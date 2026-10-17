/** Read-only existing approved recovery metadata; never binds provenance or emits corpus rows. */
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {assertDerivedArtifactsCurrent} from '../../scripts/lib/transcript-provenance.mjs';
import {groundedTrainingRows, trainingHash} from '../../scripts/training/plan.mjs';
const packetRoot='C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work/toc-recovery-v1';
const expectedManifestSha256='268c94cc13d3c70def84ea2f959b9e0da1a22774f8fd7d74b5653866ef976205';
const bytes=readFileSync(join(packetRoot,'packet.json'));
if(trainingHash(bytes)!==expectedManifestSha256)throw new Error('approved recovery manifest fingerprint changed');
const manifest=JSON.parse(bytes), sessions=[...manifest.originalSessionIds,...manifest.septemberSessionIds].sort(), rows=[];
for(const sessionId of sessions){
  let proofValidated=false, claimsSeen=null, verifiedClaims=null, currentProofSha256=null,
    approvedProofHashBound=false, artifactHashesBound=false;
  try{
    const directory=join(packetRoot,'sessions',sessionId), snapshot=new Map();
    const read=path=>{if(!snapshot.has(path))snapshot.set(path,readFileSync(path));return snapshot.get(path);};
    currentProofSha256=trainingHash(read(join(directory,'derivation-provenance.json')));
    const approvedProofHash=manifest.hashes[`sessions/${sessionId}/derivation-provenance.json`];
    if(approvedProofHash&&approvedProofHash!==currentProofSha256)throw new Error('approved recovery proof fingerprint changed');
    approvedProofHashBound=typeof approvedProofHash==='string';
    const generation=assertDerivedArtifactsCurrent(directory,read);
    if(generation.documents.source.tenantId!=='toc'||generation.documents.session.tenantId!=='toc'||generation.documents.session._id!==sessionId)
      throw new Error('foreign or inconsistent identity');
    if(Object.entries(generation.hashes).some(([name,sha])=>manifest.hashes[`sessions/${sessionId}/${name}`]!==sha))
      throw new Error('approved recovery artifact fingerprint changed');
    artifactHashesBound=true;
    proofValidated=true;
    claimsSeen=generation.documents.claims.length;
    verifiedClaims=generation.documents.claims.filter(claim=>claim.status==='verified').length;
    const result=groundedTrainingRows(generation,'toc');
    rows.push({sessionId,proofValidated,currentProofSha256,approvedProofHashBound,artifactHashesBound,
      claimsSeen,verifiedClaims,admissibleRowCount:result.rows.length,
      eligibility:result.rows.length?'candidate-awaiting-exact-approval':'excluded',
      reason:result.rows.length?null:'no-verified-claims',
      omittedClaims:result.excluded});
  }catch(error){
    const reason=error.message==='invalid source hash'?'source-hash-invalid':
      error.message==='approved recovery proof fingerprint changed'?'approved-recovery-proof-changed':
      error.message==='approved recovery artifact fingerprint changed'?'approved-recovery-artifacts-changed':
      error.message==='foreign or inconsistent identity'?'source-unavailable-for-selected-tenant':
      error.message.startsWith('derived provenance stale or mismatched;')?'derivation-proof-not-current':
      error.message.startsWith('derived provenance absent;')?'derivation-proof-missing':'source-artifacts-invalid';
    rows.push({sessionId,proofValidated,currentProofSha256,approvedProofHashBound,artifactHashesBound,
      claimsSeen,verifiedClaims,admissibleRowCount:0,eligibility:'excluded',reason});
  }
}
const report={observedAt:new Date().toISOString(),scope:'Existing current derivation consistency/artifact metadata only; not independent proof-byte approval, fixed corpus adapter admission or export/train permission',
  packetRoot,manifestSha256:expectedManifestSha256,packetId:manifest.packetId,selectedSessions:sessions.length,
  currentProofsValidated:rows.filter(row=>row.proofValidated).length,
  approvedProofHashesBound:rows.filter(row=>row.approvedProofHashBound).length,
  evidenceLimitation:'Fixed historical manifest contains no derivation-provenance byte-hash entries; observed current proof hashes are not independent approval',
  admissibleRowCount:rows.reduce((total,row)=>total+row.admissibleRowCount,0),rows,
  actualExported:false,actualTrained:false,semanticGoldClaimed:false,trainingOrExportApprovalMinted:false};
writeFileSync(new URL('./goal-t015-existing-recovery-preflight-v2.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({selectedSessions:report.selectedSessions,currentProofsValidated:report.currentProofsValidated,
  approvedProofHashesBound:report.approvedProofHashesBound,admissibleRowCount:report.admissibleRowCount,
  exclusions:report.rows.filter(row=>row.eligibility==='excluded').length,
  actualExported:false,actualTrained:false}));
