import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { visionPlan } from './plan.mjs';
import { processVideo, keyframeOcrHook } from '../process-video.mjs';

// w26-t041on. FAKES ONLY (fake vision, fake transport); the e2e uses local ffmpeg on a generated clip when installed.
const KEY = 'test-key-not-real';

test('flag default: slide text is ON with any vision provider, and 0/false/off turns it off', () => {
  assert.deepEqual(visionPlan({ OLLAMA_API_KEY: KEY }), { routed: true, vision: true, keyframeOcr: true });
  assert.deepEqual(visionPlan({ GEMINI_API_KEY: KEY, WEBINAR_VISION_MODEL: 'm' }), { routed: true, vision: true, keyframeOcr: true });
  for (const off of ['0', 'false', 'OFF']) {
    const p = visionPlan({ OLLAMA_API_KEY: KEY, LKB_KEYFRAME_OCR: off });
    assert.equal(p.keyframeOcr, false); assert.equal(p.vision, true); assert.match(p.reason, /LKB_KEYFRAME_OCR is off/);
  }
  // LKB_VISION_ROUTED=0 keeps the old Gemini-only route; Ollama alone is then not enough.
  assert.equal(visionPlan({ OLLAMA_API_KEY: KEY, LKB_VISION_ROUTED: '0' }).vision, false);
  assert.equal(visionPlan({ GEMINI_API_KEY: KEY, WEBINAR_VISION_MODEL: 'm', LKB_VISION_ROUTED: '0' }).routed, false);
});

test('flag default through the hook: unset flag reaches the core stage as "1"; explicit 0 stays off', async () => {
  const seen = [];
  const load = async () => [{ runKeyframeOcrPostProcess: async (x) => { seen.push(x.env.LKB_KEYFRAME_OCR); return { status: 'done' }; } },
    { createGeminiVisionOcr: () => async () => ({ text: 'x' }) }];
  for (const env of [{}, { LKB_KEYFRAME_OCR: '1' }, { LKB_KEYFRAME_OCR: '0' }]) {
    await (await keyframeOcrHook({ GEMINI_API_KEY: KEY, WEBINAR_VISION_MODEL: 'm', ...env }, undefined, load))({ video: 'v', outDir: 'o', turns: [] });
  }
  assert.deepEqual(seen, ['1', '1', '0']);
});

test('no key: skipped with a logged reason, no throw, and the reason never contains a key', () => {
  const p = visionPlan({});
  assert.deepEqual([p.vision, p.keyframeOcr], [false, false]);
  assert.match(p.reason, /no vision provider configured/);
  assert.ok(!p.reason.includes(KEY));
  assert.equal(visionPlan({ GEMINI_API_KEY: KEY }).vision, false, 'a Gemini key without WEBINAR_VISION_MODEL is not usable');
  // CLI: dry-run never loads a provider and exits 0 with no key (the real script, no network).
});

const turns = [{ _id: 'turn-1', tenantId: 'test-tenant', sessionId: 'session-1', tStart: 0, tEnd: 1.5, text: 'A speaker claim.', speakerRef: 'Speaker 1' }];
function sessionDir(t) {
  const root = mkdtempSync(join(tmpdir(), 'lkb-t041on-'));
  const dir = join(root, 'data', 'toc-migrated', 'session-1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'turns.json'), JSON.stringify(turns));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, dir };
}
const vision = async () => ({ readable: true, ocrText: 'Visa fees 1000 INR per seat', visualDescription: '' });

test('slide text is stored with timestamps beside the turns and is retrievable with a session/time citation labelled as screen text', async (t) => {
  const { root, dir } = sessionDir(t);
  writeFileSync(join(root, 'rec.webm'), 'media');
  const command = async (bin, args) => {
    if (bin === 'ffprobe') return { stdout: JSON.stringify({ format: { duration: 2 }, streams: [{ codec_type: 'video' }] }) };
    writeFileSync(join(args.at(-1).replace(/frame-%06d\.jpg$/, ''), 'frame-000001.jpg'), 'pixels-A');
    return { stderr: 'n: 0 pts_time:0.5' };
  };
  const state = await processVideo({ root, sessionId: 'session-1', tenantId: 'test-tenant', recording: 'rec.webm', command, vision,
    slideAlignment: async () => ({ status: 'skipped', reason: 'no-ocr-provider' }) });
  assert.equal(state.status, 'done');
  const all = JSON.parse(readFileSync(join(dir, 'knowledge-turns.json'), 'utf8'));
  const speech = all.filter((x) => x.speakerRef !== 'screen' && !x.screenEvidence);
  const slide = all.filter((x) => x.speakerRef === 'screen' && x.screenEvidence);
  assert.deepEqual(speech.map((x) => x._id), ['turn-1'], 'speech turns kept unchanged');
  assert.equal(slide.length, 1);
  const [s] = slide;
  assert.ok(s.text.startsWith('[Screen OCR; unverified]'), 'labelled as screen text, never speech');
  assert.ok(s.text.includes('Visa fees 1000 INR per seat'));
  assert.equal(s.sessionId, 'session-1'); assert.equal(s.tenantId, 'test-tenant');
  assert.equal(s.tStart, 0.5); assert.ok(s.tEnd > s.tStart);
  assert.equal(s.screenEvidence.tStart, 0.5);
  assert.match(s.screenEvidence.frameId, /^session-1-frame-/);
  // sync-session --index reads exactly this artifact, hash-bound by video-stage.json.
  const stage = JSON.parse(readFileSync(join(dir, 'video-stage.json'), 'utf8'));
  assert.ok(stage.outputs['knowledge-turns.json']);
});

const ff = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0 && spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;
test('local e2e: real ffmpeg/ffprobe on a generated 2s clip, fake vision, default-on slide stage skips cleanly without a key', { skip: !ff }, async (t) => {
  const { root, dir } = sessionDir(t);
  const gen = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=5:duration=2', '-pix_fmt', 'yuv420p', join(root, 'rec.mp4')]);
  assert.equal(gen.status, 0);
  const state = await processVideo({ root, sessionId: 'session-1', tenantId: 'test-tenant', recording: 'rec.mp4', vision });
  assert.equal(state.status, 'done'); assert.ok(state.frameCount >= 1);
  const all = JSON.parse(readFileSync(join(dir, 'knowledge-turns.json'), 'utf8'));
  assert.ok(all.some((x) => x.speakerRef === 'screen' && x.text.includes('Visa fees')));
});
