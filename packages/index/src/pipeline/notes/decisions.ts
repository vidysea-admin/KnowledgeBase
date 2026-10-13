/**
 * packages/index/src/pipeline/decisions.ts — U2.5 decisions extraction, the claims.ts template with
 * a different prompt. A decision is something the participants actually resolved or agreed
 * ("we will ship on Friday"), NOT an opinion, a fact or an open question.
 *
 * Same provenance rule as claims.ts: the LLM cites turn ids, its output is never trusted blind.
 * Every cited id is cross-checked against the real `turns`; a decision with zero surviving real
 * ids is dropped (schema/decisions.schema.json requires evidence.minItems: 1). Timestamps are NOT
 * taken from the model: `tStart`/`tEnd` are derived from the cited turns' own times, so the U2.2
 * harness span check (eval/extraction.ts) can verify them. `owner` is kept only when it equals a
 * speakerRef of a cited turn; anything else is discarded rather than guessed.
 *
 * Flag: `LKB_EXTRACT_DECISIONS=1` (OFF by default). Callers that do not opt in never reach this.
 * No quality claim is made: no golden labels for decisions are adjudicated yet.
 */
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";

export type DecisionsCompleteFn = (job: Job) => Promise<CompleteResult>;

export interface ExtractedDecision {
  text: string;
  /** Real `turns._id` values, verified to exist in the session's own transcript. */
  evidenceTurnIds: string[];
  /** Span of the cited turns (min tStart, max tEnd), derived locally, never model-supplied. */
  tStart: number;
  tEnd: number;
  /** A speakerRef of one of the cited turns; omitted when the model gave none or a non-matching one. */
  owner?: string;
}

export interface DecisionsResult {
  decisions: ExtractedDecision[];
  /** `null` when extraction genuinely ran; a reason when `decisions` means "unknown", not "none". */
  degraded: { reason: string } | null;
}

/** Off unless explicitly set to "1" or "true". */
export function decisionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.LKB_EXTRACT_DECISIONS?.trim().toLowerCase();
  return v === "1" || v === "true";
}

const DECISIONS_SYSTEM_PROMPT = [
  "You extract DECISIONS from a transcript for a searchable knowledge base. A decision is something",
  "the participants explicitly resolved, agreed or committed to (a choice made, a plan adopted, an",
  "action accepted). Opinions, background facts, suggestions nobody accepted and open questions are",
  "NOT decisions. Each line below is one turn, prefixed with its real turn id and speaker.",
  'Respond with ONLY a JSON array: [{"text": "<the decision, one sentence>",',
  '"turnIds": ["<the exact turn id(s) that show the decision>"],',
  '"owner": "<optional: the speaker label who owns it, copied exactly from the transcript>"}, ...].',
  "Every turnId you cite MUST be copied exactly from the transcript's [id:...] prefixes -- never",
  "invent one. If the transcript contains no clear decision, respond with an empty array [].",
].join(" ");

interface RawDecision { text?: unknown; turnIds?: unknown; owner?: unknown }

/** Real decisions from real turns via the injected `complete`. Never throws. */
export async function extractDecisions(turns: Turns[], complete: DecisionsCompleteFn): Promise<DecisionsResult> {
  if (turns.length === 0) return { decisions: [], degraded: null };
  const byId = new Map(turns.map((t) => [t._id, t]));
  const transcript = turns.map((t) => `[id:${t._id}] [${t.speakerRef}] ${t.text}`).join("\n");

  let raw: unknown;
  try {
    const completion = await complete({
      kind: "decisions",
      messages: [
        { role: "system", content: DECISIONS_SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
    });
    raw = completion.json ?? parseJsonLoose(completion.text);
  } catch (err) {
    return { decisions: [], degraded: { reason: `decisions provider call failed: ${err instanceof Error ? err.message : String(err)}` } };
  }
  if (!Array.isArray(raw)) return { decisions: [], degraded: { reason: "decisions response was not a JSON array" } };

  const decisions: ExtractedDecision[] = [];
  for (const entry of raw as RawDecision[]) {
    if (typeof entry !== "object" || entry === null) continue;
    if (typeof entry.text !== "string" || entry.text.trim() === "") continue;
    const ids = Array.isArray(entry.turnIds) ? entry.turnIds : [];
    const evidenceTurnIds = [...new Set(ids.filter((id): id is string => typeof id === "string" && byId.has(id)))];
    if (evidenceTurnIds.length === 0) continue; // no fabricated/empty-evidence decisions ship
    const cited = evidenceTurnIds.map((id) => byId.get(id)!);
    const decision: ExtractedDecision = {
      text: entry.text,
      evidenceTurnIds,
      tStart: Math.min(...cited.map((t) => t.tStart)),
      tEnd: Math.max(...cited.map((t) => t.tEnd)),
    };
    if (typeof entry.owner === "string" && cited.some((t) => t.speakerRef === entry.owner)) decision.owner = entry.owner;
    decisions.push(decision);
  }
  return { decisions, degraded: null };
}
