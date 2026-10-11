/**
 * packages/core/src/job-queue/queue-payload.ts — T-050 slice 4a, fix cycle 1. Payload equality for idempotent enqueue.
 * Two payloads are equal iff their canonical JSON is byte-equal: object keys sorted recursively, arrays keep their order,
 * numbers/strings/booleans/null as JSON.stringify writes them. Key order of objects therefore never matters.
 */
export function canonicalQueuePayload(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalQueuePayload).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canonicalQueuePayload(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
