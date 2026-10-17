import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { slideFrameSpans, analyzeSlideFrame, enrichSlideKnowledgeTurns } from './slide-knowledge.mjs';
import { processVideo, screenEvidenceTurns, validateVision, geminiVision, routedVision } from '../process-video.mjs';
import { loadWebinarSession, buildSessionFiles } from '../session-rows.mjs';
import { buildChunks } from '../../../packages/index/src/chunk/build-chunks.ts';
import { createSourceHydrator } from '../../../apps/api/src/ask/source-context.ts';

const speech = [
  { _id: 'cross', tenantId: 'tenant-a', sessionId: 'slides', speakerRef: 'speaker', text: 'Neighboring spoken explanation.', tStart: 0, tEnd: 5 },
  { _id: 'boundary', tenantId: 'tenant-a', sessionId: 'slides', speakerRef: 'speaker', text: 'The second topic starts now.', tStart: 2, tEnd: 4 },
  { _id: 'zero', tenantId: 'tenant-a', sessionId: 'slides', speakerRef: 'speaker', text: 'An instantaneous note.', tStart: 2, tEnd: 2 },
];
const analysis = (ocrText) => ({ readable: Boolean(ocrText), ocrText, visualDescription: '' });
function fixture(t, pixels = ['A', 'A', 'B', 'blank', 'A']) {
  const tempBase = realpathSync(tmpdir());
  const root = mkdtempSync(join(tempBase, 'lkb-slide-knowledge-')), dir = join(root, 'data', 'toc-migrated', 'slides');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, 'recording.webm'), 'synthetic-media');
  writeFileSync(join(dir, 'turns.json'), JSON.stringify(speech));
  writeFileSync(join(dir, 'source.json'), JSON.stringify({ _id: 'slides-source', tenantId: 'tenant-a', title: 'Slides', createdAt: '2026-10-14T10:00:00Z', platform: 'fixture' }));
  const command = async (binary, args) => {
    if (binary === 'ffprobe') return { stdout: JSON.stringify({ format: { duration: 5 }, streams: [{ codec_type: 'video' }] }) };
    for (const [index, value] of pixels.entries()) writeFileSync(join(dirname(args.at(-1)), `frame-${String(index + 1).padStart(6, '0')}.jpg`), value);
    return { stderr: [0, 1, 2, 3, 4].map((time) => `pts_time:${time}`).join('\n') };
  };
  const input = { root, sessionId: 'slides', tenantId: 'tenant-a', recording: 'recording.webm', command,
    visionRetry: { sleep: async () => {} }, vision: async ({ path }) => {
      const value = readFileSync(path, 'utf8');
      return analysis(value === 'blank' ? '' : value === 'A' ? 'SLIDE_ONLY_PHRASE fee 1200' : 'BETA second slide');
    } };
  t.after(() => {
    const target = realpathSync(root);
    if (dirname(target) !== tempBase || !basename(target).startsWith('lkb-slide-knowledge-')) throw new Error('unsafe fixture cleanup path');
    rmSync(target, { recursive: true, force: true });
  });
  return { root, dir, input };
}

test('visibility uses half-open overlap, crossing/zero-length turns and finite final coverage', () => {
  const spans = slideFrameSpans([{ id: 'b', tStart: 2 }, { id: 'a', tStart: 0 }], 5, speech);
  assert.deepEqual(spans.map(({ frame, tEnd, turnIds }) => [frame.id, frame.tStart, tEnd, turnIds]),
    [['a', 0, 2, ['cross']], ['b', 2, 5, ['boundary', 'cross', 'zero']]]);
  assert.throws(() => slideFrameSpans([{ id: 'a', tStart: 1 }, { id: 'b', tStart: 1 }], 5), /observation/);
  assert.throws(() => slideFrameSpans([{ id: 'a', tStart: 5 }], 5), /observation/);
  assert.throws(() => slideFrameSpans([], 5, [...speech, speech[0]]), /speech turn/);
  assert.throws(() => slideFrameSpans([], NaN), /timeline/);
});

