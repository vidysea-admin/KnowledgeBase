import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const started = Date.now();
const base = 'qa/evidence/parallel-claim-review/';
const frozen = new Map();
const read = file => { const b = fs.readFileSync(file); frozen.set(file, sha(b)); return b; };
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const parse = file => JSON.parse(read(file).toString('utf8'));
const sort = v => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v;
const canonical = v => JSON.stringify(sort(v));
const eq = (a,b,why) => assert.equal(canonical(a), canonical(b), why);
const has = (obj,key) => Object.hasOwn(obj,key);
const labels = new Set(['entailed','unsupported','contradicted','unresolvable']);
const mode = 'not-performed-provided-context-only';
const manifest = read('qa/manifests/parallel-claim-evidence-review.md').toString();
assert.match(manifest,/Status:\s*ready-for-check/);
assert.match(manifest,/Fix cycle:\s*0/);
const instructions = read(base+'instructions.txt').toString();
assert.match(instructions,/maximum READY independent parallel work, up to80subagents/);
assert.match(instructions,/Never manufacture duplicate work/);
assert.ok(!/80\s+(?:agents|subagents)\s+(?:ran|running)\s+simultaneously/i.test(manifest+instructions));
const packetPath = 'data/eval/extraction-adjudication-packet.json';
const packetBytes = read(packetPath), packet = JSON.parse(packetBytes), packetHash = sha(packetBytes);
assert.equal(packetHash,'1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175');
const index = parse(base+'index.json'), aggregate = parse(base+'aggregate.json');
assert.equal(frozen.get(base+'aggregate.json'),'8ba3fa62e201fd8ffe44d6c5ca059ac8e4fc6d10879c5fda175749fd408136df');
const rows = packet.claims.filter(c=>c.replacementReviewStatus==='unreviewed').sort((a,b)=>a.claimId<b.claimId?-1:a.claimId>b.claimId?1:0);
assert.equal(rows.length,65);
eq(fs.readdirSync(base+'tasks').filter(f=>f.endsWith('.json')).sort(),rows.map((_,i)=>String(i).padStart(2,'0')+'.json'));
eq(fs.readdirSync(base+'results').filter(f=>f.endsWith('.json')).sort(),rows.map((_,i)=>String(i).padStart(2,'0')+'.json'));
eq(fs.readdirSync(base+'audits').filter(f=>f.endsWith('.json')).sort(),Array.from({length:13},(_,i)=>'batch-'+String(i).padStart(2,'0')+'.json'));
assert.equal(index.taskCount,65); assert.equal(index.tasks.length,65);
eq([index.packetPath,index.packetSha256,index.reviewType,index.humanAdjudication],[packetPath,packetHash,'AI-preliminary',null]);
eq([aggregate.packetPath,aggregate.packetSha256,aggregate.actualPacketSha256,aggregate.indexSha256],[packetPath,packetHash,packetHash,frozen.get(base+'index.json')]);
eq([aggregate.reviewType,aggregate.humanAdjudication,aggregate.semanticGold,aggregate.bindingThresholds],['AI-preliminary-aggregate',null,false,null]);
eq(aggregate.integrityErrors,[]);
const metadata = Object.fromEntries(Object.entries(packet).filter(([k])=>!['sessions','claims'].includes(k)));
const primaryCounts={original:{},current:{}}, auditCounts={original:{},current:{}}, sourceCounts={}, artifactModes={}, primaryModes={};
const results=[], tasks=[], audited=[], disagreements=[], verification=new Map();
let primaryCitations=0,auditRecords=0,auditQuotes=0,missingCurrentReferences=0;
const auditMissingOptionalFields={speakerRef:0,tStart:0,tEnd:0,revision:0};
const increment=(obj,key)=>{obj[key]=(obj[key]??0)+1;};
function getContext(task,version,turnId,sessionId) {
  const ctx=task.claim.literalCitationContexts.find(c=>c.turnId===turnId && (!sessionId||c.sessionId===sessionId));
  assert.ok(ctx,'citation not in supplied context');
  return {ctx,data:ctx[version]};
}
function recordCitation(task,citation,version,isAudit=false) {
  const {ctx,data}=getContext(task,version,citation.turnId,citation.sessionId);
  const m=data.matches.find(m=>sha(canonical(m.record))===citation.contextSha256);
  assert.ok(m,'record hash must match supplied version');
  const record=m.record;
  if(has(citation,'sessionId')) assert.equal(citation.sessionId,record.sessionId);
  assert.equal(citation.textSha256,sha(record.text));
  assert.equal(m.textSha256,sha(record.text));
  if(has(citation,'providedTextSha256')) assert.equal(citation.providedTextSha256,m.textSha256);
  for(const k of ['speakerRef','tStart','tEnd']) {
    if(has(citation,k)) eq(citation[k],record[k],k+' mismatch');
    else { assert.ok(isAudit,'primary citation missing '+k); auditMissingOptionalFields[k]++; }
  }
  if(has(citation,'quote')) {
    assert.equal(typeof citation.quote,'string'); assert.ok(citation.quote.length>0);
    assert.ok(record.text.includes(citation.quote),'quote must be exact contiguous substring');
    if(!isAudit) assert.ok(citation.quote.trim().split(/\s+/u).length<=40,'primary quote exceeds limit');
    if(has(citation,'quoteStart')) assert.equal(record.text.slice(citation.quoteStart,citation.quoteEnd),citation.quote);
    if(has(citation,'quoteOffset')) assert.equal(record.text.slice(citation.quoteOffset,citation.quoteOffset+citation.quote.length),citation.quote);
    if(isAudit) auditQuotes++;
  }
  const aliases={artifactSha256:['artifactSha256','providedArtifactSha256','artifactSha256Provided','artifactRawSha256'],normalizedLfSha256:['normalizedLfSha256','providedNormalizedLfSha256','normalizedLfSha256Provided','artifactNormalizedLfSha256'],revision:['revision','providedRevision','revisionProvided']};
  for(const [sourceKey,keys] of Object.entries(aliases)) {
    for(const key of keys) if(has(citation,key)) eq(citation[key],data.artifact?.[sourceKey==='artifactSha256'?'sha256':sourceKey]??null,key+' provenance mismatch');
    if(isAudit&&sourceKey==='revision'&&!keys.some(k=>has(citation,k)))auditMissingOptionalFields.revision++;
  }
  if(has(citation,'sameIdContentChanged'))assert.equal(citation.sameIdContentChanged,ctx.sameIdContentChanged);
  for(const k of ['textHashVerified','textHashMatches','reviewerCitationHashesMatch'])if(has(citation,k))assert.equal(citation[k],true);
  if(!isAudit) {
    assert.equal(citation.contextVersion,version);
    assert.equal(citation.artifactSha256,data.artifact?.sha256??null);
    assert.equal(citation.revision,data.artifact?.revision??null);
    assert.equal(typeof citation.supports,'string'); primaryCitations++;
  } else auditRecords++;
  return canonical([ctx.sessionId,ctx.turnId,citation.contextSha256]);
}
for(let i=0;i<65;i++) {
  const nn=String(i).padStart(2,'0'), taskPath=base+'tasks/'+nn+'.json', resultPath=base+'results/'+nn+'.json';
  const task=parse(taskPath), result=parse(resultPath), ix=index.tasks[i], row=rows[i];
  tasks.push(task); results.push(result);
  eq(ix,{index:i,originalIndex:packet.claims.findIndex(c=>c.claimId===row.claimId),claimId:row.claimId,taskPath,inputHash:frozen.get(taskPath),resultPath});
  eq([task.index,task.originalIndex,task.claimId,task.packetPath,task.packetSha256,task.reviewType,task.humanAdjudication,task.resultPath],[i,ix.originalIndex,row.claimId,packetPath,packetHash,'AI-preliminary',null,resultPath]);
  eq(task.claim,row);eq(task.session,packet.sessions.find(s=>s.caseId===row.caseId));eq(task.metadata,metadata);
  assert.equal(sha(canonical(row.persistedClaim)),row.claimRecordSha256);
  assert.equal(sha(row.persistedClaim.text),row.claimTextSha256);
  assert.equal(sha(canonical(task.session.sourceBinding)),row.sourceBindingSha256);
  eq([row.tenantId,row.sessionId,row.caseId,row.sourceBindingSha256],[task.session.tenantId,task.session.sessionId,task.session.caseId,task.session.sourceBindingSha256]);
  eq([result.version,result.index,result.originalIndex,result.claimId,result.inputHash,result.packetSha256,result.reviewType,result.humanAdjudication],[1,i,ix.originalIndex,row.claimId,ix.inputHash,packetHash,'AI-preliminary',null]);
  for(const k of ['claimRecordHash','claimTextHash','sourceBindingHash','identityBinding','contextTextHashes'])assert.equal(result.checks[k],true);
  eq(result.checks.failures,[]);assert.equal(result.checks.artifactByteVerification,mode);increment(primaryModes,mode);
  assert.equal(result.sameIdContentChanged,row.literalCitationContexts.some(c=>c.sameIdContentChanged));
  for(const [part,version] of [['original','originalMigration'],['current','current']]) {
    const opinion=result[part]; assert.ok(labels.has(opinion.assessment));increment(primaryCounts[part],opinion.assessment);
    assert.ok(opinion.reason&&Array.isArray(opinion.caveats)&&Array.isArray(opinion.missingReferences)&&Array.isArray(opinion.citations));
    const missing=row.literalCitationContexts.filter(c=>!c[version].available);
    eq(opinion.missingReferences.map(x=>[x.sessionId,x.turnId]).sort(),missing.map(c=>[c.sessionId,c.turnId]).sort(),'missing references omitted');
    for(const m of opinion.missingReferences)assert.ok(m.reason);
    if(part==='current')missingCurrentReferences+=missing.length;
    const cited=new Set(opinion.citations.map(c=>recordCitation(task,c,version)));
    for(const ctx of row.literalCitationContexts) {
      const d=ctx[version];increment(sourceCounts,version+':'+(d.available?'available':'unavailable'));
      for(const match of d.matches) {
        assert.equal(match.textSha256,sha(match.record.text));
        assert.ok(cited.has(canonical([ctx.sessionId,ctx.turnId,sha(canonical(match.record))])),'available record omitted from primary citations');
      }
      if(d.artifact) {
        const key=canonical([version,d.artifact.path,d.artifact.sha256]);
        if(!verification.has(key)) {
          const v={path:d.artifact.path,declaredSha256:d.artifact.sha256,revision:d.artifact.revision??null,contextVersion:version};
          if(version==='current') {
            const b=read(d.artifact.path); assert.equal(sha(b),d.artifact.sha256);
            assert.equal(b.length,d.artifact.bytes);assert.equal(sha(b.toString().replace(/\r\n/g,'\n')),d.artifact.normalizedLfSha256);
            Object.assign(v,{actualSha256:sha(b),actualBytes:b.length,mode:'exact-current-artifact-bytes-verified'});
          } else Object.assign(v,{mode:'provided-historical-context-only',reason:'Historical Git artifact bytes were not read or independently verified by this aggregate.'});
          verification.set(key,v);increment(artifactModes,v.mode);
        }
      }
    }
  }
  const ac=aggregate.claims[i];eq([ac.index,ac.claimId,ac.originalIndex,ac.inputHash,ac.resultSha256,ac.sourceBindingSha256,ac.claimRecordSha256,ac.claimTextSha256],[i,row.claimId,ix.originalIndex,ix.inputHash,frozen.get(resultPath),row.sourceBindingSha256,row.claimRecordSha256,row.claimTextSha256]);
  eq(ac.originalReview,result);
  eq(ac.computedInputChecks,{claimRecordHash:true,claimTextHash:true,sourceBindingHash:true,identityBinding:true,contextTextHashes:true});
}
assert.equal(aggregate.claims.length,65);assert.equal(aggregate.audits.length,13);
for(let b=0;b<13;b++) {
  const auditPath=base+'audits/batch-'+String(b).padStart(2,'0')+'.json', audit=parse(auditPath);
  eq([audit.schemaVersion,audit.reviewType,audit.humanAdjudication,audit.batch],[1,'AI-preliminary-independent-audit',null,b]);
  assert.equal(audit.entries.length,5);
  eq(aggregate.audits[b],{path:auditPath,sha256:frozen.get(auditPath),audit});
  for(let j=0;j<5;j++) {
    const entry=audit.entries[j], i=b*5+j, task=tasks[i], result=results[i], h=entry.evidenceHashes;
    audited.push(i);eq([entry.index,entry.claimId,entry.inputHash],[i,task.claimId,result.inputHash]);
    for(const [key,expected] of [['inputHash',result.inputHash],['taskBytesSha256',result.inputHash],['expectedInputHash',result.inputHash],['claimRecordSha256',task.claim.claimRecordSha256],['claimTextSha256',task.claim.claimTextSha256],['sourceBindingSha256',task.claim.sourceBindingSha256],['reviewerResultSha256',frozen.get(base+'results/'+String(i).padStart(2,'0')+'.json')],['reviewerResultBytesSha256',frozen.get(base+'results/'+String(i).padStart(2,'0')+'.json')]])if(has(h,key))assert.equal(h[key],expected);
    assert.equal(h.artifactByteVerification,mode);
    for(const key of ['failures','hashFailures'])if(has(h,key))eq(h[key],[]);
    if(h.checks)for(const [key,value]of Object.entries(h.checks))if(typeof value==='boolean')assert.equal(value,true,'audit negative check '+key);
    for(const key of ['identityBinding','contextTextHashes','inputHashVerified'])if(has(h,key))assert.equal(h[key],true);
    const covered=new Set();
    for(const context of h.contexts) {
      const version=context.contextVersion??context.version;
      assert.ok(['originalMigration','current'].includes(version));
      const {ctx,data}=getContext(task,version,context.turnId,context.sessionId);
      if(has(context,'available'))assert.equal(context.available,data.available);
      for(const key of ['reason','missingReason'])if(has(context,key))eq(context[key],data.reason);
      const nested=context.matches??context.records;
      if(nested) {
        assert.equal(nested.length,data.matches.length);
        for(const m of nested)covered.add(recordCitation(task,{...context,...m,matches:undefined,records:undefined},version,true));
      } else covered.add(recordCitation(task,context,version,true));
    }
    for(const ctx of task.claim.literalCitationContexts)for(const version of ['current','originalMigration'])for(const m of ctx[version].matches)
      assert.ok(covered.has(canonical([ctx.sessionId,ctx.turnId,sha(canonical(m.record))])),'audit available source record omitted');
    const original=entry.reviewerLabels.original??entry.reviewerLabels.originalLabel;
    const current=entry.reviewerLabels.current??entry.reviewerLabels.currentLabel;
    eq([original,current],[result.original.assessment,result.current.assessment]);
    if(has(entry.reviewerLabels,'inputHash'))assert.equal(entry.reviewerLabels.inputHash,result.inputHash);
    if(has(entry.reviewerLabels,'resultSha256'))assert.equal(entry.reviewerLabels.resultSha256,frozen.get(base+'results/'+String(i).padStart(2,'0')+'.json'));
    assert.ok(labels.has(entry.originalLabel)&&labels.has(entry.currentLabel));increment(auditCounts.original,entry.originalLabel);increment(auditCounts.current,entry.currentLabel);
    const diff={original:entry.originalLabel!==original,current:entry.currentLabel!==current};
    const agrees=!diff.original&&!diff.current;
    if(typeof entry.agreement==='boolean')assert.equal(entry.agreement,agrees);
    else { assert.equal(entry.agreement.original,!diff.original);assert.equal(entry.agreement.current,!diff.current);if(has(entry.agreement,'all'))assert.equal(entry.agreement.all,agrees); }
    assert.ok(Array.isArray(entry.disagreements));
    if(!agrees)assert.ok(entry.disagreements.length>0,'semantic disagreement erased');
    if(entry.disagreements.length)disagreements.push({index:i,claimId:task.claimId,labelDifferences:diff,reviewerLabels:{original,current},auditorLabels:{original:entry.originalLabel,current:entry.currentLabel},recordedDisagreements:entry.disagreements,auditEntry:entry});
    eq(aggregate.claims[i].independentAudits,[{batch:b,auditSha256:frozen.get(auditPath),entry}]);
  }
}
eq(audited,Array.from({length:65},(_,i)=>i));eq(aggregate.disagreements,disagreements);
const semantic=disagreements.filter(d=>d.labelDifferences.original||d.labelDifferences.current);
const history=disagreements.filter(d=>!d.labelDifferences.original&&!d.labelDifferences.current);
eq(semantic.map(d=>d.index),[2,20,34,39]);eq(history.map(d=>d.index),[63]);assert.equal(history[0].recordedDisagreements[0].resolved,true);
const verificationRows=[...verification.values()];
eq(aggregate.sourceArtifactVerification.slice().sort((a,b)=>canonical(a).localeCompare(canonical(b))),verificationRows.slice().sort((a,b)=>canonical(a).localeCompare(canonical(b))));
for(let i=0;i<65;i++) {
  const expected=[];for(const ctx of tasks[i].claim.literalCitationContexts)for(const version of ['current','originalMigration'])if(ctx[version].artifact){const d=ctx[version].artifact,key=canonical([version,d.path,d.sha256]);expected.push(verification.get(key));}
  eq(aggregate.claims[i].sourceArtifactVerification.slice().sort((a,b)=>canonical(a).localeCompare(canonical(b))),expected.sort((a,b)=>canonical(a).localeCompare(canonical(b))));
}
const summary={reviewCount:65,auditCount:13,auditEntryCount:65,coverageComplete:true,completedComparisons:65,integrityErrorCount:0,integrityValid:true,primaryLabels:primaryCounts,independentLabels:auditCounts,disagreementRows:disagreements.length,reviewerArtifactVerificationModes:primaryModes,semanticLabelDisagreementRows:semantic.length,retainedComparisonHistoryRows:history.length,suppliedSourceContextCounts:sourceCounts,uniqueArtifactVerificationModes:artifactModes};
eq(aggregate.summary,summary);
assert.ok(aggregate.limits.some(l=>l.includes('historical artifact bytes remain provided context only')));
assert.ok(aggregate.limits.some(l=>l.includes('neither external factual truth nor human gold')));
for(const [file,hash]of frozen)assert.equal(sha(fs.readFileSync(file)),hash,'frozen input changed '+file);
console.log(JSON.stringify({verdict:'PASS_PRELIMINARY_PACKET_INTEGRITY_ONLY',cycleChecked:0,aggregateSha256:frozen.get(base+'aggregate.json'),packetSha256:packetHash,summary,primaryCitationsVerified:primaryCitations,auditRecordsVerified:auditRecords,auditQuotesVerified:auditQuotes,missingCurrentReferences,auditMissingOptionalFields,semanticDisagreementIndices:semantic.map(x=>x.index),resolvedHistoryIndices:history.map(x=>x.index),frozenInputs:frozen.size,elapsedMs:Date.now()-started,fullU22:'GATED_HUMAN_SEMANTIC_GOLD_FACT_TRUTH_AND_THRESHOLDS_UNAPPROVED'},null,2));
