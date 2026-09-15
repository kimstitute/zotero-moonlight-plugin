import * as Core from './core.ts';

type Runtime = Record<string, any>;
type Options = {window: any; key: string; title: string; url: string};
type Entry = {id: string; browser: any; url: string; window: any; cleanup: () => void};

export function createInternalTabs(env: Runtime, external: (url: string) => Promise<unknown>) {
  const {Services, Components, ChromeUtils} = env;
  const entries = new Map<string, Entry>();
  const owners = new Map<any, {originalState: any; filteredState: any}>();
  let active = true;

  function register(w: any) {
    if (owners.has(w)) return;
    const tabs = w.Zotero_Tabs;
    if (!tabs?.add) throw new Error('이 Zotero 창에서는 내부 탭을 열 수 없습니다.');
    // Unknown tab types cannot be restored after disabling an add-on in Zotero 9.
    // Keep our ephemeral tabs (and document URLs) out of the core session file.
    const originalState = tabs.getState;
    const filteredState = function(this: any, ...args: any[]) {
      return originalState.apply(this, args).filter((tab: any) => tab.type !== 'moonlight');
    };
    tabs.getState = filteredState;
    owners.set(w, {originalState, filteredState});
  }

  async function open({window: w, key, title, url}: Options): Promise<Entry> {
    if (!active) throw new Error('Moonlight 플러그인이 비활성화되어 있습니다.');
    const safeURL = Core.moonlightURL(url);
    if (!safeURL) throw new Error('내부 탭은 Moonlight 웹 주소로 열어 주세요.');
    register(w);
    const existing = entries.get(key);
    if (existing && !existing.window.closed && existing.browser.isConnected) {
      existing.window.Zotero_Tabs.select(existing.id);
      existing.window.focus();
      if (existing.url !== safeURL) {existing.url = safeURL; load(existing.browser, safeURL);}
      return existing;
    }
    const tabs = w.Zotero_Tabs, doc = w.document;
    const {id, container} = tabs.add({type: 'moonlight', title: 'Moonlight · ' + (title || '논문'), data: {icon: 'zotero-moonlight'}, select: true,
      onClose: () => { entries.get(key)?.cleanup(); entries.delete(key); }});
    container.style.cssText = 'display:flex;flex-direction:column;min-height:0;min-width:0;';
    const toolbar = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid light-dark(#ddd,#555);font:13px system-ui;flex:none;';
    const browser = doc.createXULElement('browser');
    browser.classList.add('zotero-moonlight-browser');
    browser.setAttribute('type','content');
    browser.setAttribute('remote','true');
    browser.setAttribute('maychangeremoteness','true');
    browser.setAttribute('disableglobalhistory','true');
    browser.setAttribute('flex','1');
    browser.style.cssText = 'flex:1;min-height:0;min-width:0;width:100%;';
    const status = doc.createElementNS('http://www.w3.org/1999/xhtml','span');
    status.textContent = 'Moonlight를 불러오는 중…';
    status.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    const button = (label: string, action: () => void) => {
      const el = doc.createElementNS('http://www.w3.org/1999/xhtml','button');
      el.textContent = label; el.style.cssText = 'font:inherit;padding:5px 9px;white-space:nowrap;';
      el.addEventListener('click', () => {
        try { action(); } catch { status.textContent = '요청을 처리하지 못했습니다. 브라우저에서 열기를 사용해 주세요.'; }
      });
      toolbar.append(el); return el;
    };
    const back = button('뒤로', () => {if (browser.canGoBack) browser.goBack();});
    const forward = button('앞으로', () => {if (browser.canGoForward) browser.goForward();});
    button('새로고침', () => browser.reload());
    button('라이브러리', () => load(browser,'https://www.themoonlight.io/library'));
    toolbar.append(status);
    button('브라우저에서 열기', () => {
      const current = Core.webURL(browser.currentURI?.spec) || safeURL;
      Promise.resolve(external(current)).catch(() => {status.textContent='브라우저 실행에 실패했습니다. Moonlight 설정을 확인해 주세요.';});
    });
    const hint = doc.createElementNS('http://www.w3.org/1999/xhtml','div');
    hint.textContent = '처음에는 Moonlight 로그인이 필요할 수 있습니다. 로그인 창이 열리지 않거나 문서를 불러오지 못하면 “브라우저에서 열기”를 사용하세요.';
    hint.style.cssText = 'font:12px system-ui;padding:6px 12px;color:light-dark(#555,#bbb);flex:none;';
    container.append(toolbar,hint,browser);

    let timeout: any;
    const listener = {
      QueryInterface: ChromeUtils.generateQI(['nsIWebProgressListener','nsISupportsWeakReference']),
      onLocationChange(progress: any, _request: any, location: any) {
        if (!progress.isTopLevel) return;
        back.disabled=!browser.canGoBack; forward.disabled=!browser.canGoForward;
        if (location?.spec?.startsWith('https://')) status.textContent = new URL(location.spec).hostname;
      },
      onStateChange(progress: any, _request: any, flags: number, statusCode: number) {
        const constants = Components.interfaces.nsIWebProgressListener;
        if (!progress.isTopLevel || !(flags & constants.STATE_IS_WINDOW)) return;
        if (flags & constants.STATE_STOP) {
          env.clearTimeout(timeout);
          status.textContent = statusCode === 0 ? 'Moonlight 웹 화면' : '페이지를 불러오지 못했습니다. 브라우저에서 열어 주세요.';
        }
      },
      onSecurityChange() {}, onStatusChange() {}, onProgressChange() {}, onContentBlockingEvent() {}
    };
    const entry: Entry = {id,browser,url:safeURL,window:w,cleanup: () => {
      env.clearTimeout(timeout);
      try {browser.removeProgressListener(listener);} catch {}
      try {browser.stop();} catch {}
    }};
    entries.set(key,entry);
    try {
      for(let i=0; i<30 && !browser.browsingContext && active && browser.isConnected; i++) {
        await new Promise(resolve => env.setTimeout(resolve,50));
      }
      if (!active || !browser.isConnected) return entry;
      browser.addProgressListener(listener, Components.interfaces.nsIWebProgress.NOTIFY_LOCATION | Components.interfaces.nsIWebProgress.NOTIFY_STATE_WINDOW);
      timeout=env.setTimeout(() => {status.textContent='응답이 늦어지고 있습니다. 필요하면 브라우저에서 열어 주세요.';},20000);
      load(browser,safeURL);
    } catch {
      tabs.close(id);
      throw new Error('Zotero 내부 웹 화면을 열지 못했습니다. 브라우저에서 읽기를 사용해 주세요.');
    }
    return entry;
  }

  function load(browser: any, url: string) {
    const safeURL=Core.moonlightURL(url);
    if (!safeURL) throw new Error('Moonlight 웹 주소가 필요합니다.');
    browser.loadURI(Services.io.newURI(safeURL), {
      triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({})
    });
  }

  function removeWindow(w: any) {
    for(const [key, entry] of [...entries]) if(entry.window===w) {
      if(!w.closed) w.Zotero_Tabs.close(entry.id); else entry.cleanup();
      entries.delete(key);
    }
    const owner=owners.get(w);
    if(owner && w.Zotero_Tabs.getState===owner.filteredState) w.Zotero_Tabs.getState=owner.originalState;
    owners.delete(w);
  }

  return {open,removeWindow,stop() {active=false;for(const w of [...owners.keys()]) removeWindow(w);}};
}
