import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createPrivateRecordingFixture } from '../t048-private-capture/fixture.mjs';
import { loadTrustedRecordingPrivacy, evaluateRecordingCoverage } from '../../../scripts/lib/transcription/private-recording.mjs';
import { validateSession } from '../../../scripts/webinar/validate/validate-session.mjs';
import { loadWebinarSession } from '../../../scripts/webinar/session-rows.mjs';
import { writeTranscriptGeneration } from '../../../scripts/lib/transcript-provenance.mjs';
import { buildTranscriptQaGeneration, assertQaGenerationShape } from '../../../scripts/lib/transcription/transcript-qa-generation.mjs';
import { clampAndValidateTurns } from '../../../packages/ai/src/stt/transcript-qa.ts';
import { writeRecordConsent } from '../../../packages/meeting-bot/src/capture/record-consent/receipt-store.ts';

const startedAt = new Date().toISOString(), started = performance.now();
const evidence = dirname(fileURLToPath(import.meta.url)), outcomes = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const put = (f, name, value) => writeFileSync(join(f.dir, name), `${JSON.stringify(value, null, 2)}\n`);
const turn = (tStart, tEnd, text) => ({ speakerRef: 'spk:0', tStart, tEnd, text });
const publicTurns = () => [turn(0, 299.899999, 'public career guidance before'), turn(600.100001, 900, 'public career guidance after')];
function proof(f, privacy, original, accepted = true, id = 'selected') {
  const bytes = readFileSync(join(f.dir, 'turns.json')), turns = JSON.parse(bytes);
  const filtered = privacy.filterSpanTurns(original, 0, 900);
  return buildTranscriptQaGeneration({ turnsBytes: bytes, durationSec: 900,
    privacy: { receiptSha256: privacy.receiptSha256, sanitizedAudioSha256: privacy.sanitizedAudioSha256, publicIntervals: privacy.publicIntervals },
    merged: clampAndValidateTurns(turns, 900).report,
    spans: [{ id, accepted, offsetSeconds: 0, providerReport: clampAndValidateTurns(original, 900).report,
      report: clampAndValidateTurns(filtered.turns, 900).report, privacy: filtered.privacy }] });
}
const validate = f => validateSession({ root: f.root, sessionId: f.owner.sessionId, durationSec: 900, env: {} });
const gate = f => loadWebinarSession(f.dir, f.owner.sessionId);
async function clean(f) {
  const context = await loadTrustedRecordingPrivacy(f.options);
  const original = [publicTurns()[0], turn(350, 360, 'PRIVATE SENTINEL'), publicTurns()[1]];
  writeTranscriptGeneration(f.dir, f.owner.tenantId, f.owner.sessionId, publicTurns());
  put(f, 'transcript-qa.json', proof(f, context, original));
  const result = await validate(f);
  assert.equal(result.passed, true, JSON.stringify(result.report)); assert.equal(result.gate, 'accepts');
  assert.equal(gate(f).rawTurns.length, 2); assert.ok(!JSON.stringify(result.report).includes('PRIVATE SENTINEL'));
  return context;
}
async function run(name, work) {
  const f = createPrivateRecordingFixture();
  try { await work(f); outcomes.push({ name, outcome: 'PASS' }); }
  finally {
    // The owner cleanup removes only this freshly generated, verified local fixture directory.
    assert.equal(dirname(resolve(f.root)), resolve(tmpdir()));
    assert.ok(basename(resolve(f.root)).startsWith('t048-private-proof-'));
    f.cleanup();
  }
}

