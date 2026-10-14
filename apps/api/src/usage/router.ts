/**
 * apps/api/src/usage/router.ts - T-057 D4. `GET /usage?days=N`: the caller's own tenant's /ask and /search
 * usage per UTC day, from the content-free `usage_events` rows. Scope `jobs` (the same analytics/health
 * scope as /jobs, /activity-health and /watch-runs - no new scope to mint). Tenant comes only from
 * `req.auth.tenantId`; `days` is the only accepted parameter, an integer 1..90 (default 30).
 * Only counts and error rates are served - there is nothing else in the rows to serve.
 */
import { Router } from "express";
import { requireScope } from "../auth.js";
import type { UsageKind } from "./recorder.js";

export const USAGE_DEFAULT_DAYS = 30;
export const USAGE_MAX_DAYS = 90;
export interface UsageRow { day: string; kind: UsageKind; outcome: "ok" | "error" }
export interface UsageReadDeps { readUsage(tenantId: string, sinceDay: string): Promise<{ rows: unknown[]; truncated: boolean }> }
export interface KindFigure { total: number; errors: number; errorRate: number | null }
export interface UsageDay { day: string; ask: KindFigure; search: KindFigure }
export interface UsageSnapshot {
  days: number; from: string; to: string; byDay: UsageDay[]; totals: { ask: KindFigure; search: KindFigure }; truncated: boolean;
}

export const unavailableUsageReadDeps: UsageReadDeps = { async readUsage() { throw new Error("Usage unavailable"); } };

const figure = (total: number, errors: number): KindFigure => ({ total, errors, errorRate: total > 0 ? errors / total : null });
const dayString = (d: Date): string => d.toISOString().slice(0, 10);

/** Validates one stored row; anything malformed throws (the route then fails closed with 503). */
export function projectUsageRow(value: unknown): UsageRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid usage row");
  const r = value as Record<string, unknown>;
  if (typeof r.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.day) || (r.kind !== "ask" && r.kind !== "search") ||
      (r.outcome !== "ok" && r.outcome !== "error")) throw new Error("Invalid usage row");
  return { day: r.day, kind: r.kind, outcome: r.outcome };
}

/** Every day of the window appears (zeros included); rows outside the window are ignored. */
export function buildUsageSnapshot(rows: UsageRow[], days: number, today: Date, truncated: boolean): UsageSnapshot {
  const byDay: UsageDay[] = [], counts = new Map<string, { ask: [number, number]; search: [number, number] }>();
  for (let i = days - 1; i >= 0; i--) {
    const day = dayString(new Date(today.getTime() - i * 86_400_000));
    counts.set(day, { ask: [0, 0], search: [0, 0] });
  }
  for (const row of rows) {
    const slot = counts.get(row.day)?.[row.kind];
    if (slot) { slot[0]++; if (row.outcome === "error") slot[1]++; }
  }
  const totals: Record<UsageKind, [number, number]> = { ask: [0, 0], search: [0, 0] };
  for (const [day, c] of counts) {
    byDay.push({ day, ask: figure(...c.ask), search: figure(...c.search) });
    for (const k of ["ask", "search"] as const) { totals[k][0] += c[k][0]; totals[k][1] += c[k][1]; }
  }
  return { days, from: byDay[0]!.day, to: byDay[byDay.length - 1]!.day, byDay,
    totals: { ask: figure(...totals.ask), search: figure(...totals.search) }, truncated };
}

export function createUsageRouter(deps: UsageReadDeps, now: () => Date = () => new Date()): Router {
  const router = Router();
  router.get("/usage", requireScope("jobs"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const params = new URL(req.originalUrl, "http://localhost").searchParams, raw = params.get("days");
    const body: unknown = req.body;
    if ([...params.keys()].some((k) => k !== "days") || params.getAll("days").length > 1 ||
        Object.keys(req.query).some((k) => k !== "days") || req.query.days !== undefined && typeof req.query.days !== "string" ||
        raw !== null && (!/^[1-9][0-9]?$/.test(raw) || Number(raw) > USAGE_MAX_DAYS) ||
        body !== undefined && (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0)) {
      res.status(400).json({ error: "invalid_usage_query", message: "Invalid usage query" }); return;
    }
    const days = raw === null ? USAGE_DEFAULT_DAYS : Number(raw);
    try {
      if (typeof req.auth?.tenantId !== "string" || !req.auth.tenantId.trim()) throw new Error("Missing verified tenant");
      const today = now(), since = dayString(new Date(today.getTime() - (days - 1) * 86_400_000));
      const result = await deps.readUsage(req.auth.tenantId, since);
      if (!result || !Array.isArray(result.rows) || typeof result.truncated !== "boolean") throw new Error("Invalid usage response");
      res.status(200).json(buildUsageSnapshot(result.rows.map(projectUsageRow), days, today, result.truncated));
    } catch { res.status(503).json({ error: "usage_unavailable", message: "Usage analytics are unavailable" }); }
  });
  return router;
}
