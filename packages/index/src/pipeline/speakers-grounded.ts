/**
 * packages/index/src/pipeline/speakers-grounded.ts -- U2.4 model-judged speaker attribution (D-132, pending append).
 *
 * Owner decision: speaker naming moves from rule-only evidence to MODEL-JUDGED attribution. The model sees the
 * WHOLE session and returns, per diarized label, {label, name, evidenceQuote, evidenceKind}. The old gate asked
 * "is there a self-naming turn?" and discarded every proposal that rested on being greeted, called on, handed
 * over to, thanked or on role continuity. This gate asks the question the model can be held to instead:
 * "is the quote REAL, does it contain the name, and does it sit where that kind of evidence can bind?".
 *
 * GROUNDING GATE -- a proposal ships only if ALL hold:
 *  1. label is a positional spk:N of this session; name is name-shaped, not discourse-only, and appears verbatim
 *     (whole name) somewhere in the transcript (a spelling the transcript never says is the Juben/Jubin defect).
 *  2. evidenceQuote occurs verbatim (whitespace and case normalised) INSIDE ONE turn, has >= 3 words, and contains
 *     the name -- or one name token that no other proposed name in the session shares (unambiguous reference).
 *  3. the occurrence is not quoted/reported speech, and the quote's turn sits where its evidenceKind can bind
 *     (self-intro: the label's own clean self-identification; handover/called-on: the turn right BEFORE a block of
 *     the label; thanks: right AFTER; address: either; role-continuity: inside or adjacent). The bound block(s) become
 *     the identity's scope -- never label-wide.
 *  4. each (label, name, quote turn) is grounded in >= 2 of the 3 runs (the ISS-255 2-of-3 vote, applied per grounding).
 *  5. unless one quote is a self-intro, at least 2 distinct quote turns back the (label, name) pair;
 *  6. it does not contradict the deterministic floor (resolveSpeakers), a label with two names stays unnamed, and one
 *     quote turn binds at most one label.
 * Anything else abstains. The quote and kind are stored on the resolved speaker as provenance.
 */
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";
import { personIdFor, resolveSpeakers, type ResolvedSpeaker } from "./speakers.js";
import { containsNameVerbatim, isDiscourseOnly, looksLikeAName, nameOccurrences } from "./speaker-name-rules.js";
import { citesNameAsSelfIdentification } from "./speaker-relation-rules.js";
import { isReportedAt } from "./speaker-reported-rules.js";

export type EvidenceKind = "self-intro" | "called-on" | "address" | "handover" | "thanks" | "role-continuity";
export const EVIDENCE_KINDS: readonly EvidenceKind[] = ["self-intro", "called-on", "address", "handover", "thanks", "role-continuity"];

export interface SpeakerProvenance { turnId: string; evidenceQuote: string; evidenceKind: EvidenceKind }
export interface GroundedSpeakerResult { resolved: ResolvedSpeaker[]; unresolved: string[]; degraded: { reason: string } | null }
type CompleteFn = (job: Job) => Promise<CompleteResult>;

const POSITIONAL = /^spk:\d+$/;
const AGREEMENT_RUNS = 3;
const AGREEMENT_THRESHOLD = 2;
const MIN_QUOTE_WORDS = 3;
const MIN_CORROBORATION = 2;
/** A quote that thanks someone names the PREVIOUS speaker. */
const THANKS_CUE = /\bthank(?:s| you)\b/i;
/** Forward-looking shapes: a call-on, a handover, a welcome, a role announcement. */
const FORWARD_CUE = /\b(?:over to|hand(?:ing)? (?:it )?over to|pass(?:ing)? (?:it )?to|next (?:up|speaker|presenter)|welcome|hello|hi|introduc\w*|please|go ahead|your turn|(?:can|could|would|will|do|did) you|what|how|why|(?:will|going to) (?:take|moderate|chair|host|lead|run|speak|present|share)|(?:is|are) (?:our|the) (?:moderator|host|panelist|speaker|presenter)|our (?:moderator|host|speaker|presenter))\b/i;
const MAX_QUOTE_CHARS = 500;
const MAX_SESSION_CHARS = 600_000;

