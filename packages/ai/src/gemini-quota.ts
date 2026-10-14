/**
 * packages/ai/src/gemini-quota.ts — ollamafirst. A typed error for the Gemini FREE-TIER quota (HTTP 429 whose
 * violation quotaId contains "FreeTier"). That response means the key's Google project is not billed for the
 * model, which no retry fixes: the fix is a billed key or project. Never carries the key or the request body.
 */
export const GEMINI_FREE_TIER_FIX =
  "the key's Google project is on the free tier for this model; use a key from a billed (paid) project, or enable billing on the project";

export class GeminiFreeTierQuotaError extends Error {
  readonly status = 429;
  constructor(public readonly quotaId: string, public readonly quotaMetric: string, public readonly detail: string) {
    super(`gemini free-tier quota exhausted (quotaId=${quotaId}, metric=${quotaMetric}): ${GEMINI_FREE_TIER_FIX}. ${detail}`);
    this.name = "GeminiFreeTierQuotaError";
  }
}

/** Returns a GeminiFreeTierQuotaError when (status, body) is a free-tier 429, otherwise undefined. */
export function detectGeminiFreeTier(status: number, body: unknown, detail = ""): GeminiFreeTierQuotaError | undefined {
  if (status !== 429) return undefined;
  const details = (body as { error?: { details?: { violations?: { quotaId?: string; quotaMetric?: string }[] }[] } } | null)
    ?.error?.details;
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    for (const v of d?.violations ?? []) {
      if (typeof v?.quotaId === "string" && /FreeTier/i.test(v.quotaId)) {
        return new GeminiFreeTierQuotaError(v.quotaId, String(v.quotaMetric ?? "unknown"), detail);
      }
    }
  }
  return undefined;
}
