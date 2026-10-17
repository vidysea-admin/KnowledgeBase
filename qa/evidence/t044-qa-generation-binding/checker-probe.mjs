import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { validateSession } from '../../../scripts/webinar/validate/validate-session.mjs';
import { loadWebinarSession } from '../../../scripts/webinar/session-rows.mjs';
import { writeTranscriptGeneration } from '../../../scripts/lib/transcript-provenance.mjs';
import { buildTranscriptQaGeneration } from '../../../scripts/lib/transcription/transcript-qa-generation.mjs';
import { clampAndValidateTurns } from '../../../packages/ai/src/stt/transcript-qa.ts';

const startedAt = new Date().toISOString(), started = performance.now();
const evidenceDir = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(evidenceDir, 'checker-fixture-'));
const sessionId = 'checker-t044-186', tenantId = 'checker-tenant', durationSec = 186;
const dir = join(root, 'data', 'toc-migrated', sessionId);
mkdirSync(dir, { recursive: true });
const put = (name, value) => writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
put('source.json', { _id: `${sessionId}-source`, tenantId, title: 'Independent synthetic QA boundary probe',
  createdAt: '2026-10-14T20:14:38Z', captureMode: 'silent', audioLevel: { silent: false } });
const normal = () => [{ speakerRef: 'speaker:0', tStart: 0, tEnd: durationSec, text: 'career counselling evidence' }];
const commit = turns => writeTranscriptGeneration(dir, tenantId, sessionId, turns);
const bytes = () => readFileSync(join(dir, 'turns.json'));
const readTurns = () => JSON.parse(bytes().toString('utf8'));
const qa = (original = readTurns()) => {
  const current = readTurns();
  return buildTranscriptQaGeneration({ turnsBytes: bytes(), durationSec,
    merged: clampAndValidateTurns(current, durationSec).report,
    spans: [{ id: 'selected', accepted: true, offsetSeconds: 0, report: clampAndValidateTurns(original, durationSec).report }] });
};
const validate = () => validateSession({ root, sessionId, durationSec, env: { LKB_TRANSCRIPT_QA: '1' } });
const gate = () => loadWebinarSession(dir, sessionId);
const outcomes = [];
async function run(name, work) {
  await work(); outcomes.push({ name, outcome: 'PASS' });
}
async function clean() {
  commit(normal()); put('transcript-qa.json', qa());
  const result = await validate();
  assert.equal(result.passed, true, JSON.stringify(result.report));
  assert.equal(result.gate, 'accepts'); assert.equal(gate().rawTurns.length, 1);
}

await run('clean generation traverses actual validator and consumer', clean);
await run('same speech with newly accepted past-end tail cannot reuse passed validation', async () => {
  const before = bytes();
  const suspicious = qa([...readTurns(), { speakerRef: 'speaker:0', tStart: durationSec, tEnd: 200, text: 'unsupported tail' }]);
  put('transcript-qa.json', suspicious);
  assert.deepEqual(bytes(), before);
  assert.throws(gate, /QA generation is stale/);
  const result = await validate();
  assert.equal(result.passed, false); assert.match(result.report.error, /accepted span.*past the audio end/);
  assert.throws(gate, /validation has not passed/);
});
await run('discarded anomalous retry remains audit-only', async () => {
  commit(normal()); const proof = qa();
  proof.spans.push({ id: 'discarded', accepted: false, offsetSeconds: 0,
    report: clampAndValidateTurns([{ speakerRef: 's', tStart: 190, tEnd: 200, text: 'discarded hallucination' }], durationSec).report });
  put('transcript-qa.json', proof);
  assert.equal((await validate()).passed, true); assert.equal(gate().rawTurns.length, 1);
});
await run('epsilon overshoot refuses despite uncounted clamp tolerance', async () => {
  commit([{ ...normal()[0], tEnd: durationSec + 1e-7 }]);
  const proof = qa(); assert.equal(proof.merged.clampedCount, 0);
  put('transcript-qa.json', proof);
  const result = await validate();
  assert.equal(result.passed, false); assert.match(result.report.error, /exact audio bounds/);
  assert.throws(gate, /validation has not passed/);
});
await run('ISS-REVALIDATE-001 same-count stale QA refuses', async () => {
  await clean(); const proof = qa();
  commit([{ ...normal()[0], text: 'changed transcript with unchanged count' }]);
  put('transcript-qa.json', proof);
  const result = await validate(); assert.equal(result.passed, false);
  assert.match(result.report.error, /generation hash mismatch/); assert.throws(gate, /validation has not passed/);
});
await run('ISS-REVALIDATE-001 literal contradictory 20-clamp 5-drop 400-overshoot refuses', async () => {
  commit(normal()); const proof = qa();
  proof.merged.clampedCount = 20;
  proof.merged.dropped = Array.from({ length: 5 }, (_, index) => ({ index, reason: 'invalid-timing', suspectedHallucination: false }));
  proof.merged.overshootSec = 400; put('transcript-qa.json', proof);
  assert.equal((await validate()).passed, false); assert.throws(gate, /validation has not passed/);
});
await run('ISS-REVALIDATE-001 swapped turns recomputed despite claimed-clean metadata', async () => {
  commit([{ ...normal()[0], tStart: 100, tEnd: durationSec }, { ...normal()[0], tStart: 0, tEnd: 99, text: 'earlier turn' }]);
  const proof = qa();
  proof.merged.nonMonotonicIndices = []; proof.spans[0].report.nonMonotonicIndices = [];
  put('transcript-qa.json', proof);
  const result = await validate(); assert.equal(result.passed, false);
  assert.match(result.report.error, /current transcript.*non-monotonic/); assert.throws(gate, /validation has not passed/);
});
await run('removed and truncated QA invalidate previously passed same speech', async () => {
  await clean(); unlinkSync(join(dir, 'transcript-qa.json'));
  assert.throws(gate, /QA generation is stale/);
  put('transcript-qa.json', qa()); assert.doesNotThrow(gate);
  writeFileSync(join(dir, 'transcript-qa.json'), '{'); assert.throws(gate, /QA generation is stale/);
});
await run('QA creation after absence-bound baseline validation refuses', async () => {
  unlinkSync(join(dir, 'transcript-qa.json')); commit(normal());
  const result = await validateSession({ root, sessionId, durationSec, env: {} });
  assert.equal(result.passed, true); assert.equal(result.report.qaSha256, null); assert.doesNotThrow(gate);
  put('transcript-qa.json', qa()); assert.throws(gate, /QA generation is stale/);
});
await run('legacy validation cannot authorize newly hash-bound QA', async () => {
  const validation = JSON.parse(readFileSync(join(dir, 'validation.json'), 'utf8'));
  delete validation.qaSha256; put('validation.json', validation);
  assert.throws(gate, /hash-bound QA requires current webinar validation/);
});

const report = { startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
  syntheticFixtureOnly: true, fixtureRoot: root, tests: outcomes.length, passed: outcomes.length, failed: 0,
  issueCorpus: { id: 'ISS-REVALIDATE-001', reconstructedRecordedTypesRefused: 3, totalReconstructedTypes: 3,
    unreplayed: ['75 identical turns/no QA/flag unset: preserved D-162 baseline', 'monotonic overlaps: no approved blanket refusal policy'],
    limit: 'Original standalone attack harness/commands absent from ledger; not a verbatim complete-corpus replay.' },
  fullTaskVerdict: 'HOLD: real audio/provider, watcher and intentional privacy-exclusion acceptance missing', outcomes };
writeFileSync(join(evidenceDir, 'checker-probe-result.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
