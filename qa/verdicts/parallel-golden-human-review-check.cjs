const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p));
const json = p => JSON.parse(read(p));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const packetPath = 'data/eval/golden-set-human-review.json';
const p = json(packetPath), gold = json('data/eval/golden-set.json');
const report = json('data/eval/recall-report-vector.json'), semantic = json('data/eval/golden-set-sibling-semantic.json');
assert.equal(p.status, 'HUMAN_REVIEW_REQUIRED');
assert.equal(p.cases.length, 6); assert.equal(report.misses.length, 6);
assert.equal(new Set(p.cases.map(c => c.id)).size, 6);
assert.deepEqual(p.cases.map(c => c.id), report.misses.map(c => c.id));
const inputPaths = ['data/eval/golden-set.json','data/eval/recall-report-vector.json','data/eval/golden-set-sibling-semantic.json'];
assert.deepEqual(p.sourceBindings.map(b => b.path), inputPaths);
for (const b of p.sourceBindings) { const bytes = read(b.path); assert.equal(b.sha256, sha(bytes)); assert.equal(b.bytes, bytes.length); }
for (const key of ['generatedAt','total','hits','k','recallAtK']) assert.equal(p.recordedBaseline[key], report[key]);
assert.equal(p.recordedBaseline.questionBlindControl, report.control.recallAtK);
assert.equal(p.recordedBaseline.missCount, report.misses.length);
assert.equal(report.hits / report.total, report.recallAtK);
assert.equal(p.humanGate.status, 'unreviewed');
assert.deepEqual(Object.keys(p.humanGate).sort(), ['status','approver','approvedAt','gateClosure','repointU14U15','thresholdDecision'].sort());
for (const [key,value] of Object.entries(p.humanGate)) if (key !== 'status') assert.equal(value, null, key);
assert.match(p.scopeNote, /Not exhaustive transcript review/);
assert.match(p.scopeNote, /Historical embedding evidence is separate from current transcript evidence/);
let joins = 0, sourceBindings = 0, excerpts = 0;
const details = [];
for (const c of p.cases) {
  const miss = report.misses.find(m => m.id === c.id);
  for (const source of [gold, report.misses, semantic.rows]) {
    const rows = source.filter(r => r.id === c.id); assert.equal(rows.length, 1);
    for (const key of ['id','question','expectedSessionId']) assert.equal(c[key], rows[0][key]);
    joins++;
  }
  assert.deepEqual(c.recordedTopK, miss.got); assert.equal(c.recordedTopK.length, 5);
  assert.equal(c.recordedTopK.includes(c.expectedSessionId), false); assert.equal(c.recordedMiss, true);
  const row = semantic.rows.find(r => r.id === c.id), h = c.historicalSemanticEvidence;
  assert.equal(h.measuredAt, semantic.measuredAt);
  for (const key of ['expectedScore','bestRival','bestRivalScore','topSession','topScore','margin','ambiguousRivals_0p03']) assert.deepEqual(h[key], row[key]);
  assert.ok(h.margin < 0); assert.match(h.scope, /not recomputed against current transcript hashes/);
  assert.equal(c.humanAdjudication.status, 'unreviewed');
  assert.deepEqual(Object.keys(c.humanAdjudication).sort(), ['status','reviewer','reviewedAt','questionHasUniqueAnswer','acceptedSessionIds','disposition','rationale','approvedForGoldenSet'].sort());
  for (const [key,value] of Object.entries(c.humanAdjudication)) if (key !== 'status') assert.equal(value, null, key);
  for (const [side,id] of [[c.expected,c.expectedSessionId],[c.rival,h.bestRival]]) {
    assert.equal(side.sessionId, id); assert.equal(side.source.path, `data/toc-migrated/${id}/turns.json`);
    assert.equal(side.selectionStatus, 'candidate-evidence-unreviewed'); assert.equal(side.humanAnswerable, null);
    const bytes = read(side.source.path), turns = JSON.parse(bytes);
    assert.equal(side.source.sha256, sha(bytes)); assert.equal(side.source.bytes, bytes.length); assert.equal(side.source.turnCount, turns.length); sourceBindings++;
    assert.ok(side.evidence.length > 0);
    for (const e of side.evidence) {
      const matches = turns.filter(t => t._id === e.turnId); assert.equal(matches.length,1);
      const t = matches[0]; assert.equal(e.turnSha256, sha(Buffer.from(JSON.stringify(t))));
      for (const key of ['tenantId','sessionId','speakerRef','tStart','tEnd']) assert.equal(e[key], t[key]);
      assert.equal(t.sessionId, id); assert.ok(Number.isInteger(e.characterOffset) && e.characterOffset >= 0);
      assert.ok(Number.isInteger(e.characterLength) && e.characterLength > 0);
      assert.ok(e.characterOffset + e.characterLength <= t.text.length);
      assert.equal(e.characterLength, e.text.length); assert.equal(e.text, t.text.slice(e.characterOffset,e.characterOffset + e.characterLength));
      assert.ok(typeof e.anchor === 'string' && e.anchor.length > 0 && e.text.toLowerCase().includes(e.anchor.toLowerCase()));
      assert.equal(e.truncated, e.characterLength < t.text.length); excerpts++;
    }
  }
  details.push({id:c.id,expected:c.expectedSessionId,bestRival:h.bestRival,margin:h.margin,excerptCount:c.expected.evidence.length+c.rival.evidence.length});
}
assert.equal(sha(read(packetPath)), '44432ab2717ba807a4ed066d346280156f4a671d172524f1ab009b116811677e');
console.log(JSON.stringify({result:'PASS',cycle:0,packetSha256:sha(read(packetPath)),cases:p.cases.length,joins,inputBindings:p.sourceBindings.length,sourceBindings,excerpts,humanFields:'unanswered',historicalScores:'exactly preserved; not rerun',details},null,2));
