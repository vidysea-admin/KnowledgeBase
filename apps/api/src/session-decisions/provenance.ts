import { createHash } from "node:crypto";
import type { Turns } from "@lkb/core";

export const isDecisionIdentity = (value: unknown): value is string => typeof value === "string" && value.length > 0
  && value.length <= 200 && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);

/** Bind generation to the exact cited source, without copying raw source extras into a row. */
export function decisionSourceDigest(tenantId: string, sessionId: string, turns: readonly Turns[], ids: readonly string[]): string | null {
  if (!isDecisionIdentity(tenantId) || !isDecisionIdentity(sessionId) || !ids.length || ids.some((id) => !isDecisionIdentity(id))) return null;
  const wanted = [...new Set(ids)].sort(), source: unknown[][] = [];
  for (const id of wanted) {
    const matches = turns.filter((t) => t && t._id === id);
    if (matches.length !== 1) return null;
    const t = matches[0]!;
    if (t.tenantId !== tenantId || t.sessionId !== sessionId || !isDecisionIdentity(t.speakerRef)
      || typeof t.text !== "string" || !t.text.trim() || !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd)
      || t.tStart < 0 || t.tEnd < t.tStart
      || (t.speakerLabel !== undefined && typeof t.speakerLabel !== "string")
      || (t.occurredAt !== undefined && typeof t.occurredAt !== "string")) return null;
    source.push([id, t.text, t.speakerRef, t.speakerLabel ?? null, t.occurredAt ?? null, t.tStart, t.tEnd]);
  }
  return createHash("sha256").update(JSON.stringify(["decision-source-v1", tenantId, sessionId, source])).digest("hex");
}
