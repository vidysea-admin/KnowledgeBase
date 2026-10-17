import type { SessionSummary } from "../../api/types.js";

/** Client-side Sessions Library filters (T-057 A4). Pure; operates only on rows the tenant-scoped GET /sessions already returned. */
export interface SessionFilters { month: string; status: string; org: string; participant: string }
export const NO_FILTERS: SessionFilters = { month: "", status: "", org: "", participant: "" };

/** "2026-04-21" -> "2026-04"; anything not starting YYYY-MM yields "" (never guessed). */
export function monthOf(date: unknown): string {
  return typeof date === "string" && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "";
}
export function overallStatus(s: SessionSummary): string {
  const t = s.status?.transcribe, i = s.status?.index;
  if (t === "failed" || i === "failed") return "failed";
  if (t === "done" && i === "done") return "done";
  if (t === "processing" || i === "processing") return "processing";
  return "other";
}
const uniqSorted = (xs: string[]): string[] => [...new Set(xs.filter((x) => x))].sort();
export function filterOptions(rows: SessionSummary[]): { months: string[]; orgs: string[]; participants: string[] } {
  return {
    months: uniqSorted(rows.map((r) => monthOf(r.date))).reverse(),
    orgs: uniqSorted(rows.map((r) => (typeof r.org === "string" ? r.org : ""))),
    participants: uniqSorted(rows.flatMap((r) => (Array.isArray(r.participants) ? r.participants.filter((p) => typeof p === "string") : []))),
  };
}
export function filterSessions(rows: SessionSummary[], f: SessionFilters): SessionSummary[] {
  return rows.filter((r) =>
    (!f.month || monthOf(r.date) === f.month) &&
    (!f.status || overallStatus(r) === f.status) &&
    (!f.org || r.org === f.org) &&
    (!f.participant || (Array.isArray(r.participants) && r.participants.includes(f.participant))));
}
/** Share of the supplied rows whose transcribe AND index are both "done". Not a coverage-policy figure: it is only "how many listed sessions are fully processed". */
export function processedShare(rows: SessionSummary[]): { done: number; total: number; percent: number | null } {
  const done = rows.filter((r) => overallStatus(r) === "done").length;
  return { done, total: rows.length, percent: rows.length === 0 ? null : Math.round((done / rows.length) * 100) };
}
