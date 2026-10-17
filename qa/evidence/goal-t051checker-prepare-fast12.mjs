import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';
const base='qa/evidence/goal-t051checker-broker-',hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),ready=[],skipped=[];
function save(name,s){const drift=Object.entries(s.pins).filter(([p,h])=>!existsSync(p)||hash(p)!==h.toLowerCase());if(drift.length){skipped.push({name,drift});return;}s.output=base+name;writeFileSync(s.output+'-spec.json',JSON.stringify(s,null,2)+'\n');ready.push(name);}
const original=JSON.parse(readFileSync('qa/evidence/goal-u23/cached-root-original/pins.json','utf8'));
const p=Object.fromEntries(original.flatMap(r=>[[r.Source,r.SourceSHA256],[r.Snapshot.replaceAll('\\','/'),r.SnapshotSHA256]]));
p['apps/api/src/visibility/knowledge.ts']='e97c65c1a29304b78257b6880ce27de49bafcefa7d45d1f0ca5da1182d70ea04';
p['apps/api/src/indexing/session.ts']='6734738ce50f493bc27c9db7b4170ed4db590f3dba6bda47f47dcbaa6e2709f5';
p['apps/api/src/composition/integrations/trusted-readers.ts']='d1afa507ba6d1f426d1da2c14f65178fb9d930e592cca0ee4b8d61e493727042';
p['qa/evidence/goal-u23/cached-root-taint-original.test.ts']='022da5db68294a6020409f8bd3e18c4606b2f1b72b35e1a8d478518a5e96b64e';
for(const file of ['packages/index/src/tree/search.ts','apps/api/src/transcript-review/effective-reader.ts','packages/index/src/index.ts','packages/core/src/index.ts','packages/db/src/lib/tenantScope.ts','apps/api/src/indexing/generation.ts'])p[file]=hash(file);
save('u23-cached-root-current-dependency-original-red',{args:['--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--import','tsx','qa/evidence/goal-u23/cached-root-taint-original.test.ts'],pins:p,timeoutMs:60000,reviewedRepins:{knowledge:'Two explicit false-consent guards only, checker-reviewed positive consent fixture',session:'Actual index-generation write/CAS body changed; this original reproduction never calls indexSession',trustedReaders:'Public session projection strips generation/private metadata; trustedTreeReads function still directly loads root and calls same visibility.trustedTree',eligibleTree:'Original vulnerable040dc bytes remain held. Original snapshots separately preserved and pinned.'}});
const old=JSON.parse(readFileSync(base+'u25-third-await-original-red-spec.json','utf8'));
const updates={
'apps/api/src/session-decisions/reader.ts':'5c6e9dda7e94610aea21ebf01508364a19a285d342cd826a9a05950b740878d5',
'apps/api/src/session-decisions/fixture.testsupport.ts':'5dd58be81441ea143ab7aac35df5e173f5f9038a90d6e3548048c4f3084fac68',
'apps/api/src/visibility/read-snapshot.ts':'1b97ff09d53b7c0f7fe10f13c23803290864e2f5d43c6f57568876ab281030cf',
'apps/api/src/composition/integrations/trusted-readers.ts':p['apps/api/src/composition/integrations/trusted-readers.ts'],
'qa/evidence/goal-u25-consumer/run-third-await.mjs':'f2ebfe400acc1c83fd67375f265c09b6126d189c254d25bc4a5dbbbcd41de73a'};
old.pins={...old.pins,...updates};old.args[1]='regression';old.timeoutMs=65000;
save('u25-third-await-current-regression',old);
writeFileSync(base+'batch-fast12.json',JSON.stringify({ready,skipped},null,2)+'\n');console.log(JSON.stringify({ready,skipped}));
