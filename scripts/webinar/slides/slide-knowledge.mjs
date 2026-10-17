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
