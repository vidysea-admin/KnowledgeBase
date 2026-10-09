/**
 * packages/index/src/pipeline/summarize.ts — real session summarization, the piece
 * `config/ai-routing.yaml`'s already-declared `summarize` jobKind never had an implementation
 * for (T-002's TOC session_pages were a one-time backfill from pre-written `.md` summaries, not
 * a reusable pipeline function — confirmed by reading `scripts/seed-toc.mjs`). This is that
 * function: any ingested session's turns -> a real LLM call -> a real `session_pages`-shaped
 * result, so newly ingested content (WhatsApp, URL, anything future) gets the same treatment TOC
 * sessions already have, instead of sitting invisible to the Brain graph and `/ask`.
 *
 * Injected `CompleteFn` — no provider hardcoded, same seam every other LLM-backed module in this
 * workspace uses (`packages/ask`'s `CompleteFn`, `apps/api/src/score.ts`'s judge). Never throws:
 * an unparseable or failed completion degrades to an honest, clearly-labeled fallback summary
 * (the raw transcript's first slice) rather than crashing the ingest pipeline over it.
 */
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";
import { produceRuntimeSummary } from "./grounded-summary.js";
import type { RuntimeItem, RuntimeQA } from "./grounded.js";

export type SummarizeCompleteFn = (job: Job) => Promise<CompleteResult>;

export interface SessionSummaryResult {
  summary: string;
  keyInsights: string[];
  decisions: string[];
  actionItems: string[];
  /** Validated source-local extras; canonical evidence schemas are not rolled out. */
  citedItems?: RuntimeItem[];
  qa?: RuntimeQA[];
  coveredTurnIds?: string[];
}

/**
 * The result of a summarization attempt. Same shape as `packages/index/src/pipeline/claims.ts`'s
 * `ClaimsResult`, added for the same reason (ISS-059, the sibling of ISS-056): the labelled
 * fallback page ("(fallback, LLM summary unavailable) ...") is a legitimate first summary for a
 * session that has none yet, but it must never be allowed to REPLACE a real summary a prior
 * successful run already wrote — the caller needs to be able to tell "I have a real page" from
 * "I have nothing, fall back" apart from "I degraded", which a bare `SessionSummaryResult` cannot
 * express. `degraded` is `null` for BOTH a genuinely successful LLM call and the zero-turns
 * "(no content to summarize)" case — the latter is not a failure, it is an honest empty result.
 */
export interface SummarizeResult {
  page: SessionSummaryResult;
  /** `null` when the page is real (or genuinely empty); a reason when `page` is the fallback. */
  degraded: { reason: string } | null;
}

const SUMMARIZE_SYSTEM_PROMPT = [
  "You summarize a transcript for a searchable knowledge base. Read the transcript below (each",
  "line is one turn, prefixed with the speaker) and produce a summary of what was actually said",
  "-- never invent a fact, number, or name that does not appear in the transcript.",
  'Respond with ONLY a JSON object: {"summary": "<2-4 sentence summary>",',
  '"keyInsights": ["<insight>", ...], "decisions": ["<decision>", ...],',
  '"actionItems": ["<action item>", ...]}. Omit an array entirely (use []) if the transcript has',
  "none of that kind.",
].join(" ");

function buildTranscript(turns: Turns[]): string {
  return turns.map((t) => `[${t.speakerRef}] ${t.text}`).join("\n");
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parseSummaryResponse(text: string): SessionSummaryResult | undefined {
  const parsed = parseJsonLoose(text);
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { summary, keyInsights, decisions, actionItems } = parsed as Record<string, unknown>;
  if (typeof summary !== "string" || summary.trim() === "") return undefined;
  return {
    summary,
    keyInsights: asStringArray(keyInsights),
    decisions: asStringArray(decisions),
    actionItems: asStringArray(actionItems),
  };
}

const FALLBACK_SLICE_LENGTH = 500;

/** Real summary from real turns, via the injected LLM `complete`. Never throws — a rejected
 * `complete()` call or an unparseable response degrades to a clearly-labeled fallback (the raw
 * transcript's first slice) rather than blocking the ingest pipeline, and reports `degraded` so
 * the caller can decline to let that fallback overwrite a real prior summary (ISS-059). */
export async function summarizeSession(turns: Turns[], complete: SummarizeCompleteFn, options: { strictWebinar?: boolean } = {}): Promise<SummarizeResult> {
  if (options.strictWebinar) {
    try { return { page: await produceRuntimeSummary(turns, complete), degraded: null }; }
    catch (error) { return { page: fallbackPage(buildTranscript(turns)), degraded: { reason: `strict grounded summary incomplete: ${error instanceof Error ? error.message : String(error)}` } }; }
  }
  if (turns.length === 0) {
    return {
      page: { summary: "(no content to summarize)", keyInsights: [], decisions: [], actionItems: [] },
      degraded: null,
    };
  }

  const transcript = buildTranscript(turns);
  try {
    const completion = await complete({
      kind: "summarize",
      messages: [
        { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
    });
    const parsed = parseSummaryResponse(completion.text);
    if (parsed) return { page: parsed, degraded: null };
    return {
      page: fallbackPage(transcript),
      degraded: { reason: "summarize response had no usable summary field" },
    };
  } catch (err) {
    return {
      page: fallbackPage(transcript),
      degraded: { reason: `summarize provider call failed: ${err instanceof Error ? err.message : String(err)}` },
    };
  }
}

function fallbackPage(transcript: string): SessionSummaryResult {
  return {
    summary: `(fallback, LLM summary unavailable) ${transcript.slice(0, FALLBACK_SLICE_LENGTH)}`,
    keyInsights: [],
    decisions: [],
    actionItems: [],
  };
}
