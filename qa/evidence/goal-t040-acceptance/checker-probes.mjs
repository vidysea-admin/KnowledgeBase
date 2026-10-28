import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { auditGroundedContent } from '../../../scripts/qa/t040-acceptance.mjs';

// Authentic transcript bytes; DTO below is deliberately assembled, not a live API/provider receipt.
const samplePath = new URL('../../../data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json', import.meta.url);
const bytes = readFileSync(samplePath), allTurns = JSON.parse(bytes);
const turn = allTurns.find((t) => t.text.length >= 50), sibling = allTurns.find((t) => t._id !== turn._id && t.text.length >= 50);
assert.ok(turn && sibling, 'authentic source has two informative turns');
// The full source contains a genuine reversed interval at t141 (2008 -> 213).
// Keep that refusal as an independent negative; the positive uses an explicit two-row subset.
const turns = [turn, sibling];
const ref = { turnId: turn._id, sessionId: turn.sessionId, quote: turn.text, available: true,
  tStart: turn.tStart, tEnd: turn.tEnd, speaker: typeof turn.speakerLabel === 'string' ? turn.speakerLabel : turn.speakerRef };
const content = { sessionId: turn.sessionId, notes: [{ id: 'independent-real-turn', kind: 'insight', text: turn.text,
  origin: 'speaker-statement', verification: 'unverified', evidence: [ref] }], qa: [], claims: [] };
const run = (c = content, options = {}) => auditGroundedContent({ tenantId: turn.tenantId, sessionId: turn.sessionId, turns, content: c,
  reference: [{ kind: 'insight', turnId: turn._id, quote: turn.text }], ...options });
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
check('authentic full source rejects its existing reversed timestamp rather than blessing it', () => {
  const report = run(content, { turns: allTurns });
  assert.equal(report.passed, false);
  assert.ok(report.errors.some((e) => e.code === 'invalid-source-turn' && e.location === 'turns[140]'));
});
check('authentic whole-turn provenance and actual JSON receipt consumer', () => {
  const report = run(), reloaded = JSON.parse(JSON.stringify(report));
  assert.equal(reloaded.passed, true, JSON.stringify(reloaded.errors)); assert.equal(reloaded.fullTaskStatus, 'HOLD');
  assert.equal(reloaded.counts.evidence, 1); assert.equal(reloaded.errors.length, 0);
  assert.equal(JSON.stringify(reloaded).includes(turn.text), false);
});
for (const [name, patch] of [['speaker', { speaker: 'other speaker' }], ['end', { tEnd: turn.tEnd + 1 }],
  ['session', { sessionId: 'other-session' }], ['turn', { turnId: 'unknown' }], ['availability', { available: false }]]) {
  check(`authentic source ${name} tamper refuses`, () => {
    const c = structuredClone(content); Object.assign(c.notes[0].evidence[0], patch); assert.equal(run(c).passed, false);
  });
}
check('a supplied source-reviewed sibling reference is never covered by nonempty first-turn output', () => {
  const report = run(content, { reference: [{ kind: 'insight', turnId: sibling._id, quote: sibling.text }] });
  assert.equal(report.passed, false); assert.ok(report.errors.some((e) => e.code === 'missing-reference-coverage'));
});
check('foreign tenant cannot bless authentic source rows', () => assert.equal(run(content, { tenantId: 'foreign' }).passed, false));
check('human review never hides invalid quote provenance', () => {
  const c = structuredClone(content); c.claims = [{ _id: 'reviewed-claim', text: 'Reviewed paraphrase', status: 'verified',
    evidence: [{ ...ref, quote: 'This fabricated sentence does not exist in the authentic source.' }] }];
  const report = run(c); assert.equal(report.passed, false);
  assert.ok(report.errors.some((e) => e.code === 'unresolved-source-evidence'));
});
console.log(JSON.stringify({ checks: passed, sourcePath: samplePath.pathname, sourceByteHash: createHash('sha256').update(bytes).digest('hex'),
  sourceTurnIds: [turn._id, sibling._id], sourceMode: 'authentic-file-two-row-positive-and-full-source-negative', contentMode: 'assembled-DTO',
  fullSourceRows: allTurns.length, knownInvalidIntervalTurn: '2026-04-21-visa-blueprint-part2-italy-france-nz-t141',
  realProvider: false, realPersistence: false, liveHttp: false, realBrowser: false, fullTaskStatus: 'HOLD' }));
