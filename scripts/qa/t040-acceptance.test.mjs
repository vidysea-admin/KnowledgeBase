import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditGroundedContent, runAcceptance } from './t040-acceptance.mjs';

const turn = { _id: 't1', tenantId: 'tenant-a', sessionId: 'session-a', speakerRef: 'person:rao', speakerLabel: 'Dr Rao',
  tStart: 12, tEnd: 24, text: 'The fee is 5000 rupees. Applications close in March. Please submit the form.' };
const ref = (quote, extra = {}) => ({ turnId: turn._id, sessionId: turn.sessionId, quote, available: true,
  tStart: turn.tStart, tEnd: turn.tEnd, speaker: turn.speakerLabel, ...extra });
const note = (quote, extra = {}) => ({ id: 'n1', kind: 'insight', text: quote, origin: 'speaker-statement', verification: 'unverified', evidence: [ref(quote)], ...extra });
const content = () => ({ sessionId: turn.sessionId, notes: [note('The fee is 5000 rupees.')], qa: [], claims: [] });
const audit = (c, extra = {}) => auditGroundedContent({ tenantId: turn.tenantId, sessionId: turn.sessionId, turns: [turn], content: c, ...extra });
const has = (result, code) => result.errors.some((error) => error.code === code);

test('authentic quantity keeps source attribution; receipt pins content and leaves full acceptance open', () => {
  const result = audit(content(), { reference: [{ kind: 'insight', turnId: 't1', quote: '5000 rupees' }] });
  assert.equal(result.passed, true); assert.equal(result.counts.evidence, 1); assert.equal(result.fullTaskStatus, 'HOLD');
  assert.match(result.sourceHash, /^[a-f0-9]{64}$/); assert.ok(result.remainingGates.includes('actual-web-citation-navigation'));
  assert.notEqual(result.contentHash, audit({ ...content(), notes: [note('Applications close in March.')] }).contentHash);
});

test('changed amount, qualifier or invented role cannot be added to displayed text', () => {
  for (const text of ['The fee is 500 rupees.', 'Applications close in March 2027.', 'Dr Rao is the admissions director.']) {
    assert.ok(has(audit({ ...content(), notes: [note('The fee is 5000 rupees.', { text })] }), 'changed-source-facts'));
  }
});

test('number or word substring cannot masquerade as a complete quote', () => {
  for (const quote of ['500', 'pplications', 'orm']) assert.ok(has(audit({ ...content(), notes: [note(quote)] }), 'unresolved-source-evidence'));
  assert.ok(has(audit(content(), { reference: [{ kind: 'insight', turnId: 't1', quote: '500' }] }), 'invalid-source-reference'));
  for (const [text, quote] of [['The fee is 5000.5 rupees.', 'The fee is 5000'], ['The fee is 1,000 rupees.', 'The fee is 1'], ['The fee is 50% today.', 'The fee is 50']]) {
    assert.ok(has(audit({ ...content(), notes: [note(quote)] }, { turns: [{ ...turn, text }] }), 'unresolved-source-evidence'));
  }
});

test('foreign, missing, unavailable, replaced and mistimed references refuse', () => {
  for (const change of [{ sessionId: 'foreign' }, { turnId: 'missing' }, { available: false }, { tStart: 13 }, { tEnd: 25 }, { speaker: 'invented' }, { quote: 'invented text' }]) {
    const c = content(); c.notes[0].evidence[0] = ref('The fee is 5000 rupees.', change);
    assert.equal(audit(c).passed, false);
  }
  assert.equal(audit(content(), { turns: [{ ...turn, text: 'The fee has changed.' }] }).passed, false);
});

test('source scope, timestamps and duplicate IDs are validated before relying on them', () => {
  for (const turns of [[], [{ ...turn, tenantId: 'foreign' }], [{ ...turn, sessionId: 'foreign' }], [{ ...turn, tStart: -1 }], [{ ...turn, tEnd: 11 }], [turn, turn]]) {
    assert.equal(audit(content(), { turns }).passed, false);
  }
  const c = content(); c.notes.push(note('Applications close in March.')); assert.ok(has(audit(c), 'invalid-or-duplicate-id'));
  assert.ok(has(audit(undefined), 'invalid-api-content'));
});

test('source-reviewed category reference detects omitted action despite nonempty insight', () => {
  const expected = [{ kind: 'action', turnId: 't1', quote: 'Please submit the form.' }];
  assert.ok(has(audit(content(), { reference: expected }), 'missing-reference-coverage'));
  const c = content(); c.notes.push(note('Please submit the form.', { id: 'n2', kind: 'action' }));
  assert.equal(audit(c, { reference: expected }).passed, true);
  assert.equal(audit({ sessionId: turn.sessionId, notes: [], qa: [], claims: [] }).passed, false);
});

