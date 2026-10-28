import { createHash } from 'node:crypto';
const digest = (value) => createHash('sha256').update(value).digest('hex');

/** The production sync speaker mapper: screen evidence never resolves through human aliases. */
export function enrichSlideKnowledgeTurns(rawTurns, { sessionId, people, t0 }) {
  if (!Array.isArray(rawTurns) || !Array.isArray(people) || typeof sessionId !== 'string' || !sessionId || !Number.isFinite(t0)) {
    throw new Error('invalid webinar speaker mapping input');
  }
  const byLabel = new Map(people.map((person) => [person.label, person]));
  return rawTurns.map((turn) => {
    if (!turn || turn.sessionId !== sessionId || typeof turn.speakerRef !== 'string' || !Number.isFinite(turn.tStart)) {
      throw new Error('invalid webinar speaker row');
    }
    const screen = turn.speakerRef === 'screen' || Boolean(turn.screenEvidence);
    const person = screen ? undefined : byLabel.get(turn.speakerRef);
    if (person && (typeof person.personId !== 'string' || !person.personId.trim())) throw new Error('invalid webinar person alias');
    return { ...turn, sessionId,
      speakerRef: screen ? 'screen' : person ? person.personId : turn.speakerRef,
      speakerLabel: screen ? 'screen' : person ? person.label : turn.speakerRef,
      occurredAt: new Date(t0 + turn.tStart * 1000).toISOString() };
  });
}

/** Slide visibility spans over already approved screen evidence. Source text stays unverified. */
export function slideFrameSpans(frames, duration, turns = []) {
  if (!Array.isArray(frames) || !Number.isFinite(duration) || duration <= 0 || !Array.isArray(turns)) {
    throw new Error('invalid slide timeline');
  }
  const ordered = [...frames].sort((a, b) => a.tStart - b.tStart || String(a.id).localeCompare(String(b.id)));
  const ids = new Set();
  for (const [index, frame] of ordered.entries()) {
    if (!frame || typeof frame.id !== 'string' || !frame.id || ids.has(frame.id) ||
      !Number.isFinite(frame.tStart) || frame.tStart < 0 || frame.tStart >= duration ||
      (index > 0 && frame.tStart <= ordered[index - 1].tStart)) throw new Error('invalid slide observation');
    ids.add(frame.id);
  }
  const speechIds = new Set();
  for (const turn of turns) {
    if (!turn || typeof turn._id !== 'string' || !turn._id || speechIds.has(turn._id) || !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd) ||
      turn.tStart < 0 || turn.tEnd < turn.tStart) throw new Error('invalid slide speech turn');
    speechIds.add(turn._id);
  }
  const speech = [...turns].sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd || a._id.localeCompare(b._id));
  let cursor = 0, active = [];
  return ordered.map((frame, index) => {
    const nextStart = ordered[index + 1]?.tStart ?? duration;
    // A failed intervening observation still ends the preceding readable slide.
    const tEnd = frame.tEnd ?? nextStart;
    if (!Number.isFinite(tEnd) || tEnd <= frame.tStart || tEnd > nextStart) throw new Error('invalid slide observation end');
    while (cursor < speech.length && speech[cursor].tStart < tEnd) active.push(speech[cursor++]);
    active = active.filter((turn) => turn.tStart === turn.tEnd
      ? frame.tStart <= turn.tStart && turn.tStart < tEnd
      : turn.tStart < tEnd && turn.tEnd > frame.tStart);
    const turnIds = frame.analysis?.readable === false ? [] : active.map((turn) => turn._id).sort();
    return { frame, tEnd, turnIds };
  });
}

/** Version 3 screen rows carry full visible intervals; older stored generations retain point semantics. */
export function buildScreenEvidenceTurns(sessionId, tenantId, evidence, validate) {
  if (typeof tenantId !== 'string' || !tenantId.trim() || tenantId.length > 200 || evidence?.sessionId !== sessionId ||
    evidence?.tenantId !== tenantId || !Number.isFinite(evidence.duration) || evidence.duration <= 0 ||
    !Array.isArray(evidence.frames) || (evidence.version !== undefined && ![2, 3].includes(evidence.version))) throw new Error('invalid screen evidence scope');
  const spans = evidence.version === 3 ? slideFrameSpans(evidence.frames, evidence.duration)
    : evidence.frames.map((frame) => ({ frame, tEnd: Math.min(evidence.duration, frame.tStart + 0.001) }));
  const rows = [], ids = new Set();
  for (const { frame, tEnd } of spans) {
    if (typeof frame.id !== 'string' || !frame.id || !/^[a-f0-9]{64}$/.test(frame.hash ?? '') ||
      typeof frame.file !== 'string' || !/^screen-frames\/[a-zA-Z0-9-]+\/frame-\d+\.jpg$/.test(frame.file) ||
      !Number.isFinite(frame.tStart) || frame.tStart < 0 || frame.tStart > evidence.duration) throw new Error('invalid screen frame evidence');
    const analysis = validate(frame.analysis);
    if (!analysis.readable) continue;
    for (const [kind, text] of [['ocr', analysis.ocrText], ['visual', analysis.visualDescription]]) {
      if (!text.trim()) continue;
      const identity = evidence.version === 3 ? JSON.stringify([tenantId, frame.hash, frame.tStart, kind])
        : `${frame.hash}|${frame.tStart}|${kind}`;
      const _id = `${sessionId}-screen-${digest(identity).slice(0, 32)}`;
      if (ids.has(_id)) throw new Error('duplicate screen evidence turn');
      ids.add(_id);
      rows.push({ _id, tenantId, sessionId, speakerRef: 'screen', tStart: frame.tStart, tEnd,
        text: `${kind === 'ocr' ? '[Screen OCR; unverified]' : '[Visual observation; unverified]'} ${text}`,
        screenEvidence: { frameId: frame.id, file: frame.file, hash: frame.hash, tStart: frame.tStart } });
    }
  }
  return rows;
}