test('retry/backoff then fallback, malformed replies retry, and blank is a definitive success', async () => {
  const waits = [], calls = [];
  const result = await analyzeSlideFrame({ id: 'f' }, async () => { calls.push('primary'); return { invented: true }; }, validateVision,
    { sleep: async (ms) => waits.push(ms), fallback: async () => { calls.push('fallback'); return analysis('actual OCR'); } });
  assert.equal(result.ocrText, 'actual OCR'); assert.deepEqual(calls, ['primary', 'primary', 'primary', 'fallback']);
  assert.deepEqual(waits, [100, 200]);
  let blanks = 0;
  assert.deepEqual(await analyzeSlideFrame({ id: 'blank' }, async () => { blanks++; return analysis(''); }, validateVision), analysis(''));
  assert.equal(blanks, 1);
  await assert.rejects(analyzeSlideFrame({ id: 'failed' }, async () => { throw new Error('SECRET key and text'); }, validateVision,
    { sleep: async () => {}, fallback: async () => { throw new Error('SECRET'); } }), (error) => {
    assert.equal(error.attempts, 4); assert.equal(error.frameId, 'failed'); assert.equal(error.code, 'ocr-failed');
    assert.ok(!error.message.includes('SECRET')); return true;
  });
});

test('explicit failed-observation boundaries exclude gap speech and bound trailing gaps', () => {
  const turns = [{ _id: 'gap', tStart: 2, tEnd: 3 }, { _id: 'resume', tStart: 4, tEnd: 5 }];
  const spans = slideFrameSpans([{ id: 'a', tStart: 0, tEnd: 2 }, { id: 'c', tStart: 4 }], 5, turns);
  assert.deepEqual(spans.map(({ tEnd, turnIds }) => [tEnd, turnIds]), [[2, []], [5, ['resume']]]);
  assert.equal(slideFrameSpans([{ id: 'a', tStart: 0, tEnd: 2 }], 5)[0].tEnd, 2);
  for (const tEnd of [0, -1, NaN, Infinity, 4.5]) {
    assert.throws(() => slideFrameSpans([{ id: 'a', tStart: 0, tEnd }, { id: 'c', tStart: 4 }], 5), /observation end/);
  }
});

test('actual wired stage preserves A/B/blank/A, persisted OCR spans and original speech; reader and chunker consume it', async (t) => {
  const f = fixture(t), originalBytes = readFileSync(join(f.dir, 'turns.json'));
  const state = await processVideo(f.input);
  assert.equal(state.status, 'done'); assert.equal(state.frameCount, 4); assert.deepEqual(state.ocrErrors, []);
  const evidence = JSON.parse(readFileSync(join(f.dir, 'screen-evidence.json')));
  assert.equal(evidence.version, 3); assert.deepEqual(evidence.frames.map((frame) => frame.tStart), [0, 2, 3, 4]);
  assert.deepEqual(evidence.frames.map((frame) => frame.turnIds), [['cross'], ['boundary', 'cross', 'zero'], [], ['cross']]);
  const loaded = loadWebinarSession(f.dir, 'slides');
  assert.deepEqual(loaded.rawTurns.filter((turn) => turn.speakerRef !== 'screen'), speech);
  const screen = loaded.rawTurns.filter((turn) => turn.speakerRef === 'screen');
  assert.deepEqual(screen.map((turn) => [turn.tStart, turn.tEnd]), [[0, 2], [2, 3], [4, 5]]);
  assert.ok(screen[0].text.includes('SLIDE_ONLY_PHRASE')); assert.equal(screen[0].speakerRef, 'screen');
  assert.equal(screen[0].screenEvidence.frameId, evidence.frames[0].id);
  assert.equal(screen[2].screenEvidence.frameId, evidence.frames[3].id);
  assert.notEqual(screen[0]._id, screen[2]._id, 'A/B/A produces separate stable screen identities');
  const plans = buildChunks(loaded.rawTurns);
  assert.ok(plans.some((plan) => plan.text.includes('SLIDE_ONLY_PHRASE') && plan.turnRefs.includes(screen[0]._id)));
  assert.ok(plans.some((plan) => plan.text.includes('Neighboring spoken explanation.')));
  assert.deepEqual(readFileSync(join(f.dir, 'turns.json')), originalBytes);
  assert.equal((await processVideo(f.input)).reused, true);
});

