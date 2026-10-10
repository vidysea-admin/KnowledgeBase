import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const root = process.cwd();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['packages/db/src/index.ts','packages/db/src/collections/jobs.ts','apps/api/src/jobs/router.ts','apps/api/src/jobs/store.ts','apps/api/src/jobs/fixture-store.ts','apps/api/src/jobs/fixture-store.test.ts','apps/api/src/server.ts','apps/api/src/production.ts','apps/api/src/fixtures.ts','apps/web/src/App.tsx','apps/web/src/layout/NavSidebar.tsx','apps/web/src/pages/SettingsPage.tsx','apps/web/src/pages/SettingsPage.test.tsx','apps/web/src/api/jobs.ts','apps/web/src/pages/jobs/JobsPage.tsx'];
const snapshot = () => Object.fromEntries(paths.map(path => {const bytes=readFileSync(path);return [path,{sha256:hash(bytes),nonblankLines:bytes.toString('utf8').split(/\r?\n/).filter(x=>x.trim()).length}]}));
const evidence={checkedDate:'2026-10-09',scope:'independent jobs integration; local fake database only',before:snapshot(),runs:[],preservation:{}};
function inverse(path, lines, expected, insertedPrefix = false) {
  let text=readFileSync(path,'utf8');
  for(const line of lines){const matches=text.split(/\r?\n/).filter(x=>x===line);if(matches.length!==1)throw new Error('Non-unique glue line '+path); const escaped=line.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');text=insertedPrefix?text.replace('\r\n'+line,''):text.replace(new RegExp('^'+escaped+'\\r?\\n','m'),'');}
  const actual=hash(Buffer.from(text,'utf8'));return {expectedPreimage:expected,reconstructedPreimage:actual,pass:actual===expected,removedLines:lines.length,removal:insertedPrefix?'exact inserted CRLF+line prefix, retaining original LF':'complete added lines including their newline'};
}
evidence.preservation.server=inverse('apps/api/src/server.ts',[
'import { createJobsRouter, type JobsReadDeps } from "./jobs/router.js";',
'import { unavailableJobsReadDeps } from "./jobs/fixture-store.js";',
'  jobs?: JobsReadDeps;',
'  app.use(createJobsRouter(deps.jobs ?? unavailableJobsReadDeps));'
],'2a77e71ec04e6b6c68c3b0b082e27ba19111a8a9d4827c7cd4d6e9d4a035211e');
evidence.preservation.production=inverse('apps/api/src/production.ts',[
'import { createMongoJobsReadDeps } from "./jobs/store.js";',
'    jobs: createMongoJobsReadDeps(),'
],'7e155585e7096eec5973027af1a15b61265fee9a88a57d9255f4b215863cc365',true);
evidence.preservation.fixtures={expected:'a99dd8a2c9abf1864d9af6f26741e1d890da46fb9a4a1c0dbb2e0d762781639f',actual:evidence.before['apps/api/src/fixtures.ts'].sha256,nonblankLines:evidence.before['apps/api/src/fixtures.ts'].nonblankLines};
const specs=[
 ['API integration',['--test','--test-concurrency=1','--test-timeout=45000','--experimental-test-isolation=none','--import','tsx','apps/api/src/jobs/fixture-store.test.ts'],root],
 ['Settings/App downstream',['node_modules/vitest/vitest.mjs','run','src/pages/SettingsPage.test.tsx','--maxWorkers=1','--minWorkers=1','--pool=threads'],resolve(root,'apps/web')],
 ['API typecheck',['node_modules/typescript/bin/tsc','--noEmit','-p','apps/api/tsconfig.json'],root],
 ['DB typecheck',['node_modules/typescript/bin/tsc','--noEmit','-p','packages/db/tsconfig.json'],root],
 ['Web typecheck',['node_modules/typescript/bin/tsc','--noEmit','-p','apps/web/tsconfig.json'],root]
];
for(const [label,args,cwd] of specs){const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:60000,windowsHide:true});evidence.runs.push({label,command:[process.execPath,...args],cwd,timeout:60000,status:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout,stderr:r.stderr});console.log(label+': exit'+r.status);if(r.stdout)console.log(r.stdout);if(r.stderr)console.log(r.stderr);}
evidence.after=snapshot();evidence.hashesStable=JSON.stringify(evidence.before)===JSON.stringify(evidence.after);
writeFileSync('qa/evidence/parallel-jobs-read/integration-check-cycle0.json',JSON.stringify(evidence,null,2)+'\n');
const ok=evidence.runs.every(x=>x.status===0)&&evidence.hashesStable&&evidence.preservation.server.pass&&evidence.preservation.production.pass&&evidence.preservation.fixtures.expected===evidence.preservation.fixtures.actual&&evidence.preservation.fixtures.nonblankLines===300;
console.log('Preservation and source stability: '+ok);process.exitCode=ok?0:1;
