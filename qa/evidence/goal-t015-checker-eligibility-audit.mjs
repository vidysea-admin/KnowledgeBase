/** Read-only existing-corpus audit. Emit counts/hashes/booleans only; never bind/export/train. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {prepareTrainingPlan,containedTrainingPath,TRAINING_ROOT} from '../../scripts/training/prepare.mjs';
import {trainingHash} from '../../scripts/training/plan.mjs';
try {
const [configArg,outArg]=process.argv.slice(2);
if(!configArg||!outArg||process.argv.length!==4)throw new Error('explicit metadata config and new output required');
const start=performance.now(),startedAt=new Date().toISOString();
const configBytes=readFileSync(resolve(configArg)),config=JSON.parse(configBytes),corpus=join(TRAINING_ROOT,'data/toc-migrated');
const before={},sourceMeta=[];
const ledgerPath=join(TRAINING_ROOT,'docs/DECISIONS.md');before.canonicalLedger=trainingHash(readFileSync(ledgerPath));
for(const sessionId of config.sessions){
 const dir=containedTrainingPath(corpus,join(corpus,sessionId)),buffers=new Map();
 for(const file of ['source.json','session.json','turns.json','claims.json','session_page.json','derivation-provenance.json','validation.json','transcript-qa.json']){
  const path=join(dir,file);if(existsSync(path)){const actual=containedTrainingPath(dir,path),bytes=readFileSync(actual);buffers.set(file,bytes);before[`${sessionId}/${file}`]=trainingHash(bytes);}
 }
 const json=file=>buffers.has(file)?JSON.parse(buffers.get(file)):null;
 const source=json('source.json'),claims=json('claims.json'),proof=json('derivation-provenance.json'),validation=json('validation.json'),qa=json('transcript-qa.json');
 sourceMeta.push({sessionId,tenantMatches:source?.tenantId===config.tenantId,
  consentGiven:source?.consent?.given===true,consentRevoked:source?.consent?.revoked===true,
  trainingUseExplicit:typeof source?.trainingUse?.allowed==='boolean'?source.trainingUse.allowed:null,
  trainingUseRevoked:source?.trainingUse?.revoked===true,capturePrivateMarkers:!!source?.captureConsent||source?.captureMode==='silent'||source?.privateWindows!==undefined||source?.guardedPrivateWindows!==undefined,
  claimCount:Array.isArray(claims)?claims.length:null,verifiedClaimCount:Array.isArray(claims)?claims.filter(c=>c.status==='verified').length:null,
  proofPresent:proof!==null,proofDeclaredCurrent:proof?.version===1&&proof?.status==='current',combinedGeneration:proof?.turnArtifact==='knowledge-turns.json',
  validationPresent:validation!==null,validationPassed:validation?.status==='passed'&&validation?.transcriptValidated===true,
  boundSourceHashMatches:buffers.has('source.json')&&validation?.sourceSha256===trainingHash(buffers.get('source.json')),
  boundTurnsHashMatches:buffers.has('turns.json')&&validation?.turnsSha256===trainingHash(buffers.get('turns.json')),
  boundQaHashMatches:buffers.has('transcript-qa.json')&&validation?.qaSha256===trainingHash(buffers.get('transcript-qa.json')),
  qaGenerationDeclaredV1:qa?.version===1,
  hashes:Object.fromEntries([...buffers].map(([file,bytes])=>[file,trainingHash(bytes)]))});
}
const plan=prepareTrainingPlan(TRAINING_ROOT,config);
const parent=new Map(config.sessions.map(id=>[id,id]));const find=id=>{while(parent.get(id)!==id)id=parent.get(id);return id;};
for(const group of config.relatedGroups??[])for(const id of group.slice(1))parent.set(find(id),find(group[0]));
const upperGroups=[...new Set(config.sessions.map(find))].map(root=>config.sessions.filter(id=>find(id)===root));
const after={canonicalLedger:trainingHash(readFileSync(ledgerPath))};
for(const key of Object.keys(before).filter(k=>k!=='canonicalLedger'))after[key]=trainingHash(readFileSync(join(corpus,key)));
const sourceUnchanged=Object.keys(before).every(k=>before[k]===after[k]);
const report={scope:'existing approved metadata only; no corpus text, provenance write, approval, export, training or private admission execution',startedAt,completedAt:new Date().toISOString(),elapsedMs:performance.now()-start,
 configSha256:trainingHash(configBytes),sourceMeta,declaredRelationIndependentGroupUpperBound:upperGroups.length,declaredRelationGroups:upperGroups,
 requiredNonemptyIndependentGroups:3,relationshipSelectionAloneCanSplit:upperGroups.length>=3,
 actualPlan:{fingerprint:plan.fingerprint,status:plan.status,counts:plan.counts,splitReady:plan.splitReady,exclusions:plan.exclusions},
 provenanceInterpretation:'D149 legacy-unbound staging permission does not establish current training derivation proof; no bind or grant created',
 qaInterpretation:'Hash-presence/match flags are metadata observations, not QA semantic or actual combined privacy-admission certification',sourceUnchanged,before,after};
writeFileSync(resolve(outArg),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({counts:plan.counts,status:plan.status,splitReady:plan.splitReady,independentGroupUpperBound:upperGroups.length,sourceUnchanged}));
if(!sourceUnchanged)process.exitCode=2;
} catch { console.error('metadata eligibility audit refused; no source material emitted');process.exitCode=2; }
