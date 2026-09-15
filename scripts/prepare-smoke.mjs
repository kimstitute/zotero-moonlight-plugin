import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const run=resolve(root,'work','smoke-'+Date.now());
const profile=resolve(run,'profile');
const addon=resolve(profile,'extensions','zotero-moonlight@local');
await mkdir(addon,{recursive:true});
await mkdir(resolve(run,'data'),{recursive:true});
await cp(resolve(root,'build/addon'),addon,{recursive:true});
const prefs={
  'extensions.zotero.dataDir':resolve(run,'data'),
  'extensions.zotero.useDataDir':true,
  'extensions.zotero.httpServer.enabled':false,
  'extensions.zotero.firstRun':false,
  'extensions.zotero.firstRun2':false,
  'extensions.autoDisableScopes':0,
  'extensions.enabledScopes':15,
  'browser.shell.checkDefaultBrowser':false
};
await writeFile(resolve(profile,'user.js'),Object.entries(prefs).map(([k,v])=>`user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
let smoke=await readFile(resolve(root,'tests/zotero-smoke.js'),'utf8');
smoke=smoke.replaceAll('__PROFILE__',JSON.stringify(profile)).replaceAll('__RESULT__',JSON.stringify(resolve(run,'result.json')));
await writeFile(resolve(addon,'smoke.js'),smoke);
await writeFile(resolve(addon,'bootstrap.js'),(await readFile(resolve(addon,'bootstrap.js'),'utf8'))+`
var productionStartup = startup;
startup = async function(data) {
  try {
    await productionStartup.call(this, data);
    Services.scriptloader.loadSubScript(data.rootURI + 'smoke.js', this);
  } catch (error) {
    await IOUtils.writeJSON(${JSON.stringify(resolve(run,'result.json'))}, {ok:false,error:String(error),stack:error.stack});
  }
};
`);
await writeFile(resolve(root,'work/smoke-current.json'),JSON.stringify({run,profile,result:resolve(run,'result.json')}));
execFileSync(process.execPath,['--check',resolve(addon,'bootstrap.js')]);
console.log(run);
