#!/usr/bin/env node
/** Read-only authentic-source/API audit. This receipt never substitutes for live generation or UI evidence. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { quoteMayStart, quoteMayEnd } from '../../packages/index/src/pipeline/quote/quote-token-rule.ts';

const hash = (value) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const categories = new Set(['insight', 'decision', 'action']);
// Reuse the production boundary policy, while its full verifier/judge remain generation gates.
function literalExcerpt(text, quote) {
  let offset = text.indexOf(quote);
  while (offset >= 0) {
    if (quoteMayStart(text, offset) && quoteMayEnd(text, offset + quote.length)) return true;
    offset = text.indexOf(quote, offset + 1);
  }
  return false;
}
// Inspect the same identity invariants as grounded.ts runtimeOrigin; a textual marker alone is not screen identity.
function sourceOrigin(turn) {
  if (turn.speakerRef !== 'screen') return turn.screenEvidence ? null : 'speaker-statement';
  const frame = turn.screenEvidence;
  if (!frame || !nonempty(frame.frameId) || frame.frameId !== frame.frameId.trim() || !nonempty(frame.file) ||
    frame.file !== frame.file.trim() || /[\x00-\x1f\x7f]/.test(frame.file) ||
    /(^[\\/]|^[A-Za-z]:|(^|[\\/])\.\.([\\/]|$))/.test(frame.file) || !/^[a-f0-9]{64}$/i.test(frame.hash ?? '') || frame.tStart !== turn.tStart) return null;
  return turn.text.startsWith('[Screen OCR; unverified]') ? 'screen-ocr' :
    turn.text.startsWith('[Visual observation; unverified]') ? 'visual-observation' : null;
}

/** reference is an explicit, source-reviewed list; absence of a category must never be silently inferred. */
export function auditGroundedContent({ tenantId, sessionId, turns, content, reference = [] }) {
  const errors = [], warnings = [], source = new Map(), counts = { insight: 0, decision: 0, action: 0, qa: 0, claims: 0, evidence: 0 };
  const fail = (code, location) => errors.push({ code, location });
  if (!nonempty(tenantId) || !nonempty(sessionId)) fail('invalid-scope', 'source');
  if (!Array.isArray(turns) || !turns.length) fail('missing-authentic-turns', 'source');
  for (const [i, turn] of (Array.isArray(turns) ? turns : []).entries()) {
    if (!turn || !nonempty(turn._id) || source.has(turn._id) || turn.tenantId !== tenantId || turn.sessionId !== sessionId ||
      !nonempty(turn.speakerRef) || typeof turn.text !== 'string' || !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd) ||
      turn.tStart < 0 || turn.tEnd < turn.tStart) fail('invalid-source-turn', `turns[${i}]`);
    else source.set(turn._id, turn);
  }
  if (!content || content.sessionId !== sessionId || !Array.isArray(content.notes) || !Array.isArray(content.qa) || !Array.isArray(content.claims)) {
    fail('invalid-api-content', 'content');
    return receipt();
  }
  const ids = new Set(), emitted = [];
  const unique = (id, location) => {
    if (!nonempty(id) || ids.has(id)) fail('invalid-or-duplicate-id', location);
    else ids.add(id);
  };
  function evidence(refs, location, optional = false) {
    if (!Array.isArray(refs) || (!optional && !refs.length)) { fail('missing-evidence', location); return []; }
    return refs.map((ref, i) => {
      const at = `${location}[${i}]`, turn = ref && source.get(ref.turnId);
      counts.evidence++;
      if (!turn || ref.sessionId !== sessionId || ref.available !== true || !nonempty(ref.quote) || !literalExcerpt(turn.text, ref.quote)) {
        fail('unresolved-source-evidence', at); return null;
      }
      const speaker = typeof turn.speakerLabel === 'string' ? turn.speakerLabel : turn.speakerRef;
      if (ref.tStart !== turn.tStart || ref.tEnd !== turn.tEnd || ref.speaker !== speaker) fail('changed-source-attribution', at);
      return ref;
    }).filter(Boolean);
  }
  const extractive = (text, refs, location) => {
    if (!nonempty(text) || text !== refs.map((ref) => ref.quote).join('\n')) fail('changed-source-facts', location);
  };
  for (const [i, note] of content.notes.entries()) {
    const at = `notes[${i}]`; unique(note?.id, at);
    if (!categories.has(note?.kind) || !['speaker-statement', 'screen-ocr', 'visual-observation'].includes(note?.origin) || note?.verification !== 'unverified') fail('invalid-note-label', at);
    else counts[note.kind]++;
    const refs = evidence(note?.evidence, `${at}.evidence`); extractive(note?.text, refs, at);
    if (refs.length && refs.some((ref) => {
      return sourceOrigin(source.get(ref.turnId)) !== note.origin;
    })) fail('changed-source-origin', at);
    emitted.push({ kind: note?.kind, refs });
  }
  for (const [i, qa] of content.qa.entries()) {
    const at = `qa[${i}]`; unique(qa?.id, at); counts.qa++;
    const questions = evidence(qa?.questionEvidence, `${at}.questionEvidence`); extractive(qa?.question, questions, `${at}.question`);
    if (qa?.status === 'unanswered') {
      if (qa.answer !== null || !Array.isArray(qa.answerEvidence) || qa.answerEvidence.length) fail('invented-unanswered-answer', at);
      emitted.push({ kind: 'question', refs: questions });
    } else if (qa?.status === 'answered') {
      const answers = evidence(qa.answerEvidence, `${at}.answerEvidence`); extractive(qa.answer, answers, `${at}.answer`);
      emitted.push({ kind: 'question', refs: questions }, { kind: 'answer', refs: answers });
    } else fail('invalid-qa-status', at);
  }
  for (const [i, claim] of content.claims.entries()) {
    const at = `claims[${i}]`; unique(claim?._id, at); counts.claims++;
    if (!['verified', 'needs-review', 'conflicting'].includes(claim?.status)) fail('invalid-claim-status', at);
    const refs = evidence(claim?.evidence, `${at}.evidence`);
    if (['verified', 'conflicting'].includes(claim?.status) && nonempty(claim.text) && claim.text !== refs.map((ref) => ref.quote).join('\n')) {
      warnings.push({ code: 'reviewed-paraphrase-semantic-check-unverified', location: at });
    } else extractive(claim?.text, refs, at);
    emitted.push({ kind: 'claim', refs });
  }
  if (!content.notes.length && !content.qa.length && !content.claims.length) fail('no-grounded-output', 'content');
  if (!Array.isArray(reference)) fail('invalid-reference', 'reference');
  else for (const [i, expected] of reference.entries()) {
    const at = `reference[${i}]`, turn = expected && source.get(expected.turnId);
    if (!['insight', 'decision', 'action', 'question', 'answer', 'claim'].includes(expected?.kind) || !turn || !nonempty(expected.quote) || !literalExcerpt(turn.text, expected.quote)) fail('invalid-source-reference', at);
    else if (!emitted.some((item) => item.kind === expected.kind && item.refs.some((ref) => ref.turnId === expected.turnId && ref.quote.includes(expected.quote)))) fail('missing-reference-coverage', at);
  }
  return receipt();

  function receipt() {
    return { version: 1, taskId: 'T-040', scope: 'authentic-source-to-grounded-content-api', passed: errors.length === 0,
      fullTaskStatus: 'HOLD', tenantId, sessionId, sourceHash: hash(turns), contentHash: hash(content), referenceHash: hash(reference), counts, errors, warnings,
      remainingGates: ['authentic-configured-provider-and-judge-generation', 'persistent-work-database-readback',
        'source-reviewed-full-category-and-long-window-coverage', 'interrupted-retry-and-human-review-preservation', 'actual-web-citation-navigation'] };
  }
}

