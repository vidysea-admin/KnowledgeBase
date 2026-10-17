import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {buildTrainingPlan,trainingHash} from '../../scripts/training/plan.mjs';
import {assertPrivateTrainingPath} from '../../scripts/training/private-path.mjs';
const startedAt=new Date().toISOString(), started=performance.now();
const generation=id=>({hashes:{'source.json':trainingHash(id)},documents:{
 source:{_id:`synthetic-${id}-source`,tenantId:'checker',hash:trainingHash(`source-${id}`),synthetic:true,consent:{given:true}},
 session:{_id:id,tenantId:'checker',sourceId:`synthetic-${id}-source`},
 turns:[{_id:`${id}-turn`,tenantId:'checker',sessionId:id,speakerRef:'synthetic-speaker',tStart:0,tEnd:1,text:`SYNTHETIC_UNIQUE_${id}`}],
 claims:[{_id:`${id}-claim`,tenantId:'checker',status:'verified',text:`SYNTHETIC_CLAIM_${id}`,evidence:[{sessionId:id,turnId:`${id}-turn`}]}]
}});
const generations=['a','c','d','e'].map(generation), failures=[], samples=[];
for(let i=0;i<20;i++){
 const config={tenantId:'checker',seed:`independent-${i}`,sessions:['a','b','c','d','e'],relatedGroups:[['a','b'],['b','c']]};
 const plan=buildTrainingPlan(generations,config,[{sessionId:'b',reason:'derivation-proof-missing'}]);
 const splitOf=id=>Object.entries(plan.splits).find(([,ids])=>ids.includes(id))?.[0];
 const sample={seed:config.seed,groups:plan.leakageGroups,splitA:splitOf('a'),splitC:splitOf('c'),splitReady:plan.splitReady};
 samples.push(sample);if(sample.splitA!==sample.splitC || !plan.leakageGroups.some(ids=>ids.includes('a')&&ids.includes('c')) || plan.membership.some(s=>s.sessionId==='b') || Object.values(plan.splits).some(ids=>ids.includes('b')))failures.push(sample);
}
const paths=['\\\\server\\share\\new','//server/share/new','\\\\?\\C:\\new','\\\\.\\pipe\\new','\\??\\C:\\new','C:\\new:stream','C:\\NUL','C:\\CON.txt','C:\\AUX','C:\\LPT1','C:new','https://example.invalid/new'];
const refused=paths.map(path=>{try{assertPrivateTrainingPath(path,'win32');return {path,refused:false};}catch{return {path,refused:true};}});
let foreignRefused=false;try{const foreign=generation('f');foreign.documents.source.tenantId='foreign';buildTrainingPlan([foreign],{tenantId:'checker',seed:'tenant',sessions:['f'],relatedGroups:[]});}catch{foreignRefused=true;}
let permissionRefused=false;try{const withdrawn=generation('w');withdrawn.documents.source.trainingUse={revoked:true};buildTrainingPlan([withdrawn],{tenantId:'checker',seed:'permission',sessions:['w'],relatedGroups:[]});}catch{permissionRefused=true;}
const report={scope:'independent in-memory synthetic metadata and pure lexical refusal; no filesystem corpus, export or trainer',startedAt,completedAt:new Date().toISOString(),elapsedMs:performance.now()-started,
 relatedThroughExcludedSession:{cases:20,crossSplitViolations:failures.length,samples},privateNamespaceRefusals:{cases:paths.length,refused:refused.filter(p=>p.refused).length,results:refused},foreignRefused,permissionRefused};
writeFileSync(new URL('./goal-t015-cycle1-ledger-replay.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({crossSplitViolations:failures.length,cases:20,privatePathsRefused:report.privateNamespaceRefusals.refused,foreignRefused,permissionRefused}));
if(failures.length||refused.some(p=>!p.refused)||!foreignRefused||!permissionRefused)process.exitCode=1;
