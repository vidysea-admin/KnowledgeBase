import { generateKeyPairSync, sign } from 'node:crypto';
import { canonical, sha256 } from '../../../../../scripts/qa/capture-operations-evidence.mjs';
import { validateOperations, REQUIRED_GATES } from '../../../../../scripts/qa/capture-operations-acceptance.mjs';
const trust={version:1,keys:[]}, pairs={};
for(const id of ['pwin','plinux','review']) {
 const pair=generateKeyPairSync('ed25519'); pairs[id]=pair;
 const pem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
 trust.keys.push({id,role:id==='review'?'reviewer':'producer',algorithm:'ed25519',publicKeyPem:pem,publicKeySha256:sha256(pem),principal:id,hostId:id==='pwin'?'windows':'linux',platform:id==='pwin'?'win32':'linux',allowedHosts:['windows','linux']});
}
const start='2026-10-01T00:00:00.000Z', end='2026-10-08T00:00:00.000Z';
const bundle={version:1,candidateSha:'a'.repeat(40),environmentSha256:'b'.repeat(64),tenantId:'test',gates:[]};
const observed={'fixture.bin':{sha256:'c'.repeat(64),bytes:1}};
function receipts(g) {
 const payloadHash=sha256(canonical({id:g.id,binding:g.binding,measurement:g.measurement,artifacts:g.artifacts}));
 for(const [field,keyId,kind] of [['producerReceipt',g.binding.platform==='win32'?'pwin':'plinux','native-observation'],['reviewReceipt','review','independent-review']]) {
  const body={keyId,kind,binding:g.binding,payloadHash};
  g[field]={...body,signature:sign(null,Buffer.from(canonical(body)),pairs[keyId].privateKey).toString('base64')};
 }
}
for(const id of REQUIRED_GATES) {
 const linux=id==='ubuntu-restart';
 const binding={candidateSha:bundle.candidateSha,environmentSha256:bundle.environmentSha256,tenantId:'test',hostId:linux?'linux':'windows',platform:linux?'linux':'win32',sessionId:id};
 const measurement={synthetic:false,source:'native-runtime',startedAt:start,endedAt:end,failures:[],audioDecoded:true,videoDecoded:true,cleanupVerified:true,mediaSeconds:3600,mediaBytes:1,height:720,isolationVerified:true,unattended:true,coverageSeconds:604800,coverageGaps:[],alertReceiptVerified:true,actualHostRestart:true,actualControllerRestart:true,recovered:true,playableAfterRecovery:true,ownedCleanupVerified:true};
 const artifacts=[{id:'a',path:'fixture.bin',sha256:'c'.repeat(64),bytes:1},{id:'b',path:'fixture.bin',sha256:'c'.repeat(64),bytes:1}];
 measurement.tabs=['a','b'].map(x=>({sessionId:x,profileId:x,artifactId:x,audioDecoded:true,videoDecoded:true,startedAt:start,endedAt:end}));
 const gate={id,binding,measurement,artifacts};receipts(gate);bundle.gates.push(gate);
}
console.log('SYNTHETIC CHECKER PROBE; no native operational evidence');
console.log('signed fixture baseline:',validateOperations(bundle,trust,observed).status);
const parallel=bundle.gates.find(g=>g.id==='parallel-tabs');
parallel.measurement.tabs.forEach(t=>{t.startedAt='2099-01-01T00:00:00.000Z';t.endedAt='2099-01-02T00:00:00.000Z';});receipts(parallel);
const result=validateOperations(bundle,trust,observed);
console.log('future tabs outside signed observation window:',JSON.stringify(result));
if(result.operationalPass) process.exitCode=7;
