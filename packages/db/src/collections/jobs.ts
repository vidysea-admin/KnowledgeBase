// T-057: standard application provider-audit records, not the dedicated upload queue.
import type { Jobs } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export interface ProviderJobSummary {
  _id: string;
  kind: string;
  status: Jobs["status"];
  createdAt: string;
  provider?: string;
  updatedAt?: string;
}
export interface JobsReadResponse {
  jobs: ProviderJobSummary[];
  limit: number;
  truncated: boolean;
}

export function jobs(tenantId: string, db: Db = getDb()) {
  return scopedCollection<Jobs>(db, "jobs")(tenantId);
}

// No payload/tenant/cost/lease fields can be requested by this metadata reader.
const projection = { _id: 1, kind: 1, status: 1, provider: 1, createdAt: 1, updatedAt: 1 };

function dateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, y, m, d, hh, mm, ss, tzH, tzM] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! &&
    Number(hh) <= 23 && Number(mm) <= 59 && Number(ss) <= 59 &&
    Number(tzH ?? 0) <= 23 && Number(tzM ?? 0) <= 59 && Number.isFinite(Date.parse(value));
}

function summary(value: unknown): ProviderJobSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid jobs metadata");
  const row = value as Record<string, unknown>;
  if (typeof row._id !== "string" || typeof row.kind !== "string" || row.kind.length === 0 ||
      !["pending", "processing", "done", "failed"].includes(row.status as string) || !dateTime(row.createdAt) ||
      (row.provider !== undefined && typeof row.provider !== "string") ||
      (row.updatedAt !== undefined && !dateTime(row.updatedAt))) throw new Error("Invalid jobs metadata");
  const result: ProviderJobSummary = {
    _id: row._id, kind: row.kind, status: row.status as Jobs["status"], createdAt: row.createdAt,
  };
  if (row.provider !== undefined) result.provider = row.provider as string;
  if (row.updatedAt !== undefined) result.updatedAt = row.updatedAt as string;
  return result;
}

/** A bounded, tenant-scoped metadata page. The observed extra row only proves truncation. */
export async function listJobs(tenantId: string, limit = 50, db?: Db): Promise<JobsReadResponse> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid jobs limit");
  const rows = await jobs(tenantId, db).find({}).project<ProviderJobSummary>(projection)
    .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
  // Validate the extra row too: malformed fetched data must never appear healthy.
  const metadata = rows.map(summary);
  return { jobs: metadata.slice(0, limit), limit, truncated: metadata.length > limit };
}
