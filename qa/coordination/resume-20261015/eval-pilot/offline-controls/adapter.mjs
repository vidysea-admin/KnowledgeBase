import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.cwd(),dir=resolve(root,'qa/coordination/resume-20261015/eval-pilot/offline-controls'),sha=b=>createHash('sha256').update(b).digest('hex');
async function main(){
 const started=Date.now(),cpuStart=process.cpuUsage(),rssStart=process.memoryUsage().rss;let deniedFetchCalls=0;
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{deniedFetchCalls++;throw Error('offline-controls-fetch-denied');};
 try{
  const closure=JSON.parse(await readFile(resolve(dir,'source-closure.json'),'utf8')),approved=JSON.parse(await readFile(resolve(dir,'approved-data-pins.json'),'utf8'));
  async function verify(pins){for(const p of pins){const bytes=await readFile(resolve(root,p.path));if(sha(bytes)!==p.sha256||p.bytes!==undefined&&bytes.length!==p.bytes)throw Error('input-source-drift');}}
  await verify(closure.files);await verify(approved);
  const ledgerPaths=['qa/coordination/resume-20261015/eval-pilot/provider-request-ledger.jsonl','qa/coordination/resume-20261015/eval-pilot/grant2/provider-request-reservations.jsonl'];
  const ledgerBefore=await Promise.all(ledgerPaths.map(async path=>({path,sha256:sha(await readFile(resolve(root,path)))})));
  const {freezeInputs,sourcePairIdentity}=await import(pathToFileURL(resolve(root,'scripts/eval/vectorless-production-eval.mjs')).href);
  const {lexicalSearchTurns}=await import(pathToFileURL(resolve(root,'packages/index/src/search/lexical.ts')).href);
  const {createNullRetriever,assessBaseline}=await import(pathToFileURL(resolve(root,'packages/index/src/eval/baseline.ts')).href);
  const corpus=freezeInputs(),ids=corpus.questions.map(q=>q.id),rawGolden=await readFile(resolve(root,'data/eval/golden-set.json'));
  if(sha(rawGolden)!=='07e507d5b1b297c97242d3d4f727f66227267378a4a8806006e533aac78e94be'||ids.length!==92||new Set(ids).size!==92||sha(JSON.stringify([...ids].sort()))!=='49881f7e8f47896c9a104c908d089a15cf3fe5908ea7a69e6bff61cc31f526b6')throw Error('accepted-golden-identity-mismatch');
  if(corpus.candidateIds.length!==29||sha(JSON.stringify(corpus.candidateIds))!=='033745a6e7b31dd23300281355fc87d57a156885fd0b4e65918e32b1cd53752c'||sourcePairIdentity()!==closure.sourcePair)throw Error('candidate-source-identity-mismatch');
  const blind=createNullRetriever(corpus.candidateIds),rows=[];let lexicalCalls=0,blindCalls=0;
  for(const q of corpus.questions){const lexical=[...new Set(lexicalSearchTurns(q.question,corpus.turns,corpus.turns.length).map(h=>h.sessionId))].slice(0,5);lexicalCalls++;
   const blindIds=blind(q.question,5);blindCalls++;const blindHit=blind('',5).includes(q.expectedSessionId);blindCalls++;
   rows.push({id:q.id,querySha256:sha(q.question),expectedSessionId:q.expectedSessionId,lexicalSessionIds:lexical,blindSessionIds:blindIds,lexicalHit:lexical.includes(q.expectedSessionId),blindHit});}
  const arm=key=>({k:5,total:rows.length,hits:rows.filter(r=>r[key]).length,recallAtK:rows.filter(r=>r[key]).length/rows.length,misses:rows.filter(r=>!r[key]).map(r=>({id:r.id,expectedSessionId:r.expectedSessionId}))});
  const lexicalArm=arm('lexicalHit'),blindArm=arm('blindHit'),assessment=assessBaseline(lexicalArm,blindArm,corpus.candidateIds.length);
  await verify(closure.files);await verify(approved);for(const p of corpus.bindings)await verify([p]);for(const l of ledgerBefore)if(sha(await readFile(resolve(root,l.path)))!==l.sha256)throw Error('paid-ledger-changed');
  if(deniedFetchCalls!==0)throw Error('offline-fetch-attempted');
  let rusage=null;try{rusage=process.resourceUsage();}catch{}const cpu=process.cpuUsage(cpuStart);
  const output={format:'offline-production-controls-v1',status:'CONTROLS_COMPLETED',ownExit:0,startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),wallMsExcludingLoaderStartup:Date.now()-started,mainProcessCpuMs:{user:cpu.user/1000,system:cpu.system/1000},childCpuAndActiveTime:null,memory:{rssStart,rssEnd:process.memoryUsage().rss,reportedMaxRssKiB:rusage?.maxRSS>0?rusage.maxRSS:null,v8OldSpaceLimitMiB:256,totalRssHardCapClaim:false},input:{rawGoldenPath:'data/eval/golden-set.json',rawGoldenSha256:sha(rawGolden),sortedAcceptedIDSetSha256:sha(JSON.stringify([...ids].sort())),orderedIDsSha256:sha(JSON.stringify(ids)),candidateIDsSha256:sha(JSON.stringify(corpus.candidateIds)),questionCount:rows.length,candidateCount:corpus.candidateIds.length,turnCount:corpus.turns.length,sourceBoundCorpusSha256:corpus.sha256,sourcePairIdentity:sourcePairIdentity(),commitObservedAtPreparation:closure.commit,sourcePins:closure.files,corpusBindings:corpus.bindings},algorithms:{lexical:'unchanged lexicalSearchTurns all-turn hits -> ordered session dedup -> first5',blind:'unchanged createNullRetriever candidate order -> first5; query ignored',selectedFunctions:['freezeInputs','lexicalSearchTurns','createNullRetriever','assessBaseline'],evaluatorProductionRuntimeCalled:false,providerOrDatabaseInitialized:false},callCounts:{lexical:lexicalCalls,blind:blindCalls,fetchDenied:deniedFetchCalls,explicitProviderFunctions:0},networkScope:'fetch denied in this process only; no claim of universal network interception. Selected control modules have no runtime provider/DB imports.',arms:{lexical:lexicalArm,questionBlind:blindArm,production:null},lexicalVsBlindAssessment:assessment,theoreticalChanceFloor:5/29,rows,paidLedgersUnchanged:ledgerBefore,modelUsage:{inputTokens:0,outputTokens:0,reason:'No model/provider function invoked by selected offline callgraph'},primaryPipelinePASS:false,answerCitationPASS:false,humanQualityPASS:false};
  await writeFile(resolve(dir,'result.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:output.status,ownExit:0,questions:92,candidates:29,lexical:{hits:lexicalArm.hits,total:92,recallAt5:lexicalArm.recallAtK,misses:lexicalArm.misses.map(m=>m.id)},questionBlind:{hits:blindArm.hits,total:92,recallAt5:blindArm.recallAtK,misses:blindArm.misses.map(m=>m.id)},fetchDeniedCalls:deniedFetchCalls,primaryPipelinePASS:false,answerCitationPASS:false}));
 }finally{globalThis.fetch=originalFetch;}
}
main().catch(async err=>{const receipt={status:'OFFLINE_CONTROLS_REFUSED',ownExit:2,errorName:['Error','TypeError','SyntaxError'].includes(err?.name)?err.name:'Error',errorCode:['ENOENT','EEXIST','EPERM'].includes(err?.code)?err.code:null,noRawErrorBody:true,primaryPipelinePASS:false};await writeFile(resolve(dir,'refusal.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));process.exitCode=2;});
