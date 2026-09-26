/**
 * packages/index/src/pipeline/speakers-llm.ts â€” U2.4 (catalogue B3/B10), the LLM half.
 *
 * `speakers.ts` resolves 78/494 positional turns (15.8%) from explicit self-naming alone. This is
 * the path to the other ~84%, and it inherits `claims.ts`'s posture wholesale: the model is asked
 * to cite real turn ids, and its output is NEVER trusted blind.
 *
 * One guard here has no counterpart in `claims.ts`, and it is the reason this module exists in
 * this shape. A claim is prose the model composes, so it can only be checked for *provenance*. A
 * speaker name is a string that must actually have been SPOKEN â€” so it can be checked for
 * *identity*, and it is: every `displayName` must appear verbatim in every turn cited as its
 * evidence (plan Â§10, "zero speaker name that does not appear verbatim in a cited turn").
 *
 * That check is not theoretical. The generated summary for one real session says "Juben Thakur"
 * while its transcript says "Jubin Thakkar" â€” a normalisation the summarizer introduced. A model
 * given the same corpus can reach the same wrong spelling honestly. Without this guard a
 * plausible, well-formed, completely unspoken name would ship as a cited fact about a real person.
 *
 * Degradation is deliberate and follows Â§10's "keep the regex as the degradation fallback": if the
 * provider call fails or returns junk, this falls back to the deterministic pass rather than
 * returning an empty result that a caller would mistake for "no speakers in this session"
 * (the ISS-056 failure mode that made `claims.ts` grow its own `degraded` flag).
 */
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";
import { personIdFor, resolveSpeakers, type ResolvedSpeaker } from "./speakers.js";
import { looksLikeAName, isDiscourseOnly, citesNameAsAnIntroduction } from "./speaker-name-rules.js";

export type SpeakersCompleteFn = (job: Job) => Promise<CompleteResult>;

const POSITIONAL = /^spk:\d+$/;

/**
 * Segment-aware windows (speaker-segment-identity gate, Option A, phase 2): the model never sees
 * the whole transcript. Each window is <=8 turns around one contiguous positional-label block —
 * the block plus just enough before-context for a handover/greeting to land inside the window.
 * Measured over the real corpus: 494 positional turns form 240 contiguous blocks (gate evidence),
 * so a session-wide prompt asks the model to do exactly the merge across people the gate measured
 * as unsafe. Windows do that merge per-segment instead.
 */
const WINDOW_CONTEXT_BEFORE = 3;
const MAX_WINDOW = 8;

/**
 * ISS-255 fix_direction (2): the eval measured single-run acceptance UNSTABLE (different name
 * sets accepted across runs 1 vs 2-3 of the same session, temperature 0 + seed notwithstanding).
 * The windows are therefore sampled AGREEMENT_RUNS times and an identity proceeds to the
 * evidence filters only when >=AGREEMENT_THRESHOLD runs proposed the same (label, name) pair —
 * a 2-of-3 majority. Lower agreement = the label stays unresolved.
 */
const AGREEMENT_RUNS = 3;
const AGREEMENT_THRESHOLD = 2;

export interface SpeakerWindow {
  label: string;
  startTurnIndex: number;
  endTurnIndex: number;
  turns: Turns[];
}

interface WindowFailure {
  label: string;
  startTurnIndex: number;
  detail: string;
}

function distinctWindowCount(failures: WindowFailure[]): number {
  return new Set(failures.map((f) => `${f.label}@${f.startTurnIndex}`)).size;
}

const SPEAKERS_SYSTEM_PROMPT = [
  "You identify who each anonymous speaker in a transcript actually is. Each line is one turn,",
  "prefixed with its real turn id and its anonymous speaker label, e.g. [id:t12] [spk:0] ...",
  "Some speakers introduce themselves, are greeted by name, or are handed over to by name.",
  'Respond with ONLY a JSON array: [{"speakerRef": "<the exact spk:N label>",',
  '"displayName": "<the person\'s name EXACTLY as it is spelled in the transcript>",',
  '"turnIds": ["<turn ids that show this person is that speaker>"]}, ...].',
  "Copy the name character-for-character from the transcript -- never correct, normalise or",
  "complete a spelling, and never supply a name the transcript does not contain. Copy every",
  "turnId exactly from the [id:...] prefixes. If you cannot tell who a speaker is, leave them out",
  "entirely -- an unnamed speaker is correct, a guessed one is a serious error. If no speaker can",
  "be identified, respond with an empty array [].",
].join(" ");

