import { Router } from "express";
import { requireScope } from "../auth.js";

export interface ProviderJobSummary {
  _id: string;
  kind: string;
  status: "pending" | "processing" | "done" | "failed";
  createdAt: string;
  provider?: string;
  updatedAt?: string;
}
export interface JobsReadResponse { jobs: ProviderJobSummary[]; limit: number; truncated: boolean }
export interface JobsReadDeps { listJobs(tenantId: string, limit: number): Promise<JobsReadResponse> }

export function assertJobsLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid jobs limit");
}

function dateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match;
  const y = Number(year), m = Number(month);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return m >= 1 && m <= 12 && Number(day) >= 1 && Number(day) <= days[m - 1]! &&
    Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 &&
    (offsetHour === undefined || Number(offsetHour) < 24 && Number(offsetMinute) < 60);
}

/** Project at both boundaries; never serialize a provider document or its error payload. */
export function projectJobSummary(value: unknown): ProviderJobSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid job summary");
  const row = value as Record<string, unknown>;
  if (typeof row._id !== "string" || typeof row.kind !== "string" || !row.kind.trim() ||
      !["pending", "processing", "done", "failed"].includes(row.status as string) || !dateTime(row.createdAt) ||
      row.provider !== undefined && typeof row.provider !== "string" ||
      row.updatedAt !== undefined && !dateTime(row.updatedAt)) throw new Error("Invalid job summary");
  const result: ProviderJobSummary = {_id: row._id, kind: row.kind, status: row.status as ProviderJobSummary["status"], createdAt: row.createdAt};
  if (row.provider !== undefined) result.provider = row.provider as string;
  if (row.updatedAt !== undefined) result.updatedAt = row.updatedAt as string;
  return result;
}

export function createJobsRouter(deps: JobsReadDeps): Router {
  const router = Router();
  router.get("/jobs", requireScope("jobs"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const params = new URL(req.originalUrl, "http://localhost").searchParams;
    const raw = params.get("limit");
    const body = req.body as unknown;
    if ([...params.keys()].some(key => key !== "limit") || params.getAll("limit").length > 1 ||
        Object.keys(req.query).some(key => key !== "limit") ||
        req.query.limit !== undefined && typeof req.query.limit !== "string" ||
        raw !== null && (!/^[1-9][0-9]{0,2}$/.test(raw) || Number(raw) > 100) ||
        body !== undefined && (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0)) {
      res.status(400).json({error: "invalid_jobs_query", message: "Invalid jobs query"}); return;
    }
    const limit = raw === null ? 50 : Number(raw);
    try {
      if (typeof req.auth?.tenantId !== "string" || !req.auth.tenantId.trim()) throw new Error("Missing verified tenant");
      const result = await deps.listJobs(req.auth.tenantId, limit);
      if (!result || result.limit !== limit || typeof result.truncated !== "boolean" || !Array.isArray(result.jobs) ||
          result.jobs.length > limit || result.truncated && result.jobs.length !== limit) throw new Error("Invalid jobs response");
      res.status(200).json({jobs: result.jobs.map(projectJobSummary), limit, truncated: result.truncated});
    } catch { res.status(503).json({error: "jobs_unavailable", message: "Provider audit jobs are unavailable"}); }
  });
  return router;
}
