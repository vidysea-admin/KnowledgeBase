import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const root=process.cwd(), pnpm='C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs';
const versions={};
const run=(args,cwd=root)=>{const r=spawnSync(process.execPath,[pnpm,...args],{cwd,encoding:'utf8',timeout:15000,windowsHide:true,shell:false});if(r.status!==0)throw Error(r.stderr||r.error?.message||'preflight child failed');return r.stdout.trim();};
versions.pnpm=run(['--version']);
if(versions.pnpm!=='10.33.0')throw Error('Unexpected pnpm version');
const apiRequire=createRequire(resolve(root,'apps/api/package.json'));
const typescript=apiRequire('typescript'),esbuild=apiRequire('esbuild');
versions.typescript=typescript.version;versions.esbuild=esbuild.version;
if(!esbuild.transformSync('const proof: number = 1',{loader:'ts'}).code.includes('proof'))throw Error('esbuild compatibility failed');
for(const app of ['api','web'])versions[app+'ScriptNode']=JSON.parse(run(['exec','node','-p','JSON.stringify({version:process.version,executable:process.execPath})'],resolve(root,'apps/'+app)));
const parent=tmpdir(),folder=mkdtempSync(join(parent,'kb-build-preflight-'));
try{const file=join(folder,'probe');writeFileSync(file,'bounded-build-probe');if(readFileSync(file,'utf8')!=='bounded-build-probe')throw Error('temp mismatch');unlinkSync(file);}finally{rmdirSync(folder);}
console.log(JSON.stringify({status:'PREFLIGHT_OK',node:process.version,executable:process.execPath,importRoot:root,versions,tempParent:parent,tempWritable:true,sourceWrites:false,network:false}));
