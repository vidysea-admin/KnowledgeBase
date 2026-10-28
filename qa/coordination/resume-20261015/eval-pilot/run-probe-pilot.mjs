import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out=resolve(root,'qa/coordination/resume-20261015/eval-pilot'),started=Date.now();
const e=await import(pathToFileURL(resolve(root,'scripts/eval/vectorless-production-eval.mjs')).href);
const corpus=e.freezeInputs(),id=corpus.questions.map(q=>q.id).sort()[0];
const config={execution:'real-provider',mode:'pilot',dispatchReal:true,model:'glm-5.3-flash',questionIds:[id],grant:{scope:'single-question-pilot',id:'root-user-approved-ollama-single-question-20261015-probe-and-pilot'},limits:{maxAttempts:3,maxSeconds:60,callTimeoutMs:20000,maxInputBytes:32000,maxRequestBytes:32000,maxResponseBytes:262144,outputLimit:256,maxKnownInputTokens:32768,maxKnownOutputTokens:768}};
e.validateConfig(config);
const providerBytes=await readFile(resolve(root,'packages/ai/src/providers/ollama-cloud.ts'));
if(!providerBytes.toString('utf8').includes('OLLAMA_CLOUD_PRIMARY_MODEL = "glm-5.3-flash"'))throw Error('configured model changed');
const before=corpus.bindings.map(({path,sha256,bytes})=>({path,sha256,bytes}));
const grant={format:'root-single-question-pilot-binding-v1',actor:'root acting on explicit user-approved goal',id:config.grant.id,scope:config.grant.scope,approvedAt:new Date().toISOString(),expiresAt:new Date(started+120000).toISOString(),corpusSha256:corpus.sha256,sourceCandidateSha256:e.sourcePairIdentity(),configSha256:e.digest(config),selection:'first approved question ID sorted lexically',questionId:id,budget:config.limits,availability:'probe current configured GLM exactID then pilot; first actual production inference is authenticated access probe; no aliases/catalog assumption',evidenceReference:'root explicit model-probe plus productionpilot authorization; no Umesh signature asserted'};
await mkdir(out,{recursive:true});
for(const [name,value]of [['config.probe-pilot.json',config],['grant.probe-pilot.json',grant],['before.probe-pilot.json',before]])await writeFile(resolve(out,name),JSON.stringify(value,null,2)+'\n');
// Validate root grant/config/source before secret access. Values never enter logs/receipts.
if(grant.configSha256!==e.digest(config)||grant.corpusSha256!==corpus.sha256||!e.bindingsMatch(root,corpus))throw Error('grant/source mismatch');
let key=process.env.OLLAMA_API_KEY;
if(!key){const env=await readFile(resolve(root,'.env'),'utf8');const match=env.match(/^\s*(?:export\s+)?OLLAMA_API_KEY\s*=\s*(.*?)\s*$/m);if(match){key=match[1];if((key.startsWith('"')&&key.endsWith('"'))||(key.startsWith("'")&&key.endsWith("'")))key=key.slice(1,-1);}}
if(!key?.trim())throw Error('Ollama credential unavailable');
const cancellation=new AbortController(),timer=setTimeout(()=>cancellation.abort(),Math.max(1,60000-(Date.now()-started)));
let state=null,reason=null;try{state=await e.evaluate({corpus,config,directory:resolve(out,'private-checkpoint-probe-pilot'),credential:key,root,signal:cancellation.signal,pauseAfterQuestions:1});}catch(err){reason=err?.message==='Ollama credential unavailable'?'credential-unavailable':'production-evaluation-refused';}finally{clearTimeout(timer);key=undefined;}
const selected=state?.rows.find(r=>r.id===id);
const safeCitation=c=>{const o={};for(const k of ['id','sessionId','sessionRef','sourceId','sourceRef','turnId','turnIds','startMs','endMs','start','end','pageId','nodeId','sourceRevision','turnRevision'])if(c?.[k]!==undefined)o[k]=c[k];return o;};
const after=[];for(const b of before){const raw=await readFile(resolve(root,b.path));after.push({path:b.path,sha256:e.digest(raw),bytes:raw.length});}
const drift=after.filter((b,i)=>b.sha256!==before[i].sha256).map(b=>b.path);
const attempts=(state?.attempts??[]).map(a=>({id:a.id,model:a.model,status:a.status,inputBytes:a.inputBytes,requestSha256:a.requestSha256,inputTokens:a.inputTokens,outputTokens:a.outputTokens,startedAt:a.startedAt,elapsedMs:a.elapsedMs}));
const receipt={status:selected?.status??'production-precondition-refusal',ownExit:state&&selected?0:2,startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),latencyMs:Date.now()-started,productionEntrypoint:'scripts/eval/vectorless-production-eval.mjs#evaluate',algorithm:state?.algorithm??null,questionId:id,model:config.model,availabilityProbe:'first production inference; catalog not substituted for authenticated inference',rootGrantId:grant.id,corpusSha256:corpus.sha256,sourceCandidateSha256:grant.sourceCandidateSha256,configSha256:grant.configSha256,providerAttempts:attempts.length,attempts,totals:state?.totals??null,failure:state?.failure??reason,citations:(selected?.citations??[]).map(safeCitation),passageLocators:(selected?.passages??[]).map(p=>({...safeCitation(p),quoteSha256:p.quoteSha256})),retrievalHit:selected?.retrievalHit??null,selectedSessionIds:selected?.selectedSessionIds??[],usage:selected?.usage??null,answerPresent:typeof selected?.answer==='string'&&selected.answer.length>0,rawAnswerOmitted:true,rawPromptsOmitted:true,sourcePins:before.length,sourceDrift:drift,full92:false,semanticQuality:'unmeasured; no gold/human labels',acceptance:'HOLD'};
for(const [name,value]of [['after.probe-pilot.json',after],['receipt.probe-pilot.json',receipt]])await writeFile(resolve(out,name),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify(receipt));process.exitCode=receipt.ownExit;
