import * as Core from './core.ts';
import type { Context, Source } from './core.ts';
import { createInternalTabs } from './internal-tabs.ts';

// Zotero's privileged runtime is injected at the boundary; core logic is platform independent.
type Runtime = Record<string, any>;
type Settings = { browser: 'chrome' | 'edge'; executable: string; profile: string; localFallback: boolean; openMode: 'browser' | 'tab' };
const PREFIX = 'extensions.zotero-moonlight.';
const DEFAULTS: Settings = {browser: 'chrome', executable: '', profile: '', localFallback: true, openMode: 'browser'};

export function createMoonlightPlugin(env: Runtime, pluginID: string) {
  const {Zotero: Z, Services, IOUtils, PathUtils, ChromeUtils, Components} = env;
  const windows = new Map<any, {nodes: Element[]; popup: Element | null; listener: EventListener}>();
  const pending = new Set<any>();
  const busy = new Set<string>();
  const dialogs = new Set<any>();
  let alive = true;
  let internalTabs = createInternalTabs(env, url => launch(url));

  const pref = (key: string) => Z.Prefs.get(PREFIX + key, true);
  const put = (key: string, value: string) => Z.Prefs.set(PREFIX + key, value, true);
  const alert = (message: string, w = Z.getMainWindow()) => Services.prompt.alert(w, 'Zotero Moonlight', message);
  const settings = (): Settings => {
    const raw = pref('settings');
    return raw ? {...DEFAULTS, ...JSON.parse(raw)} : {...DEFAULTS};
  };
  const links = () => Core.readLinks(pref('documentLinks'));
  const report = (error: unknown) => {
    // Avoid logging publisher URLs, signed query strings, or account state.
    if (alive) alert(error instanceof Error ? error.message : 'Moonlight를 열지 못했습니다.');
  };
  const run = (action: () => Promise<unknown> | unknown) => { Promise.resolve().then(action).catch(report); };

  function readField(item: any, name: string): string {
    try { return String(item.getField(name) || ''); } catch { return ''; }
  }

  async function contextFor(selected: any): Promise<{context: Context; item: any; attachments: any[]}> {
    if (!selected || selected.deleted || selected.isNote?.() || selected.isAnnotation?.()) {
      throw new Error('논문 항목 또는 PDF 첨부를 하나 선택해 주세요.');
    }
    const item = selected.parentItemID ? await Z.Items.getAsync(selected.parentItemID) : selected;
    if (!item || item.deleted) throw new Error('선택한 논문을 찾을 수 없습니다.');
    const children = item.isRegularItem() ? await Z.Items.getAsync(item.getAttachments()) : [item];
    const attachments = children.filter((a: any) => !a.deleted && a.isAttachment() && a.attachmentContentType === 'application/pdf');
    const source = (a: any): Source => ({url: readField(a, 'url'), label: readField(a, 'title') || 'PDF 첨부', pdf: true});
    return {
      item, attachments,
      context: {libraryID: item.libraryID, itemKey: item.key, title: readField(item, 'title'),
        itemURL: readField(item, 'url'), doi: readField(item, 'DOI'),
        selected: selected.isAttachment() ? source(selected) : undefined,
        attachments: attachments.map(source)}
    };
  }

  function selection(w: any): any {
    const items = w.ZoteroPane?.getSelectedItems() || [];
    if (items.length !== 1) throw new Error('논문 항목 또는 PDF 첨부를 하나 선택해 주세요.');
    return items[0];
  }

  function inspectPage(url: string): Promise<Source[]> {
    return new Promise((resolve, reject) => {
      if (!alive) { resolve([]); return; }
      const xhr = new env.XMLHttpRequest({mozAnon: true});
      pending.add(xhr);
      let done = false;
      const finish = (result: Source[], error?: Error) => {
        if (done) return;
        done = true; pending.delete(xhr);
        if (error) reject(error); else resolve(result);
        xhr.abort();
      };
      xhr.open('GET', url, true);
      xhr.timeout = 6000;
      xhr.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/pdf;q=0.9');
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 2 || done) return;
        const finalURL = Core.webURL(xhr.responseURL);
        if (!finalURL || xhr.status < 200 || xhr.status >= 300) { finish([]); return; }
        const type = (xhr.getResponseHeader('Content-Type') || '').toLowerCase();
        // Headers suffice to identify a PDF. Abort before buffering its body.
        if (type.includes('application/pdf')) finish([{url: finalURL, label: '온라인 PDF', pdf: true}]);
        else if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) finish([]);
        else if (Number(xhr.getResponseHeader('Content-Length')) > 2 * 1024 * 1024) finish([]);
      };
      xhr.onprogress = (event: ProgressEvent) => { if (event.loaded > 2 * 1024 * 1024) finish([]); };
      xhr.onload = () => {
        if (done) return;
        try {
          const base = Core.webURL(xhr.responseURL);
          if (!base || xhr.responseText.length > 2 * 1024 * 1024) { finish([]); return; }
          const doc = new env.DOMParser().parseFromString(xhr.responseText, 'text/html');
          finish(Core.metadataPDFs(doc, base));
        } catch { finish([]); }
      };
      xhr.onerror = xhr.ontimeout = xhr.onabort = () => finish([]);
      try { xhr.send(); } catch { finish([]); }
    });
  }

  async function executableFor(s: Settings): Promise<string | null> {
    if (s.executable) return await IOUtils.exists(s.executable) ? s.executable : null;
    const directories = Z.isWin
      ? [Services.env.get('PROGRAMFILES'), Services.env.get('PROGRAMFILES(X86)'), Services.env.get('LOCALAPPDATA')]
      : [];
    const suffix = s.browser === 'edge' ? ['Microsoft', 'Edge', 'Application', 'msedge.exe'] : ['Google', 'Chrome', 'Application', 'chrome.exe'];
    for (const dir of directories.filter(Boolean)) {
      const candidate = PathUtils.join(dir, ...suffix);
      if (await IOUtils.exists(candidate)) return candidate;
    }
    return null;
  }

  async function launch(url: string, allowFile = false) {
    if (!alive) return;
    const s = settings();
    const executable = await executableFor(s);
    if (!executable) { openSettings(); throw new Error('Moonlight를 사용할 브라우저 실행 파일을 설정해 주세요.'); }
    const args = Core.browserArgs(url, s.profile, allowFile);
    const file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsIFile);
    file.initWithPath(executable);
    if (!file.isFile() || !file.isExecutable()) throw new Error('선택한 파일은 브라우저 실행 파일이 아닙니다.');
    const process = Components.classes['@mozilla.org/process/util;1'].createInstance(Components.interfaces.nsIProcess);
    process.init(file);
    // A newly opened browser process can live for hours. Do not await its exit.
    process.runwAsync(args, args.length, {observe(subject: any, topic: string) {
      if (alive && (topic === 'process-failed' || (topic === 'process-finished' && subject.exitValue !== 0))) {
        report(new Error('브라우저 실행에 실패했습니다. 실행 파일과 프로필 설정을 확인해 주세요.'));
      }
    }});
    const progress = new Z.ProgressWindow({closeOnClick: true});
    progress.changeHeadline('Moonlight');
    progress.addDescription('브라우저로 열었습니다. 기본 PDF 화면이면 왼쪽 아래 Moonlight 버튼을 눌러 주세요.');
    progress.show(); progress.startCloseTimer(6000);
  }

  function choose(candidates: Source[], w: any): Source | null {
    if (candidates.length === 1) return candidates[0];
    const index = {value: 0};
    const accepted = Services.prompt.select(w, 'Moonlight로 읽기', '읽을 문서의 주소를 선택해 주세요.',
      candidates.map(s => `${s.label}\n${s.url}`), index);
    return accepted ? candidates[index.value] : null;
  }

  async function openItem(selected: any, forceSource = false, w = Z.getMainWindow(), mode?: 'browser' | 'tab') {
    const {context, attachments} = await contextFor(selected);
    const key = Core.linkKey(context.libraryID, context.itemKey);
    if (busy.has(key)) return;
    busy.add(key);
    const destination = mode || settings().openMode;
    const openOnline = (url: string) => destination === 'tab'
      ? internalTabs.open({window:w,key,title:context.title,url:Core.moonlightReaderURL(url)})
      : launch(url);
    try {
      const saved = forceSource ? null : links().entries[key];
      if (saved) { await openOnline(saved.url); return; }
      const result = await Core.resolveSources(context, inspectPage);
      if (!alive) return;
      if (result.candidates.length) {
        const chosen = choose(result.candidates, w);
        if (chosen) await openOnline(chosen.url);
        return;
      }
      // Preserve the URL-first workflow even when the publisher requires browser login.
      if (result.pages.length) {
        const flags = Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING
          + Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL
          + (settings().localFallback && attachments.length ? Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_IS_STRING : 0);
        const answer = Services.prompt.confirmEx(w, 'Moonlight',
          '온라인 PDF 주소를 찾지 못했습니다. 원문 페이지에서 PDF를 연 뒤 Moonlight 버튼을 사용할 수 있습니다.',
          flags, '원문 페이지 열기', null, '로컬 PDF 사용', null, {});
        if (answer === 0) await launch(result.pages[0].url);
        if (answer !== 2) return;
      }
      if (settings().localFallback) {
        const local: Source[] = [];
        // Only inspect already-local attachments after all online sources are exhausted.
        for (const attachment of attachments) {
          const path = await attachment.getFilePathAsync();
          if (path && await IOUtils.exists(path)) {
            local.push({url: Z.File.pathToFileURI(path), label: readField(attachment, 'title') || '로컬 PDF'});
          }
        }
        if (local.length) {
          const chosen = choose(local, w);
          if (chosen) {
            alert('로컬 PDF를 브라우저로 엽니다. Moonlight 확장 프로그램에서 파일 URL 접근을 허용해야 합니다. 작동하지 않으면 Moonlight 홈페이지에서 이 파일을 직접 업로드해 주세요.', w);
            await launch(chosen.url, true);
          }
          return;
        }
      }
      throw new Error('사용할 논문 주소가 없습니다. Zotero 항목에 URL 또는 DOI를 추가해 주세요.');
    } finally { busy.delete(key); }
  }

  async function connect(selected: any, w: any) {
    const {context} = await contextFor(selected);
    const key = Core.linkKey(context.libraryID, context.itemKey);
    const value = {value: links().entries[key]?.url || ''};
    const accepted = Services.prompt.prompt(w, 'Moonlight 문서 연결',
      '이 논문의 Moonlight 문서 링크를 붙여 넣어 주세요.\n내용을 비우고 확인하면 연결을 해제합니다.\n로그인·홈페이지 주소 대신 읽던 문서의 주소를 사용하세요.', value, null, {});
    if (!accepted) return;
    const url = value.value.trim() ? Core.moonlightURL(value.value.trim()) : null;
    if (value.value.trim() && !url) throw new Error('https://www.themoonlight.io/ 아래의 문서 주소를 입력해 주세요.');
    // Read again immediately before saving so edits from another window are preserved.
    const current = links();
    if (url) current.entries[key] = {url, updatedAt: new Date().toISOString()};
    else delete current.entries[key];
    put('documentLinks', JSON.stringify(current));
  }

  function openSettings(w = Z.getMainWindow()) {
    for (const dialog of dialogs) if (!dialog.closed) { dialog.focus(); return; }
    const args = {
      settings: settings(),
      async pick() {
        const {FilePicker} = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
        const picker = new FilePicker();
        picker.init(w, '브라우저 실행 파일 선택', picker.modeOpen);
        picker.appendFilters(picker.filterApps);
        return await picker.show() === picker.returnOK ? picker.file : '';
      },
      async save(next: Settings) {
        if (!['chrome', 'edge'].includes(next.browser)) throw new Error('브라우저를 선택해 주세요.');
        if (!['browser', 'tab'].includes(next.openMode)) throw new Error('열기 방식을 선택해 주세요.');
        Core.browserArgs('https://www.themoonlight.io/', next.profile);
        if (next.executable && !await IOUtils.exists(next.executable)) throw new Error('실행 파일을 찾을 수 없습니다.');
        put('settings', JSON.stringify(next));
      },
      test: () => run(() => settings().openMode === 'tab'
        ? internalTabs.open({window:w,key:'moonlight-home',title:'라이브러리',url:'https://www.themoonlight.io/library'})
        : launch('https://www.themoonlight.io/'))
    };
    const dialog = w.openDialog('chrome://zotero-moonlight/content/settings.xhtml', 'zotero-moonlight-settings',
      'chrome,centerscreen,resizable,width=620,height=700', args);
    dialogs.add(dialog);
    dialog.addEventListener('unload', () => dialogs.delete(dialog), {once: true});
  }

  function addWindow(w: any) {
    if (!alive || windows.has(w)) return;
    const doc = w.document;
    const nodes: Element[] = [];
    const style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style');
    style.textContent = '.tab .tab-icon[data-item-type="zotero-moonlight"] {background: url("chrome://zotero-moonlight/content/icons/icon-32.png") center / contain no-repeat !important; width:16px; height:16px; border-radius:3px;}';
    doc.documentElement.append(style); nodes.push(style);
    const create = (tag: string, label?: string) => {
      const el = doc.createXULElement(tag);
      if (label) el.setAttribute('label', label);
      return el;
    };
    const popup = doc.getElementById('zotero-itemmenu');
    const submenu = create('menu', 'Moonlight');
    submenu.id = 'zotero-moonlight-item-menu';
    submenu.setAttribute('class', 'menu-iconic');
    submenu.setAttribute('image', 'chrome://zotero-moonlight/content/icons/icon-32.png');
    const sub = create('menupopup'); submenu.append(sub);
    const actions = [
      ['Moonlight로 읽기', () => openItem(selection(w), false, w)],
      ['Zotero 탭에서 읽기', () => openItem(selection(w), false, w, 'tab')],
      ['브라우저에서 읽기', () => openItem(selection(w), false, w, 'browser')],
      ['원문에서 다시 열기', () => openItem(selection(w), true, w)],
      ['Moonlight 문서 연결…', () => connect(selection(w), w)]
    ] as const;
    for (const [label, action] of actions) {
      const menuitem = create('menuitem', label);
      menuitem.addEventListener('command', () => run(action)); sub.append(menuitem);
    }
    const listener = ((event: Event) => {
      if (event.target !== popup) return;
      try { const item = selection(w); submenu.disabled = !!(item.isNote?.() || item.isAnnotation?.() || item.deleted); }
      catch { submenu.disabled = true; }
    }) as EventListener;
    if (popup) {popup.append(submenu); nodes.push(submenu); popup.addEventListener('popupshowing', listener);}
    const tools = doc.getElementById('menu_ToolsPopup');
    if (tools) {
      const node = create('menuitem', 'Moonlight 설정…'); node.id = 'zotero-moonlight-settings-menu';
      node.setAttribute('class', 'menuitem-iconic');
      node.setAttribute('image', 'chrome://zotero-moonlight/content/icons/icon-32.png');
      node.addEventListener('command', () => run(() => openSettings(w))); tools.append(node); nodes.push(node);
    }
    windows.set(w, {nodes, popup, listener});
  }

  function removeWindow(w: any) {
    internalTabs.removeWindow(w);
    const state = windows.get(w);
    if (!state) return;
    state.nodes.forEach(node => node.remove());
    state.popup?.removeEventListener('popupshowing', state.listener);
    windows.delete(w);
  }

  const readerHandler = ({reader, append}: any) => {
    append({label: 'Moonlight로 읽기', onCommand: () => run(async () => openItem(await Z.Items.getAsync(reader.itemID)))});
    append({label: 'Moonlight · Zotero 탭에서 읽기', onCommand: () => run(async () => openItem(await Z.Items.getAsync(reader.itemID), false, Z.getMainWindow(), 'tab'))});
  };
  return {
    start() {
      if (!alive) internalTabs = createInternalTabs(env, url => launch(url));
      alive = true;
      Z.getMainWindows().forEach(addWindow);
      Z.Reader.registerEventListener('createViewContextMenu', readerHandler, pluginID);
    },
    stop() {
      alive = false;
      internalTabs.stop();
      for (const xhr of pending) xhr.abort(); pending.clear();
      for (const w of [...windows.keys()]) removeWindow(w);
      Z.Reader.unregisterEventListener('createViewContextMenu', readerHandler);
      for (const dialog of dialogs) if (!dialog.closed) dialog.close(); dialogs.clear();
    },
    addWindow, removeWindow, openItem, openSettings, contextFor, inspectPage
  };
}
