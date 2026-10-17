/** Read-only repair of the queue-complete -> operation-status crash gap, never marker-only success. */
import {createHash} from 'node:crypto';
const sha=(...parts)=>createHash('sha256').update(parts.join('\0')).digest('hex');
const runId=(tenant,key,generation)=>`r-${sha(...(generation===0?[tenant,key]:[tenant,key,String(generation)])).slice(0,32)}`;

export function acknowledgedCompletion({core,queueDir,store,tenantId,id,sourceFingerprint,captureFingerprint,indexProof,now}) {
  const loaded=core.loadQueue(core.realQueueFs,queueDir);
  if(!loaded.ok)return null;
  const own=loaded.value.state.jobs.filter(job=>job.tenantId===tenantId && job.payload && job.payload.runKey===id);
  const generation=job=>job.payload.generation??0;
  if(own.some(job=>!Number.isSafeInteger(generation(job))||generation(job)<0||generation(job)>10000))return null;
  own.sort((a,b)=>generation(b)-generation(a));
  const job=own[0];
  if(!job||job.status!=='done'||job.payload.sourceFingerprint!==sourceFingerprint||job.id!==runId(tenantId,id,generation(job)))return null;
  const loadedState=store.load(job.id);
  if(!loadedState.ok||!loadedState.state||loadedState.state.sourceFingerprint!==sourceFingerprint)return null;
  const state=loadedState.state;
  if(core.planNext(core.WEBINAR_PIPELINE,state,now).outcome!=='complete')return null;
  if(state.stages.capture.outputFingerprint!==captureFingerprint || state.stages.index.outputFingerprint!==sha('index',String(indexProof.inputHash)))return null;
  if((indexProof.tenantId&&indexProof.tenantId!==tenantId)||(indexProof.sessionId&&indexProof.sessionId!==id))return null;
  return {generation:generation(job)};
}
