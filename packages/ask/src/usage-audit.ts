import type { CompleteResult } from "@lkb/ai";
import type { AuditEntry } from "./ask-shared.js";

const validCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/** Missing prices stay absent across JSON/BSON persistence; never turn them into free calls. */
export function completionAudit(step: string, result: CompleteResult): AuditEntry {
  const entry: AuditEntry = { jobKind: `ask.${step}`, step, provider: result.provider, model: result.model };
  const priced = result.costStatus !== "unknown" && typeof result.costUsd === "number"
    && Number.isFinite(result.costUsd) && result.costUsd >= 0;
  if (priced) entry.costUsd = result.costUsd;
  // Preserve legacy audit shape for old providers; explicit accounting opts into token metadata.
  if (result.costStatus !== undefined || !priced) {
    entry.costStatus = priced ? "reported" : "unknown";
    if (validCount(result.usage.inputTokens)) entry.inputTokens = result.usage.inputTokens;
    if (validCount(result.usage.outputTokens)) entry.outputTokens = result.usage.outputTokens;
  }
  return entry;
}
