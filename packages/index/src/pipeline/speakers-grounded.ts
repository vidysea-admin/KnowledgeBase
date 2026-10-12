/**
 * packages/index/src/pipeline/speakers-grounded.ts -- U2.4 model-judged speaker attribution (D-132, pending append).
 *
 * Owner decision: speaker naming is MODEL-JUDGED. A proposer sees the WHOLE session and returns, per diarized label,
 * {label, name, evidenceQuote, evidenceKind}. Two layers decide what ships:
 *
 *  DETERMINISTIC GROUNDING (cannot be argued with by a model) -- an entry becomes a candidate only if
 *   1. its label is a positional spk:N of this session (`[spk:2]` and `Speaker 2` are normalised; a bare-name label is
 *      mapped to the quote turn's diarized label only for a self-intro whose quote sits in a positional turn);
 *   2. the name is name-shaped, not discourse-only, and spelled in full somewhere in the transcript;
 *   3. evidenceQuote occurs verbatim (whitespace, case, apostrophes normalised) inside ONE turn, >= 3 words, and
 *      contains the name (or a token no other proposed name shares), outside quoted/reported speech;
 *   4. the quote does not mention a SECOND distinct person (hard abstain; a self-intro is exempt), because which of two
 *      names the speaker means is exactly what a regex cannot tell;
 *   5. the quote turn is not spoken by the label itself (a speaker is not identified by their own words) unless it is the
 *      existing clean self-introduction, which stands alone;
 *   6. the quote sits within MAX_DISTANCE turns of a block of the label (before or after it).
 *  VERIFIER (judgement) -- a non-self-intro candidate must be confirmed by an injectable verifier that sees a window of
 *  turns and answers "does this evidence show that speaker <label> IS <name>?" in VERIFIER_FRAMINGS differently framed
 *  calls: >= 2 yes and no "no". No verifier means no non-self-intro identity (abstain).
 *
 *  Then: the (label, name) pair must be proposed in >= 2 of the 3 proposer runs (vote keyed on the pair, not the quote);
 *  CORROBORATION = a self-intro alone, or two verified pieces of evidence that are INDEPENDENT (different quote speakers
 *  AND opposite sides of the block: a host and a cohost both introducing the same person are one handover, not two
 *  witnesses); no contradiction with the deterministic floor; one name per label; one name never on two labels; one quote
 *  turn binds one label. The quote and kind are kept as provenance.
 */
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";
import { personIdFor, resolveSpeakers, type ResolvedSpeaker } from "./speakers.js";
import { containsNameVerbatim, isDiscourseOnly, looksLikeAName, nameOccurrences } from "./speaker-name-rules.js";
import { citesNameAsSelfIdentification } from "./speaker-relation-rules.js";
import { isReportedAt } from "./speaker-reported-rules.js";
import { llmVerifier, VERIFIER_FRAMINGS, buildVerifierWindow, type SpeakerVerifier } from "./speakers-verifier.js";

export type EvidenceKind = "self-intro" | "called-on" | "address" | "handover" | "thanks" | "role-continuity";
export const EVIDENCE_KINDS: readonly EvidenceKind[] = ["self-intro", "called-on", "address", "handover", "thanks", "role-continuity"];

export interface SpeakerProvenance { turnId: string; evidenceQuote: string; evidenceKind: EvidenceKind }
/**
 * A model-proposed name that passed grounding and a verifier "yes" on SINGLE evidence only (D-141).
 * It is NOT a final identity: the quote and kind travel with it, and only a human confirmation makes it final.
 */
export type SuggestedSpeaker = ResolvedSpeaker & { provenance: SpeakerProvenance[] };
export interface GroundedSpeakerResult {
  resolved: ResolvedSpeaker[]; unresolved: string[]; degraded: { reason: string } | null;
  /** Present only when `suggest: true` was asked for. Never merged into `resolved`. */
  suggested?: SuggestedSpeaker[];
}
type CompleteFn = (job: Job) => Promise<CompleteResult>;
export type Corroboration = "independent-pair" | "single-verified";
export interface GroundConfig {
  /** Which corroboration rule applies to non-self-intro evidence. Default "independent-pair". */
  corroboration?: Corroboration;
}
/** A (label, person) a human already rejected in THIS session: never suggested again. */
export interface RejectedSuggestion { speakerRef: string; personId: string }
/** A (label, person) a human CONFIRMED in this session: the name is final and no auto/floor/suggested result may displace it. */
export interface ConfirmedSpeaker { speakerRef: string; personId: string }
/** Drops any result for a label a human already confirmed, unless it names the same person. Human beats auto and floor. */
export function dropOverriddenByConfirmed<T extends { speakerRef: string; personId: string }>(results: readonly T[], confirmed: readonly ConfirmedSpeaker[]): T[] {
  return results.filter((r) => !confirmed.some((c) => c.speakerRef === r.speakerRef && c.personId !== r.personId));
}
export interface SuggestOptions {
  confirmed?: readonly ConfirmedSpeaker[];
  /** OFF by default. When false/absent no suggestion is computed (and no extra verifier call is made). */
  suggest?: boolean;
  rejected?: readonly RejectedSuggestion[];
}

