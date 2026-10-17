import test from 'node:test';
import assert from 'node:assert/strict';
import { importAuthorizedExtraction } from './extraction-authorized-import.mjs';
test('only exact reviewed native labels reach evaluator; pending remains absent',()=>{
  const label={caseId:'c',artifactHash:'a'.repeat(64),claimId:'claim',stage:'persisted',status:'uncertain'};
  const seed={tenantId:'t',packetSha256:'p',cases:[{id:'c'}],items:[{id:'i',caseId:'c',inputSha256:'h',labelField:'labels',options:[label]},{id:'pending',caseId:'c',inputSha256:'h2',labelField:'factLabels',options:[]}]};
  const state={format:'extraction-review-state-v1',tenantId:'t',packetSha256:'p',reviews:{i:{revision:1,audit:[{revision:1,itemId:'i',inputSha256:'h',label}]}}};
  const consumed=[];
  const result=importAuthorizedExtraction(seed,state,c=>{consumed.push(c);return {id:c.id};},reports=>({count:reports.length}));
  assert.deepEqual(consumed[0].labels,[label]);assert.equal(consumed[0].factLabels,undefined);assert.equal(seed.cases[0].labels,undefined);assert.equal(result.measurement.summary.count,1);
  for(const mutate of [s=>s.tenantId='foreign',s=>s.packetSha256='stale',s=>s.reviews.i.audit[0].inputSha256='stale',s=>s.reviews.i.audit[0].label.status='supported']){
    const changed=structuredClone(state);mutate(changed);assert.throws(()=>importAuthorizedExtraction(seed,changed,()=>{},()=>{}));
  }
});
