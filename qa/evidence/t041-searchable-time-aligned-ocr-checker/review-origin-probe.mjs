import assert from 'node:assert/strict';
import { planTranscriptReview } from '../../../apps/api/src/transcript-review/planner.ts';
import { effectiveTurns } from '../../../apps/api/src/transcript-review/service.ts';
import { headId } from '../../../apps/api/src/transcript-review/store.ts';
import { createSourceHydrator } from '../../../apps/api/src/ask/source-context.ts';

// Synthetic public source; real planner/overlay/hydrator functions, injected tenant-scoped database.
const tenantId = 'tenant-a', sessionId = 'review-slide';
const original = { _id: 'screen-turn', tenantId, sessionId, speakerRef: 'screen', tStart: 2, tEnd: 6,
  text: '[Screen OCR; unverified] SLIDE_ONLY_1200 fee',
  screenEvidence: { frameId: 'frame', file: 'screen-frames/run/frame-000001.jpg', hash: 'a'.repeat(64), tStart: 2 } };
const trusted = { tenantId, sessionId, actorRef: 'user:synthetic-reviewer', reviewedAt: '2026-10-14T22:30:00Z' };
let blockedAtWrite = false, writerSpeaker;
try {
  const plan = planTranscriptReview({ tenantId, sessionId, revision: 'base-synthetic', turns: [original] },
    { expectedRevision: 'base-synthetic', reason: 'Synthetic origin guard probe', corrections: [],
      mapping: { turnIds: [original._id], speakerRef: 'person:alice', speakerLabel: 'Alice' } }, trusted);
  writerSpeaker = plan.nextTurns[0].speakerRef;
} catch (error) {
  if (error?.name === 'AssertionError') throw error;
  assert.ok(['invalid', 'scope', 'screen_origin'].includes(error?.code), 'screen remap must have an explicit safe refusal');
  blockedAtWrite = true;
}

// A historical persisted overlay must also fail closed at the read boundary, even after writer guard repair.
const head = { _id: headId(tenantId, sessionId), tenantId, sessionId, revision: 'synthetic-overlay',
  overlay: [{ turnId: original._id, text: 'SLIDE_ONLY_1200 corrected fee', speakerRef: 'person:alice', speakerLabel: 'Alice' }] };
let effectiveSpeaker;
try { effectiveSpeaker = effectiveTurns([original], head)[0].speakerRef; }
catch (error) { assert.match(error?.message ?? '', /screen|origin|review|source|passage/i); effectiveSpeaker = 'refused'; }
const tables = { turns: [original], transcript_reviews: [head],
  sessions: [{ _id: sessionId, tenantId, sourceId: 'synthetic-source' }],
  sources: [{ _id: 'synthetic-source', tenantId, kind: 'recording', path: 'synthetic.webm' }], whatsapp_candidates: [] };
const select = (name, filter) => {
  assert.equal(filter.tenantId, tenantId);
  assert.ok(Object.hasOwn(tables, name));
  return tables[name].filter((row) => Object.entries(filter).every(([key, value]) =>
    value && typeof value === 'object' && Array.isArray(value.$in) ? value.$in.includes(row[key]) : row[key] === value));
};
const db = { collection: (name) => ({ find: (filter) => ({ toArray: async () => select(name, filter) }),
  findOne: async (filter) => select(name, filter)[0] ?? null }) };
const node = { node_id: `tenant:${tenantId}/session:${sessionId}`, title: 'Synthetic slide', level: 'session',
  summary: '', evidence: { sessionRef: sessionId }, children: [] };
let blockedAtRead = false, readQuote;
try {
  const hydrated = await createSourceHydrator(tenantId, { db })('SLIDE_ONLY_1200', [node]);
  readQuote = hydrated.nodes.flatMap((item) => item.evidence.sourceQuotes).find((item) => item.turnId === original._id);
} catch (error) {
  if (error?.name === 'AssertionError') throw error;
  assert.match(error?.message ?? '', /screen|origin|review|source|passage/i, 'historical invalid overlay must be refused explicitly');
  blockedAtRead = true;
}
console.log(JSON.stringify({ blockedAtWrite, writerSpeaker, blockedAtRead, effectiveSpeaker,
  readOrigin: readQuote?.origin, readSpeaker: readQuote?.speakerRef,
  scope: 'synthetic planner, historical overlay, source hydrator; no real recording/provider/database' }));
if (!blockedAtWrite) assert.equal(writerSpeaker, 'screen', 'planner must not turn a screen-derived observation into human speech');
if (!blockedAtRead) {
  assert.ok(readQuote, 'a successful read must retain a citation for the admitted synthetic source');
  assert.equal(readQuote.origin, 'screen-ocr-unverified', 'review overlay must retain immutable original screen origin');
  assert.equal(readQuote.speakerRef, 'screen', 'screen OCR cannot cite a human speaker after an overlay');
}
console.log('review-origin-probe: PASS');
