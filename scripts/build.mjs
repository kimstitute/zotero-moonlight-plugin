import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'build/addon');
await mkdir(out, {recursive:true});
await cp(resolve(root, 'addon'), out, {recursive:true});
const core = stripTypeScriptTypes(await readFile(resolve(root, 'src/core.ts'), 'utf8'));
const names = [...core.matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map(m=>m[1]);
const internalTabs = stripTypeScriptTypes(await readFile(resolve(root, 'src/internal-tabs.ts'), 'utf8'))
  .replace(/^import \* as Core from '\.\/core\.ts';\s*/m, '').replace(/^export /gm, '');
const plugin = stripTypeScriptTypes(await readFile(resolve(root, 'src/plugin.ts'), 'utf8'))
  .replace(/^import \* as Core from '\.\/core\.ts';\s*/m, '')
  .replace(/^import \{ createInternalTabs \} from '\.\/internal-tabs\.ts';\s*/m, '').replace(/^export /gm, '');
if (/^import /m.test(plugin)) throw new Error('Build only supports the explicit core import.');
const bundle = `var createMoonlightPlugin = (() => {\nconst Core = (() => {\n${core.replace(/^export /gm, '')}\nreturn {${names.join(',')}};\n})();\n${internalTabs}\n${plugin}\nreturn createMoonlightPlugin;\n})();\n`;
await writeFile(resolve(out, 'moonlight.js'), bundle);
execFileSync(process.execPath, ['--check', resolve(out, 'moonlight.js')], {stdio:'inherit'});
execFileSync('python', [resolve(root, 'scripts/package.py')], {stdio:'inherit'});
