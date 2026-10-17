import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const h=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const base='qa/evidence/goal-t051checker-broker-';
const previous=JSON.parse(readFileSync(base+'batch-next.json'));
const q=JSON.parse(readFileSync('qa/goal-2026-10-14/test-queue.json'));
q.active=null;q.updatedAt=new Date().toISOString();
for(const n of previous.ready){const r=JSON.parse(readFileSync(base+n+'.json'));q.completed.push({scope:n,exitCode:r.exitCode,elapsedMs:r.elapsedMs,hashesUnchanged:r.hashesUnchanged,receipt:base+n+'.json'});console.log(n,JSON.stringify({exit:r.exitCode,ms:r.elapsedMs,unchanged:r.hashesUnchanged,summary:readFileSync(r.stdoutPath,'utf8').match(/^# (?:tests|pass|fail|skipped|duration_ms).*$/gm)}));}
const ready=[],skipped=[];
function spec(n,args,pins,timeoutMs=60000){const drift=Object.entries(pins).filter(([p,v])=>!existsSync(p)||h(p)!==v.toLowerCase());if(drift.length){skipped.push({n,drift});return;}const s={args,pins,timeoutMs,output:base+n,cwd:process.cwd()};writeFileSync(base+n+'-spec.json',JSON.stringify(s,null,2)+'\n');ready.push(n);}
const t060=JSON.parse(readFileSync('qa/evidence/goal-t060-maker-spec.json'));spec('t060-maker',t060.args,t060.pins,t060.timeoutMs);
function packetPins(p){const t=readFileSync(p,'utf8');return Object.fromEntries([...t.matchAll(/(?:\|\s*)?([\w./-]+\.(?:ts|tsx|mjs|jsonl|json|yaml))\s*(?:\|\s*)?([a-fA-F0-9]{64})/g)].map(m=>[m[1],m[2]]));}
spec('t036-guard', ['--test','--test-concurrency=1','--test-timeout=30000','--import','tsx','packages/ingest/src/sources/guarded-fetch.test.ts'],packetPins('qa/packets/t036-ssrf-documentation-prefix.md'),120000);
const p37=packetPins('qa/packets/all40goal-t037.md');spec('t037-node',['--test','--test-concurrency=1','--test-timeout=30000','--import','tsx','packages/meeting-bot/src/calendar/join-rules/registration-policy.test.ts','scripts/webinar/registration-policy-host.test.ts'],p37,120000);
writeFileSync(base+'batch-fast.json',JSON.stringify({ready,skipped},null,2)+'\n');q.active={agent:'/root/docker_checker',scope:ready.join(','),state:'serial frozen focused batch'};writeFileSync('qa/goal-2026-10-14/test-queue.json',JSON.stringify(q,null,2)+'\n');console.log(JSON.stringify({ready,skipped}));