/** Bounded per-frame recovery; callers omit exhausted frames and preserve the typed receipt as a gap. */
export async function analyzeSlideFrame(frame, vision, validate, { retries = 2, fallback, sleep = (ms) =>
  new Promise((done) => setTimeout(done, ms)), backoffMs = 100, timeoutMs = 90_000 } = {}) {
  if (typeof vision !== 'function' || typeof validate !== 'function' || !Number.isInteger(retries) ||
    retries < 0 || retries > 5 || !Number.isFinite(backoffMs) || backoffMs < 0 || backoffMs > 1000 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000 ||
    (fallback !== undefined && typeof fallback !== 'function')) throw new Error('invalid slide OCR recovery options');
  const invoke = async (call) => {
    const controller = new AbortController(); let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new Error('slide OCR attempt timed out'));
    }, timeoutMs); });
    // Promise.race attaches rejection handlers even when an ignored-abort provider rejects late.
    const result = Promise.resolve().then(() => call({ ...frame, signal: controller.signal })).then(validate);
    try { return await Promise.race([result, timeout]); }
    finally { clearTimeout(timer); controller.abort(); }
  };
  let attempts = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    attempts++;
    try { return await invoke(vision); } catch { /* Error text can contain source text or credentials. */ }
    if (attempt < retries) await sleep(backoffMs * (attempt + 1));
  }
  if (fallback) {
    attempts++;
    try { return await invoke(fallback); } catch { /* Preserve only the safe recovery receipt. */ }
  }
  const error = new Error(`slide OCR failed after ${attempts} attempts`);
  error.code = 'ocr-failed'; error.frameId = frame.id; error.attempts = attempts;
  throw error;
}

/** Version of the notes.json item shape (decisions/actionItems/qa); a reused video stage with older notes is rebuilt in place. */
export const NOTES_VERSION = 2;
// ---- ISS-WEBINARRELEASE-001: deterministic, extractive, item-level grounded decisions / actions / Q&A ----
// No model call. Every item is ONE literal sentence (or leading slice) of ONE real turn, so its evidence resolves to that
// turn and nothing else. Cue words only nominate a sentence; negated, conditional, hedged or interrogative sentences never
// become decisions or actions. The strict webinar index (summarize.ts + session.ts) remains the model-backed upgrade.
const MAX_ITEMS = 100;
const HEDGED = /\b(?:if|unless|whether|maybe|perhaps|might|could|should|would|probably|not|never|no|nobody|nothing|none|yet)\b|n['’]t\b/i;
const MODAL_MAY = /\bmay\b/; // case-sensitive: the month May is not a hedge
const DECISION_CUE = new RegExp([
  String.raw`\b(?:we|they|i|everyone|(?:the\s+)?(?:team|board|committee|group|panel))(?:\s+\w+){0,2}?\s+(?:(?:have|has|had|all)\s+)?(?:decided|agreed|resolved|settled|concluded)\b`,
  String.raw`\bit\s+(?:was|is)\s+(?:decided|agreed)\b`, String.raw`\bthe\s+decision\s+(?:is|was)\b`, String.raw`\bwe(?:['’]ll|\s+will)\s+go\s+with\b`].join('|'), 'i');
const ACTION_VERBS = 'send|share|follow up|email|circulate|schedule|prepare|draft|update|review|submit|publish|post|write|forward|upload|provide|book';
const ACTION_CUE = new RegExp([String.raw`\baction\s+items?\b`,
  String.raw`\b(?:i|we)(?:['’]ll|\s+will|['’](?:m|re)\s+going\s+to|\s+(?:am|are)\s+going\s+to)\s+(?:${ACTION_VERBS})\b`].join('|'), 'i');
const sentencesOf = (text) => text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const leadingSlice = (text, max = 280) => {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), boundary = cut.match(/^[\s\S]*[.!?](?=\s|$)/);
  return boundary ? boundary[0] : cut;
};
const resolvableTurn = (t, sessionId) => t && typeof t._id === 'string' && t._id.trim() && typeof t.text === 'string' &&
  Number.isFinite(t.tStart) && Number.isFinite(t.tEnd) && t.tEnd >= t.tStart && (t.sessionId === undefined || t.sessionId === sessionId);
