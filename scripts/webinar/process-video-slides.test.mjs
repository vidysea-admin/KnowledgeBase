import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { processVideo, keyframeOcrHook } from './process-video.mjs';

// T-041 wiring. FAKES ONLY: fake media commands, fake hook, fake transport. No network, no model, no real ffmpeg.
const turns = [{ _id: 'turn-1', tenantId: 'test-tenant', sessionId: 'session-1', tStart: 0, tEnd: 2, text: 'A speaker claim.', speakerRef: 'Speaker 1' }];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lkb-vslides-'));
  const dir = join(root, 'data', 'toc-migrated', 'session-1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'turns.json'), JSON.stringify(turns));
  writeFileSync(join(root, 'recording.webm'), 'media');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const command = async (binary, args) => {
    if (binary === 'ffprobe') return { stdout: JSON.stringify({ format: { duration: 2 }, streams: [{ codec_type: 'video' }] }) };
    const out = dirname(args.at(-1));
    writeFileSync(join(out, 'frame-000001.jpg'), 'pixels-A');
    writeFileSync(join(out, 'frame-000002.jpg'), 'pixels-B');
    return { stderr: 'n: 0 pts_time:0\nn: 1 pts_time:1.5' };
  };
  const input = { root, sessionId: 'session-1', tenantId: 'test-tenant', recording: 'recording.webm', command,
    vision: async () => ({ readable: true, ocrText: 'Slide text', visualDescription: 'A bar chart.' }) };
  return { root, dir, input };
}
const snapshot = (dir) => Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));

test('flag off: no hook => result and files are exactly the pre-wiring behaviour (no slide-alignment.json, no slideAlignment key)', async (t) => {
  const f = fixture(t);
  const state = await processVideo(f.input);
  assert.ok(!('slideAlignment' in state));
  assert.ok(!existsSync(join(f.dir, 'slide-alignment.json')));
  assert.equal((await processVideo(f.input)).reused, true);
  assert.ok(!('slideAlignment' in await processVideo(f.input)));
});

test('flag off via a disabled hook: identical files and state to no hook, nothing written', async (t) => {
  const a = fixture(t), b = fixture(t);
  const base = await processVideo(a.input);
  const calls = [];
  const state = await processVideo({ ...b.input, slideAlignment: async (x) => { calls.push(x); return { status: 'disabled' }; } });
  assert.equal(calls.length, 1);
  const strip = ({ outputs, ...rest }) => rest; // output digests embed a random per-run frame directory name
  assert.deepEqual(strip(state), { ...strip(base), slideAlignment: { status: 'disabled' } });
  assert.ok(!existsSync(join(b.dir, 'slide-alignment.json')));
  const sa = snapshot(a.dir), sb = snapshot(b.dir);
  for (const name of ['screen-evidence.json', 'notes.json', 'knowledge-turns.json']) {
    // ids embed frame hashes + session, not time, so the files must be equal byte for byte
    assert.equal(sb[name].replace(/screen-frames\/[0-9a-f-]+\//g, ''), sa[name].replace(/screen-frames\/[0-9a-f-]+\//g, ''));
  }
});

test('flag on: hook gets the video, turns mapped to align shape, a temp dir that is removed; result is ids/ranges only', async (t) => {
  const f = fixture(t);
  let seen;
  const state = await processVideo({ ...f.input, slideAlignment: async (x) => {
    seen = x; assert.ok(existsSync(x.outDir));
    return { status: 'done', keyframeCount: 2, sampledFrames: 5, alignment: { turns: [{ turnId: 'turn-1', attachments: [], primarySlideId: 'f0' }], slides: [], errors: [] },
      ocrErrors: [{ frameId: 'f1', code: 'ocr-failed', attempts: 4 }] };
  } });
  assert.match(seen.video, /recording\.webm$/);
  assert.deepEqual(seen.turns, [{ id: 'turn-1', tStart: 0, tEnd: 2, speakerRef: 'Speaker 1' }]);
  assert.ok(!existsSync(seen.outDir), 'temporary keyframe PNGs are not retained');
  assert.deepEqual(state.slideAlignment, { status: 'done', keyframeCount: 2, ocrErrorCount: 1 });
  const written = JSON.parse(readFileSync(join(f.dir, 'slide-alignment.json'), 'utf8'));
  assert.equal(written.version, 1); assert.equal(written.sessionId, 'session-1'); assert.equal(written.status, 'done');
  assert.deepEqual(written.ocrErrors, [{ frameId: 'f1', code: 'ocr-failed', attempts: 4 }]);
  assert.equal(state.status, 'done');
});

test('flag on, hook throws: the video stage still completes and the failure is recorded by code only', async (t) => {
  const f = fixture(t);
  const state = await processVideo({ ...f.input, slideAlignment: async () => { throw new Error('boom /secret'); } });
  assert.equal(state.status, 'done');
  assert.deepEqual(state.slideAlignment, { status: 'failed' });
  const written = JSON.parse(readFileSync(join(f.dir, 'slide-alignment.json'), 'utf8'));
  assert.deepEqual({ status: written.status, code: written.code }, { status: 'failed', code: 'stage-failed' });
  assert.ok(!readFileSync(join(f.dir, 'slide-alignment.json'), 'utf8').includes('secret'));
});

test('flag on, reused video stage: the slide stage still runs', async (t) => {
  const f = fixture(t); await processVideo(f.input);
  const state = await processVideo({ ...f.input, slideAlignment: async () => ({ status: 'skipped', reason: 'no-ocr-provider' }) });
  assert.equal(state.reused, true);
  assert.deepEqual(state.slideAlignment, { status: 'skipped' });
});

test('keyframeOcrHook: builds primary + fallback OCR on the gemini route from env; flag/ocr/retry reach the core stage', async () => {
  const urls = [];
  const transport = async (req) => { urls.push(req.url); return { status: 200, body: { candidates: [{ content: { parts: [{ text: '{"text":"x"}' }] } }] } }; };
  let got;
  const load = async () => [
    { runKeyframeOcrPostProcess: async (x) => { got = x; return { status: 'done' }; } },
    { createGeminiVisionOcr: (o) => { assert.equal(o.apiKey, 'K'); assert.equal(o.transport, transport); return `ocr:${o.model}`; } },
  ];
  const env = { GEMINI_API_KEY: 'K', WEBINAR_VISION_MODEL: 'm-primary', LKB_KEYFRAME_OCR: '1', LKB_KEYFRAME_OCR_FALLBACK_MODEL: 'm-fallback' };
  const hook = await keyframeOcrHook(env, transport, load);
  assert.deepEqual(await hook({ video: 'v', outDir: 'o', turns: [] }), { status: 'done' });
  assert.equal(got.env, env); assert.equal(got.ocr, 'ocr:m-primary'); assert.deepEqual(got.ocrRetry, { fallback: 'ocr:m-fallback' });
  const noFb = await keyframeOcrHook({ ...env, LKB_KEYFRAME_OCR_FALLBACK_MODEL: '' }, transport, load);
  await noFb({ video: 'v', outDir: 'o', turns: [] });
  assert.equal(got.ocrRetry.fallback, undefined);
});
