import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const workspace=process.cwd();
const {plan,materialize,digest}=await import(pathToFileURL(path.join(workspace,'scripts/qa/source-overlay-candidate.mjs')));
const parent=path.join(workspace,'.cache/coordination');
await fs.mkdir(parent,{recursive:true});
const root=await fs.mkdtemp(path.join(parent,'source-overlay-independent-'));
const put=async(rel,b)=>{await fs.mkdir(path.dirname(path.join(root,rel)),{recursive:true});await fs.writeFile(path.join(root,rel),b);};
const files=['Dockerfile','.dockerignore','docker-compose.yml','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.github/workflows/docker.yml','scripts/lint-root.mjs','scripts/lint.test.mjs','scripts/lint-loc.mjs','scripts/gen-types.mjs','scripts/lib/walk.mjs','structure.config.json','tsconfig.base.json','.gitignore','contracts/verify_contracts.py','workers/transcribe/package.json','qa/issues.T045WORKER.jsonl','packages/core/src/runtime.ts','apps/api/src/server.ts','apps/web/src/app.ts','schema/example.json','config/example.json','migrations/example.cjs','scripts/qa/container-workflows/run.sh'];
try {
 for(const rel of files) await put(rel,'synthetic independent bytes\r\n');
 await fs.mkdir(path.join(root,'.cache/coordination'),{recursive:true});
 const spec={scope:'docker-workflow',output:'.cache/coordination/source-overlay-independent123',entries:files.map(p=>({path:p,sha256:digest('synthetic independent bytes\r\n')}))};
 await plan(root,spec);
 const alias={...spec,entries:spec.entries.map(r=>r.path==='apps/api/src/server.ts'?{...r,path:'apps/api/src/Server.ts'}:r)};
 let aliasRefused=false;
 try {await plan(root,alias);}catch{aliasRefused=true;}
 console.log(JSON.stringify({probe:'case-alias',platform:process.platform,refused:aliasRefused}));
 let additionRefused=false;
 try {await materialize(root,spec,{afterRead:()=>put('apps/api/src/new-required.ts','new dependency')});}catch{additionRefused=true;}
 console.log(JSON.stringify({probe:'new-required-after-capture',refused:additionRefused,manifestPublished:await fs.stat(path.join(root,spec.output,'manifest.json')).then(()=>true,()=>false)}));
 assert.ok(aliasRefused,'case alias must refuse');
 assert.ok(additionRefused,'new required source before copy must refuse');
} finally {
 assert.equal((await fs.realpath(root)).toLowerCase(),root.toLowerCase());
 assert.equal(path.dirname(root),parent);
 assert.ok(path.basename(root).startsWith('source-overlay-independent-'));
 await fs.rm(root,{recursive:true,force:true});
}