await run('trusted capture public output traverses actual validator and consumer with public QA flag off', clean);
await run('no sealed context, foreign generation and raw reselection make zero callback dispatches', async f => {
  let calls = 0; const callback = async () => { calls++; return 'unreachable'; };
  const unsealed = await loadTrustedRecordingPrivacy({ ...f.options, sealedInput: null });
  await assert.rejects(unsealed.runProvider(callback), /sealed parent input/);
  await assert.rejects(loadTrustedRecordingPrivacy({ ...f.options, sealedInput: { ...f.sealedInput, tenantId: 'foreign' } }), /Sealed capture input/);
  await assert.rejects(loadTrustedRecordingPrivacy({ ...f.options, sealedInput: { ...f.sealedInput, generation: '00000000-0000-4000-8000-000000000002' } }), /Sealed capture input/);
  await assert.rejects(loadTrustedRecordingPrivacy({ ...f.options, audioPath: f.original }), /Provider audio differs/);
  assert.equal(calls, 0);
});
await run('caller supplied private windows cannot waive deficits even with acceptPartial', async f => {
  const source = { ...f.source, captureMode: 'provided', privateWindows: [{ tStart: 0, tEnd: 900 }] };
  delete source.captureConsent; writeFileSync(f.sourcePath, JSON.stringify(source));
  writeTranscriptGeneration(f.dir, f.owner.tenantId, f.owner.sessionId, [turn(0, 1, 'very short public speech')]);
  const result = await validateSession({ root: f.root, sessionId: f.owner.sessionId, durationSec: 900, acceptPartial: true, env: {} });
  assert.equal(result.passed, false); assert.match(result.report.error, /durable consent\/media proof/);
});
await run('unprotected public time is aggregated across many protected windows', async () => {
  const publicIntervals = Array.from({ length: 10 }, (_, index) => ({ tStart: index * 100, tEnd: index * 100 + 10 }));
  const result = evaluateRecordingCoverage({ privacy: { publicIntervals }, turns: [turn(0, 10, 'only first public window')], durationSeconds: 910 });
  assert.equal(result.expectedPublicSeconds, 100); assert.equal(result.tailShortfall, 90); assert.equal(result.complete, false);
});
await run('mixed protected and missing public deficit refuses actual validation', async f => {
  const context = await loadTrustedRecordingPrivacy(f.options), turns = [turn(0, 240, 'opening'), turn(650, 900, 'closing')];
  writeTranscriptGeneration(f.dir, f.owner.tenantId, f.owner.sessionId, turns); put(f, 'transcript-qa.json', proof(f, context, turns));
  const result = await validate(f); assert.equal(result.passed, false); assert.equal(result.report.partial, true);
  assert.ok(result.report.gaps.some(g => g.unprotectedSeconds > 109)); assert.throws(() => gate(f));
});
await run('protected canonical speech cannot be promoted', async f => {
  await clean(f);
  writeTranscriptGeneration(f.dir, f.owner.tenantId, f.owner.sessionId, [...publicTurns(), turn(350, 360, 'private canonical intrusion')]);
  const result = await validate(f); assert.equal(result.passed, false); assert.match(result.report.error, /intentionally protected/);
  assert.throws(() => gate(f));
});
await run('accepted raw past-end provider anomaly survives public filtering and refuses', async f => {
  const context = await clean(f);
  const original = [publicTurns()[0], turn(350, 360, 'private discarded'), publicTurns()[1], turn(900, 910, 'hallucinated tail')];
  put(f, 'transcript-qa.json', proof(f, context, original));
  const result = await validate(f); assert.equal(result.passed, false); assert.match(result.report.error, /accepted provider.*past the audio end/);
  assert.throws(() => gate(f));
});
await run('discarded raw anomaly stays auditable without rejecting a later clean accepted attempt', async f => {
  const context = await clean(f), cleanProof = proof(f, context, publicTurns());
  const raw = [...publicTurns(), turn(900, 910, 'discarded anomaly')];
  const bad = proof(f, context, raw).spans[0]; bad.id = 'discarded'; bad.accepted = false;
  cleanProof.spans.unshift(bad); assertQaGenerationShape(cleanProof); put(f, 'transcript-qa.json', cleanProof);
  assert.equal((await validate(f)).passed, true); assert.equal(gate(f).rawTurns.length, 2);
});
await run('privacy exclusion ledger cannot hide a provider-dropped index', async f => {
  const context = await clean(f);
  const original = [publicTurns()[0], turn(350, 360, 'private'), publicTurns()[1], turn(900, 910, 'bad timing')];
  const candidate = proof(f, context, original); candidate.spans[0].privacy.excludedIndices = [3];
  assert.throws(() => assertQaGenerationShape(candidate), /privacy exclusion counts\/indices/);
});
await run('missing bound raw QA fails trusted capture even with public flag off', async f => {
  await clean(f); unlinkSync(join(f.dir, 'transcript-qa.json'));
  const result = await validate(f); assert.equal(result.passed, false); assert.match(result.report.error, /requires generation-bound transcript-qa/);
  assert.throws(() => gate(f));
});
await run('same speech plus changed source cannot reuse accepted generation', async f => {
  await clean(f); const speech = readFileSync(join(f.dir, 'turns.json'));
  writeFileSync(f.sourcePath, JSON.stringify({ ...f.source, title: 'new privacy/source generation' }));
  assert.deepEqual(readFileSync(join(f.dir, 'turns.json')), speech); assert.throws(() => gate(f), /source snapshot/);
});
await run('same source and speech plus changed durable receipt cannot reuse acceptance', async f => {
  await clean(f); const source = readFileSync(f.sourcePath), speech = readFileSync(join(f.dir, 'turns.json'));
  writeRecordConsent(f.recordDir, { ...f.receipt, privateWindows: [{ tStart: 310, tEnd: 600 }] });
  assert.deepEqual(readFileSync(f.sourcePath), source); assert.deepEqual(readFileSync(join(f.dir, 'turns.json')), speech);
  assert.throws(() => gate(f), /receipt changed/);
});
await run('same source, receipt and speech plus changed public media cannot reuse acceptance', async f => {
  await clean(f); const source = readFileSync(f.sourcePath);
  writeFileSync(f.audioPath, 'changed public audio bytes'); assert.deepEqual(readFileSync(f.sourcePath), source);
  assert.throws(() => gate(f), /Public capture media changed/);
});

const report = { startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
  slug: 't044-trusted-private-windows', fixCycle: 0, integrationVersion: 1,
  tests: outcomes.length, passed: outcomes.length, failed: 0, syntheticMediaOnly: true,
  actualConstructorStoreHelperValidatorConsumer: true, realNetworkProviderCalls: 0, realCodecCalls: 0, realDbCalls: 0,
  scope: 'Trusted privacy source/caller/consumer integration; injected duration and synthetic bytes.',
  fullParentVerdict: 'HOLD: actual audio/provider spot checks and live watcher/finalizer/privacy proofs remain required', outcomes };
writeFileSync(join(evidence, 'checker-probe-result.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
