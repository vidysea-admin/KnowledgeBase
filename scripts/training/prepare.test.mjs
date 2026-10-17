/** All export/training success probes use disposable explicitly synthetic fixtures. No provider calls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { bindDerivedArtifacts } from '../lib/transcript-provenance.mjs';
import { prepareTrainingPlan } from './prepare.mjs';
import { trainingHash } from './plan.mjs';
import { validateTrainingPlan, trainingApproval } from './validate.mjs';
import { exportTrainingDataset, validateTrainingExport } from './export.mjs';
import { runPrivateTraining, validateLocalTrainingRecipe } from './train.mjs';
import { assertPrivateTrainingPath } from './private-path.mjs';
const now = new Date().toISOString(), future = new Date(Date.now()+3600000).toISOString();
const fixture = () => {const root=realpathSync(mkdtempSync(join(tmpdir(),'lkb-t015-synthetic-')));mkdirSync(join(root,'docs'));mkdirSync(join(root,'data/toc-migrated'),{recursive:true});writeFileSync(join(root,'docs/DECISIONS.md'),'');return root;};
function session(root,id,{tenantId='test',text=`PRIVATE_SYNTHETIC_TEXT_${id}`,sourceHash=trainingHash(id),verified=true,consent=true}={}) {
  const dir=join(root,'data/toc-migrated',id);mkdirSync(dir);
  const source={_id:`synthetic-${id}-src`,tenantId,kind:'document',synthetic:true,hash:sourceHash,consent:{given:consent}};
  const turn={_id:`${id}-turn`,tenantId,sessionId:id,speakerRef:'synthetic-speaker',tStart:0,tEnd:10,text};
  const evidence=[{sessionId:id,turnId:turn._id,quote:text}];
  for(const [name,data] of Object.entries({'source.json':source,'session.json':{_id:id,tenantId,sourceId:source._id},
    'turns.json':[turn],'claims.json':[{_id:`${id}-claim`,tenantId,text:`SYNTHETIC_CLAIM_${id}`,status:verified?'verified':'needs-review',evidence}],
    'session_page.json':{_id:`${id}-page`,tenantId,sessionId:id,evidence}})) writeFileSync(join(dir,name),JSON.stringify(data));
  bindDerivedArtifacts(dir);return dir;
}
const config=(sessions=['a','b','c','d'])=>({tenantId:'test',seed:'private-fixture-v1',sessions,relatedGroups:[]});
function grant(root,id,kind,value) {
  mkdirSync(join(root,'qa/evidence'),{recursive:true});
  const proof={format:'private-storage-proof-v1',kind:'fixed-private-local-volume',status:'verified',hostId:hostname(),destination:value.destination,
    verifiedBy:'Umesh',verifiedAt:now,expiresAt:future,evidence:'SYNTHETIC FIXTURE ASSERTION ONLY; NO REAL HOST PROOF'};
  const path=`qa/evidence/${id}-${kind}.json`,bytes=JSON.stringify(proof);writeFileSync(join(root,path),bytes);
  writeFileSync(join(root,'docs/DECISIONS.md'),`\n## ${id} | 2026-10-14 | type: decision | status: ACTIVE\n**Approved-by:** Umesh\n**${kind}:** ${JSON.stringify({version:1,revoked:false,privacy:'local-only',approvedAt:now,expiresAt:future,restrictions:'Synthetic fixture only; never real corpus',storageProof:{path,sha256:trainingHash(bytes)},...value})}\n`,{flag:'a'});
}
function setup() {const root=fixture();for(const id of config().sessions)session(root,id);return {root,plan:prepareTrainingPlan(root,config())};}
function approvedExport(root,plan) {
  const destination=join(root,'synthetic-export'),purpose='test-synthetic-only';
  grant(root,'D-900','Training-export',{fingerprint:plan.fingerprint,tenantId:'test',destination,purpose,taskFormat:plan.taskFormat});
  return exportTrainingDataset(root,plan,{decisionId:'D-900',destination,purpose});
}
test('metadata preparation deterministic, content-free, exact downstream validation and no corpus mutations',()=>{
  const {root,plan}=setup();try{
    const before=readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.json')).map(p=>[p,trainingHash(readFileSync(join(root,p)))]);
    assert.deepEqual(plan,prepareTrainingPlan(root,config()));assert.deepEqual(validateTrainingPlan(root,plan),plan);
    assert.equal(plan.counts.rows,4);assert.equal(plan.splitReady,true);assert.equal(plan.exported,false);
    assert.ok(plan.membership.every(s=>s.synthetic));assert.ok(!JSON.stringify(plan).includes('PRIVATE_SYNTHETIC_TEXT'));assert.ok(!JSON.stringify(plan).includes('SYNTHETIC_CLAIM'));
    assert.deepEqual(before,before.map(([p])=>[p,trainingHash(readFileSync(join(root,p)))]));
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('no current proof, withdrawn capture, source prohibition, foreign tenant and unverified claims never qualify',()=>{
  const root=fixture();try{
    const a=session(root,'a'),b=session(root,'b',{consent:false}),c=session(root,'c',{tenantId:'secret-foreign'}),d=session(root,'d',{verified:false});
    rmSync(join(a,'derivation-provenance.json'));
    const p=prepareTrainingPlan(root,config());assert.equal(p.counts.rows,0);assert.equal(p.status,'blocked-no-current-eligible-examples');assert.equal(p.exclusions.length,5);
    assert.ok(!JSON.stringify(p).includes('secret-foreign'));assert.ok(!JSON.stringify(p).includes('PRIVATE_SYNTHETIC_TEXT'));
    assert.throws(()=>prepareTrainingPlan(root,config(['../outside'])));assert.throws(()=>prepareTrainingPlan(root,config([])));
    const source=JSON.parse(readFileSync(join(b,'source.json')));source.consent.given=true;source.trainingUse={allowed:false};writeFileSync(join(b,'source.json'),JSON.stringify(source));bindDerivedArtifacts(b);
    assert.equal(prepareTrainingPlan(root,config(['b'])).counts.rows,0);
    source.trainingUse={allowed:true,expiresAt:'2000-01-01T00:00:00.000Z'};writeFileSync(join(b,'source.json'),JSON.stringify(source));bindDerivedArtifacts(b);
    assert.equal(prepareTrainingPlan(root,config(['b'])).counts.rows,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('duplicate source, cited turn, and transitive explicit relations never cross split boundaries',()=>{
  const root=fixture();try{
    session(root,'a');session(root,'b',{sourceHash:trainingHash('a')});session(root,'c',{text:'PRIVATE_SYNTHETIC_TEXT_b'});session(root,'d');session(root,'e');
    const cfg=config(['a','b','c','d','e']);cfg.relatedGroups=[['a','d']];const p=prepareTrainingPlan(root,cfg);
    assert.equal(p.counts.groups,2);assert.equal(p.splitReady,false);
    const same=p.leakageGroups.find(g=>g.includes('a'));assert.deepEqual(same,['a','b','c','d']);
    assert.equal(Object.values(p.splits).filter(ids=>ids.includes('a')).length,1);
  }finally{rmSync(root,{recursive:true,force:true});}
  // ISS-GOALT015-001: the real preparation loader excludes b, but b still connects a/c.
  const bridgeRoot=fixture();try{
    for(const id of ['a','b','c','d','e'])session(bridgeRoot,id);
    rmSync(join(bridgeRoot,'data/toc-migrated/b/derivation-provenance.json'));
    const cfg=config(['a','b','c','d','e']);cfg.relatedGroups=[['a','b'],['b','c']];
    const p=prepareTrainingPlan(bridgeRoot,cfg);
    assert.deepEqual(p.leakageGroups.find(g=>g.includes('a')),['a','c']);
    assert.equal(p.counts.acceptedSessions,4);assert.equal(p.counts.rows,4);assert.equal(p.counts.groups,3);
    assert.equal(p.splitReady,true);assert.ok(!p.membership.some(s=>s.sessionId==='b'));
    assert.ok(Object.values(p.splits).every(ids=>!ids.includes('b')));
    assert.deepEqual(p.exclusions,[{sessionId:'b',reason:'derivation-proof-missing'}]);
    assert.deepEqual(validateTrainingPlan(bridgeRoot,p),p);
  }finally{rmSync(bridgeRoot,{recursive:true,force:true});}
});
test('generic D-170, request approved flag, absent/stale/revoked/expired/foreign/superseded canonical grants deny before output',()=>{
  const {root,plan}=setup();try{
    const destination=join(root,'denied'),purpose='test-synthetic-only',options={decisionId:'D-170',destination,purpose,approved:true};
    writeFileSync(join(root,'docs/DECISIONS.md'),'## D-170 | 2026-10-14 | type: session | status: ACTIVE\n**Approved-by:** Umesh\n**What:** build ALL40\n');
    assert.throws(()=>exportTrainingDataset(root,plan,options));assert.equal(existsSync(destination),false);
    for(const path of [String.raw`\\server\share\data`,String.raw`\\?\UNC\server\share\data`,String.raw`\\?\C:\data`,String.raw`\\.\NUL`,String.raw`\??\C:\data`,String.raw`C:\NUL.txt`,String.raw`C:\file:stream`,'//server/share/data'])
      assert.throws(()=>assertPrivateTrainingPath(path,'win32')); // Pure guard only: never contacts a share/device.
    assert.equal(assertPrivateTrainingPath(String.raw`C:\private\new-data`,'win32'),String.raw`C:\private\new-data`);
    for(const [i,override] of [{fingerprint:'0'.repeat(64)},{tenantId:'other'},{destination:join(root,'other')},{revoked:true},{expiresAt:'2001-01-01T00:00:00.000Z'},{privacy:'external'},{storageProof:null}].entries()){
      const id=`D-${910+i}`;grant(root,id,'Training-export',{fingerprint:plan.fingerprint,tenantId:'test',destination,purpose,taskFormat:plan.taskFormat,...override});
      assert.throws(()=>exportTrainingDataset(root,plan,{...options,decisionId:id}));assert.equal(existsSync(destination),false);
    }
    const networkProof=JSON.stringify({format:'private-storage-proof-v1',kind:'network-volume',status:'verified',hostId:hostname(),destination,verifiedBy:'Umesh',verifiedAt:now,expiresAt:future,evidence:'SYNTHETIC NETWORK KIND; NEVER CONTACT A SHARE'});
    writeFileSync(join(root,'qa/evidence/synthetic-network-proof.json'),networkProof);
    grant(root,'D-918','Training-export',{fingerprint:plan.fingerprint,tenantId:'test',destination,purpose,taskFormat:plan.taskFormat,storageProof:{path:'qa/evidence/synthetic-network-proof.json',sha256:trainingHash(networkProof)}});
    assert.throws(()=>exportTrainingDataset(root,plan,{...options,decisionId:'D-918'}));assert.equal(existsSync(destination),false);
    grant(root,'D-920','Training-export',{fingerprint:plan.fingerprint,tenantId:'test',destination,purpose,taskFormat:plan.taskFormat});
    writeFileSync(join(root,'docs/DECISIONS.md'),'\n## D-921 | 2026-10-14 | type: decision | status: ACTIVE\n**Supersedes:** D-920 -- revoked\n',{flag:'a'});
    assert.throws(()=>trainingApproval(root,'D-920','Training-export',{}));
    assert.throws(()=>exportTrainingDataset(root,{...plan,approved:true},{...options,decisionId:'D-920'}));
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('exact approved synthetic local export consumed with count/hash parity; changed sources and export bytes refuse',()=>{
  const {root,plan}=setup();try{
    const r=approvedExport(root,plan);assert.equal(r.trained,false);assert.deepEqual(validateTrainingExport(root,r.destination),r);
    assert.equal(Object.values(r.files).reduce((n,f)=>n+f.count,0),4);
    writeFileSync(join(r.destination,'train.jsonl'),'invalid corpus\n');assert.throws(()=>validateTrainingExport(root,r.destination));
    const source=join(root,'data/toc-migrated/a/source.json');writeFileSync(source,readFileSync(source,'utf8')+' ');
    assert.throws(()=>validateTrainingPlan(root,plan));
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('invalid evidence and source generations reject; zero rows and fewer than three groups cannot export',()=>{
  const root=fixture();try{
    const dir=session(root,'a'),claims=join(dir,'claims.json'),rows=JSON.parse(readFileSync(claims));
    rows[0].evidence[0].quote='NOT_IN_CITED_TURN';writeFileSync(claims,JSON.stringify(rows));bindDerivedArtifacts(dir);
    const plan=prepareTrainingPlan(root,config(['a']));assert.equal(plan.counts.rows,0);
    assert.throws(()=>exportTrainingDataset(root,plan,{decisionId:'D-900',destination:join(root,'never'),purpose:'synthetic'}));assert.equal(existsSync(join(root,'never')),false);
    rows[0].evidence[0].quote='PRIVATE_SYNTHETIC_TEXT_a';rows[0].evidence[0].turnId='missing';writeFileSync(claims,JSON.stringify(rows));
    assert.equal(prepareTrainingPlan(root,config(['a'])).counts.rows,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('training errors and missing artifacts retain failed receipt without claiming model/evaluation',async()=>{
  const {root,plan}=setup();try{
    const r=approvedExport(root,plan),model=join(root,'synthetic-model.bin');writeFileSync(model,'synthetic');const executable=realpathSync(process.execPath),destination=join(root,'failed-run');
    const recipe={format:'private-training-recipe-v1',privacy:'local-only',taskFormat:'grounded-claim-v1',baseModel:'synthetic-only',baseModelPath:model,baseModelSha256:trainingHash('synthetic'),license:'fixture',trainerVersion:'fixture',
      executable,executableSha256:trainingHash(readFileSync(executable)),args:['{train}','{validation}','{output}','{model}'],artifacts:[],timeoutMs:100,seed:0,resources:'injected fake runner',checkpoint:'missing.bin'};
    grant(root,'D-950','Training-run',{fingerprint:plan.fingerprint,exportFingerprint:r.exportFingerprint,recipeFingerprint:trainingHash(JSON.stringify(recipe)),tenantId:'test',destination,purpose:'synthetic failure',baseModel:'synthetic-only'});
    const fake=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();queueMicrotask(()=>child.emit('close',null,'SIGKILL'));return child;};
    const report=await runPrivateTraining(root,{exportDir:r.destination,recipe,decisionId:'D-950',destination,purpose:'synthetic failure'},fake);
    assert.equal(report.status,'training-failed');assert.equal(report.checkpoint,null);assert.equal(report.evaluated,false);assert.equal(report.promoted,false);
    assert.equal(JSON.parse(readFileSync(join(destination,'training-run.json'))).status,'training-failed');
    const missingDestination=join(root,'zero-without-checkpoint');grant(root,'D-951','Training-run',{fingerprint:plan.fingerprint,exportFingerprint:r.exportFingerprint,recipeFingerprint:trainingHash(JSON.stringify(recipe)),tenantId:'test',destination:missingDestination,purpose:'synthetic failure',baseModel:'synthetic-only'});
    const zero=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();queueMicrotask(()=>child.emit('close',0,null));return child;};
    const missing=await runPrivateTraining(root,{exportDir:r.destination,recipe,decisionId:'D-951',destination:missingDestination,purpose:'synthetic failure'},zero);
    assert.equal(missing.status,'training-failed');assert.equal(missing.checkpoint,null);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('approved runner invokes exact private synthetic recipe, receives no heldout argument or secret env, and captures hashes only',async()=>{
  const {root,plan}=setup();try{
    const r=approvedExport(root,plan),model=join(root,'synthetic-model.bin');writeFileSync(model,'SYNTHETIC_BASE_MODEL');
    const executable=realpathSync(process.execPath),destination=join(root,'synthetic-checkpoint'),purpose='synthetic-runner-probe';
    const recipe={format:'private-training-recipe-v1',privacy:'local-only',taskFormat:'grounded-claim-v1',baseModel:'synthetic-only',baseModelPath:model,
      baseModelSha256:trainingHash(readFileSync(model)),license:'synthetic-fixture',trainerVersion:'fixture-1',executable,executableSha256:trainingHash(readFileSync(executable)),
      args:['{train}','{validation}','{output}','{model}'],artifacts:[],timeoutMs:1000,seed:1,resources:'no actual process; injected synthetic runner',checkpoint:'checkpoint.bin'};
    const trainerScript=join(root,'synthetic-trainer.mjs');writeFileSync(trainerScript,'// synthetic dependency only');
    const scripted={...recipe,args:[trainerScript,...recipe.args]};assert.throws(()=>validateLocalTrainingRecipe(scripted));
    scripted.artifacts=[{path:trainerScript,sha256:trainingHash(readFileSync(trainerScript))}];assert.equal(typeof validateLocalTrainingRecipe(scripted),'string');
    writeFileSync(trainerScript,'// changed synthetic dependency');assert.throws(()=>validateLocalTrainingRecipe(scripted));
    let calls=0;const stub=(program,args,options)=>{calls++;assert.equal(program,executable);assert.ok(!args.some(a=>a.includes('evaluation')));assert.equal(options.shell,false);assert.equal(options.env.OPENAI_API_KEY,undefined);
      const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();queueMicrotask(()=>{child.stdout.write('PRIVATE_SYNTHETIC_TEXT_DO_NOT_LOG');writeFileSync(join(destination,'checkpoint.bin'),'SYNTHETIC_MODEL_NOT_TRAINED');child.emit('close',0,null);});return child;};
    const opts={exportDir:r.destination,recipe,decisionId:'D-901',destination,purpose};
    await assert.rejects(runPrivateTraining(root,opts,stub));assert.equal(calls,0);assert.equal(existsSync(destination),false);
    grant(root,'D-901','Training-run',{fingerprint:plan.fingerprint,exportFingerprint:r.exportFingerprint,recipeFingerprint:trainingHash(JSON.stringify(recipe)),tenantId:'test',destination,purpose,baseModel:'synthetic-only'});
    const report=await runPrivateTraining(root,opts,stub);assert.equal(calls,1);assert.equal(report.status,'trainer-completed-unverified-checkpoint');assert.equal(report.evaluated,false);assert.equal(report.inferenceVerified,false);
    assert.equal(report.executionEvidence,'injected-test-runner');assert.equal(report.trainedModelVerified,false);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_SYNTHETIC_TEXT_DO_NOT_LOG'));
    assert.equal(report.checkpoint.sha256,trainingHash('SYNTHETIC_MODEL_NOT_TRAINED'));
  }finally{rmSync(root,{recursive:true,force:true});}
});
