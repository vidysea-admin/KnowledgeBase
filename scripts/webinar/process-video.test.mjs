import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { processVideo, geminiVision, validateVision, validateTurns, buildNotes, mediaCommand, screenEvidenceTurns } from './process-video.mjs';

const turns = [{ _id: 'turn-1', tenantId: 'test-tenant', sessionId: 'session-1', tStart: 0, tEnd: 2, text: 'A speaker claim, not a verified fact.', speakerRef: 'Speaker 1' }];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lkb-video-'));
  const dir = join(root, 'data', 'toc-migrated', 'session-1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'turns.json'), JSON.stringify(turns));
  writeFileSync(join(root, 'recording.webm'), 'media');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const command = async (binary, args) => {
    calls.push({ binary, args });
    if (binary === 'ffprobe') return { stdout: JSON.stringify({ format: { duration: 2 }, streams: [{ codec_type: 'video' }] }) };
    const dir = dirname(args.at(-1));
    writeFileSync(join(dir, 'frame-000001.jpg'), 'pixels-A');
    writeFileSync(join(dir, 'frame-000002.jpg'), 'pixels-A');
    writeFileSync(join(dir, 'frame-000003.jpg'), 'pixels-B');
    return { stderr: 'n: 0 pts_time:0\nn: 1 pts_time:1\nn: 2 pts_time:1.5' };
  };
  const input = { root, sessionId: 'session-1', tenantId: 'test-tenant', recording: 'recording.webm', command,
    vision: async () => ({ readable: true, ocrText: 'Slide text', visualDescription: 'Two bars; numeric labels are unreadable.' }) };
  return { root, dir, calls, input };
}
test('dry-run probes inputs but writes no output and never calls vision', async (t) => {
  const f = fixture(t), before = readdirSync(f.dir);
  const state = await processVideo({ ...f.input, dryRun: true, vision: () => { throw new Error('called'); } });
  assert.equal(state.status, 'dry-run'); assert.deepEqual(readdirSync(f.dir), before);
  assert.deepEqual(f.calls.map((c) => c.binary), ['ffprobe']);
});
test('scene extraction dedupes bytes, associates real turns, and notes cite real frames', async (t) => {
  const f = fixture(t), state = await processVideo(f.input);
  assert.equal(state.frameCount, 2);
  const evidence = JSON.parse(readFileSync(join(f.dir, 'screen-evidence.json')));
  assert.deepEqual(evidence.frames.map((p) => p.tStart), [0, 1.5]);
  assert.deepEqual(evidence.frames[1].turnIds, ['turn-1']);
  const notes = JSON.parse(readFileSync(join(f.dir, 'notes.json')));
  assert.equal(notes.notes[0].text, turns[0].text);
  assert.equal(notes.notes[0].verified, false);
  assert.equal(notes.notes[1].evidence[0].frameId, evidence.frames[0].id);
  assert.deepEqual(notes.decisions, []);
  const knowledge = JSON.parse(readFileSync(join(f.dir, 'knowledge-turns.json')));
  assert.equal(knowledge.length, 5);
  assert.equal(knowledge.find((turn) => turn._id === turns[0]._id).speakerRef, 'Speaker 1');
  assert.ok(knowledge.filter((turn) => turn.speakerRef === 'screen').every((turn) =>
    turn.tenantId === 'test-tenant' && turn.sessionId === 'session-1' && turn.tEnd <= 2 && turn.screenEvidence.hash));
  assert.ok(state.outputs['knowledge-turns.json']);
  assert.match(f.calls[1].args.join(' '), /gt\(scene,0.30\)/);
});
test('content hash reuse requires outputs and actual frames unchanged', async (t) => {
  const f = fixture(t); await processVideo(f.input);
  assert.equal((await processVideo(f.input)).reused, true);
  const evidence = JSON.parse(readFileSync(join(f.dir, 'screen-evidence.json')));
  writeFileSync(join(f.dir, evidence.frames[0].file), 'corrupted');
  assert.equal((await processVideo(f.input)).reused, undefined);
  writeFileSync(join(f.dir, 'turns.json'), JSON.stringify([{ ...turns[0], text: 'Changed transcript' }]));
  assert.equal((await processVideo(f.input)).reused, undefined);
});
test('provider failure is durable; retry converges and releases lock', async (t) => {
  const f = fixture(t);
  await assert.rejects(processVideo({ ...f.input, vision: async () => { throw new Error('provider unavailable'); } }), /provider unavailable/);
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'video-stage.json'))).status, 'failed');
  assert.ok(!readdirSync(f.dir).includes('.video-stage.lock'));
  assert.equal((await processVideo(f.input)).status, 'done');
});
test('missing vision config does not start extraction or claim screen completion', async (t) => {
  const f = fixture(t);
  await assert.rejects(processVideo({ ...f.input, vision: undefined }), /configured vision provider/);
  const diagnostic = JSON.parse(readFileSync(join(f.dir, 'video-stage.json')));
  assert.equal(diagnostic.status, 'failed');
  assert.match(diagnostic.error, /vision provider not configured/);
  assert.ok(!readdirSync(f.dir).includes('screen-evidence.json'));
  assert.deepEqual(f.calls.map((call) => call.binary), ['ffprobe']);
});
test('unreadable stays unresolved; invented model keys are rejected', () => {
  assert.throws(() => validateVision({ readable: false, ocrText: 'invention', visualDescription: '' }), /unresolved/);
  assert.throws(() => validateVision({ readable: true, ocrText: '', visualDescription: '', speaker: 'CEO' }), /schema/);
  const notes = buildNotes('s', [{ id: 'f', tStart: 1, analysis: { readable: false, ocrText: '', visualDescription: '' } }], turns);
  assert.equal(notes.notes.length, 1); assert.equal(notes.gaps[0].frameId, 'f');
});
test('turns reject fake ids, duplicate ids, out-of-media timestamps', () => {
  assert.throws(() => validateTurns([{ ...turns[0], tEnd: 5 }], 2), /timestamp/);
  assert.throws(() => validateTurns([...turns, ...turns], 2), /invalid/);
  assert.throws(() => validateTurns([], 2), /nonempty/);
  assert.throws(() => validateTurns([{ ...turns[0], speakerRef: '' }], 2), /invalid/);
  assert.throws(() => validateTurns([{ ...turns[0], tenantId: 'foreign' }], 2, { tenantId: 'test-tenant' }), /invalid/);
  assert.throws(() => validateTurns([{ ...turns[0], sessionId: 'foreign' }], 2, { sessionId: 'session-1' }), /invalid/);
});
test('source-derived tenant works; foreign or missing provenance is refused', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.dir, 'source.json'), JSON.stringify({ tenantId: 'test-tenant' }));
  assert.equal((await processVideo({ ...f.input, tenantId: undefined })).status, 'done');
  await assert.rejects(processVideo({ ...f.input, tenantId: 'foreign' }), /conflicts/);
  writeFileSync(join(f.dir, 'turns.json'), JSON.stringify([{ ...turns[0], tenantId: undefined }]));
  await assert.rejects(processVideo(f.input), /scope/);
});
test('screen IDs remain stable when extraction indexes change; bad refs refused', () => {
  const frame = { id: 'frame-a', hash: 'a'.repeat(64), file: 'screen-frames/test-run/frame-000001.jpg', tStart: 1.8,
    analysis: { readable: true, ocrText: 'Slide text', visualDescription: 'Chart' } };
  const evidence = { sessionId: 'session-1', tenantId: 'test-tenant', duration: 2, frames: [frame] };
  const rows = screenEvidenceTurns('session-1', 'test-tenant', evidence);
  assert.equal(rows[0]._id, screenEvidenceTurns('session-1', 'test-tenant', { ...evidence, frames: [{ ...frame, id: 'frame-z' }] })[0]._id);
  assert.equal(rows[0].screenEvidence.frameId, 'frame-a');
  assert.match(rows[0].text, /^\[Screen OCR; unverified\]/);
  assert.match(rows[1].text, /^\[Visual observation; unverified\]/);
  assert.throws(() => screenEvidenceTurns('session-1', '', evidence), /scope/);
  assert.throws(() => screenEvidenceTurns('session-1', 'test-tenant', { ...evidence, frames: [{ ...frame, file: '../outside.jpg' }] }), /frame/);
  assert.throws(() => validateVision({ readable: true, ocrText: ' ', visualDescription: '' }), /screen evidence/);
});
test('notes are bounded extractive highlights with traceable excerpts', () => {
  const input = Array.from({ length: 30 }, (_, i) => ({ ...turns[0], _id: `turn-${i}`, text: `${i} ${'A'.repeat(1000)}` }));
  const notes = buildNotes('session-1', [], input);
  assert.equal(notes.notes.length, 4);
  assert.ok(notes.notes.every((note) => note.text.length <= 280 && input.some((turn) => turn._id === note.evidence[0].turnId)));
  assert.equal(notes.summary.method, 'extractive');
});
test('traversal and active lock rejected without output mutation', async (t) => {
  const f = fixture(t);
  await assert.rejects(processVideo({ ...f.input, sessionId: '../escape' }), /invalid sessionId/);
  writeFileSync(join(f.dir, '.video-stage.lock'), String(process.pid));
  await assert.rejects(processVideo(f.input), /already running/);
  assert.ok(!readdirSync(f.dir).includes('screen-evidence.json'));
});
test('Gemini request sends actual image through Transport; validates actual response', async (t) => {
  const f = fixture(t), image = join(f.root, 'frame.jpg'); writeFileSync(image, 'pixels');
  let request;
  const vision = geminiVision(async (req) => {
    request = req;
    return { status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ readable: true, ocrText: 'Costs', visualDescription: 'A chart' }) }] } }] } };
  }, { apiKey: 'fixture-only', model: 'gemini-test' });
  assert.equal((await vision({ path: image })).ocrText, 'Costs');
  assert.equal(request.kind, 'http'); assert.equal(request.headers['x-goog-api-key'], 'fixture-only');
  assert.equal(request.body.contents[0].parts[1].inlineData.data, Buffer.from('pixels').toString('base64'));
  await assert.rejects(geminiVision(async () => ({ status: 500 }), { apiKey: 'test', model: 'gemini-test' })({ path: image }), /status 500/);
});
test('real ffmpeg synthetic video yields timestamped playable frame evidence', async (t) => {
  const f = fixture(t), path = join(f.root, 'real.webm');
  await mediaCommand('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2', '-c:v', 'libvpx', path]);
  const state = await processVideo({ ...f.input, recording: 'real.webm', command: mediaCommand });
  assert.equal(state.status, 'done'); assert.equal(state.frameCount, 1);
  const evidence = JSON.parse(readFileSync(join(f.dir, 'screen-evidence.json')));
  assert.equal(evidence.frames[0].tStart, 0);
  assert.ok(readFileSync(join(f.dir, evidence.frames[0].file)).length > 100);
});