function buildCitableTranscript(turns: Turns[]): string {
  return turns.map((t) => `[id:${t._id}] [${t.speakerRef}] ${t.text}`).join("\n");
}

export interface SpeakerExtractionResult {
  resolved: ResolvedSpeaker[];
  /** Positional labels still unnamed. Reported, never guessed at. */
  unresolved: string[];
  /** `null` when extraction genuinely ran; a reason when the result means "unknown", not "none". */
  degraded: { reason: string } | null;
}

interface RawSpeaker {
  speakerRef?: unknown;
  displayName?: unknown;
  turnIds?: unknown;
}

function positionalLabels(turns: Turns[]): string[] {
  return [...new Set(turns.filter((t) => POSITIONAL.test(t.speakerRef ?? "")).map((t) => t.speakerRef))].sort();
}

/** The deterministic pass, relabelled as a degraded result. */
function fallback(turns: Turns[], reason: string): SpeakerExtractionResult {
  const { resolved, unresolved } = resolveSpeakers(turns);
  return { resolved, unresolved, degraded: { reason } };
}

/**
 * Contiguous positional-label blocks over the full turn list (same definition as
 * `speakers.ts`'s scoping: a block ends at any label change or a named turn).
 */
function labelBlocks(turns: Turns[]): Map<string, { startTurnIndex: number; endTurnIndex: number }[]> {
  const blocks = new Map<string, { startTurnIndex: number; endTurnIndex: number }[]>();
  let current: { label: string; start: number; end: number } | null = null;
  const close = () => {
    if (!current) return;
    const list = blocks.get(current.label) ?? [];
    list.push({ startTurnIndex: current.start, endTurnIndex: current.end });
    blocks.set(current.label, list);
    current = null;
  };
  for (let i = 0; i < turns.length; i++) {
    const ref = turns[i]?.speakerRef ?? "";
    if (POSITIONAL.test(ref)) {
      if (current && current.label === ref) current.end = i;
      else {
        if (current) blocks.set(current.label, [...(blocks.get(current.label) ?? []), { startTurnIndex: current.start, endTurnIndex: current.end }]);
        current = { label: ref, start: i, end: i };
      }
    } else {
      if (current) {
        blocks.set(current.label, [...(blocks.get(current.label) ?? []), { startTurnIndex: current.start, endTurnIndex: current.end }]);
        current = null;
      }
    }
  }
  if (current) blocks.set(current.label, [...(blocks.get(current.label) ?? []), { startTurnIndex: current.start, endTurnIndex: current.end }]);
  return blocks;
}

/**
 * One <=MAX_WINDOW-turn window per contiguous block: up to WINDOW_CONTEXT_BEFORE turns of
 * before-context (named turns included — a handover names its speaker), and the WHOLE block
 * (a block longer than the window is covered in full — the window bound applies to the context,
 * never to truncating the evidence the block carries).
 *
 * Context NEVER reaches back into the previous window's turns: a different label's unresolved
 * block must not be fed into this label's window, or the model is asked to merge identities the
 * gate measured as unsafe (240 blocks, 29 session/label pairs).
 */
export function buildSpeakerWindows(turns: Turns[]): SpeakerWindow[] {
  const blocks = labelBlocks(turns);
  const windows: SpeakerWindow[] = [];
  let prevEnd = -1;
  for (const [label, list] of [...blocks.entries()].sort()) {
    for (const block of list) {
      // Context must not reach back into ANOTHER unresolved block of a different label (that
      // would feed two identities into one window): it stops after the previous block end.
      const from = Math.max(0, block.startTurnIndex - WINDOW_CONTEXT_BEFORE, prevEnd + 1);
      // A block longer than MAX_WINDOW is chunked: each chunk is its own window with the
      // same label and its true block scope, so the model never sees >MAX_WINDOW turns while
      // every evidence turn in a chunk is still inside the block it names.
      for (let s = block.startTurnIndex; s <= block.endTurnIndex; s += MAX_WINDOW) {
        const to = Math.min(block.endTurnIndex, s + MAX_WINDOW - 1);
        windows.push({ label, startTurnIndex: block.startTurnIndex, endTurnIndex: block.endTurnIndex, turns: turns.slice(from, to + 1) });
        prevEnd = to;
      }
    }
  }
  return windows;
}

