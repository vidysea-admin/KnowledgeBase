import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {acknowledgedCompletion} from './completed-session.mjs';
const sha=(...parts)=>createHash('sha256').update(parts.join('\0')).digest('hex');
function rig() {
  const job={id:`r-${sha('tenant-a','session').slice(0,32)}`,tenantId:'tenant-a',status:'done',payload:{runKey:'session',sourceFingerprint:'source'}};
  const state={sourceFingerprint:'source',stages:{capture:{outputFingerprint:'capture'},index:{outputFingerprint:sha('index','input')}}};
  const args={core:{loadQueue:()=>({ok:true,value:{state:{jobs:[job]}}}),realQueueFs:{},WEBINAR_PIPELINE:{},planNext:()=>({outcome:'complete'})},
    queueDir:'/owned',store:{load:()=>({ok:true,state})},tenantId:'tenant-a',id:'session',sourceFingerprint:'source',captureFingerprint:'capture',indexProof:{inputHash:'input'},now:1};
  return {job,state,args};
}
test('completion repair requires acknowledged own queue, exact generation identity and both current digests',()=>{
  assert.deepEqual(acknowledgedCompletion(rig().args),{generation:0});
  for(const mutate of [
    r=>r.job.status='leased',r=>r.job.tenantId='tenant-b',r=>r.job.id='forged-id',r=>r.job.payload.generation=1,
    r=>r.job.payload.sourceFingerprint='old',r=>r.state.sourceFingerprint='old',r=>r.args.captureFingerprint='changed-media',
    r=>r.args.indexProof.inputHash='changed-index',r=>r.args.indexProof.tenantId='tenant-b',
    r=>r.args.core.planNext=()=>({outcome:'failed-terminal'}),r=>r.args.store.load=()=>({ok:false,code:'corrupt'}),
  ]) {
    const r=rig();mutate(r);assert.equal(acknowledgedCompletion(r.args),null);
  }
});
