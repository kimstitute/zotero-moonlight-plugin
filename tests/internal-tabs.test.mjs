import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalTabs} from '../src/internal-tabs.ts';

function harness() {
  const loads=[],tabs=[{id:'zotero-pane',type:'library',data:{}},{id:'pdf-reader',type:'reader',data:{itemID:7}}];
  const element=()=>({style:{},classList:{add(){}},children:[],attrs:{},isConnected:true,browsingContext:{},
    setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},addEventListener(){},
    addProgressListener(){},removeProgressListener(){},stop(){},loadURI(uri,options){loads.push({uri,options});}});
  const w={document:{createXULElement:element,createElementNS:element},focus(){},
    Zotero_Tabs:{getState:()=>tabs.map(t=>({type:t.type,data:t.data})),select(){},
      add(options){const row={...options,id:'tab-'+tabs.length,container:element()};tabs.push(row);return row;},
      close(id){const i=tabs.findIndex(t=>t.id===id);if(i<0)return;tabs[i].onClose?.();tabs.splice(i,1);}}};
  const original=w.Zotero_Tabs.getState;
  const env={Services:{io:{newURI:x=>x},scriptSecurityManager:{createNullPrincipal:()=>({kind:'null'})}},
    Components:{interfaces:{nsIWebProgress:{NOTIFY_LOCATION:1,NOTIFY_STATE_WINDOW:2}}},
    ChromeUtils:{generateQI:()=>()=>{}},setTimeout:()=>1,clearTimeout(){}};
  const manager=createInternalTabs(env,async()=>{});
  return {manager,w,tabs,loads,original};
}

test('internal tabs load Moonlight as content with a null triggering principal',async()=>{
  const h=harness();const entry=await h.manager.open({window:h.w,key:'1:ABCD1234',title:'Example',url:'https://www.themoonlight.io/file?url=test'});
  assert.equal(entry.browser.attrs.type,'content');assert.equal(entry.browser.attrs.remote,'true');
  assert.equal(h.loads[0].options.triggeringPrincipal.kind,'null');
  h.manager.stop();
});
test('reopening a paper preserves its tab and reading position; changed URL navigates once',async()=>{
  const h=harness();const o={window:h.w,key:'1:ABCD1234',title:'Example',url:'https://www.themoonlight.io/paper/1'};
  const first=await h.manager.open(o);const second=await h.manager.open(o);
  assert.equal(first.id,second.id);assert.equal(h.loads.length,1);
  await h.manager.open({...o,url:'https://www.themoonlight.io/paper/2'});assert.equal(h.loads.length,2);
  h.manager.stop();
});
test('session filtering preserves normal tabs and uninstall restores the original state function',async()=>{
  const h=harness();await h.manager.open({window:h.w,key:'1:ABCD1234',title:'Example',url:'https://www.themoonlight.io/paper/1'});
  assert.deepEqual(h.w.Zotero_Tabs.getState(),[{type:'library',data:{}},{type:'reader',data:{itemID:7}}]);
  h.manager.stop();assert.equal(h.tabs.length,2);assert.equal(h.w.Zotero_Tabs.getState,h.original);
});
test('cleanup does not overwrite a later wrapper installed by another plugin',async()=>{
  const h=harness();await h.manager.open({window:h.w,key:'1:ABCD1234',title:'Example',url:'https://www.themoonlight.io/paper/1'});
  const prior=h.w.Zotero_Tabs.getState;const other=()=>prior();h.w.Zotero_Tabs.getState=other;
  h.manager.stop();assert.equal(h.w.Zotero_Tabs.getState,other);assert.equal(other().length,2);
});
test('untrusted non-Moonlight URLs do not create a privileged tab',async()=>{
  const h=harness();await assert.rejects(h.manager.open({window:h.w,key:'x',title:'Bad',url:'javascript:alert(1)'}));
  assert.equal(h.tabs.length,2);assert.equal(h.loads.length,0);
});
