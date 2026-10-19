/**
 * packages/index/src/pipeline/claims.ts — real claim extraction, the other half of the
 * "make ingested content searchable" pipeline `summarize.ts` starts. `config/ai-routing.yaml`
 * already declares a `claims` jobKind; this is its first real implementation.
 *
 * The hard rule this module exists to enforce (ARCHITECTURE H-provenance, the AI-engineer
 * pipeline design's "no fact without citation"): a claim's evidence must cite REAL turn ids that
 * really exist in the session's own transcript. The LLM is asked to cite `turnId`s, but its
 * output is NEVER trusted blind — `extractClaims` cross-checks every cited id against the real
 * `turns` passed in and drops any claim whose evidence doesn't survive that check (including
 * dropping the claim entirely if it ends up with zero real evidence, since `claims.schema.json`
 * requires `evidence.minItems: 1` — no claim ships with fabricated or empty evidence).
 */
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";
import { resolveEvidence, extractiveText } from "./notes/evidence.js";
import { runtimeVerdicts, verdictPasses } from "./grounded.js";
import { lexicalHits, settleDrop, type DroppedNote } from "./notes/drop-mode.js";
import { makeJudgeContext, judgeCandidates, type JudgeContext, type JudgeSidecar, type NoteJudge } from "./notes/judge.js";
import { runtimeChronologicalTurns, runtimeWindows, runtimeComplete, runtimeRecord, runtimeArray, assertRuntimeCoverage, runtimeInventory, runtimeEvidence, runtimeExtractive, runtimeEvidenceOrigin, runtimeDigest, runtimeJudge, withWindowRetry, rejectedFeedback, QUOTE_RULE, type RuntimeEvidence, type RuntimeOrigin } from "./grounded.js";

export type ClaimsCompleteFn = (job: Job) => Promise<CompleteResult>;

export interface ExtractedClaim {
  text: string;
  /** Real `turns._id` values, already verified to exist in the session's transcript. */
  evidenceTurnIds: string[];
  evidence?: RuntimeEvidence[];
  origin?: RuntimeOrigin;
  verification?: "unverified";
}

const CLAIMS_SYSTEM_PROMPT = [
  "You extract atomic, verifiable factual claims from a transcript for a searchable knowledge",
  "base. Each line below is one turn, prefixed with its real turn id and speaker. A claim is one",
  "self-contained fact someone could look up or cite later -- never invent a claim the transcript",
  "does not actually support.",
  'Respond with ONLY a JSON array: [{"text": "<the claim, one sentence>",',
  '"turnIds": ["<the exact turn id(s) from the transcript that support this claim>"]}, ...].',
  "Every turnId you cite MUST be copied exactly from the transcript's [id:...] prefixes -- never",
  "invent one. If the transcript supports no clear factual claims, respond with an empty array [].",
].join(" ");

function buildCitableTranscript(turns: Turns[]): string {
  return turns.map((t) => `[id:${t._id}] [${t.speakerRef}] ${t.text}`).join("\n");
}

interface RawClaim {
  text?: unknown;
  turnIds?: unknown;
}

/** Real claims from real turns, via the injected LLM `complete`. Never throws — a rejected
 * `complete()` call or an unparseable response degrades to an empty array (an honest "no claims
 * extracted yet", never a fabricated one). Every returned claim's `evidenceTurnIds` is a
 * verified-real subset of the input `turns`' ids; a claim with zero surviving real ids is
 * dropped entirely rather than shipped with empty evidence. */
/**
 * The result of an extraction attempt.
 *
 * `claims: []` used to be returned for BOTH "the transcript genuinely contains no citable claims"
 * and "the provider call failed" — indistinguishable to the caller. That mattered more than it
 * looked: `indexSession` deletes a session's existing claims before inserting the new set, so a
 * transient provider outage during a re-index silently DESTROYED previously-extracted real claims
 * and wrote nothing back (ISS-056, checker sweep 2026-09-07). `degraded` is how the caller can
 * tell the difference and decline to replace good data with an unknown.
 */
