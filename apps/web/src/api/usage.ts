import { apiFetch, ApiError } from "./client.js";

export interface KindFigure { total: number; errors: number; errorRate: number | null }
export interface UsageDay { day: string; ask: KindFigure; search: KindFigure }
export interface UsageResponse {
  days: number; from: string; to: string; byDay: UsageDay[];
  totals: { ask: KindFigure; search: KindFigure }; truncated: boolean;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function figure(value: unknown): value is KindFigure {
  if (!object(value) || Object.keys(value).sort().join(",") !== "errorRate,errors,total") return false;
  if (!count(value.total) || !count(value.errors) || value.errors > value.total) return false;
  return value.total === 0 ? value.errorRate === null
    : typeof value.errorRate === "number" && Math.abs(value.errorRate - value.errors / value.total) < 1e-9;
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET /usage?days=N (scope `jobs`): this tenant's /ask and /search counts per UTC day. Strictly validated: a malformed body is an error, never a figure. */
export async function getUsage(apiKey: string | null, days = 30): Promise<UsageResponse> {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new ApiError(400, "Invalid usage days.");
  const r = await apiFetch<unknown>(`/usage?days=${days}`, apiKey);
  if (!object(r) || Object.keys(r).sort().join(",") !== "byDay,days,from,to,totals,truncated" || r.days !== days ||
    typeof r.from !== "string" || typeof r.to !== "string" || !DAY.test(r.from) || !DAY.test(r.to) ||
    typeof r.truncated !== "boolean" || !Array.isArray(r.byDay) || r.byDay.length !== days ||
    !r.byDay.every((d) => object(d) && typeof d.day === "string" && DAY.test(d.day) && figure(d.ask) && figure(d.search)) ||
    !object(r.totals) || !figure(r.totals.ask) || !figure(r.totals.search)) {
    throw new ApiError(503, "Invalid usage response.");
  }
  return r as unknown as UsageResponse;
}
