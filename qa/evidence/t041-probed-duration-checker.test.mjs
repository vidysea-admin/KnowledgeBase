import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { processVideo, keyframeOcrHook } from '../../scripts/webinar/process-video.mjs';
import { runKeyframeOcrPostProcess } from '../../packages/core/src/keyframes/post-process.ts';
import { extractSlideTurnAlignment } from '../../packages/core/src/keyframes/extract.ts';

test('independent: two different slides retain provenance and actual-media bound on fresh/reuse', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'lkb-t041-checker-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sessionId = 'checker-session', tenantId = 'checker-tenant';
  const dir = join(root, 'data', 'toc-migrated', sessionId);
  mkdirSync(dir, { recursive: true });
  const turns = [{ _id: 'speech-before-change', sessionId, tenantId, tStart: 0.5, tEnd: 1.9,
    text: 'Synthetic speech A', speakerRef: 'Speaker A' },
  { _id: 'speech-at-change', sessionId, tenantId, tStart: 2, tEnd: 2.6,
    text: 'Synthetic speech B', speakerRef: 'Speaker B' }];
  const turnBytes = JSON.stringify(turns);
  writeFileSync(join(dir, 'turns.json'), turnBytes);
  writeFileSync(join(root, 'fake.webm'), 'Synthetic media placeholder');
  let probeCount = 0, extractCount = 0;
  const command = async (binary, args) => {
    if (binary === 'ffprobe') {
      probeCount++;
      return { stdout: JSON.stringify({ format: { duration: '2.3' }, streams: [{ codec_type: 'video' }] }) };
    }
    extractCount++;
    writeFileSync(join(dirname(args.at(-1)), 'frame-000001.jpg'), 'Synthetic screen placeholder');
    return { stderr: 'n: 0 pts_time:0' };
  };
  const raw = Buffer.alloc(144);
  // Frame 0 is flat (dHash 0); frame 1 descends in each row (dHash f).
  for (let row = 0; row < 8; row++) for (let col = 0; col < 9; col++) raw[72 + row * 9 + col] = 9 - col;
  const received = [], temporaryDirs = [];
  const load = async () => [
    { runKeyframeOcrPostProcess: (input) => {
      received.push(input.pipeline.endSec);
      temporaryDirs.push(input.outDir);
      return runKeyframeOcrPostProcess({ ...input, extract: (video, opts) => extractSlideTurnAlignment(video, {
        ...opts, intervalSec: 2, exec: async (_binary, args) => ({ code: 0, timedOut: false,
          truncated: false, stderr: '', stdout: args.includes('rawvideo') ? raw : Buffer.alloc(0) }),
      }) });
    } },
    { createGeminiVisionOcr: () => async ({ id }) => ({ text: id === 'f0' ? 'PRIVATE OCR ALPHA' : 'PRIVATE OCR BETA' }) },
  ];
  const slideAlignment = await keyframeOcrHook({ LKB_KEYFRAME_OCR: '1' }, undefined, load);
  for (const reused of [false, true]) {
    const state = await processVideo({ root, sessionId, tenantId, recording: 'fake.webm', command, slideAlignment,
      vision: async () => ({ readable: true, ocrText: 'Public synthetic screen', visualDescription: '' }) });
    assert.equal(Boolean(state.reused), reused);
    assert.equal(state.status, 'done');
    assert.equal(state.slideAlignment.status, 'done');
    const bytes = readFileSync(join(dir, 'slide-alignment.json'), 'utf8');
    const { alignment, sessionId: persistedSession } = JSON.parse(bytes);
    assert.equal(persistedSession, sessionId);
    assert.deepEqual(alignment.errors, []);
    assert.deepEqual(alignment.slides.map(({ slideId, observationIds, from, to }) => ({ slideId, observationIds, from, to })), [
      { slideId: 'f0', observationIds: ['f0'], from: 0, to: 2 },
      { slideId: 'f1', observationIds: ['f1'], from: 2, to: 2.3 },
    ]);
    assert.deepEqual(alignment.turns.map(({ turnId, primarySlideId }) => ({ turnId, primarySlideId })), [
      { turnId: 'speech-before-change', primarySlideId: 'f0' },
      { turnId: 'speech-at-change', primarySlideId: 'f1' },
    ]);
    const finalAttachment = alignment.turns[1].attachments[0];
    assert.equal(finalAttachment.turnId, 'speech-at-change');
    assert.equal(finalAttachment.slideId, 'f1');
    assert.equal(finalAttachment.from, 2);
    assert.equal(finalAttachment.to, 2.3);
    assert.ok(Math.abs(finalAttachment.overlapSec - 0.3) < 1e-12);
    assert.ok(alignment.slides.every((s) => s.to <= 2.3));
    assert.ok(!bytes.includes('PRIVATE OCR'));
    assert.equal(readFileSync(join(dir, 'turns.json'), 'utf8'), turnBytes);
    assert.ok(temporaryDirs.every((path) => !existsSync(path)));
  }
  assert.deepEqual(received, [2.3, 2.3]);
  assert.equal(probeCount, 2);
  assert.equal(extractCount, 1, 'reuse reads existing screen outputs without re-extraction');
});
