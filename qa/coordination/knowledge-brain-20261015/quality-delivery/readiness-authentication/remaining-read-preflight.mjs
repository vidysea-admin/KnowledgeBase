import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(), lane='qa/coordination/knowledge-brain-20261015/quality-delivery/';
const abs=p=>path.isAbsolute(p)?p:path.join(root,p), hash=b=>createHash('sha256').update(b).digest('hex'), bytes=p=>readFile(abs(p)), json=async p=>JSON.parse(await bytes(p));
const mismatches=[], counts={ranges:0,lines:0,sourcePins:0,receipts:0,pinEntries:0,environmentDeclarations:0,unitPins:0};
const check=(ok,kind,id)=>{if(!ok)mismatches.push({kind,id});};
const spec=await json(lane+'readiness-authentication/remaining-read-spec.json');
const ready=await json(lane+'review-budget-prep/batch-four-current/readiness-and-identity.json');
const env=await json(lane+'review-budget-prep/batch-four-current/recorded-environment-closure.json');
const parts=[];
for(const r of spec.ranges){const raw=await bytes(r.path);check(hash(raw)===r.wholeFileSha256,'source-pin',r.path);const ls=raw.toString('utf8').replace(/\r\n/g,'\n').split('\n');check(r.from>=1&&r.to<=ls.length&&r.to-r.from+1===r.lineCount,'range',r.path);parts.push(ls.slice(r.from-1,r.to).join('\n'));counts.ranges++;counts.lines+=r.lineCount;counts.sourcePins++;}
check(counts.lines===621&&counts.ranges===10,'coverage','621lines/10ranges');
for(const u of ready.units)for(const p of u.pins){check(hash(await bytes(p.path))===p.sha256,'unit-pin',p.path);counts.unitPins++;}
const declarations=new Map();
for(const p of ready.proofs)declarations.set(p.path,{sha:p.sha256,env:p.recorded_environment_hash,exit:p.own_exit,stdout:p.stdout,stdoutSha:p.stdout_sha256});
for(const p of env.four_unit_receipts)declarations.set(p.receipt,{sha:p.receipt_sha256,env:p.recorded_environment_hash,exit:p.own_exit});
for(const p of [env.latest_authority,env.current_targeted])declarations.set(p.path,{sha:p.sha256,env:p.environment_hash,exit:p.own_exit});
for(const [id,d]of declarations){const raw=await bytes(id);check(hash(raw)===d.sha,'receipt-sha',id);const r=JSON.parse(raw);check(r.environment_hash===d.env,'declared-env',id);check(r.exitCode===d.exit,'declared-exit',id);counts.environmentDeclarations++;counts.receipts++;const keys=new Set([...Object.keys(r.before??{}),...Object.keys(r.after??{})]);for(const p of keys){counts.pinEntries++;check(r.before[p]===r.after[p],'receipt-before-after',p);try{check(hash(await bytes(p))===r.after[p],'receipt-current-pin',p);}catch{check(false,'receipt-missing-pin',p);}}if(d.stdout){check(hash(await bytes(d.stdout))===d.stdoutSha,'stdout-sha',id);}if(r.runtime_identity?.executable&&r.runtime_executable_sha256){check(hash(await bytes(r.runtime_identity.executable))===r.runtime_executable_sha256,'runtime-pin',id);}if(r.lock_hash)check(hash(await bytes('pnpm-lock.yaml'))===r.lock_hash,'lock-pin',id);}
const original=await json('qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six.json');
const probe=await json('qa/goal-vectorless-2026-10-15/verification-quality-mjs-independent-four.json');
for(const k of ['environment_hash','lock_hash','runtime_executable_sha256'])check(original[k]===probe[k],'probe-environment',k);
check(probe.exitCode===0,'probe-exit','MJS4');
const scope={counts,allRequiredClausesRetained:true,reviewAuthorized:false,history:{actualTotal:950992,wallBoundSeconds:156.701271},probeReceipt:'verification-quality-mjs-independent-four.json'};
const metadata=JSON.stringify(scope), metadataBytes=Buffer.byteLength(metadata);
const payload=parts.join('\n')+'\n'+metadata, payloadBytes=Buffer.byteLength(payload);
check(metadataBytes<=5000,'metadata-limit','5000');check(payloadBytes<=75000,'payload-limit','75000');
const summary={outcome:mismatches.length?'FAIL':'READY_FOR_BOUNDED_READ_ONLY',counts,metadataBytes,payloadBytes,payloadSha256:hash(payload),mismatches,complete:counts.lines===621&&counts.ranges===10&&mismatches.length===0,sourcePrinted:false,reviewerReactivated:false};
const encoded=JSON.stringify(summary);if(Buffer.byteLength(encoded)>5000){console.log(JSON.stringify({outcome:'FAIL_SUMMARY_LIMIT',counts,mismatchCount:mismatches.length,mismatchSha256:hash(JSON.stringify(mismatches)),complete:false}));process.exitCode=2;}else{console.log(encoded);process.exitCode=mismatches.length?2:0;}
