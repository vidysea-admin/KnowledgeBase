import {readFile,writeFile,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=resolve(root,'qa/coordination/resume-20261015/eval-pilot'),start=Date.now(),end=start+55000;
const hash=b=>createHash('sha256').update(b).digest('hex'),target='glm-5.3-flash',ledgerPath=resolve(out,'provider-request-ledger.jsonl');
const old=JSON.parse(await readFile(resolve(out,'receipt.probe-pilot-released.json'),'utf8'));
if(old.providerAttempts!==1||old.usage!==null)throw Error('historical request identity mismatch');
let ledger;try{ledger=(await readFile(ledgerPath,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code!=='ENOENT')throw e;ledger=[];}
async function append(row){const f=await open(ledgerPath,'a',0o600);try{await f.writeFile(JSON.stringify(row)+'\n');await f.sync();}finally{await f.close();}ledger.push(row);}
if(!ledger.length)await append({event:'reserved',id:1,kind:'historical-production-inference',inputBytes:724,usage:null,status:'failed-or-unknown',receipt:'receipt.probe-pilot-released.json'});
let allocated=ledger.filter(x=>x.event==='reserved').length;
if(allocated!==1)throw Error('no reset or duplicate request reservation permitted');
const provider=await readFile(resolve(root,'packages/ai/src/providers/ollama-cloud.ts'),'utf8');
if(!provider.includes('OLLAMA_CLOUD_PRIMARY_MODEL = "glm-5.3-flash"')||!provider.includes('https://ollama.com'))throw Error('provider identity mismatch');
const authority={actor:'root acting on explicit user-authorized Ollama goal',scope:'remaining2 requests including metadata/inference',historicalUnknownUsagePreserved:true,maxTotalRequests:3,outerProcessSeconds:60,innerHttpMs:20000,target,modelAliases:false,source:'parent explicit bounded transport-execution repair grant'};
await writeFile(resolve(out,'remaining-grant.json'),JSON.stringify(authority,null,2)+'\n');
let key=process.env.OLLAMA_API_KEY;if(!key){const env=await readFile(resolve(root,'.env'),'utf8'),m=env.match(/^\s*(?:export\s+)?OLLAMA_API_KEY\s*=\s*(.*?)\s*$/m);key=m?.[1];if(key&&((key.startsWith('"')&&key.endsWith('"'))||(key.startsWith("'")&&key.endsWith("'"))))key=key.slice(1,-1);}if(!key?.trim())throw Error('credential-unavailable');
const nativeFetch=globalThis.fetch;let totalInput=724,metadataStatus=null,errorCode=null,modelConfirmed=false,inferenceStatus=null,productionState=null;
async function reserve(kind,inputBytes){if(allocated>=3||Date.now()>=end||totalInput+inputBytes>32000)throw Error('remaining-budget-refusal');const id=++allocated;totalInput+=inputBytes;await append({event:'reserved',id,kind,inputBytes,usage:null,startedAt:new Date().toISOString()});return id;}
const mid=await reserve('authenticated-read-only-model-catalog',0);
try{const r=await nativeFetch('https://ollama.com/api/tags',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(Math.min(15000,Math.max(1,end-Date.now())))});metadataStatus=r.status;
if(r.status>=200&&r.status<300){const chunks=[];let size=0;for await(const b of r.body??[]){size+=b.length;if(size>262144)throw Error('metadata-byte-limit');chunks.push(b);}const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));modelConfirmed=Array.isArray(data.models)&&data.models.some(m=>m.name===target||m.model===target||m.id===target);}
await append({event:'result',id:mid,httpStatus:metadataStatus,errorCode:null,exactConfiguredModelPresent:modelConfirmed,usage:null});
}catch(e){errorCode=String(e.cause?.code??e.code??e.name??'unknown').replace(/[^A-Z0-9_a-z-]/g,'').slice(0,80);await append({event:'result',id:mid,httpStatus:metadataStatus,errorCode,usage:null});}
if(metadataStatus>=200&&metadataStatus<300&&modelConfirmed&&allocated<3&&end-Date.now()>5000){
const e=await import(pathToFileURL(resolve(root,'scripts/eval/vectorless-production-eval.mjs')).href),corpus=e.freezeInputs(),qid=corpus.questions.map(q=>q.id).sort()[0];
const remaining=Math.min(20000,Math.max(1,end-Date.now()-2000));const c={execution:'real-provider',mode:'pilot',dispatchReal:true,model:target,questionIds:[qid],grant:{scope:'single-question-pilot',id:'root-remaining-one-actual-production-inference-20261015'},limits:{maxAttempts:1,maxSeconds:Math.max(1,Math.floor((end-Date.now())/1000)),callTimeoutMs:remaining,maxInputBytes:32000-totalInput,maxRequestBytes:32000-totalInput,maxResponseBytes:262144,outputLimit:256,maxKnownInputTokens:32768,maxKnownOutputTokens:256}};e.validateConfig(c);
await writeFile(resolve(out,'remaining-config.json'),JSON.stringify(c,null,2)+'\n');await writeFile(resolve(out,'remaining-source-pins.json'),JSON.stringify(corpus.bindings.map(({path,sha256,bytes})=>({path,sha256,bytes})),null,2)+'\n');
globalThis.fetch=async(url,opt)=>{if(url!=='https://ollama.com/api/chat')throw Error('unapproved-endpoint');const body=JSON.parse(opt.body);if(body.model!==target||body.options?.num_predict!==256)throw Error('unapproved-model-output');const id=await reserve('actual-production-inference',Buffer.byteLength(opt.body));try{const r=await nativeFetch(url,{...opt,signal:AbortSignal.any([opt.signal,AbortSignal.timeout(Math.min(20000,Math.max(1,end-Date.now())))]),redirect:'error'});inferenceStatus=r.status;await append({event:'http-result',id,httpStatus:r.status,usage:null});return r;}catch(e){await append({event:'http-result',id,httpStatus:null,errorCode:String(e.cause?.code??e.code??e.name??'unknown').replace(/[^A-Z0-9_a-z-]/g,'').slice(0,80),usage:null});throw e;}};
try{productionState=await e.evaluate({corpus,config:c,directory:resolve(out,'private-checkpoint-remaining-one'),credential:key,root,pauseAfterQuestions:1,signal:AbortSignal.timeout(Math.max(1,end-Date.now()))});}finally{globalThis.fetch=nativeFetch;}
}
key=undefined;const row=productionState?.rows.find(r=>r.id===productionState.config.questionIds[0]);
const receipt={status:modelConfirmed?'production-attempt-or-refusal':'availability-check-stopped',ownExit:0,startedAt:new Date(start).toISOString(),completedAt:new Date().toISOString(),latencyMs:Date.now()-start,metadataHttpStatus:metadataStatus,errorCode,selectedModel:target,exactModelPresent:modelConfirmed,catalogIsNotInferenceAccessProof:true,inferenceHttpStatus:inferenceStatus,totalProviderRequestsReserved:allocated,historicalUnknownUsage:null,totalInputBytes:totalInput,productionStatus:row?.status??null,productionUsage:row?.usage??null,productionFailure:productionState?.failure??null,citationCount:row?.citations?.length??0,answerPresent:!!row?.answer,noRawBodiesOrPromptsPrinted:true,noAliases:true,full92:false,acceptance:'HOLD'};
await writeFile(resolve(out,'receipt.remaining-probe.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));

process.on('uncaughtException',async e=>{const receipt={status:'safe-launch-refusal',ownExit:2,errorName:e?.name??null,errorCode:String(e?.cause?.code??e?.code??'unknown').replace(/[^A-Z0-9_a-z-]/g,'').slice(0,80),noRawErrorBody:true};await writeFile(resolve(out,'receipt.remaining-launch-error.json'),JSON.stringify(receipt));console.log(JSON.stringify(receipt));process.exitCode=2;});
