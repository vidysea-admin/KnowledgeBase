import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileExtractionReviewStore } from './file-store.js';
import { hash } from './seed.js';
import type { RelationshipContext } from '../speaker-relations/types.js';

const human:RelationshipContext={tenantId:'fixture',actorId:'fixture-human',canPropose:false,canReview:true,reviewerKind:'human'};
test('fixture only: trusted review persists, replays refuse, export consumes evaluator, drift refuses',async()=>{
  const base=await mkdtemp(join(tmpdir(),'extraction-review-')),corpus=join(base,'corpus'),root=join(base,'private'),packetPath=join(corpus,'packet.json');
  try{
    await mkdir(corpus);
    const data=Buffer.from(JSON.stringify([{_id:'t',tenantId:'fixture',sessionId:'s',speakerRef:'p',text:'Fixture only',tStart:0,tEnd:1}]));
    await writeFile(join(corpus,'turns.json'),data);
    const claims=Buffer.from(JSON.stringify([{_id:'claim',tenantId:'fixture',sessionId:'s',text:'Fixture only',evidence:[]}]));await writeFile(join(corpus,'claims.json'),claims);
    const hashes={persisted:hash(claims),turns:hash(data)};
    const artifactHash=hash(JSON.stringify({version:1,id:'c',tenantId:'fixture',sessionId:'s',hashes}));
    const label={caseId:'c',artifactHash,claimId:'claim',stage:'persisted',status:'uncertain'};
    const context={candidate:'Fixture only',source:'Fixture only'};
    const inputSha256=hash(JSON.stringify({id:'item',caseId:'c',artifactHash,context,labelField:'labels',options:[label]}));
    await writeFile(packetPath,JSON.stringify({format:'extraction-review-seed-v1',tenantId:'fixture',cases:[{id:'c',sessionId:'s',artifacts:{turns:{path:'turns.json',sha256:hash(data),bytes:data.length},persisted:{path:'claims.json',sha256:hash(claims),bytes:claims.length}}}],items:[{id:'item',caseId:'c',inputSha256,context,labelField:'labels',options:[label]}]}));
    const store=()=>createFileExtractionReviewStore({root,projectRoot:corpus,packetPath,now:()=> '2026-10-15T12:00:00.000Z'});
    assert.equal((await store().read(human)).reviewedCount,0);
    await assert.rejects(store().read({...human,reviewerKind:'automation'}),/forbidden/);
    await assert.rejects(store().read({...human,tenantId:'foreign'}),/not_found/);
    const submission={expectedRevision:0,inputSha256,label,affirmIndividualReview:true as const,rationale:'Synthetic fixture assertion; not actual human evidence.'};
    const saved=await store().approve(human,'item',submission);assert.equal(saved.items[0]!.revision,1);assert.equal(saved.items[0]!.review!.actorId,'fixture-human');
    const durable=await readFile(join(root,`${hash('fixture')}.json`),'utf8');assert.equal((await store().read(human)).reviewedCount,1);
    await assert.rejects(store().approve(human,'item',submission),/conflict/);assert.equal(await readFile(join(root,`${hash('fixture')}.json`),'utf8'),durable);
    const exported=await store().export(human);assert.equal(exported.measurement.cases[0]!.semantic.counts.uncertain,1);assert.equal(exported.measurement.cases[0]!.semantic.factsMeasured,false);assert.equal(exported.humanGoldVerified,false);
    await mkdir(join(root,`${hash('fixture')}.lock`));await assert.rejects(store().approve(human,'item',{...submission,expectedRevision:1}),/conflict/);await rm(join(root,`${hash('fixture')}.lock`),{recursive:true});
    await writeFile(join(corpus,'turns.json'),'[]');await assert.rejects(store().export(human),/sources_changed/);
  }finally{await rm(base,{recursive:true,force:true});}
});
