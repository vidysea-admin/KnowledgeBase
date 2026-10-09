export const gapStatuses = ["open", "received", "expired"] as const;
export type GapStatus = typeof gapStatuses[number] | "unknown";
export interface RecordedText { state: "recorded" | "missing" | "invalid"; value?: string }
export interface RecordedDate extends RecordedText { milliseconds?: number }
export interface GapView {
  id: string; kind: string; rawStatus: string; status: GapStatus; description: RecordedText;
  requestedFrom: RecordedText; requestedAt: RecordedDate; dueAt: RecordedDate; sourceRef: RecordedText;
}
export interface GapFilters { status: GapStatus | "all"; kind: string; query: string }
export const emptyGapFilters: GapFilters = { status: "all", kind: "", query: "" };
function text(value: unknown): RecordedText {
  if (value === undefined) return { state: "missing" };
  return typeof value === "string" && value.length > 0 ? { state: "recorded", value } : { state: "invalid" };
}
export function recordedDate(value: unknown): RecordedDate {
  if (value === undefined) return { state: "missing" };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return { state: "invalid" };
  const milliseconds = Date.parse(value), day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(milliseconds) || !Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)) return { state: "invalid" };
  return { state: "recorded", value, milliseconds };
}
/** Consumer-local projection of the real complete GET /gaps envelope; no extra API or write. */
export function readGaps(response: unknown): GapView[] {
  if (!response || typeof response !== "object" || !Array.isArray((response as { gaps?: unknown }).gaps)) throw new Error("Invalid gaps response");
  const ids = new Set<string>();
  return (response as { gaps: unknown[] }).gaps.map(value => {
    if (!value || typeof value !== "object") throw new Error("Invalid gap record");
    const row = value as Record<string, unknown>;
    if (typeof row._id !== "string" || !row._id || ids.has(row._id) || typeof row.kind !== "string" || !row.kind || typeof row.status !== "string" || !row.status) throw new Error("Invalid gap record");
    ids.add(row._id);
    const status: GapStatus = gapStatuses.includes(row.status as typeof gapStatuses[number]) ? row.status as GapStatus : "unknown";
    const sla = row.sla;
    const dueAt = sla === undefined ? recordedDate(undefined) : sla && typeof sla === "object" && !Array.isArray(sla) ? recordedDate((sla as { dueAt?: unknown }).dueAt) : recordedDate(null);
    return { id: row._id, kind: row.kind, rawStatus: row.status, status, description: text(row.description), requestedFrom: text(row.requestedFrom), requestedAt: recordedDate(row.requestedAt), dueAt, sourceRef: text(row.sourceRef) };
  });
}
export function gapsModel(gaps: readonly GapView[], filters: GapFilters, now: number) {
  if (!Number.isFinite(now) || !["all", ...gapStatuses, "unknown"].includes(filters.status)) throw new Error("Invalid dashboard filter");
  const counts = { open: 0, received: 0, expired: 0, unknown: 0 };
  const kinds = new Map<string, number>();
  let overdue = 0, openDated = 0, openDueMissing = 0, openDueInvalid = 0;
  for (const gap of gaps) {
    counts[gap.status]++; kinds.set(gap.kind, (kinds.get(gap.kind) ?? 0) + 1);
    if (gap.status === "open") {
      if (gap.dueAt.state === "recorded") { openDated++; if (gap.dueAt.milliseconds! < now) overdue++; }
      else if (gap.dueAt.state === "missing") openDueMissing++; else openDueInvalid++;
    }
  }
  const query = filters.query.trim().toLowerCase();
  const visible = gaps.filter(gap => (filters.status === "all" || gap.status === filters.status) && (!filters.kind || gap.kind === filters.kind)
    && [gap.id, gap.kind, gap.rawStatus, gap.description.value, gap.requestedFrom.value, gap.sourceRef.value].some(value => typeof value === "string" && value.toLowerCase().includes(query)));
  return { total: gaps.length, counts, kinds: [...kinds].sort(([a], [b]) => a.localeCompare(b)), visible, overdue, openDated, openDueMissing, openDueInvalid, observedAt: new Date(now).toISOString() };
}