export async function runAcceptance({ tenantId, sessionId, turns, reference, baseUrl, apiKey, fetchImpl = fetch }) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('plain HTTP(S) API base URL required');
  if (!nonempty(apiKey)) throw new Error('LKB_ACCEPTANCE_API_KEY required');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/sessions/${encodeURIComponent(sessionId)}/grounded-content`;
  let response;
  try { response = await fetchImpl(url, { headers: { authorization: `Bearer ${apiKey}` }, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('grounded-content request failed'); }
  if (response.status !== 200) throw new Error(`grounded-content HTTP ${response.status}`);
  let content;
  try { content = await response.json(); } catch { throw new Error('grounded-content response must be valid JSON'); }
  const report = auditGroundedContent({ tenantId, sessionId, turns, reference, content });
  return { ...report, observedAt: new Date().toISOString(), apiOrigin: url.origin, transport: 'authenticated-http' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), value = (name) => args[args.indexOf(name) + 1];
    const required = ['--tenant', '--session', '--turns', '--reference', '--base-url'];
    if (required.some((name) => args.indexOf(name) < 0 || !value(name) || value(name).startsWith('--'))) throw new Error('usage: t040-acceptance.mjs --tenant id --session id --turns file --reference reviewed-reference.json --base-url http://localhost:PORT/api');
    const readJson = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error('source/reference JSON could not be read'); } };
    const report = await runAcceptance({ tenantId: value('--tenant'), sessionId: value('--session'),
      turns: readJson(value('--turns')), reference: readJson(value('--reference')),
      baseUrl: value('--base-url'), apiKey: process.env.LKB_ACCEPTANCE_API_KEY });
    console.log(JSON.stringify(report, null, 2)); process.exitCode = report.passed ? 0 : 1;
  } catch (error) { console.error(error instanceof Error ? error.message : 'acceptance inspector failed'); process.exitCode = 1; }
}
