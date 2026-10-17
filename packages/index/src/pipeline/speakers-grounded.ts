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
import { POSITIONAL, groundCandidates, independent, tokenOverlap, type Candidate, type EvidenceKind } from "./speaker-rules/speakers-grounding.js";
import { llmVerifier, VERIFIER_FRAMINGS, buildVerifierWindow, type SpeakerVerifier } from "./speakers-verifier.js";


export { EVIDENCE_KINDS, MAX_DISTANCE, groundCandidates, independent, normalizeLabel, normalizeWithMap, otherNamesIn, type Candidate, type EvidenceKind } from "./speaker-rules/speakers-grounding.js";
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

const AGREEMENT_RUNS = 3;
const AGREEMENT_THRESHOLD = 2;
const MAX_SESSION_CHARS = 600_000;

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