export const GROUNDED_SYSTEM_PROMPT = [
  "You identify who each anonymous speaker label in a transcript actually is. You are given the WHOLE session.",
  "Each line is one turn, prefixed with its turn id and its anonymous speaker label, e.g. [id:t12] [spk:0] ...",
  "A label may be reused for several people in different stretches; name a label only for a stretch where the",
  "transcript itself shows who is speaking. Use the whole session as context.",
  'Respond with ONLY a JSON array: [{"label": "<the exact spk:N label>", "name": "<the person\'s name EXACTLY as spelled in the transcript>",',
  '"evidenceQuote": "<a sentence or phrase copied word-for-word from ONE turn that shows this>",',
  '"evidenceKind": "<one of: self-intro, called-on, address, handover, thanks, role-continuity>"}, ...].',
  "evidenceKind: self-intro = the speaker introduces themselves (quote their own turn); called-on = the host asks that",
  "person a question or calls on them and the next stretch of that label answers; address = they are greeted or",
  "addressed by name right before or after they speak; handover = the previous speaker hands over to them by name;",
  "thanks = the next speaker thanks them by name; role-continuity = their role (host, panelist, presenter) is named and",
  "the label continues that role. The quote must come from a turn right before, right after, or inside the stretch you name,",
  "must contain the name (or its first or last name), and must be copied exactly -- never paraphrase, never join two turns.",
  "Return one entry per independent supporting quote (the same label and name may appear several times, each with a different quote);",
  "a name backed by a single quote that is not a self-introduction is discarded.",
  "Never supply a name the transcript does not contain. Precision matters far more than coverage: if you are not sure who a",
  "label is, leave it out. If no label can be identified, respond with an empty array [].",
].join(" ");

/** Whole-session transcript with real turn ids (the model quotes text; ids give it a stable frame). */
export function buildSessionTranscript(turns: Turns[]): string {
  return turns.map((t) => `[id:${t._id}] [${t.speakerRef}] ${t.text}`).join("\n");
}

type Block = { startTurnIndex: number; endTurnIndex: number };

function blocksByLabel(turns: Turns[]): Map<string, Block[]> {
  const out = new Map<string, Block[]>();
  let cur: { label: string; s: number; e: number } | null = null;
  const close = () => { if (cur) out.set(cur.label, [...(out.get(cur.label) ?? []), { startTurnIndex: cur.s, endTurnIndex: cur.e }]); cur = null; };
  for (let i = 0; i < turns.length; i++) {
    const ref = turns[i]?.speakerRef ?? "";
    if (!POSITIONAL.test(ref)) { close(); continue; }
    if (cur && cur.label === ref) cur.e = i; else { close(); cur = { label: ref, s: i, e: i }; }
  }
  close();
  return out;
}

/** Case-fold, straighten apostrophes/quotes, collapse whitespace; `map[i]` = original index of normalized char i. */
export function normalizeWithMap(raw: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < raw.length; i++) {
    let ch = raw[i] ?? "";
    if (/\s/u.test(ch)) { if (norm.length > 0) pendingSpace = true; continue; }
    if (ch === "’" || ch === "‘") ch = "'";
    if (ch === "“" || ch === "”") ch = '"';
    if (pendingSpace) { norm += " "; map.push(i); pendingSpace = false; }
    norm += ch.toLowerCase();
    map.push(i);
  }
  return { norm, map };
}

const normQuote = (q: string): string => normalizeWithMap(q).norm;
const personTokens = (name: string): string[] => name.trim().split(/\s+/).filter(Boolean);
const tokenOverlap = (a: string, b: string): boolean => {
  const [x, y] = [personTokens(a.toLowerCase()), personTokens(b.toLowerCase())];
  const sub = (s: string[], big: string[]) => { for (let i = 0; i + s.length <= big.length; i++) if (s.every((t, k) => big[i + k] === t)) return true; return false; };
  return x.length > 0 && y.length > 0 && (sub(x, y) || sub(y, x));
};