test('never-resolving primary and fallback time out and abort every attempt without late rejection leaks', async () => {
  const signals = [];
  const hung = ({ signal }) => { signals.push(signal); return new Promise(() => {}); };
  await assert.rejects(analyzeSlideFrame({ id: 'hung' }, hung, validateVision,
    { timeoutMs: 5, retries: 1, sleep: async () => {}, fallback: hung }), (error) => {
    assert.equal(error.attempts, 3); assert.equal(error.frameId, 'hung'); return true;
  });
  assert.equal(signals.length, 3); assert.ok(signals.every((signal) => signal.aborted));
  await assert.rejects(analyzeSlideFrame({ id: 'late' }, () => new Promise((_, reject) => setTimeout(() => reject(new Error('PRIVATE late')), 20)), validateVision,
    { timeoutMs: 5, retries: 0 }), /1 attempts/);
  await new Promise((done) => setTimeout(done, 25));
});

test('direct Gemini and routed backend receive the attempt abort signal', async (t) => {
  const f = fixture(t), path = join(f.root, 'frame.jpg'); writeFileSync(path, 'pixels');
  const controller = new AbortController(); let directSignal, routedSignal;
  const direct = geminiVision(async (request) => { directSignal = request.signal; return { status: 200,
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify(analysis('OCR')) }] } }] } }; }, { apiKey: 'fixture-key', model: 'fixture' });
  await direct({ path, signal: controller.signal }); assert.equal(directSignal, controller.signal);
  const backends = [{ provider: 'fixture', model: 'fixture', call: async (_request, context) => { routedSignal = context.signal; return analysis('OCR'); } }];
  const lib = { runVisionChain: async (bound) => ({ value: await bound[0].call({}, { timeoutMs: 50 }) }) };
  await routedVision(lib, backends)({ path, signal: controller.signal }); assert.equal(routedSignal, controller.signal);
});

test('exhausted frame is omitted with typed counted gaps; reuse retries it instead of hiding data loss', async (t) => {
  const f = fixture(t), original = f.input.vision;
  const input = { ...f.input, vision: async (frame) => {
    if (readFileSync(frame.path, 'utf8') === 'B') throw new Error('SECRET');
    return original(frame);
  }, visionFallback: async () => { throw new Error('SECRET FALLBACK'); } };
  const state = await processVideo(input);
  assert.equal(state.ocrErrors.length, 1); assert.equal(state.ocrErrors[0].attempts, 4);
  assert.equal(state.ocrErrors[0].reason, 'ocr-failed');
  const loaded = loadWebinarSession(f.dir, 'slides');
  assert.ok(!loaded.rawTurns.some((turn) => turn.text.includes('BETA')));
  const evidence = JSON.parse(readFileSync(join(f.dir, 'screen-evidence.json')));
  assert.equal(evidence.frames[0].tEnd, 2, 'failed B ends A even though B is omitted');
  assert.deepEqual(evidence.frames[0].turnIds, ['cross']);
  assert.equal(loaded.rawTurns.find((turn) => turn.screenEvidence).tEnd, 2);
  assert.equal(loaded.notes.gaps.find((gap) => gap.reason === 'ocr-failed').attempts, 4);
  assert.ok(!JSON.stringify(state).includes('SECRET'));
  assert.equal((await processVideo({ ...input, vision: original })).reused, undefined);
  assert.deepEqual(loadWebinarSession(f.dir, 'slides').notes.gaps.map((gap) => gap.reason), ['unreadable-screen']);
});

