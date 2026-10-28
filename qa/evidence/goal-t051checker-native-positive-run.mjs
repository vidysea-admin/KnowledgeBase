import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const prefix='qa/evidence/goal-t051checker-broker-t011-protected';
const script='packages/meeting-bot/src/capture/record-consent/native-acl-fixture.ps1';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const approved={
 [script]:'667560a2805af9e70c391d362e29306a98da20cb6a2cbb6f9af71048d152914b',
 'packages/meeting-bot/src/capture/record-consent/controller-bridge.test.ts':'68cb585bacae29f85edfafee8a003a877367204bbcd335ec1c15634a5f0357cb',
 'packages/meeting-bot/src/capture/record-consent/private-acl.ts':'f3f26d13bdd6f778d9dca39aa8ae02909c248984049f73cdb9b3101b3f5d7a35',
 'apps/api/src/bot-privacy/private-acl.ts':'f3f26d13bdd6f778d9dca39aa8ae02909c248984049f73cdb9b3101b3f5d7a35',
 'packages/meeting-bot/src/capture/record-consent/private-acl.test.ts':'d0701137238a1c7e0dcab0ea5bc7383ab846e029bf671ba61d5cb4a875df576b'
};
const old=JSON.parse(readFileSync('qa/evidence/goal-t051checker-broker-t011-known-clock-diagnostic-spec.json','utf8'));
const pins={...old.pins,...approved};
for(const [p,h] of Object.entries(pins))assert.equal(hash(p),h.toLowerCase(),'preflight '+p);
const ps=path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const env={PSModulePath:path.join(path.dirname(ps),'Modules')};
let fixture=null;
function run(name,spec){
 spec={...spec,pins,output:prefix+'-'+name};
 assert(!existsSync(spec.output+'.json'),'Immutable output already exists');
 const file=spec.output+'-spec.json';writeFileSync(file,JSON.stringify(spec,null,2)+'\n');
 const r=spawnSync(process.execPath,['qa/evidence/goal-t051checker-broker-run.mjs',file],{encoding:'utf8',timeout:spec.timeoutMs+5000,maxBuffer:4*1024*1024,windowsHide:true});
 if(!existsSync(spec.output+'.json'))throw Error('Missing child receipt: '+name+' '+r.stderr);
 const receipt=JSON.parse(readFileSync(spec.output+'.json','utf8'));
 console.log(JSON.stringify({name,exit:receipt.exitCode,elapsedMs:receipt.elapsedMs,unchanged:receipt.hashesUnchanged}));
 return receipt;
}
try {
 const setup=run('setup',{program:ps,args:['-NoProfile','-NonInteractive','-File',path.resolve(script),'-Action','Create'],env,timeoutMs:10000});
 assert.equal(setup.exitCode,0,'Fixture setup failed');
 fixture=JSON.parse(readFileSync(setup.stdoutPath,'utf8').replace(/^\uFEFF/,''));
 const target=path.resolve(fixture.fixtureDirectory),base=path.resolve('qa/evidence/native-acl-fixtures');
 assert.equal(path.dirname(target).toLowerCase(),base.toLowerCase());
 assert.match(path.basename(target),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
 const test='packages/meeting-bot/src/capture/record-consent/private-acl.test.ts';
 const common=['--import','tsx','--test','--test-concurrency=1','--test-timeout=30000'];
 const pos=run('native-positive',{args:[...common,test],env:{...env,LKB_PRIVATE_ACL_PROBE_DIR:target},timeoutMs:45000});
 const unsafe=JSON.parse(readFileSync('qa/evidence/goal-t051checker-broker-native-acl-fixture.json','utf8')).directory;
 const neg=run('unsafe-negative',{args:[...common,'--test-name-pattern=explicit real Windows ACL probe',test],env:{...env,LKB_PRIVATE_ACL_PROBE_DIR:unsafe},timeoutMs:45000});
 assert.equal(neg.exitCode,1,'Unsafe directory unexpectedly accepted');
 assert.match(readFileSync(neg.stdoutPath,'utf8'),/permits an unrelated identity/);
 assert.equal(pos.exitCode,0,'Native positive/semantics failed');
 run('known-clock',{args:old.args,env:{...env,LKB_PRIVATE_ACL_PROBE_DIR:target},timeoutMs:90000});
} finally {
 if(fixture)run('cleanup',{program:ps,args:['-NoProfile','-NonInteractive','-File',path.resolve(script),'-Action','Cleanup','-FixtureDirectory',fixture.fixtureDirectory],env,timeoutMs:10000});
}