export function extractSpeechItems(sessionId, turns) {
  const gaps = [], decisions = [], actionItems = [], qa = [];
  const evidenceOf = (turn, quote) => ({ sessionId, turnId: turn._id, tStart: turn.tStart, tEnd: turn.tEnd,
    ...(turn.speakerRef ? { speakerRef: turn.speakerRef } : {}), quote });
  const ordered = turns.map((turn, index) => ({ turn, index })).filter(({ turn }) => typeof turn?.text === 'string' && turn.text.trim())
    .sort((a, b) => (Number(a.turn.tStart) - Number(b.turn.tStart)) || a.index - b.index).map(({ turn }) => turn);
  const seen = new Set();
  const truncated = (kind) => { if (!gaps.some((g) => g.kind === kind && g.reason === 'items-truncated')) gaps.push({ kind, reason: 'items-truncated' }); };
  const push = (list, kind, turn, quote) => {
    const key = `${kind}|${turn._id}|${quote}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (list.length >= MAX_ITEMS) return truncated(kind);
    list.push({ kind, text: quote, verified: false, evidence: [evidenceOf(turn, quote)] });
  };
  let unresolvable = 0;
  ordered.forEach((turn, position) => {
    const sentences = sentencesOf(turn.text), sound = resolvableTurn(turn, sessionId);
    const questions = sentences.filter((s) => s.endsWith('?') && s.split(/\s+/).length >= 3);
    let nominated = questions.length > 0;
    for (const sentence of sentences) {
      if (sentence.endsWith('?') || HEDGED.test(sentence) || MODAL_MAY.test(sentence)) continue;
      const kind = DECISION_CUE.test(sentence) ? 'decision' : ACTION_CUE.test(sentence) ? 'action-item' : undefined;
      if (!kind) continue;
      nominated = true;
      if (sound) push(kind === 'decision' ? decisions : actionItems, kind, turn, sentence);
    }
    if (!sound) { if (nominated) unresolvable += 1; return; }
    questions.forEach((question, i) => {
      const entry = { id: `qa-${digest(JSON.stringify([sessionId, turn._id, question])).slice(0, 32)}`, question,
        questionEvidence: [evidenceOf(turn, question)], answer: null, answerEvidence: [], status: 'unanswered',
        link: 'adjacent-turn', verified: false };
      // Only the last question of a turn can be paired with the reply that follows it: the next different-speaker
      // turn within three turns. Adjacency is a pointer for a reader, never a verification of relevance.
      if (i === questions.length - 1) {
        const reply = ordered.slice(position + 1, position + 4).find((next) => next.speakerRef !== turn.speakerRef && resolvableTurn(next, sessionId));
        if (reply) { const quote = leadingSlice(reply.text); Object.assign(entry, { answer: quote, answerEvidence: [evidenceOf(reply, quote)], status: 'answered' }); }
      }
      if (qa.length < MAX_ITEMS) qa.push(entry); else truncated('qa');
    });
  });
  if (unresolvable) gaps.push({ reason: 'unresolvable-evidence', count: unresolvable });
  return { decisions, actionItems, qa, gaps };
}

export function buildNotes(sessionId, frames, turns, ocrErrors, version) {
  const excerpt = (text) => text.length > 280 ? `${text.slice(0, 277)}…` : text;
  const nonempty = turns.filter((t) => t.text.trim());
  const sampled = [...new Set([0, Math.floor(nonempty.length / 3), Math.floor(2 * nonempty.length / 3), nonempty.length - 1])]
    .map((i) => nonempty[i]).filter(Boolean);
  const speech = sampled.map((turn) => ({
    kind: 'speaker-statement', text: excerpt(turn.text), verified: false,
    evidence: [{ sessionId, turnId: turn._id, tStart: turn.tStart, tEnd: turn.tEnd,
      ...(turn.speakerRef ? { speakerRef: turn.speakerRef } : {}) }],
  }));
  const screen = frames.flatMap((frame) => {
    if (!frame.analysis?.readable) return [];
    const evidence = [{ sessionId, frameId: frame.id, tStart: frame.tStart, file: frame.file }];
    return [
      ...(frame.analysis.ocrText ? [{ kind: 'screen-text', text: excerpt(frame.analysis.ocrText), verified: false, evidence }] : []),
      ...(frame.analysis.visualDescription ? [{ kind: 'visual-observation', text: excerpt(frame.analysis.visualDescription), verified: false, evidence }] : []),
    ];
  });
  const highlights = [...speech, ...screen.slice(0, 4)];
  const { gaps: itemGaps, ...items } = extractSpeechItems(sessionId, turns);
  return { version, notesVersion: NOTES_VERSION, sessionId, method: 'deterministic-extractive-highlights', notes: highlights,
    summary: { method: 'extractive', highlights },
    ...items, gaps: [...frames.filter((f) => !f.analysis?.readable)
      .map((f) => ({ frameId: f.id, tStart: f.tStart, reason: 'unreadable-screen' })), ...ocrErrors, ...itemGaps] };
}