/**
 * Speaker identities for one session's positional labels, via the injected LLM `complete`.
 *
 * Never throws. Every returned `displayName` is verbatim-present in every turn it cites, every
 * cited turn id is real, and a label the model names two different ways is left unresolved rather
 * than settled by a coin flip.
 */
export async function extractSpeakers(turns: Turns[], complete: SpeakersCompleteFn): Promise<SpeakerExtractionResult> {
  if (turns.length === 0) return { resolved: [], unresolved: [], degraded: null };

  const byId = new Map(turns.map((t) => [t._id, t]));
  const labels = new Set(positionalLabels(turns));

  // Segment-aware (gate Option A, phase 2): one bounded window per contiguous block instead of
  // one session-wide prompt. A window whose provider call fails is recorded; if EVERY window
  // fails the whole extraction degrades to the deterministic floor. A partially-failing session
  // keeps its successful windows and reports the failures via `degraded.reason`.
  //
  // ISS-255 fix_direction (2): single-run acceptance is NOT stable — the live eval measured the
  // same session accepting different name sets across runs despite temperature 0 + seed. So the
  // windows are sampled THREE times and only the identities that agree in >=AGREE_OF runs
  // proceed to the filters. A label that resolves differently across runs is left unresolved —
  // the module's stated contract, now backed by voting rather than hope.
  const windows = buildSpeakerWindows(turns);
  const runRaw: unknown[][] = [];
  const windowFailures: WindowFailure[] = [];
  const junkFailures: WindowFailure[] = [];
  for (let run = 1; run <= AGREEMENT_RUNS; run++) {
    const raws: unknown[] = [];
    for (const w of windows) {
      try {
        const completion = await complete({
          kind: "speakers",
          messages: [
            { role: "system", content: SPEAKERS_SYSTEM_PROMPT },
            { role: "user", content: buildCitableTranscript(w.turns) },
          ],
        });
        const parsed = completion.json ?? parseJsonLoose(completion.text);
        // ISS-270: a non-array response is unparseable provider output, not a legitimate "no
        // speaker" (that is an empty array). It is recorded with the same window accounting as a
        // thrown call so `degraded` is non-null whenever ANY window returned junk.
        if (!Array.isArray(parsed)) junkFailures.push({ label: w.label, startTurnIndex: w.startTurnIndex, detail: "response was not a JSON array" });
        raws.push(parsed);
      } catch (err) {
        windowFailures.push({ label: w.label, startTurnIndex: w.startTurnIndex, detail: err instanceof Error ? err.message : String(err) });
      }
    }
    runRaw.push(raws);
  }
  const allRaw = runRaw.flat();
  if (allRaw.length === 0 && windowFailures.length > 0) {
    return fallback(turns, `speakers provider call failed on all ${windows.length * AGREEMENT_RUNS} window call(s); first: ${windowFailures[0]?.detail}`);
  }

  const raw: unknown = allRaw.flat();
  if (allRaw.length > 0 && allRaw.every((r) => !Array.isArray(r))) {
    return fallback(turns, "speakers responses were not JSON arrays in any window");
  }

  // Count how many RUNS proposed each (label, name) pair with surviving evidence; only pairs
  // proposed in >=AGREEMENT_THRESHOLD runs carry on to the claims map. Votes are keyed on
  // (speakerRef, lowercased displayName) — casing variants of the same name vote together.
  const votes = new Map<string, number>();
  for (const run of runRaw) {
    const seenThisRun = new Set<string>();
    for (const entry of run.flat() as RawSpeaker[]) {
      if (typeof entry !== "object" || entry === null) continue;
      const ref = entry.speakerRef;
      const nm = entry.displayName;
      if (typeof ref !== "string" || !labels.has(ref)) continue;
      if (typeof nm !== "string" || nm.trim() === "") continue;
      if (!looksLikeAName(nm.trim()) || isDiscourseOnly(nm.trim())) continue;
      seenThisRun.add(`${ref}|${nm.trim().toLowerCase()}`);
    }
    for (const key of seenThisRun) votes.set(key, (votes.get(key) ?? 0) + 1);
  }

  // label -> name -> evidence. Kept per-name so a contradiction is visible rather than overwritten.
  const claims = new Map<string, Map<string, { turnId: string; sessionId: string }[]>>();

  for (const entry of raw as RawSpeaker[]) {
    if (typeof entry !== "object" || entry === null) continue;

    const speakerRef = entry.speakerRef;
    // Only anonymous labels are in scope: never rename a turn that already carries a real name,
    // and never name a speaker who does not appear in this transcript.
    if (typeof speakerRef !== "string" || !labels.has(speakerRef)) continue;

    const displayName = entry.displayName;
    if (typeof displayName !== "string" || displayName.trim() === "") continue;
    const name = displayName.trim();
    // ISS-255 (2): 2-of-3 run agreement required before ANY acceptance. An identity proposed in
    // fewer runs is unstable output, not a citable fact.
    if ((votes.get(`${speakerRef}|${name.toLowerCase()}`) ?? 0) < AGREEMENT_THRESHOLD) continue;
    // Shape check BEFORE containment: a greeting can be verbatim in the transcript and still not
    // be a name. Cheaper too -- it rejects without touching any turn.
    if (!looksLikeAName(name)) continue;
    // Shape says "could be a name"; this says "is not a discourse word". Different questions.
    if (isDiscourseOnly(name)) continue;

    const cited = Array.isArray(entry.turnIds) ? entry.turnIds : [];
    const evidence: { turnId: string; sessionId: string }[] = [];
    for (const id of cited) {
      if (typeof id !== "string") continue;
      const t = byId.get(id);
      if (!t) continue;                                  // fabricated turn id
      // THE RULE: the name must appear in its evidence as whole words, never as a substring
      // buried inside a longer word ("Ruby" inside "Rubykumar" is a different person).
      if (!citesNameAsAnIntroduction(t.text ?? "", name)) continue;
      if (evidence.some((e) => e.turnId === id)) continue;
      evidence.push({ turnId: id, sessionId: t.sessionId });
    }
    if (evidence.length === 0) continue;                 // nothing survived -- the speaker does not ship

    // Merge across runs WITHOUT duplicating evidence: the same (label, name) pair is filtered
    // in every run, so its surviving turns recur verbatim. One copy per turn id.
    const byName = claims.get(speakerRef) ?? new Map<string, { turnId: string; sessionId: string }[]>();
    const merged = [...(byName.get(name) ?? [])];
    for (const e of evidence) if (!merged.some((m) => m.turnId === e.turnId)) merged.push(e);
    byName.set(name, merged);
    claims.set(speakerRef, byName);
  }

  const resolved: ResolvedSpeaker[] = [];
  for (const [speakerRef, byName] of claims) {
    if (byName.size !== 1) continue;                     // contradiction: not ours to settle
    const entry = [...byName.entries()][0];
    if (!entry) continue;
    const [displayName, evidence] = entry;
    // Segment-aware scope (speaker-segment-identity gate): the LLM path's identity evidence is
    // scoped the same way as the deterministic pass â€” to the contiguous block(s) holding its
    // citing turns. The LLM path has no block map of its own, so the deterministic floor is
    // re-run for the scoping only; its identity decisions here are already re-filtered above.
    const floor = resolveSpeakers(turns);
    const ownBlocks =
      floor.resolved.find((r) => r.speakerRef === speakerRef && r.displayName === displayName)?.blocks ?? [];
    resolved.push({ speakerRef, displayName, personId: personIdFor(displayName), evidence, blocks: ownBlocks });
  }
  resolved.sort((a, b) => a.speakerRef.localeCompare(b.speakerRef));

  const named = new Set(resolved.map((r) => r.speakerRef));
  const totalCalls = windows.length * AGREEMENT_RUNS;
  const failedWindows = distinctWindowCount([...windowFailures, ...junkFailures]);
  const failedCalls = windowFailures.length + junkFailures.length;
  let reason: string | null = null;
  if (failedWindows > 0) {
    // ISS-269: the numerator is DISTINCT windows (never exceeds windows.length), and the failed
    // CALL count over the total calls over all agreement runs is reported separately -- a window
    // failing in all 3 runs is 1 window / 3 calls, three windows failing once each is 3 windows.
    reason = `${failedWindows} of ${windows.length} speaker window(s) failed (${failedCalls} of ${totalCalls} calls across ${AGREEMENT_RUNS} runs)`;
    if (windowFailures.length > 0) reason += `: ${windowFailures[0]?.detail}`;
    if (junkFailures.length > 0) {
      const first = junkFailures[0];
      reason += `; ${junkFailures.length} call(s) returned junk (first: ${first?.label}@${first?.startTurnIndex})`;
    }
  }
  return {
    resolved,
    unresolved: [...labels].filter((l) => !named.has(l)).sort(),
    degraded: reason ? { reason } : null,
  };
}

