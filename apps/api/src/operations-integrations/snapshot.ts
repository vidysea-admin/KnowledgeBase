export interface ExportSession { tenantId: string; _id: string; title: string; date: string; status?: { transcribe?: unknown; index?: unknown } }
const safeState = (value: unknown) => typeof value === "string" && ["pending", "processing", "done", "failed"].includes(value) ? value : "unknown";
/** Bounded metadata export; deliberately excludes transcripts, summaries, speaker PII and raw source locations. */
export function exportSnapshot(tenant: string, input: ExportSession[], limit = 500) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Array.isArray(input) || input.length > limit + 1) throw new Error("Invalid export snapshot");
  const ids = new Set<string>();
  for (const row of input) {
    if (!row || row.tenantId !== tenant || typeof row._id !== "string" || !row._id || row._id.length > 512 || ids.has(row._id) || typeof row.title !== "string" || row.title.length > 2000 || typeof row.date !== "string" || row.date.length > 64) throw new Error("Invalid export session");
    ids.add(row._id);
  }
  const selected = input.slice(0, limit), ready = selected.filter(row => row.status?.transcribe === "done" && row.status?.index === "done").length;
  const rows = selected.map(row => [row._id, row.title, row.date, safeState(row.status?.transcribe), safeState(row.status?.index)]);
  if (Buffer.byteLength(JSON.stringify(rows), "utf8") > 1024 * 1024) throw new Error("Export snapshot too large");
  return { rows: [["Session ID", "Title", "Recorded date", "Transcription status", "Index status"], ...rows], returned: selected.length, truncated: input.length > limit, ready };
}
