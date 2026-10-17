export const operationViews = ["all", "attention", "processing", "ready"] as const;
export type OperationView = typeof operationViews[number];
export const viewLabels: Record<OperationView, string> = { all: "All sessions", attention: "Needs attention", processing: "Processing", ready: "Ready" };
const states = ["pending", "processing", "done", "failed"];
export interface OperationSession { id: string; title: string; date: string; transcribe: string | null; index: string | null; category: "failed" | "unknown" | "processing" | "ready" | "pending" }
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export function readOperationSessions(raw: unknown): OperationSession[] {
  if (!object(raw) || !Array.isArray(raw.sessions)) throw new Error("Invalid sessions response");
  const ids = new Set<string>();
  return raw.sessions.map((row: unknown) => {
    if (!object(row) || typeof row._id !== "string" || !row._id || ids.has(row._id) || typeof row.title !== "string" || typeof row.date !== "string") throw new Error("Invalid session row");
    ids.add(row._id);
    const status = object(row.status) ? row.status : {};
    const transcribe = typeof status.transcribe === "string" ? states.includes(status.transcribe) ? status.transcribe : "unknown" : null;
    const index = typeof status.index === "string" ? states.includes(status.index) ? status.index : "unknown" : null;
    const category = transcribe === "failed" || index === "failed" ? "failed"
      : !states.includes(transcribe ?? "") || !states.includes(index ?? "") ? "unknown"
      : transcribe === "done" && index === "done" ? "ready"
      : transcribe === "processing" || index === "processing" ? "processing" : "pending";
    return { id: row._id, title: row.title, date: row.date, transcribe, index, category };
  });
}
export function sessionsForView(rows: OperationSession[], view: OperationView): OperationSession[] {
  return rows.filter(row => view === "all" || view === "attention" && ["failed", "unknown"].includes(row.category) || row.category === view);
}
export function readOperationView(params: URLSearchParams): { view: OperationView; invalid: boolean } {
  const values = params.getAll("view");
  const invalid = [...params.keys()].some(key => key !== "view") || values.length > 1 || values.length === 1 && !operationViews.includes(values[0] as OperationView);
  return { view: invalid ? "all" : values[0] as OperationView || "all", invalid };
}
export function explorerUrl(id: string): string { return `/explorer?${new URLSearchParams({ session: id, tab: "Overview" })}`; }
export function operationUrl(view: OperationView): string { return `/operations?${new URLSearchParams({ view })}`; }