export interface ClaimsResult {
  claims: ExtractedClaim[];
  /** `null` when extraction genuinely ran; a reason when `claims` means "unknown", not "none". */
  degraded: { reason: string } | null;
  /** Drop-unverified mode only: claims that failed verification and were NOT emitted. */
  dropped?: DroppedNote[];
  /** D-144: present when a `noteJudge` ran. */
  judgeSidecar?: JudgeSidecar;
}

export async function extractClaims(turns: Turns[], complete: ClaimsCompleteFn, options: { strictWebinar?: boolean; dropUnverified?: boolean; noteJudge?: NoteJudge; judgeMaxCostUsd?: number } = {}): Promise<ClaimsResult> {
  if (options.strictWebinar) {
    const dropped: DroppedNote[] | undefined = options.dropUnverified ? [] : undefined;
    const jc = dropped && options.noteJudge ? makeJudgeContext(options.noteJudge, { maxCostUsd: options.judgeMaxCostUsd }) : undefined;
    try { return { claims: await strictRuntimeClaims(turns, complete, dropped, jc), degraded: null, ...(dropped ? { dropped } : {}), ...(jc ? { judgeSidecar: jc.sidecar } : {}) }; }
    catch (error) { return { claims: [], degraded: { reason: `strict grounded claims incomplete: ${error instanceof Error ? error.message : String(error)}` }, ...(jc ? { judgeSidecar: jc.sidecar } : {}) }; }
  }
  if (turns.length === 0) return { claims: [], degraded: null };

  const validTurnIds = new Set(turns.map((t) => t._id));
  const transcript = buildCitableTranscript(turns);

  let raw: unknown;
  try {
    const completion = await complete({
      kind: "claims",
      messages: [
        { role: "system", content: CLAIMS_SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
    });
    raw = completion.json ?? parseJsonLoose(completion.text);
  } catch (err) {
    return { claims: [], degraded: { reason: `claims provider call failed: ${err instanceof Error ? err.message : String(err)}` } };
  }

  if (!Array.isArray(raw)) {
    return { claims: [], degraded: { reason: "claims response was not a JSON array" } };
  }

  const claims: ExtractedClaim[] = [];
  for (const entry of raw as RawClaim[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const text = entry.text;
    if (typeof text !== "string" || text.trim() === "") continue;
    const turnIds = Array.isArray(entry.turnIds) ? entry.turnIds : [];
    const evidenceTurnIds = turnIds.filter((id): id is string => typeof id === "string" && validTurnIds.has(id));
    if (evidenceTurnIds.length === 0) continue; // no fabricated/empty-evidence claims ship
    claims.push({ text, evidenceTurnIds });
  }
  return { claims, degraded: null };
}

async function strictRuntimeClaims(turns: Turns[], complete: ClaimsCompleteFn, dropped?: DroppedNote[], jc?: JudgeContext): Promise<ExtractedClaim[]> {
  turns = runtimeChronologicalTurns(turns);
  const result = new Map<string, ExtractedClaim>();
  for (const spans of runtimeWindows(turns)) {
    let mark = 0; // drop-log start of the CURRENT attempt, so a failed half rolls back only its own rejections
    const accepted = await withWindowRetry(spans, async (sp, hint) => {
      mark = dropped?.length ?? 0;
      const raw = runtimeRecord(await runtimeComplete(complete, "claims",
        'Read ALL supplied source spans; return {processed:exact inventory,claims:[{text,origin:speaker-statement|screen-ocr|visual-observation,verification:"unverified",evidence:[{turnId,sessionId,quote}]}]}. Extract atomic factual source statements only. Text equals literal evidence quotes joined by newline, and every quote lies entirely inside a submitted span. Preserve unverified screen origin. Return claims:[] only if no factual claim exists; no made-up facts or speaker identities.' + QUOTE_RULE,
        { phase: "extract-claims", spans: sp, inventory: runtimeInventory(sp), ...(hint ? { retry: hint } : {}) }));
      assertRuntimeCoverage(raw.processed, sp);
      const proposed = dropped ? dropUnverifiedClaims(runtimeArray(raw.claims), turns, sp, dropped, !!jc) : runtimeArray(raw.claims).map((entry) => {
        const c = runtimeRecord(entry), evidence = runtimeEvidence(c.evidence, turns, sp), origin = runtimeEvidenceOrigin(evidence, turns);
        if (c.origin !== origin || c.verification !== "unverified") throw new Error("claim source origin mismatch");
        return { id: runtimeDigest(["claim", evidence]), text: runtimeExtractive(c.text, evidence), origin, verification: "unverified" as const, evidence };
      });
      if (!dropped && new Set(proposed.map((c) => c.id)).size !== proposed.length) throw new Error("duplicate proposed claim");
      let accepted = proposed;
      if (dropped) {
        const verdicts = await runtimeVerdicts(complete, "claims", turns, sp, proposed);
        accepted = proposed.filter((c) => verdictPasses(verdicts.find((v) => v.id === c.id)) || (dropped.push({ what: "claim", reason: "independent judge rejected the claim", excerpt: c.text.slice(0, 120) }), false));
        if (jc) {
          const keep = await judgeCandidates(jc, turns, accepted.map((c) => ({ id: c.id, kind: "claim", note: c.text, evidence: c.evidence })));
          // D-151 (pending append): the judge AND the lexical rules both gate a claim; the sidecar records which dropped it.
          accepted = accepted.filter((c) => { const r = settleDrop(jc, keep, c.id, "claim", c.text, c.evidence, c); return r === undefined || (dropped.push({ what: "claim", reason: r, excerpt: c.text.slice(0, 120) }), false); });
        }
      } else await runtimeJudge(complete, "claims", turns, sp, proposed);
      return accepted;
    }, (parts) => parts.flat(), () => rejectedFeedback(dropped, mark));
    for (const c of accepted) result.set(c.id, { text: c.text, evidenceTurnIds: c.evidence.map((e) => e.turnId), evidence: c.evidence, origin: c.origin, verification: c.verification });
  }
  return [...result.values()];
}

function dropUnverifiedClaims(raws: unknown[], turns: Turns[], spans: ReturnType<typeof runtimeWindows>[number], dropped: DroppedNote[], judged = false) {
  const out = new Map<string, { id: string; text: string; origin: RuntimeOrigin; verification: "unverified"; evidence: RuntimeEvidence[] }>();
  for (const entry of raws) {
    const c = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? (entry as Record<string, unknown>) : undefined;
    const drop = (reason: string) => void dropped.push({ what: "claim", reason, excerpt: typeof c?.text === "string" ? c.text.slice(0, 120) : "" });
    if (!c) { drop("not an object"); continue; }
    const ev = resolveEvidence(c.evidence, turns, spans, judged ? { judged: true } : {});
    if (!ev.ok) { drop(ev.reason); continue; }
    let origin: RuntimeOrigin;
    try { origin = runtimeEvidenceOrigin(ev.evidence, turns); } catch { drop("mixed or unavailable source origin"); continue; }
    const text = extractiveText(c.text, ev);
    if (c.origin !== origin || c.verification !== "unverified") { drop("claim source origin mismatch"); continue; }
    if (text === undefined) { drop("claim text is not the verified quotes"); continue; }
    const id = runtimeDigest(["claim", ev.evidence]);
    const claim = { id, text, origin, verification: "unverified" as const, evidence: ev.evidence };
    if (ev.lexical) lexicalHits.set(claim, ev.lexical);
    out.set(id, claim);
  }
  return [...out.values()];
}