const POSITIONAL = /^spk:\d+$/;
const AGREEMENT_RUNS = 3;
const AGREEMENT_THRESHOLD = 2;
const MIN_QUOTE_WORDS = 3;
const MAX_QUOTE_CHARS = 500;
const MAX_SESSION_CHARS = 600_000;
/** A quote must be this many turns from a block of the label (1 = the immediately adjacent turn; a backchannel in between breaks the binding). */
export const MAX_DISTANCE = 1;

export const GROUNDED_SYSTEM_PROMPT = [
  "You identify who each anonymous speaker label in a transcript actually is. You are given the WHOLE session.",
  "Each line is one turn, prefixed with its turn id and its anonymous speaker label, e.g. [id:t12] [spk:0] ...",
  "A label may be reused for several people in different stretches; name a label only for a stretch where the",
  "transcript itself shows who is speaking. Use the whole session as context.",
  'Respond with ONLY a JSON array: [{"label": "<the exact spk:N label of the speaker being named>", "name": "<the person\'s name EXACTLY as spelled in the transcript>",',
  '"evidenceQuote": "<a sentence or phrase copied word-for-word from ONE turn that shows this>",',
  '"evidenceKind": "<one of: self-intro, called-on, address, handover, thanks, role-continuity>"}, ...].',
  "evidenceKind: self-intro = the speaker introduces themselves (quote their own turn); called-on = the host asks that",
  "person a question or calls on them and the next stretch of that label answers; address = they are greeted or",
  "addressed by name right before or after they speak; handover = the previous speaker hands over to them by name;",
  "thanks = the next speaker thanks them by name; role-continuity = their role (host, panelist, presenter) is named and",
  "the label continues that role. The quote must come from a turn near the stretch you name, must contain the name,",
  "and must be copied exactly -- never paraphrase, never join two turns. Prefer a quote that names ONLY that person.",
  "Return one entry per independent supporting quote (the same label and name may appear several times, each with a different",
  "quote, ideally from different speakers). Never supply a name the transcript does not contain.",
  "Precision matters far more than coverage: if you are not sure who a label is, leave it out. If no label can be",
  "identified, respond with an empty array [].",
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

/** `spk:2`, `[spk:2]`, `Speaker 2`, `speaker_2` -> `spk:2`; anything else is returned trimmed. */
export function normalizeLabel(raw: string): string {
  const m = /^\W*(?:spk|speaker)[\s:_#-]*(\d+)\W*$/iu.exec(raw.trim());
  return m ? `spk:${m[1]}` : raw.trim();
}

interface Entry { label: string; name: string; quote: string; kind: EvidenceKind }
function readEntry(e: unknown): Entry | null {
  if (typeof e !== "object" || e === null) return null;
  const r = e as Record<string, unknown>;
  if (typeof r.label !== "string" || typeof r.name !== "string" || typeof r.evidenceQuote !== "string" || typeof r.evidenceKind !== "string") return null;
  if (!EVIDENCE_KINDS.includes(r.evidenceKind as EvidenceKind)) return null;
  const [name, quote] = [r.name.trim(), r.evidenceQuote.trim()];
  if (!name || !quote || quote.length > MAX_QUOTE_CHARS) return null;
  return { label: normalizeLabel(r.label), name, quote, kind: r.evidenceKind as EvidenceKind };
}

/** A candidate piece of evidence that passed the deterministic layer. */
export interface Candidate {
  label: string; name: string; kind: EvidenceKind; quote: string;
  turnIdx: number; turnId: string; sessionId: string; speaker: string;
  block: Block; side: "inside" | "before" | "after"; run: number;
}

/** Distinct OTHER person names in a span: mid-sentence capitalised words (or known names) outside `name`. */
export function otherNamesIn(span: string, name: string, known: Set<string>): string[] {
  const own = new Set(personTokens(name).map((t) => t.toLowerCase()));
  const found = new Set<string>();
  const re = /\p{Lu}[\p{L}'’-]*/gu;
  for (let m = re.exec(span); m; m = re.exec(span)) {
    const w = m[0];
    const lw = w.toLowerCase();
    if (own.has(lw) || w === "I" || /^I['’]/.test(w) || isDiscourseOnly(w)) continue;
    const sentenceInitial = /(?:^|[.!?]["')\]]*\s+)$/u.test(span.slice(0, m.index));
    const vocative = /^\s*,/u.test(span.slice(m.index + w.length));   // "Rashi, can you..." opens with a person
    if (sentenceInitial && !known.has(lw) && !vocative) continue;
    if (looksLikeAName(w)) found.add(lw);
  }
  return [...found];
}

function candidatesFor(turns: Turns[], blocks: Map<string, Block[]>, fullText: string, ambiguous: Set<string>, known: Set<string>, positional: Set<string>, en: Entry, run: number): Candidate[] {
  if (!looksLikeAName(en.name) || isDiscourseOnly(en.name)) return [];
  if (!containsNameVerbatim(fullText, en.name)) return [];                        // the whole name is spoken somewhere
  if (en.quote.split(/\s+/).filter(Boolean).length < MIN_QUOTE_WORDS) return [];
  const q = normQuote(en.quote);
  const out: Candidate[] = [];
  for (let k = 0; k < turns.length; k++) {
    const turn = turns[k];
    if (!turn) continue;
    const { norm, map } = normalizeWithMap(turn.text ?? "");
    const at0 = norm.indexOf(q);
    if (at0 === -1) continue;                                                      // quote must sit inside ONE turn
    const [spanStart, spanEnd] = [map[at0] ?? 0, (map[at0 + q.length - 1] ?? 0) + 1];
    const text = (turn.text ?? "").replaceAll("’", "'");
    const span = text.slice(spanStart, spanEnd);

    // Label: a bare-name or "[Name]" label means "the speaker of this quote", valid only for a self-intro.
    let label = en.label;
    if (!positional.has(label)) {
      const bare = label.replace(/^\W+|\W+$/gu, "");
      if (en.kind !== "self-intro" || !bare || !tokenOverlap(bare, en.name) || !POSITIONAL.test(turn.speakerRef ?? "")) continue;
      label = turn.speakerRef;
    }
    const labelBlocks = blocks.get(label);
    if (!labelBlocks) continue;

    const refs = containsNameVerbatim(span, en.name)
      ? [en.name]
      : personTokens(en.name).filter((t) => t.length >= 3 && !ambiguous.has(t.toLowerCase()) && looksLikeAName(t) && !isDiscourseOnly(t) && containsNameVerbatim(span, t));
    if (refs.length === 0) continue;
    if (!refs.some((r) => nameOccurrences(text, r).some((at) => at >= spanStart && at + r.length <= spanEnd && !isReportedAt(text, r, at)))) continue;

    const mk = (block: Block, side: Candidate["side"]): Candidate => ({ label, name: en.name, kind: en.kind, quote: en.quote, turnIdx: k, turnId: turn._id, sessionId: turn.sessionId, speaker: turn.speakerRef, block, side, run });
    if (en.kind === "self-intro") {
      const inBlock = labelBlocks.find((b) => k >= b.startTurnIndex && k <= b.endTurnIndex);
      if (inBlock && turn.speakerRef === label && refs[0] === en.name && citesNameAsSelfIdentification(turn.text ?? "", en.name)) out.push(mk(inBlock, "inside"));
      continue;
    }
    if (turn.speakerRef === label) continue;                                       // a speaker is not identified by their own words
    if (otherNamesIn(span, en.name, known).length > 0) continue;                   // two people in one quote: abstain
    const before = labelBlocks.filter((b) => b.startTurnIndex > k && b.startTurnIndex - k <= MAX_DISTANCE).sort((a, b) => a.startTurnIndex - b.startTurnIndex)[0];
    const after = labelBlocks.filter((b) => b.endTurnIndex < k && k - b.endTurnIndex <= MAX_DISTANCE).sort((a, b) => b.endTurnIndex - a.endTurnIndex)[0];
    if (before) out.push(mk(before, "before"));
    if (after) out.push(mk(after, "after"));
  }
  return out;
}

/** The deterministic layer, per proposer run. Exported for tests and offline replay. */
export function groundCandidates(turns: Turns[], runs: unknown[]): { candidates: Candidate[][]; positional: string[] } {
  const positional = [...new Set(turns.map((t) => t.speakerRef).filter((r): r is string => POSITIONAL.test(r ?? "")))].sort();
  const pos = new Set(positional);
  const blocks = blocksByLabel(turns);
  const fullText = turns.map((t) => t.text ?? "").join("\n").replaceAll("’", "'");
  const parsed = runs.map((run) => (Array.isArray(run) ? run : []).map(readEntry).filter((e): e is Entry => e !== null));

  // A name token proposed under two different names cannot stand alone as a reference.
  const tokenOwners = new Map<string, Set<string>>();
  for (const e of parsed.flat()) for (const t of personTokens(e.name)) tokenOwners.set(t.toLowerCase(), (tokenOwners.get(t.toLowerCase()) ?? new Set()).add(e.name.toLowerCase()));
  const ambiguous = new Set([...tokenOwners].filter(([, owners]) => owners.size > 1).map(([t]) => t));
  // Known person names: everything proposed, plus every non-positional speaker label.
  const known = new Set<string>([...tokenOwners.keys()]);
  for (const t of turns) if (t.speakerRef && !POSITIONAL.test(t.speakerRef)) for (const tok of personTokens(t.speakerRef)) known.add(tok.toLowerCase());

  return { positional, candidates: parsed.map((run, ri) => run.flatMap((en) => candidatesFor(turns, blocks, fullText, ambiguous, known, pos, en, ri))) };
}

/** Two pieces are independent witnesses: different quote speakers AND opposite sides of the block (host + cohost are one handover). */
export function independent(a: Candidate, b: Candidate): boolean {
  return a.turnIdx !== b.turnIdx && a.speaker !== b.speaker && a.side !== b.side && a.side !== "inside" && b.side !== "inside";
}

/**
 * Ground, verify and resolve. `verifier` answers the non-self-intro question; without one only self-introductions ship.
 * Offline replays pass an oracle or a pessimist verifier; production passes `llmVerifier(complete)`.
 */
export async function groundSpeakerProposals(turns: Turns[], runs: unknown[], verifier?: SpeakerVerifier, cfg: GroundConfig = {}): Promise<{ resolved: ResolvedSpeaker[]; unresolved: string[] }> {
  const mode: Corroboration = cfg.corroboration ?? "independent-pair";
  const { candidates, positional } = groundCandidates(turns, runs);

  // Vote keyed on (label, name): proposed with a grounded candidate in >= 2 runs.
  const votes = new Map<string, Set<number>>();
  for (const [ri, run] of candidates.entries()) for (const c of run) { const key = `${c.label}|${c.name.toLowerCase()}`; votes.set(key, (votes.get(key) ?? new Set()).add(ri)); }
  const voted = (c: Candidate): boolean => (votes.get(`${c.label}|${c.name.toLowerCase()}`)?.size ?? 0) >= AGREEMENT_THRESHOLD;
  const unique = new Map<string, Candidate>();
  for (const c of candidates.flat()) if (voted(c)) unique.set(`${c.label}|${c.name}|${c.turnIdx}|${c.block.startTurnIndex}`, c);
  const all = [...unique.values()];

  const byPair = new Map<string, Candidate[]>();
  for (const c of all) byPair.set(`${c.label}|${c.name}`, [...(byPair.get(`${c.label}|${c.name}`) ?? []), c]);
  const verified = new Set<Candidate>();
  const cache = new Map<string, boolean>();
  const verify = async (c: Candidate): Promise<boolean> => {
    if (!verifier) return false;
    const key = `${c.label}|${c.name}|${c.turnIdx}|${c.block.startTurnIndex}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let yes = 0, no = 0;
    for (let framing = 0; framing < VERIFIER_FRAMINGS; framing++) {
      let verdict = "unsure";
      try { verdict = (await verifier({ label: c.label, name: c.name, quote: c.quote, quoteTurnId: c.turnId, blockStart: c.block.startTurnIndex, blockEnd: c.block.endTurnIndex, window: buildVerifierWindow(turns, c.block.startTurnIndex, c.block.endTurnIndex, c.turnIdx), framing })).verdict; } catch { verdict = "unsure"; }
      if (verdict === "yes") yes++; else if (verdict === "no") no++;
    }
    const ok = yes >= 2 && no === 0;
    cache.set(key, ok);
    return ok;
  };
  const corroborated = (others: Candidate[]): boolean => (mode === "single-verified" ? others.length >= 1 : others.some((a) => others.some((b) => independent(a, b))));
  for (const cands of byPair.values()) {
    const others = cands.filter((c) => c.kind !== "self-intro");
    for (const s of cands.filter((c) => c.kind === "self-intro")) verified.add(s);
    if (!corroborated(others)) continue;                                           // do not spend verifier calls on pairs that cannot ship
    for (const c of others) if (await verify(c)) verified.add(c);
  }

  const claims = new Map<string, Map<string, Candidate[]>>();
  for (const [key, cands] of byPair) {
    const good = cands.filter((c) => verified.has(c));
    const others = good.filter((c) => c.kind !== "self-intro");
    if (!(good.some((c) => c.kind === "self-intro") || corroborated(others))) continue;
    const [label, name] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
    const byName = claims.get(label) ?? new Map<string, Candidate[]>();
    byName.set(name, good);
    claims.set(label, byName);
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
    if (collides(speakerRef, displayName)) continue;                               // the same person is plausibly another label
    if (bound.some((g) => (labelsByTurn.get(g.turnId)?.size ?? 0) > 1)) continue;  // one quote turn binds one label
    const ordered = [...bound].sort((a, b) => a.turnIdx - b.turnIdx);
    const scope = [...new Map(ordered.map((g) => [g.block.startTurnIndex, g.block])).values()].sort((a, b) => a.startTurnIndex - b.startTurnIndex);
    const provenance: SpeakerProvenance[] = ordered.map((g) => ({ turnId: g.turnId, evidenceQuote: g.quote, evidenceKind: g.kind }));
    const evidence = [...new Map(ordered.map((g) => [g.turnId, { turnId: g.turnId, sessionId: g.sessionId }])).values()];
    resolved.push({ speakerRef, displayName, personId: personIdFor(displayName), evidence, blocks: scope, provenance });
  }
  resolved.sort((a, b) => a.speakerRef.localeCompare(b.speakerRef));
  const named = new Set(resolved.map((r) => r.speakerRef));
  return { resolved, unresolved: positional.filter((l) => !named.has(l)) };
}

/** Speaker identities for one session's positional labels, via the injected model `complete`. Never throws. */
export async function extractSpeakersGrounded(turns: Turns[], complete: CompleteFn, opts: { verifier?: SpeakerVerifier } & GroundConfig & SuggestOptions = {}): Promise<GroundedSpeakerResult> {
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

  const verifier = opts.verifier ?? llmVerifier(complete);
  const grounded = await groundSpeakerProposals(turns, runs, verifier, { corroboration: opts.corroboration });
  const { unresolved } = grounded;
  const confirmed = opts.confirmed ?? [];
  const resolved = dropOverriddenByConfirmed(grounded.resolved, confirmed);
  // The suggested tier (D-141): single-verified evidence, only for labels/names the auto-final path did not already name.
  let suggested: SuggestedSpeaker[] | undefined;
  if (opts.suggest === true) {
    const single = await groundSpeakerProposals(turns, runs, verifier, { corroboration: "single-verified" });
    const confirmedLabels = new Set(confirmed.map((c) => c.speakerRef));
    suggested = selectSuggestions(single.resolved, resolved, opts.rejected ?? []).filter((s) => !confirmedLabels.has(s.speakerRef));
  }
  let reason: string | null = null;
  if (failures.length > 0 || junk > 0) {
    reason = `${failures.length + junk} of ${AGREEMENT_RUNS} speaker run(s) failed`;
    if (failures.length > 0) reason += `: ${failures[0]}`;
    if (junk > 0) reason += `; ${junk} run(s) returned junk`;
  }
  return { resolved, unresolved, degraded: reason ? { reason } : null, ...(suggested ? { suggested } : {}) };
}

/**
 * Pure: which single-verified identities are shipped as SUGGESTIONS. Never a label or name the auto-final path already
 * resolved, never a (label, person) a human rejected, and always with its quote and kind (no provenance, no suggestion).
 */
export function selectSuggestions(single: ResolvedSpeaker[], final: ResolvedSpeaker[], rejected: readonly RejectedSuggestion[]): SuggestedSpeaker[] {
  const finalLabels = new Set(final.map((f) => f.speakerRef));
  const finalPeople = new Set(final.map((f) => f.personId));
  const out: SuggestedSpeaker[] = [];
  for (const s of single) {
    if (finalLabels.has(s.speakerRef) || finalPeople.has(s.personId)) continue;
    if (rejected.some((r) => r.speakerRef === s.speakerRef && r.personId === s.personId)) continue;
    if (!s.provenance || s.provenance.length === 0) continue;
    out.push({ ...s, provenance: s.provenance as SpeakerProvenance[] });
  }
  return out;
}
