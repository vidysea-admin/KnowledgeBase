import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='qa/evidence/goal-t051checker-broker-',ready=[],skipped=[];
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function add(name,s){const drift=Object.entries(s.pins).filter(([p,h])=>!existsSync(p)||hash(p)!==h.toLowerCase()).map(([p,h])=>({path:p,expected:h,actual:existsSync(p)?hash(p):null}));if(drift.length){skipped.push({name,drift});return;}s.output=base+name;writeFileSync(s.output+'-spec.json',JSON.stringify(s,null,2)+'\n');ready.push(name);}
const t=JSON.parse(readFileSync('qa/evidence/t054-review-completion/focused-replay-request.json','utf8'));
add('t054-generation-focused',{program:t.program,cwd:t.cwd,args:t.stages[0].args,pins:t.pins,timeoutMs:t.timeoutMsPerProcess});
const d=JSON.parse(readFileSync('qa/evidence/t054-review-completion/dom-replay-request.json','utf8'));
for(const stage of d.stages)add('t054-isolated-'+stage.name,{program:d.program,cwd:d.cwd,args:stage.args,pins:d.pins,timeoutMs:d.timeoutMsPerProcess});
const w=JSON.parse(readFileSync('qa/evidence/t040-grounded-product-composition/maker-withdrawal-spec.json','utf8'));add('t040-consent-withdrawal-current',{...w,env:w.environment??{}});
const qfile='qa/goal-2026-10-14/test-queue.json',q=JSON.parse(readFileSync(qfile,'utf8'));
q.active=null;q.updatedAt=new Date().toISOString();
for(const name of ['live-toc-preflight','live-toc-run']){const file=base+name+'.json';if(existsSync(file)&&!q.completed.some(x=>x.receipt===file)){const r=JSON.parse(readFileSync(file,'utf8'));q.completed.push({scope:name,receipt:file,exitCode:r.exitCode,elapsedMs:r.elapsedMs,hashesUnchanged:r.hashesUnchanged,scopeLimit:'approved bounded non-strict TOC slice; no DB/index/Ask/human acceptance'});}}
for(const name of ['setup','native-positive','unsafe-negative','known-clock','cleanup']){const file=base+'t011-protected-'+name+'.json',r=JSON.parse(readFileSync(file,'utf8'));q.completed.push({scope:'t011-protected-'+name,receipt:file,exitCode:r.exitCode,elapsedMs:r.elapsedMs,hashesUnchanged:r.hashesUnchanged,scopeLimit:'new private test-only UUID fixture; no production host acceptance'});}
q.completed.push(...skipped.map(s=>({scope:s.name,state:'preflight skipped',drift:s.drift})));writeFileSync(qfile,JSON.stringify(q,null,2)+'\n');
writeFileSync(base+'batch-fast11.json',JSON.stringify({ready,skipped},null,2)+'\n');console.log(JSON.stringify({ready,skipped}));
