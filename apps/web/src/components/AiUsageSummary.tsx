import type { AskResponse } from "../api/types.js";

type Entry = AskResponse["auditLog"][number];

/** Sum reported prices only; an incomplete subtotal must never read as a total bill. */
export function AiUsageSummary({ entries }: { entries: Entry[] }): React.ReactElement | null {
  const calls = entries.filter((e) => e.provider !== undefined || e.costStatus !== undefined);
  if (!calls.length) return null;
  let knownUsd = 0, knownCalls = 0, unknownCalls = 0;
  for (const entry of calls) {
    if (entry.costStatus !== "unknown" && typeof entry.costUsd === "number"
      && Number.isFinite(entry.costUsd) && entry.costUsd >= 0 && Number.isFinite(knownUsd + entry.costUsd)) {
      knownUsd += entry.costUsd; knownCalls++;
    } else unknownCalls++;
  }
  return <p className="row-meta" aria-label="AI usage">
    {unknownCalls === 0 ? `Reported AI cost: $${knownUsd.toFixed(4)}.`
      : knownCalls === 0 ? `AI cost unknown for ${unknownCalls} call(s).`
        : `Reported AI cost subtotal: $${knownUsd.toFixed(4)}; price unknown for ${unknownCalls} call(s).`}
  </p>;
}