test('A then exhausted B then A resumes original OCR after the failed interval', async (t) => {
  const f = fixture(t, ['A', 'A', 'B', 'A', 'A']);
  const state = await processVideo({ ...f.input, visionRetry: { retries: 0 }, vision: async ({ path }) => {
    if (readFileSync(path, 'utf8') === 'B') throw new Error('PRIVATE');
    return analysis('SAME_A');
  } });
  assert.equal(state.ocrErrors.length, 1); assert.equal(state.ocrErrors[0].attempts, 1);
  const evidence = JSON.parse(readFileSync(join(f.dir, 'screen-evidence.json')));
  assert.deepEqual(evidence.frames.map((frame) => [frame.tStart, frame.tEnd]), [[0, 2], [3, 5]]);
  assert.ok(!evidence.frames.some((frame) => frame.tStart === 2), 'failed OCR content remains omitted');
  assert.deepEqual(evidence.frames.map((frame) => frame.turnIds), [['cross'], ['boundary', 'cross']]);
  const loaded = loadWebinarSession(f.dir, 'slides');
  const screen = loaded.rawTurns.filter((turn) => turn.screenEvidence);
  assert.deepEqual(screen.map((turn) => [turn.tStart, turn.tEnd]), [[0, 2], [3, 5]]);
  assert.ok(screen.every((turn) => turn.text.endsWith('SAME_A')));
  assert.notEqual(screen[0]._id, screen[1]._id);
  assert.equal(loaded.notes.gaps.find((gap) => gap.reason === 'ocr-failed').tStart, 2);
});

test('production speaker mapper preserves OCR against a screen alias, then actual scoped hydrator returns screen/time citations', async (t) => {
  const f = fixture(t); await processVideo(f.input);
  const { rawTurns, meta } = loadWebinarSession(f.dir, 'slides');
  const t0 = Date.parse('2026-10-14T10:00:00Z');
  const people = [{ label: 'screen', personId: 'person:alice', role: 'host' }, { label: 'speaker', personId: 'person:bob', role: 'presenter' }];
  const mapped = enrichSlideKnowledgeTurns(rawTurns, { sessionId: 'slides', t0,
    people });
  assert.ok(mapped.filter((turn) => turn.screenEvidence).every((turn) => turn.speakerRef === 'screen' && turn.speakerLabel === 'screen'));
  assert.ok(mapped.filter((turn) => !turn.screenEvidence).every((turn) => turn.speakerRef === 'person:bob'));
  assert.equal(mapped.find((turn) => turn._id === 'boundary').occurredAt, '2026-10-14T10:00:02.000Z');
  assert.ok(!mapped.some((turn) => turn.speakerRef === 'person:alice'));
  const files = buildSessionFiles({ sessionId: 'slides', tenantId: 'tenant-a', turns: mapped, meta: { ...meta, people },
    sessionDoc: { sourceId: 'slides-source', title: meta.title, date: meta.date, org: '', status: {} } });
  assert.ok(files.sessionPage.summary.includes('Speakers: speaker (presenter)'));
  assert.ok(!files.sessionPage.summary.includes('screen (host)'), 'screen alias cannot become a speaker in emitted session summary');
  assert.ok(files.sessionPage.evidence.every((item) => mapped.find((turn) => turn._id === item.turnId)?.speakerRef === 'person:bob'));
  const screen = rawTurns.find((turn) => turn.screenEvidence);
  assert.equal(enrichSlideKnowledgeTurns([{ ...screen, speakerRef: 'speaker' }], { sessionId: 'slides', t0,
    people: [{ label: 'speaker', personId: 'person:bob' }] })[0].speakerRef, 'screen');
  const foreign = mapped.map((turn) => ({ ...turn, tenantId: 'tenant-b', text: 'FOREIGN private' }));
  const tables = {
    turns: [...mapped, ...foreign],
    sessions: [{ _id: 'slides', tenantId: 'tenant-a', sourceId: 'slides-source', title: 'Slides' }],
    sources: [{ _id: 'slides-source', tenantId: 'tenant-a', kind: 'recording', path: 'recording.webm' }],
    transcript_reviews: [], // This recording has no human transcript correction overlay.
    whatsapp_candidates: [],
  };
  const filters = [];
  const select = (name, filter) => {
    assert.equal(typeof filter.tenantId, 'string', 'every fixture read must carry the request tenant');
    assert.ok(Object.hasOwn(tables, name), `unexpected fixture collection: ${name}`);
    filters.push({ name, filter });
    return tables[name].filter((row) => Object.entries(filter).every(([key, value]) =>
      value && typeof value === 'object' && Array.isArray(value.$in) ? value.$in.includes(row[key]) : row[key] === value));
  };
  const db = { collection: (name) => ({
    find: (filter) => ({ toArray: async () => select(name, filter) }),
    findOne: async (filter) => select(name, filter)[0] ?? null,
  }) };
  const node = { node_id: 'tenant:tenant-a/session:slides', title: 'Slides', level: 'session', summary: '', evidence: { sessionRef: 'slides' }, children: [] };
  const hydrated = await createSourceHydrator('tenant-a', { db })('SLIDE_ONLY_PHRASE', [node]);
  const quotes = hydrated.nodes[0].evidence.sourceQuotes;
  const screenQuote = quotes.find((quote) => quote.quote.includes('SLIDE_ONLY_PHRASE'));
  assert.equal(screenQuote.origin, 'screen-ocr-unverified'); assert.equal(screenQuote.speakerRef, 'screen');
  assert.equal(screenQuote.sessionRef, 'slides'); assert.ok(screenQuote.tStart >= 0 && screenQuote.tEnd <= 5);
  assert.ok(!JSON.stringify(hydrated).includes('FOREIGN')); assert.equal(filters[0].filter.tenantId, 'tenant-a');
  assert.ok(filters.some(({ name, filter }) => name === 'transcript_reviews' && filter.sessionId === 'slides'));
  assert.ok(filters.some(({ name, filter }) => name === 'sessions' && filter._id === 'slides'));
  assert.ok(filters.some(({ name, filter }) => name === 'sources' && filter._id === 'slides-source'));
  await assert.rejects(createSourceHydrator('tenant-c', { db })('SLIDE_ONLY_PHRASE', [node]), /no source rows/);
});

