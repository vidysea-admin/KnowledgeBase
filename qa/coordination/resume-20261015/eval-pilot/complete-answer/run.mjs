import {readFile,writeFile,appendFile,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export const hash=b=>createHash('sha256').update(b).digest('hex');
const ROOT=process.cwd(),DIR=resolve(ROOT,'qa/coordination/resume-20261015/eval-pilot/complete-answer');
export function approvalGate(a,now=Date.now()) {
 if(a.approvalState!=='approved'||typeof a.humanApprovalReference!=='string'||!a.humanApprovalReference.trim()
  ||!Number.isFinite(Date.parse(a.approvedAt))||Date.parse(a.approvedAt)>now||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=now)throw Error('awaiting-human');
}
export async function verifyPlan(root=ROOT,dir=DIR) {
 const plan=JSON.parse(await readFile(resolve(dir,'launch-pins.json'),'utf8'));
 for(const p of plan.files)if(hash(await readFile(resolve(root,p.path)))!==p.sha256)throw Error('launch-pin-drift');
 const config=JSON.parse(await readFile(resolve(dir,'config.pending.json'),'utf8'));
 if(hash(JSON.stringify(config))!==plan.configSha256)throw Error('config-drift');
 return {plan,config};
}
export function physicalGate(url,opt,config,usage) {
 const body=JSON.parse(opt.body),bytes=Buffer.byteLength(opt.body,'utf8');
 if(String(url)!=='https://ollama.com/api/chat'||opt.method!=='POST'||body.model!=='glm-5.3-flash'||body.stream!==false||body.options?.num_predict!==768
  ||bytes>65536||usage.calls>=12||usage.bytes+bytes>327680||config.limits.maxAttempts!==12||config.limits.outputLimit!==768)throw Error('physical-request-refusal');
 usage.calls++;usage.bytes+=bytes;return bytes;
}
export async function main({offline=false,root=ROOT,dir=DIR}={}) {
 const started=Date.now(),{plan,config}=await verifyPlan(root,dir);
 if(offline){const pending=JSON.parse(await readFile(resolve(dir,'authorization.pending.json'),'utf8'));let blocked=false;try{approvalGate(pending);}catch{blocked=true;}
  if(!blocked)throw Error('pending-authority-unexpected');return {status:'OFFLINE_LAUNCH_PREFLIGHT_READY',files:plan.files.length,awaitingHumanBlocks:true,credentialReads:0,providerCalls:0};}
 const authorizationPath=resolve(dir,'authorization.approved.json'),approved=JSON.parse(await readFile(authorizationPath,'utf8'));approvalGate(approved);
 // All code/config/data/prior-ledger admission and complete-answer feasibility precede key access.
 const e=await import(pathToFileURL(resolve(root,'scripts/eval/vectorless-production-eval.mjs')).href),corpus=e.freezeInputs();
 e.validateConfig(config);let auth=e.validateCompleteAuthorization(authorizationPath,corpus,config);
 if(e.sourcePairIdentity()!==plan.sourcePair||corpus.sha256!==plan.corpusSha256||!e.bindingsMatch(root,corpus))throw Error('current-source-corpus-drift');
 await e.preflightEvaluation(corpus,config);auth=e.validateCompleteAuthorization(authorizationPath,corpus,config);
 const once=await open(resolve(dir,'launch-once.json'),'wx',0o600);try{await once.writeFile(JSON.stringify({authorizationSha256:auth.sha256,startedAt:new Date(started).toISOString(),neverRefunded:true})+'\n');await once.sync();}finally{await once.close();}
 await writeFile(resolve(dir,'execution-before-pins.json'),JSON.stringify(corpus.bindings,null,2)+'\n',{flag:'wx'});
 let key=process.env.OLLAMA_API_KEY;if(!key){const env=await readFile(resolve(root,'.env'),'utf8'),m=env.match(/^\s*(?:export\s+)?OLLAMA_API_KEY\s*=\s*(.*?)\s*$/m);key=m?.[1];if(key&&((key.startsWith('"')&&key.endsWith('"'))||(key.startsWith("'")&&key.endsWith("'"))))key=key.slice(1,-1);}if(!key?.trim())throw Error('credential-unavailable');
 const native=globalThis.fetch,usage={calls:0,bytes:0},used=new Set();let networkCalls=0;
 globalThis.fetch=async(url,opt)=>{const requestBytes=physicalGate(url,opt,config,usage);
  const reservations=(await readFile(auth.ledgerPath,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),row=reservations.find(r=>!used.has(r.id));
  if(!row||row.id<6||row.id>17||row.grantSha256!==auth.sha256||row.inputBytes!==requestBytes)throw Error('reservation-refusal');used.add(row.id);
  const start=Date.now();try{networkCalls++;const response=await native(url,{...opt,redirect:'error',signal:AbortSignal.any([opt.signal,AbortSignal.timeout(20000)])});await appendFile(resolve(dir,'provider-http-results.jsonl'),JSON.stringify({cumulativeRequestId:row.id,httpStatus:response.status,elapsedMs:Date.now()-start})+'\n');return response;}
  catch(err){const raw=err?.cause?.code??err?.code??err?.name,errorCode=['ENOTFOUND','ETIMEDOUT','ECONNRESET','ECONNREFUSED','AbortError','TimeoutError'].includes(raw)?raw:'unknown';await appendFile(resolve(dir,'provider-http-results.jsonl'),JSON.stringify({cumulativeRequestId:row.id,httpStatus:null,errorCode,elapsedMs:Date.now()-start})+'\n');throw err;}};
 const evalStart=Date.now();await writeFile(resolve(dir,'evaluate-start.json'),JSON.stringify({epochMs:evalStart})+'\n',{flag:'wx'});let state;
 try{state=await e.evaluate({corpus,config,directory:auth.checkpointDirectory,authorizationPath,credential:key,root,pauseAfterQuestions:1,signal:AbortSignal.timeout(210000)});}finally{key=undefined;globalThis.fetch=native;}
 const row=state.rows.find(r=>r.id===config.questionIds[0]),reservations=(await readFile(auth.ledgerPath,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 const quoteMeta=p=>Object.fromEntries(Object.entries(p??{}).filter(([k,v])=>['sourceId','turnId','sessionId','sessionRef','charStart','charEnd','tStart','tEnd','startMs','endMs','speakerRef','sourceRevision','turnRevision','quoteSha256'].includes(k)&&v!==undefined));
 const cites=(row.citations?.internal??[]).map(c=>({nodeId:c.node_id??c.id??null,sessionRef:c.evidence?.sessionRef??null,sourceQuotes:(c.evidence?.sourceQuotes??[]).map(p=>({...quoteMeta(p),quoteSha256:typeof p.quote==='string'?hash(p.quote):null}))}));
 const after=[];for(const p of corpus.bindings){const b=await readFile(resolve(root,p.path));after.push({path:p.path,bytes:b.length,sha256:hash(b)});}const drift=after.filter((p,i)=>p.sha256!==corpus.bindings[i].sha256).map(p=>p.path);
 const receipt={status:row.status,ownExit:0,evaluationSucceeded:row.status==='answered',questionId:row.id,model:config.model,corpusSha256:corpus.sha256,sourceCandidateSha256:e.sourcePairIdentity(),configSha256:e.digest(config),authorizationSha256:auth.sha256,startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),totalMs:Date.now()-started,evaluateMs:Date.now()-evalStart,evaluateBudgetMet:Date.now()-evalStart<=210000,actualNewProviderCalls:networkCalls,physicalAdmissions:usage.calls,actualRequestBytes:usage.bytes,cumulativeReservedIds:reservations.map(r=>r.id),priorProviderRequests:5,cumulativeProviderRequests:5+reservations.length,newUsage:row.usage,aggregateLifetimeUsage:null,historicalUnknownUsagePreserved:true,attempts:state.attempts.map(a=>({id:a.id,cumulativeRequestId:a.cumulativeRequestId,status:a.status,inputBytes:a.inputBytes,inputTokens:a.inputTokens,outputTokens:a.outputTokens,elapsedMs:a.elapsedMs,providerHttpStatus:a.providerHttpStatus,providerFinishReason:a.providerFinishReason,diagnostic:a.diagnostic})),totals:state.totals,diagnostic:row.diagnostic??null,executionStage:row.executionStage??null,providerStep:row.providerStep??null,failure:state.failure,answerPresent:typeof row.answer==='string'&&row.answer.length>0,answerSha256:typeof row.answer==='string'?hash(row.answer):null,answerContentNotPrinted:true,citations:cites,passageLocators:(row.passages??[]).map(quoteMeta),retrievalHit:row.retrievalHit??null,selectedSessionIds:row.selectedSessionIds,sourcePins:after.length,sourceDrift:drift,all92RowsRetained:state.rows.length===92,full92:false,auditDisposition:'Original audits and snapshots preserved',qualityAcceptance:'HOLD: no human gold or independent semantic acceptance'};
 await writeFile(resolve(dir,'execution-after-pins.json'),JSON.stringify(after,null,2)+'\n',{flag:'wx'});await writeFile(resolve(dir,'actual-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main({offline:process.argv.includes('--offline-preflight')}).then(r=>console.log(JSON.stringify(r))).catch(async err=>{const safe={status:'production-launch-refused',ownExit:2,errorName:['Error','TypeError','SyntaxError'].includes(err?.name)?err.name:'Error',errorCode:['EPERM','ENOENT','EEXIST'].includes(err?.code)?err.code:null,noRawErrorBody:true,auditUntouched:true};await writeFile(resolve(DIR,'launch-refusal.json'),JSON.stringify(safe,null,2)+'\n',{flag:'wx'}).catch(()=>{});console.log(JSON.stringify(safe));process.exitCode=2;});