interface Entry { label: string; name: string; quote: string; kind: EvidenceKind }
function readEntry(e: unknown): Entry | null {
  if (typeof e !== "object" || e === null) return null;
  const r = e as Record<string, unknown>;
  if (typeof r.label !== "string" || typeof r.name !== "string" || typeof r.evidenceQuote !== "string" || typeof r.evidenceKind !== "string") return null;
  if (!EVIDENCE_KINDS.includes(r.evidenceKind as EvidenceKind)) return null;
  const [name, quote] = [r.name.trim(), r.evidenceQuote.trim()];
  if (!name || !quote || quote.length > MAX_QUOTE_CHARS) return null;
  return { label: r.label.trim(), name, quote, kind: r.evidenceKind as EvidenceKind };
}

interface Grounded { turnId: string; sessionId: string; block: Block; i: number; quote: string; kind: EvidenceKind }

/**
 * Ground ONE entry. Returns the grounding (turn, scope block, provenance) or null = abstain.
 * `ambiguousTokens` = name tokens shared by two or more distinct proposed names (unusable as a bare reference).
 */
function groundEntry(turns: Turns[], blocks: Map<string, Block[]>, fullText: string, ambiguousTokens: Set<string>, en: Entry): Grounded | null {
  if (!POSITIONAL.test(en.label) || !blocks.has(en.label)) return null;
  if (!looksLikeAName(en.name) || isDiscourseOnly(en.name)) return null;
  if (!containsNameVerbatim(fullText, en.name)) return null;                       // the whole name is spoken somewhere
  if (en.quote.split(/\s+/).filter(Boolean).length < MIN_QUOTE_WORDS) return null;
  const q = normQuote(en.quote);
  const labelBlocks = blocks.get(en.label) ?? [];

  for (let k = 0; k < turns.length; k++) {
    const turn = turns[k];
    if (!turn) continue;
    const { norm, map } = normalizeWithMap(turn.text ?? "");
    const at0 = norm.indexOf(q);
    if (at0 === -1) continue;                                                      // quote must sit inside ONE turn
    const [spanStart, spanEnd] = [map[at0] ?? 0, (map[at0 + q.length - 1] ?? 0) + 1];
    const text = (turn.text ?? "").replaceAll("’", "'");
    const span = text.slice(spanStart, spanEnd);

    // The quote must contain the name, or one token of it that no other proposed name shares.
    const refs = containsNameVerbatim(span, en.name)
      ? [en.name]
      : personTokens(en.name).filter((t) => t.length >= 3 && !ambiguousTokens.has(t.toLowerCase()) && looksLikeAName(t) && !isDiscourseOnly(t) && containsNameVerbatim(span, t));
    if (refs.length === 0) continue;
    const live = refs.some((r) => nameOccurrences(text, r).some((at) => at >= spanStart && at + r.length <= spanEnd && !isReportedAt(text, r, at)));
    if (!live) continue;
    // WHO does the quote name? A "thank you, X" / "thanks X" addresses the person who JUST spoke, never the next block.
    const backward = THANKS_CUE.test(span);
    if (backward && (en.kind === "called-on" || en.kind === "handover" || en.kind === "role-continuity")) continue;   // a thanks-shaped quote cannot call someone forward
    if (en.kind === "thanks" && !backward) continue;
    if ((en.kind === "called-on" || en.kind === "handover" || (en.kind === "address" && !backward) || en.kind === "role-continuity") && !FORWARD_CUE.test(span) && !(en.kind === "role-continuity" && labelBlocks.some((b) => k >= b.startTurnIndex && k <= b.endTurnIndex))) continue;

    const inBlock = labelBlocks.find((b) => k >= b.startTurnIndex && k <= b.endTurnIndex);
    const before = labelBlocks.find((b) => b.startTurnIndex === k + 1);            // the turn right BEFORE this block
    const after = labelBlocks.find((b) => b.endTurnIndex === k - 1);               // the turn right AFTER this block
    let block: Block | undefined;
    switch (en.kind) {
      case "self-intro": block = turn.speakerRef === en.label && refs[0] === en.name && citesNameAsSelfIdentification(turn.text ?? "", en.name) ? inBlock : undefined; break;
      case "handover":
      case "called-on": block = turn.speakerRef !== en.label ? before : undefined; break;
      case "thanks": block = turn.speakerRef !== en.label ? after : undefined; break;
      case "address": block = turn.speakerRef !== en.label ? (backward ? after : before) : undefined; break;
      case "role-continuity": block = inBlock ?? before; break;
    }
    if (block) return { turnId: turn._id, sessionId: turn.sessionId, block, i: k, quote: en.quote, kind: en.kind };
  }
  return null;
}

