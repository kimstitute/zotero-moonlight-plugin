import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoonlightPlugin} from '../src/plugin.ts';

function harness() {
  const launched=[], prefs=new Map(), calls={files:0,requests:0};
  const item = {key:'ABCD1234',libraryID:1,deleted:false,isRegularItem:()=>true,isAttachment:()=>false,
    getAttachments:()=>[22],getField:name=>({url:'https://arxiv.org/abs/1706.03762v3',title:'Example'}[name]||'')};
  const attachment = {id:22,key:'EFGH1234',libraryID:1,parentItemID:1,attachmentContentType:'application/pdf',
    isAttachment:()=>true,getField:()=>'',getFilePathAsync:async()=>{calls.files++;return 'C:/local.pdf';}};
  const Z = {isWin:true,Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)},
    Items:{getAsync:async ids=>Array.isArray(ids)?[attachment]:ids===1?item:attachment},
    getMainWindow:()=>({}),getMainWindows:()=>[],
    Reader:{registerEventListener(){},unregisterEventListener(){}},
    ProgressWindow:class{changeHeadline(){}addDescription(){}show(){}startCloseTimer(){}},File:{pathToFileURI:p=>'file:///'+p}};
  const Services={env:{get:()=> 'C:/Programs'},prompt:{alert(){},select:()=>true}};
  const Components={interfaces:{},classes:new Proxy({}, {get:(_,name)=>({createInstance:()=>String(name).includes('process')
    ? {init(){},runwAsync:args=>launched.push(args)} : {initWithPath(){},isExecutable:()=>true,isFile:()=>true}})})};
  const plugin=createMoonlightPlugin({Zotero:Z,Services,Components,IOUtils:{exists:async()=>true},PathUtils:{join:(...xs)=>xs.join('/')},
    XMLHttpRequest:class{constructor(){calls.requests++; throw Error('Unexpected network');}}},'test');
  return {plugin,item,attachment,prefs,launched,calls,Z};
}

test('opening an item uses its online address and never touches its local PDF',async()=>{
  const h=harness();await h.plugin.openItem(h.item);
  assert.deepEqual(h.launched,[['--new-tab','https://arxiv.org/pdf/1706.03762v3']]);
  assert.equal(h.calls.files,0);assert.equal(h.calls.requests,0);
});
test('reader attachment resolves to the parent item and keeps online-first behavior',async()=>{
  const h=harness();await h.plugin.openItem(h.attachment);
  assert.equal(h.launched[0].at(-1),'https://arxiv.org/pdf/1706.03762v3');
  assert.equal(h.calls.files,0);
});
test('a saved Moonlight document bypasses source resolution; forceSource re-resolves',async()=>{
  const h=harness();h.prefs.set('extensions.zotero-moonlight.documentLinks',JSON.stringify({schema:1,entries:{'1:ABCD1234':{url:'https://www.themoonlight.io/paper/share/abc',updatedAt:'2026-09-15'}}}));
  await h.plugin.openItem(h.item);assert.equal(h.launched[0].at(-1),'https://www.themoonlight.io/paper/share/abc');
  await h.plugin.openItem(h.item,true);assert.equal(h.launched[1].at(-1),'https://arxiv.org/pdf/1706.03762v3');
});
test('simultaneous commands for one item launch only once',async()=>{
  const h=harness();await Promise.all([h.plugin.openItem(h.item),h.plugin.openItem(h.item)]);
  assert.equal(h.launched.length,1);
});
test('disabled plugin cannot launch a pending command',async()=>{
  const h=harness();h.plugin.stop();await h.plugin.openItem(h.item);assert.equal(h.launched.length,0);
});
test('missing metadata does not download a cloud-only attachment',async()=>{
  const h=harness();h.item.getField=()=>'';h.attachment.getFilePathAsync=async()=>false;
  await assert.rejects(h.plugin.openItem(h.item),/URL 또는 DOI/);assert.equal(h.launched.length,0);
});
test('corrupt saved links are preserved, while forceSource still opens the paper',async()=>{
  const h=harness();h.prefs.set('extensions.zotero-moonlight.documentLinks','{broken');
  await assert.rejects(h.plugin.openItem(h.item));
  assert.equal(h.prefs.get('extensions.zotero-moonlight.documentLinks'),'{broken');
  await h.plugin.openItem(h.item,true);assert.equal(h.launched.length,1);
});
