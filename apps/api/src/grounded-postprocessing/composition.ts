import { createLlmNoteJudge, type SummarizeCompleteFn } from "@lkb/index";
import type { IndexSessionDeps } from "../indexing/session.js";

export interface GroundedPostProcessingOptions {
  strictWebinar?: boolean;
  groundedNotes: boolean;
  judgeMaxCostUsd?: number;
}

/** Shared environment policy for the normal producer and transactional review refresh. */
export function readGroundedJudgeCostLimit(env: Record<string, string | undefined>): number | undefined {
  const raw = env.KB_NOTE_JUDGE_MAX_USD?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Explicit grounded-note opt-in selects the complete strict producer, including Q&A.
 * Without it, retain the caller's legacy/strict choice and bind no additional judge. */
export function composeGroundedPostProcessing(
  complete: SummarizeCompleteFn,
  options: GroundedPostProcessingOptions,
): Pick<IndexSessionDeps, "strictWebinar" | "dropUnverified" | "noteJudge" | "judgeMaxCostUsd"> {
  if (!options.groundedNotes) return { strictWebinar: options.strictWebinar };
  return {
    strictWebinar: true,
    dropUnverified: true,
    noteJudge: createLlmNoteJudge(complete),
    judgeMaxCostUsd: options.judgeMaxCostUsd,
  };
}
