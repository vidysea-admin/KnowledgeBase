import assert from 'node:assert/strict';
import { slideFrameSpans, enrichSlideKnowledgeTurns } from '../../../scripts/webinar/slides/slide-knowledge.mjs';

// Independent all-pairs overlap oracle: no production sweep or active-set reuse.
let state = 41014;
const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
let checks = 0;
for (let n = 0; n < 64; n++) {
  const duration = 24;
  const frames = Array.from({ length: 6 }, (_, i) => ({
    id: `frame-${i}`, tStart: i * 4, analysis: { readable: i !== n % 6 },
  }));
  const turns = Array.from({ length: 18 }, (_, i) => {
    const tStart = next() % 24;
    return { _id: `turn-${i}`, tStart, tEnd: i % 4 === 0 ? tStart : tStart + next() % (25 - tStart) };
  });
  turns.push({ _id: 'cross-all', tStart: 0, tEnd: 24 });
  const expected = frames.map((frame, index) => {
    const tEnd = frames[index + 1]?.tStart ?? duration;
    const turnIds = frame.analysis.readable ? turns.filter((turn) => turn.tStart === turn.tEnd
      ? turn.tStart >= frame.tStart && turn.tStart < tEnd
      : Math.max(turn.tStart, frame.tStart) < Math.min(turn.tEnd, tEnd)).map((turn) => turn._id).sort() : [];
    return { frame, tEnd, turnIds };
  });
  assert.deepEqual(slideFrameSpans(frames, duration, turns), expected); checks++;
  assert.deepEqual(slideFrameSpans([...frames].reverse(), duration, [...turns].reverse()), expected); checks++;
}
for (const frames of [[{ id: 'x', tStart: 24 }], [{ id: 'x', tStart: 0 }, { id: 'x', tStart: 2 }],
  [{ id: 'x', tStart: 0 }, { id: 'y', tStart: 0 }]]) {
  assert.throws(() => slideFrameSpans(frames, 24), /observation/); checks++;
}
const rows = [
  { _id: 'ocr', sessionId: 's', speakerRef: 'screen', tStart: 4, text: '[Screen OCR; unverified] Slide only' },
  { _id: 'visual', sessionId: 's', speakerRef: 'speaker', screenEvidence: { frameId: 'f' }, tStart: 8, text: '[Visual observation; unverified] Chart' },
  { _id: 'speech', sessionId: 's', speakerRef: 'speaker', tStart: 12, text: 'Spoken explanation' },
];
const original = structuredClone(rows);
const mapped = enrichSlideKnowledgeTurns(rows, { sessionId: 's', t0: 0,
  people: [{ label: 'screen', personId: 'person:wrong' }, { label: 'speaker', personId: 'person:real' }] });
assert.deepEqual(mapped.map((row) => [row._id, row.speakerRef, row.speakerLabel]),
  [['ocr', 'screen', 'screen'], ['visual', 'screen', 'screen'], ['speech', 'person:real', 'speaker']]); checks++;
assert.deepEqual(rows, original); checks++;
assert.equal(mapped[2].occurredAt, '1970-01-01T00:00:12.000Z'); checks++;
console.log(JSON.stringify({ status: 'PASS', checks, oracleTimelines: 64, permutationChecks: 64,
  scope: 'synthetic pure timeline and production mapper; no real media/provider/search' }));
