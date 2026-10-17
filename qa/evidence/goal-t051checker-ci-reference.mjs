import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const packet = readFileSync('qa/packets/ci-issue-reference-repair.md','utf8');
const encoded = packet.match(/```(?:base64|text)?\r?\n([A-Za-z0-9+/=]{400,})\r?\n```/);
assert.ok(encoded,'Original-byte corpus missing from packet');
const before = Buffer.from(encoded[1],'base64');
assert.equal(hash(before),'314b668279d5227e68ffe4d519dc9da30db1a69023acc7f17bbe9ecba38e7c1e');
const after = readFileSync('qa/manifests/wa-review-wire.md');
assert.equal(hash(after),'8b98f7828d8e04c1b8b92f8752b15728c752a3a84e947dab30bf2e44b95d5c19');
const targets = new Set(); let changes=0;
const expected = before.toString('utf8').replace(/\bISS-(00[1-9]|01[0-2])\b/g,(_full,suffix)=>{
  changes++; const qualified='ISS-WA-REVIEW-WIRE-'+suffix; targets.add(qualified); return qualified;
});
assert.deepEqual(after,Buffer.from(expected,'utf8'),'Unrelated historical bytes changed');
assert.equal(changes,16); assert.equal(targets.size,12);
const ids = new Set();
for(const file of readdirSync('qa').filter(name=>/^issues(?:\.[^.]+)?\.jsonl$/.test(name))){
  for(const line of readFileSync('qa/'+file,'utf8').split(/\r?\n/).filter(line=>line.trim())){
    const row=JSON.parse(line.replace(/^\uFEFF/,'')); ids.add(row.id??row.issueId??row.issue);
  }
}
for(const target of targets)assert.ok(ids.has(target),'Invented/missing ledger identity: '+target);
const result={command:'node qa/evidence/goal-t051checker-ci-reference.mjs',exitCode:0,changes,distinctActualLedgerIds:targets.size,beforeSHA:hash(before),afterSHA:hash(after),onlyNamespaceQualifications:true,enforcementChanged:false};
writeFileSync('qa/evidence/goal-t051checker-ci-reference.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