test('question and answer evidence remain separate and unanswered entries cannot expose stale answers', () => {
  const question = { ...turn, _id: 'q1', text: 'When do applications close?', tStart: 25, tEnd: 30 };
  const qref = { ...ref(question.text), turnId: 'q1', tStart: 25, tEnd: 30 };
  const c = content(); c.qa = [{ id: 'qa1', question: question.text, status: 'answered', answer: 'Applications close in March.',
    questionEvidence: [qref], answerEvidence: [ref('Applications close in March.')] }];
  assert.equal(audit(c, { turns: [turn, question] }).passed, true);
  c.qa[0].status = 'unanswered'; assert.ok(has(audit(c, { turns: [turn, question] }), 'invented-unanswered-answer'));
  c.qa[0].answer = null; c.qa[0].answerEvidence = []; assert.equal(audit(c, { turns: [turn, question] }).passed, true);
});

test('preserved reviewed paraphrase is provenance-audited with explicit semantic limitation; generated paraphrase refuses', () => {
  const c = content(); c.claims = [{ _id: 'claim1', text: 'Tuition costs five thousand rupees.', status: 'verified', evidence: [ref('The fee is 5000 rupees.')] }];
  const result = audit(c); assert.equal(result.passed, true);
  assert.equal(result.warnings[0].code, 'reviewed-paraphrase-semantic-check-unverified'); assert.equal(result.fullTaskStatus, 'HOLD');
  c.claims[0].status = 'needs-review'; assert.ok(has(audit(c), 'changed-source-facts'));
  c.claims[0].status = 'verified'; c.claims[0].evidence[0].quote = 'invented quote'; assert.equal(audit(c).passed, false);
});

test('screen observation keeps its actual origin and unverified label', () => {
  const screen = { ...turn, speakerRef: 'screen', text: '[Screen OCR; unverified] Applications close in March.',
    screenEvidence: { frameId: 'f1', file: 'screen-frames/gen/frame-000001.jpg', hash: 'a'.repeat(64), tStart: turn.tStart } };
  const c = { ...content(), notes: [note('Applications close in March.', { origin: 'screen-ocr' })] };
  assert.equal(audit(c, { turns: [screen] }).passed, true);
  c.notes[0].origin = 'speaker-statement'; assert.ok(has(audit(c, { turns: [screen] }), 'changed-source-origin'));
  c.notes[0].origin = 'screen-ocr';
  for (const bad of [{ ...screen, speakerRef: 'person:rao' }, { ...screen, screenEvidence: undefined },
    { ...screen, screenEvidence: { ...screen.screenEvidence, file: '../private.jpg' } }, { ...screen, text: 'Applications close in March.' }]) {
    assert.ok(has(audit(c, { turns: [bad] }), 'changed-source-origin'));
  }
});

test('authenticated route is encoded, redirects refused, and receipt never includes bearer key', async () => {
  let request;
  const result = await runAcceptance({ tenantId: turn.tenantId, sessionId: 'session/with spaces', turns: [{ ...turn, sessionId: 'session/with spaces' }],
    baseUrl: 'http://localhost:3000/api/', apiKey: 'private-secret', reference: [], fetchImpl: async (url, options) => {
      request = { url: url.href, options };
      return { status: 200, json: async () => ({ sessionId: 'session/with spaces', notes: [], qa: [], claims: [] }) };
    } });
  assert.equal(request.url, 'http://localhost:3000/api/sessions/session%2Fwith%20spaces/grounded-content');
  assert.equal(request.options.headers.authorization, 'Bearer private-secret'); assert.equal(request.options.redirect, 'error');
  assert.equal(JSON.stringify(result).includes('private-secret'), false); assert.equal(result.passed, false);
});

test('HTTP errors and ambiguous credential-bearing base URLs fail without claiming a receipt', async () => {
  for (const status of [401, 403, 404, 503]) {
    await assert.rejects(runAcceptance({ baseUrl: 'http://localhost:3000/api', apiKey: 'private-secret', sessionId: 's',
      fetchImpl: async () => ({ status }) }), new RegExp(`HTTP ${status}`));
  }
  for (const baseUrl of ['file:///tmp/a', 'https://user:pass@example.com/api', 'https://example.com/api?key=secret']) {
    await assert.rejects(runAcceptance({ baseUrl, apiKey: 'secret' }), /base URL required/);
  }
  await assert.rejects(runAcceptance({ baseUrl: 'http://localhost:3000' }), /API_KEY required/);
});

test('transport and JSON errors cannot leak echoed credentials or private response text', async () => {
  const options = { baseUrl: 'http://localhost:3000/api', apiKey: 'private-secret', sessionId: 's' };
  await assert.rejects(runAcceptance({ ...options, fetchImpl: async () => { throw new Error('Bearer private-secret rejected'); } }),
    (error) => error.message === 'grounded-content request failed');
  await assert.rejects(runAcceptance({ ...options, fetchImpl: async () => ({ status: 200, json: async () => { throw new Error('private-secret is invalid JSON'); } }) }),
    (error) => error.message === 'grounded-content response must be valid JSON');
});
