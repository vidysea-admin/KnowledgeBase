import ts from 'typescript';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const root=process.cwd(), req=createRequire(resolve(root,'package.json'));
const pins={},seen=new Set(),missing=[],external=new Set();
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function actual(p){for(const f of [p,p.replace(/\.js$/,'.ts'),p+'.ts',p+'.mjs',join(p,'index.ts')]) if(existsSync(f)) return f; return null;}
function visit(path){const p=actual(path);if(!p){missing.push(relative(root,path));return;}if(seen.has(p))return;seen.add(p);const rel=relative(root,p).replaceAll('\\','/');pins[rel]=hash(p);if(!/\.[cm]?[jt]s$/.test(p))return;
for(const i of ts.preProcessFile(readFileSync(p,'utf8'),true,true).importedFiles){const name=i.fileName;if(name.startsWith('node:'))continue;if(name.startsWith('.'))visit(resolve(dirname(p),name));else if(name.startsWith('@lkb/')){const match=/^@lkb\/([^/]+)(?:\/(.*))?$/.exec(name);visit(resolve(root,'packages',match[1],'src',match[2]??'index.ts'));const manifest=resolve(root,'packages',match[1],'package.json');pins[relative(root,manifest).replaceAll('\\','/')]=hash(manifest);}else external.add(name);}}
for(const entry of process.argv.slice(2))visit(resolve(root,entry));
for(const name of external){try{let entry;for(const manifest of ['package.json','packages/ask/package.json','apps/api/package.json']){try{entry=createRequire(resolve(root,manifest)).resolve(name);break;}catch{}}if(!entry)throw Error('missing');pins[entry]=hash(entry);}catch{missing.push('external:'+name);}}
for(const p of ['package.json','pnpm-lock.yaml','node_modules/tsx/package.json','node_modules/tsx/dist/esm/index.mjs','qa/goal-vectorless-2026-10-15/verification-runner-v2.mjs','qa/goal-vectorless-2026-10-15/unit-dependency-pins.mjs','schema/index.json',...JSON.parse(readFileSync('qa/coordination/knowledge-brain-20261015/shared-schema-freeze.json','utf8')).pins.map(p=>p.path)])pins[p]=hash(resolve(root,p));
writeFileSync('qa/goal-vectorless-2026-10-15/unit-current-dependency-pins.json',JSON.stringify({pins,missing,external:[...external],note:'Conservative static transitive import closure includes type-only source; external entrypoints plus lock identify installed dependencies'},null,2));console.log(JSON.stringify({sourcePins:Object.keys(pins).length,missing,external:[...external]}));