/**
 * The gate, pure: `runs` = the parsed model output of each agreement run (any junk tolerated).
 * Exported so recorded proposals can be replayed with NO provider call.
 */
export function groundSpeakerProposals(turns: Turns[], runs: unknown[]): { resolved: ResolvedSpeaker[]; unresolved: string[] } {
  const labels = [...new Set(turns.map((t) => t.speakerRef).filter((r): r is string => POSITIONAL.test(r ?? "")))].sort();
  const blocks = blocksByLabel(turns);
  const fullText = turns.map((t) => t.text ?? "").join("\n").replaceAll("’", "'");
  const parsed = runs.map((run) => (Array.isArray(run) ? run : []).map(readEntry).filter((e): e is Entry => e !== null && labels.includes(e.label)));

  // A name token proposed under two different names cannot stand alone as a reference.
  const tokenOwners = new Map<string, Set<string>>();
  for (const e of parsed.flat()) for (const t of personTokens(e.name)) tokenOwners.set(t.toLowerCase(), (tokenOwners.get(t.toLowerCase()) ?? new Set()).add(e.name.toLowerCase()));
  const ambiguous = new Set([...tokenOwners].filter(([, owners]) => owners.size > 1).map(([t]) => t));

  // label -> name -> groundings; a (label, name) pair counts as a vote in a run only when something GROUNDED.
  const groundedByRun = parsed.map((run) => run.map((en) => ({ en, g: groundEntry(turns, blocks, fullText, ambiguous, en) })).filter((x): x is { en: Entry; g: Grounded } => x.g !== null));
  const votes = new Map<string, number>();
  const voteKey = (en: Entry, g: Grounded): string => `${en.label}|${en.name.toLowerCase()}|${g.turnId}`;   // a quote earns its vote only where it grounds on the same turn
  for (const run of groundedByRun) for (const key of new Set(run.map(({ en, g }) => voteKey(en, g)))) votes.set(key, (votes.get(key) ?? 0) + 1);

  const claims = new Map<string, Map<string, Grounded[]>>();
  for (const { en, g } of groundedByRun.flat()) {
    if ((votes.get(voteKey(en, g)) ?? 0) < AGREEMENT_THRESHOLD) continue;
    const byName = claims.get(en.label) ?? new Map<string, Grounded[]>();
    const list = byName.get(en.name) ?? [];
    if (!list.some((x) => x.turnId === g.turnId && x.kind === g.kind && x.quote === g.quote)) list.push(g);
    byName.set(en.name, list);
    claims.set(en.label, byName);
  }

  const floor = resolveSpeakers(turns).resolved;
  const collides = (label: string, name: string): boolean =>
    floor.some((f) => f.speakerRef !== label && tokenOverlap(f.displayName, name)) ||
    [...claims].some(([other, byOther]) => other !== label && [...byOther.keys()].some((n) => tokenOverlap(n, name)));
  const labelsByTurn = new Map<string, Set<string>>();
  for (const [ref, byName] of claims) for (const gs of byName.values()) for (const g of gs) labelsByTurn.set(g.turnId, (labelsByTurn.get(g.turnId) ?? new Set()).add(ref));

  const resolved: ResolvedSpeaker[] = [];
  for (const [speakerRef, byName] of claims) {
    if (byName.size !== 1) continue;                                               // two names for one label: abstain
    const [displayName, bound] = [...byName.entries()][0] ?? ["", []];
    if (!displayName || bound.length === 0) continue;
    if (floor.some((f) => f.speakerRef === speakerRef && !tokenOverlap(f.displayName, displayName))) continue;   // contradicts the floor
    if (bound.some((g) => (labelsByTurn.get(g.turnId)?.size ?? 0) > 1)) continue;  // one quote turn binds one label
    // Corroboration (prefer abstaining): a self-introduction stands alone; any other kind needs >= MIN_CORROBORATION INDEPENDENT quotes.
    if (!bound.some((g) => g.kind === "self-intro") && new Set(bound.map((g) => `${turns.find((t) => t._id === g.turnId)?.speakerRef}|${g.kind}`)).size < MIN_CORROBORATION) continue;   // independent = different quote speaker or different kind, never one repeated pattern
    if (collides(speakerRef, displayName)) continue;                               // the same person is plausibly another label
    const ordered = [...bound].sort((a, b) => a.i - b.i);
    const scope = [...new Map(ordered.map((g) => [g.block.startTurnIndex, g.block])).values()].sort((a, b) => a.startTurnIndex - b.startTurnIndex);
    const provenance: SpeakerProvenance[] = ordered.map((g) => ({ turnId: g.turnId, evidenceQuote: g.quote, evidenceKind: g.kind }));
    const evidence = [...new Map(ordered.map((g) => [g.turnId, { turnId: g.turnId, sessionId: g.sessionId }])).values()];
    resolved.push({ speakerRef, displayName, personId: personIdFor(displayName), evidence, blocks: scope, provenance });
  }
  resolved.sort((a, b) => a.speakerRef.localeCompare(b.speakerRef));
  const named = new Set(resolved.map((r) => r.speakerRef));
  return { resolved, unresolved: labels.filter((l) => !named.has(l)) };
}

