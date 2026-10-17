import { apiFetch, ApiError } from "./client.js";

export interface ProviderJobSummary {
  _id: string;
  kind: string;
  status: "pending" | "processing" | "done" | "failed";
  createdAt: string;
  provider?: string;
  updatedAt?: string;
}

export interface JobsReadResponse {
  jobs: ProviderJobSummary[];
  limit: number;
  truncated: boolean;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dateTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! &&
    Number(value.slice(11, 13)) <= 23 && Number(value.slice(14, 16)) <= 59 && Number(value.slice(17, 19)) <= 59 && Number.isFinite(Date.parse(value));
}

function summary(value: unknown): value is ProviderJobSummary {
  if (!object(value) || !["_id", "kind", "status", "createdAt"].every((key) => Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !["_id", "kind", "status", "createdAt", "provider", "updatedAt"].includes(key))) return false;
  return typeof value._id === "string" && typeof value.kind === "string" && value.kind.trim().length > 0 &&
    typeof value.status === "string" && ["pending", "processing", "done", "failed"].includes(value.status) && dateTime(value.createdAt) &&
    (!Object.hasOwn(value, "provider") || typeof value.provider === "string") && (!Object.hasOwn(value, "updatedAt") || dateTime(value.updatedAt));
}

export async function listJobs(apiKey: string | null, limit = 50): Promise<JobsReadResponse> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, "Invalid jobs limit.");
  const response = await apiFetch<unknown>(`/jobs?limit=${limit}`, apiKey);
  if (!object(response) || Object.keys(response).sort().join(",") !== "jobs,limit,truncated" ||
    !Array.isArray(response.jobs) || response.limit !== limit || typeof response.truncated !== "boolean" ||
    response.jobs.length > limit || (response.truncated && response.jobs.length !== limit) || !response.jobs.every(summary)) {
    throw new ApiError(503, "Invalid provider audit response.");
  }
  return response as unknown as JobsReadResponse;
}
