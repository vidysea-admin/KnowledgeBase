import { listSessions, getSession } from "../../api/sessions.js";
import { listGaps } from "../../api/gaps.js";
import { listJobs } from "../../api/jobs.js";
import { loadGraph } from "../../api/graph.js";
import { ApiError } from "../../api/client.js";
import type { SessionDetailRow } from "./analyticsModel.js";

/** Newest sessions whose detail (claims, turns) is fetched; the page states this sample size. */
export const DETAIL_SAMPLE = 10;
export type Part<T> = { ok: true; value: T } | { ok: false; message: string };
export interface AnalyticsData {
  sessions: Part<unknown>;
  details: Part<{ rows: SessionDetailRow[]; failed: number }>;
  graph: Part<unknown>; gaps: Part<unknown>; jobs: Part<{ jobs: unknown; truncated: boolean; limit: number }>;
}
function fail(what: string, error: unknown): { ok: false; message: string } {
  return { ok: false, message: error instanceof ApiError && error.status === 403 ? `This API key lacks permission to read ${what}.` : `Unable to load ${what}.` };
}
async function part<T>(what: string, run: () => Promise<T>): Promise<Part<T>> {
  try { return { ok: true, value: await run() }; } catch (error) { return fail(what, error); }
}
/** Read-only: GET /sessions, /sessions/:id (newest few), /graph, /gaps, /jobs. Tenant scope comes from the API key only. */
export async function loadAnalytics(apiKey: string): Promise<AnalyticsData> {
  const sessions = await part("sessions", async () => (await listSessions(apiKey)).sessions as unknown);
  const details: Promise<AnalyticsData["details"]> = sessions.ok
    ? part("session details", async () => {
      const list = Array.isArray(sessions.value) ? sessions.value as { _id?: unknown; date?: unknown }[] : [];
      const newest = list.filter(s => typeof s?._id === "string").sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, DETAIL_SAMPLE);
      const settled = await Promise.allSettled(newest.map(s => getSession(apiKey, s._id as string)));
      const rows = settled.flatMap((r, i) => r.status === "fulfilled" ? [{ sessionId: newest[i]!._id as string, claims: r.value.claims, turns: r.value.turns }] : []);
      return { rows, failed: settled.length - rows.length };
    })
    : Promise.resolve({ ok: false, message: "Unable to load session details." });
  const [d, graph, gaps, jobs] = await Promise.all([
    details, part("the graph", () => loadGraph(apiKey) as Promise<unknown>), part("knowledge gaps", async () => (await listGaps(apiKey)).gaps as unknown),
    part("provider jobs", async () => { const r = await listJobs(apiKey, 50); return { jobs: r.jobs as unknown, truncated: r.truncated, limit: r.limit }; }),
  ]);
  return { sessions, details: d, graph, gaps, jobs };
}