test('legacy evidence keeps its point timestamps; unsupported versions and foreign tenant fail closed', () => {
  const frame = { id: 'f', hash: 'a'.repeat(64), file: 'screen-frames/run/frame-000001.jpg', tStart: 2, analysis: analysis('OCR') };
  const evidence = { sessionId: 'slides', tenantId: 'tenant-a', duration: 5, frames: [frame], version: 2 };
  assert.equal(screenEvidenceTurns('slides', 'tenant-a', evidence)[0].tEnd, 2.001);
  assert.equal(screenEvidenceTurns('slides', 'tenant-a', { ...evidence, version: 3 })[0].tEnd, 5);
  const v3a = screenEvidenceTurns('slides', 'tenant-a', { ...evidence, version: 3 })[0];
  const v3b = screenEvidenceTurns('slides', 'tenant-b', { ...evidence, version: 3, tenantId: 'tenant-b' })[0];
  assert.notEqual(v3a._id, v3b._id, 'new v3 screen rows cannot collide across tenants even with equal session/frame IDs');
  assert.equal(v3a._id, screenEvidenceTurns('slides', 'tenant-a', { ...evidence, version: 3 })[0]._id);
  assert.throws(() => screenEvidenceTurns('slides', 'tenant-b', evidence), /scope/);
  assert.throws(() => screenEvidenceTurns('slides', 'tenant-a', { ...evidence, version: 4 }), /scope/);
});

test('shared ingestion refuses digest-resealed missing, foreign, duplicate and misassigned speech attachments', async (t) => {
  const f = fixture(t); await processVideo(f.input);
  const evidencePath = join(f.dir, 'screen-evidence.json'), statePath = join(f.dir, 'video-stage.json');
  const evidence = JSON.parse(readFileSync(evidencePath)), state = JSON.parse(readFileSync(statePath));
  for (const [name, turnIds] of [['missing', []], ['foreign', ['other-session-turn']], ['duplicate', ['cross', 'cross']],
    ['misassigned', ['boundary']], ['wrong-boundary', ['zero']], ['extra', ['cross', 'boundary']]]) {
    const tampered = structuredClone(evidence); tampered.frames[0].turnIds = turnIds;
    const bytes = `${JSON.stringify(tampered)}\n`; writeFileSync(evidencePath, bytes);
    const resealed = structuredClone(state); resealed.outputs['screen-evidence.json'] = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(statePath, JSON.stringify(resealed));
    assert.throws(() => loadWebinarSession(f.dir, 'slides'), /attachment|turnIds/, name);
  }
});