/** Speaker identities for one session's positional labels, via the injected model `complete`. Never throws. */
export async function extractSpeakersGrounded(turns: Turns[], complete: CompleteFn): Promise<GroundedSpeakerResult> {
  const degrade = (reason: string): GroundedSpeakerResult => {
    const { resolved, unresolved } = resolveSpeakers(turns);
    return { resolved, unresolved, degraded: { reason } };
  };
  if (turns.length === 0) return { resolved: [], unresolved: [], degraded: null };
  if (!turns.some((t) => POSITIONAL.test(t.speakerRef ?? ""))) return { resolved: [], unresolved: [], degraded: null };
  const transcript = buildSessionTranscript(turns);
  if (transcript.length > MAX_SESSION_CHARS) return degrade(`session transcript too large for one call (${transcript.length} chars)`);

  const runs: unknown[] = [];
  const failures: string[] = [];
  let junk = 0;
  for (let run = 1; run <= AGREEMENT_RUNS; run++) {
    try {
      const completion = await complete({ kind: "speakers", messages: [{ role: "system", content: GROUNDED_SYSTEM_PROMPT }, { role: "user", content: transcript }] });
      const parsed = completion.json ?? parseJsonLoose(completion.text);
      if (!Array.isArray(parsed)) junk++;
      runs.push(parsed);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (runs.length === 0) return degrade(`speakers provider call failed on all ${AGREEMENT_RUNS} run(s); first: ${failures[0]}`);
  if (runs.every((r) => !Array.isArray(r))) return degrade("speakers responses were not JSON arrays in any run");

  const { resolved, unresolved } = groundSpeakerProposals(turns, runs);
  let reason: string | null = null;
  if (failures.length > 0 || junk > 0) {
    reason = `${failures.length + junk} of ${AGREEMENT_RUNS} speaker run(s) failed`;
    if (failures.length > 0) reason += `: ${failures[0]}`;
    if (junk > 0) reason += `; ${junk} run(s) returned junk`;
  }
  return { resolved, unresolved, degraded: reason ? { reason } : null };
}
