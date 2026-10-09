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
import { runtimeChronologicalTurns, runtimeWindows, runtimeComplete, runtimeRecord, runtimeArray, assertRuntimeCoverage, runtimeInventory, runtimeEvidence, runtimeExtractive, runtimeEvidenceOrigin, runtimeDigest, runtimeJudge, type RuntimeEvidence, type RuntimeOrigin } from "./grounded.js";

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
}

export async function extractClaims(turns: Turns[], complete: ClaimsCompleteFn, options: { strictWebinar?: boolean } = {}): Promise<ClaimsResult> {
  if (options.strictWebinar) {
    try { return { claims: await strictRuntimeClaims(turns, complete), degraded: null }; }
    catch (error) { return { claims: [], degraded: { reason: `strict grounded claims incomplete: ${error instanceof Error ? error.message : String(error)}` } }; }
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

async function strictRuntimeClaims(turns: Turns[], complete: ClaimsCompleteFn): Promise<ExtractedClaim[]> {
  turns = runtimeChronologicalTurns(turns);
  const result = new Map<string, ExtractedClaim>();
  for (const spans of runtimeWindows(turns)) {
    const raw = runtimeRecord(await runtimeComplete(complete, "claims",
      'Read ALL supplied source spans; return {processed:exact inventory,claims:[{text,origin:speaker-statement|screen-ocr|visual-observation,verification:"unverified",evidence:[{turnId,sessionId,quote}]}]}. Extract atomic factual source statements only. Text equals literal evidence quotes joined by newline, and every quote lies entirely inside a submitted span. Preserve unverified screen origin. Return claims:[] only if no factual claim exists; no made-up facts or speaker identities.',
      { phase: "extract-claims", spans, inventory: runtimeInventory(spans) }));
    assertRuntimeCoverage(raw.processed, spans);
    const proposed = runtimeArray(raw.claims).map((entry) => {
      const c = runtimeRecord(entry), evidence = runtimeEvidence(c.evidence, turns, spans), origin = runtimeEvidenceOrigin(evidence, turns);
      if (c.origin !== origin || c.verification !== "unverified") throw new Error("claim source origin mismatch");
      return { id: runtimeDigest(["claim", evidence]), text: runtimeExtractive(c.text, evidence), origin, verification: "unverified" as const, evidence };
    });
    if (new Set(proposed.map((c) => c.id)).size !== proposed.length) throw new Error("duplicate proposed claim");
    await runtimeJudge(complete, "claims", turns, spans, proposed);
    for (const c of proposed) result.set(c.id, { text: c.text, evidenceTurnIds: c.evidence.map((e) => e.turnId), evidence: c.evidence, origin: c.origin, verification: c.verification });
  }
  return [...result.values()];
}
