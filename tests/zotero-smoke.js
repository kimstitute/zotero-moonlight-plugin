// Runs only in a fresh, isolated Zotero profile made by prepare-smoke.mjs.
(async () => {
  const result = {ok:false,version:Zotero.version,checks:[]};
  const check = (name, condition) => {
    result.checks.push({name,pass:!!condition});
    if (!condition) throw new Error(name);
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  try {
    check('isolated profile', Zotero.Profile.dir === __PROFILE__);
    for (let i=0; i<60 && !Zotero.getMainWindow()?.ZoteroPane; i++) await sleep(500);
    const w=Zotero.getMainWindow();
    check('main window loaded',!!w?.ZoteroPane);
    moonlightPlugin.addWindow(w);
    check('item menu installed',!!w.document.getElementById('zotero-moonlight-item-menu'));
    check('settings menu installed',!!w.document.getElementById('zotero-moonlight-settings-menu'));

    // Library data remains untouched: context uses synthetic objects.
    const item={key:'ABCD1234',libraryID:1,deleted:false,isRegularItem:()=>true,isAttachment:()=>false,
      getAttachments:()=>[],getField:name=>({title:'Sample',url:'https://arxiv.org/abs/1706.03762v7'}[name]||'')};
    const context=await moonlightPlugin.contextFor(item);
    check('URL-only item has no attachments',context.context.attachments.length===0);
    check('item URL is preserved',context.context.itemURL==='https://arxiv.org/abs/1706.03762v7');

    moonlightPlugin.openSettings(w);
    await sleep(1200);
    const ds=Services.wm.getEnumerator(null);
    let dialog;
    while(ds.hasMoreElements()) {const dw=ds.getNext();if(dw.location.href==='chrome://zotero-moonlight/content/settings.xhtml')dialog=dw;}
    check('settings dialog loaded',!!dialog);
    check('settings script initialized',dialog.document.getElementById('browser').value==='chrome');
    const logo=dialog.document.getElementById('moonlight-logo');
    check('settings logo image loads',logo?.complete && logo.naturalWidth===96);
    dialog.document.getElementById('profile').value='Profile 2';
    dialog.document.getElementById('openMode').value='tab';
    dialog.document.getElementById('save').click();
    await sleep(300);
    const saved=JSON.parse(Zotero.Prefs.get('extensions.zotero-moonlight.settings',true));
    check('settings save works',saved.profile==='Profile 2');
    check('internal tab mode persists',saved.openMode==='tab');
    check('settings closes after save',dialog.closed);
    await moonlightPlugin.openItem(item,false,w,'tab');
    const webTab=w.Zotero_Tabs._tabs.find(t=>t.type==='moonlight');
    check('internal Moonlight tab created',!!webTab);
    await sleep(100);
    const tabIcon=w.document.querySelector('.tab .tab-icon[data-item-type="zotero-moonlight"]');
    check('custom tab logo style applied',tabIcon && w.getComputedStyle(tabIcon).backgroundImage.includes('icons/icon-32.png'));
    const webBrowser=w.document.getElementById(webTab.id).querySelector('.zotero-moonlight-browser');
    check('remote content browser',webBrowser.getAttribute('type')==='content' && webBrowser.getAttribute('remote')==='true');
    for(let i=0;i<40 && !webBrowser.currentURI?.spec?.startsWith('https://www.themoonlight.io/file?');i++)await sleep(250);
    check('Moonlight receives exact PDF URL',webBrowser.currentURI.spec==='https://www.themoonlight.io/file?url=https%3A%2F%2Farxiv.org%2Fpdf%2F1706.03762v7');
    check('session excludes ephemeral tab',!w.Zotero_Tabs.getState().some(t=>t.type==='moonlight'));
    await moonlightPlugin.openItem(item,false,w,'tab');
    check('same paper reuses tab',w.Zotero_Tabs._tabs.filter(t=>t.type==='moonlight').length===1);
    let readerFrame='';
    ChromeUtils.importESModule('chrome://zotero/content/actors/ActorManager.mjs');
    for(let i=0;i<60 && !readerFrame;i++) {
      try {
        // Moonlight mounts its reader inside a shadow root; inspect actual browsing contexts.
        const queue=[webBrowser.browsingContext];
        const paths=[];
        while(queue.length) {
          const context=queue.shift();
          const frameURL=context.currentWindowGlobal?.documentURI?.spec||'';
          paths.push(frameURL.split('?')[0]);
          if(frameURL.includes('/extension/dist/web/pdf.html'))readerFrame=frameURL;
          queue.push(...context.children);
        }
        result.framePaths=paths;
      } catch(error) {result.frameInspectionError=String(error);}
      if(!readerFrame)await sleep(500);
    }
    result.webTitle=webBrowser.contentTitle;
    result.readerFrameLoaded=!!readerFrame;
    check('Moonlight PDF viewer frame loaded',!!readerFrame);
    const bounds=webBrowser.getBoundingClientRect();
    check('web browser has visible layout',bounds.width>100 && bounds.height>100);
    check('web content has no system privileges',webBrowser.contentPrincipal && !webBrowser.contentPrincipal.isSystemPrincipal);
    moonlightPlugin.stop();
    check('internal tabs close on disable',!w.Zotero_Tabs._tabs.some(t=>t.type==='moonlight'));
    check('menu cleanup',!w.document.getElementById('zotero-moonlight-item-menu'));
    moonlightPlugin.start();
    check('re-enable creates one menu',w.document.querySelectorAll('#zotero-moonlight-item-menu').length===1);
    result.ok=true;
  } catch(error) {result.error=String(error);result.stack=error.stack;}
  await IOUtils.writeJSON(__RESULT__,result);
  if(Zotero.Profile.dir===__PROFILE__) Services.startup.quit(Services.startup.eAttemptQuit);
})();
