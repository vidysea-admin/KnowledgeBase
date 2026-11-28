import { apiFetch } from "./client.js";

/** POST /calendar/send-now (scope `send-now`, tenant from the key). Body is exactly { meetingUrl, until }; nothing else is ever sent. */
export interface SendNowAccepted { jobId: string; status: string }
export function sendBotNow(apiKey: string | null, meetingUrl: string, until: string): Promise<SendNowAccepted> {
  return apiFetch<SendNowAccepted>("/calendar/send-now", apiKey, { method: "POST", body: { meetingUrl, until } });
}

/** yes = the bot was seen in the call; assumed = no lobby signal on a non-Meet platform; no = ended without being admitted. */
export type Joined = "yes" | "assumed" | "no" | "unknown";
const JOINED = ["yes", "assumed", "no", "unknown"];
export interface SendNowStatus { jobId: string; status: "launching" | "running" | "not-running"; joined: Joined }
export const SEND_NOW_JOB_ID = /^send-now-\d{14}-[0-9a-f]{6}$/;
/** Status measures recorder process liveness, never meeting admission. Reject malformed replies. */
export async function getSendNowStatus(apiKey: string | null, jobId: string): Promise<SendNowStatus> {
  if (!SEND_NOW_JOB_ID.test(jobId)) throw new Error("invalid send-now job id");
  const v = await apiFetch<SendNowStatus>(`/calendar/send-now/${encodeURIComponent(jobId)}`, apiKey);
  if (!v || v.jobId !== jobId || !["launching", "running", "not-running"].includes(v.status) || !JOINED.includes(v.joined)) {
    throw new Error("invalid send-now status response");
  }
  return v;
}

export type ManualJobState = "queued" | "launching" | "running" | "cancel-requested" | "cancel-acknowledged" | "cancelled" | "completed" | "failed" | "unknown";
export interface ManualJob { jobId: string; platform: string; state: ManualJobState; requestedAt: string; updatedAt: string; joined: Joined; joinedAt?: string }
const MANUAL_STATES = ["queued", "launching", "running", "cancel-requested", "cancel-acknowledged", "cancelled", "completed", "failed", "unknown"];
function manualJob(value: unknown): ManualJob {
  const v = value as ManualJob;
  if (!v || !SEND_NOW_JOB_ID.test(v.jobId) || !/^[a-z-]{1,32}$/.test(v.platform) || !MANUAL_STATES.includes(v.state) || !JOINED.includes(v.joined) ||
    typeof v.requestedAt !== "string" || typeof v.updatedAt !== "string" || !Number.isFinite(Date.parse(v.requestedAt)) || !Number.isFinite(Date.parse(v.updatedAt))) throw new Error("invalid manual job response");
  const joinedAt = (v.joined === "yes" || v.joined === "assumed") && typeof v.joinedAt === "string" && Number.isFinite(Date.parse(v.joinedAt)) ? { joinedAt: v.joinedAt } : {};
  return { jobId: v.jobId, platform: v.platform, state: v.state, requestedAt: v.requestedAt, updatedAt: v.updatedAt, joined: v.joined, ...joinedAt };
}
export async function listManualJobs(apiKey: string | null): Promise<ManualJob[]> {
  const v = await apiFetch<{ jobs: unknown[] }>("/calendar/send-now/jobs", apiKey);
  if (!v || !Array.isArray(v.jobs) || v.jobs.length > 100) throw new Error("invalid manual jobs response");
  return v.jobs.map(manualJob);
}
export async function cancelManualJob(apiKey: string | null, jobId: string): Promise<ManualJob> {
  if (!SEND_NOW_JOB_ID.test(jobId)) throw new Error("invalid manual job id");
  const job = manualJob(await apiFetch(`/calendar/send-now/jobs/${jobId}/cancel`, apiKey, { method: "POST", body: {} }));
  if (job.jobId !== jobId) throw new Error("mismatched manual job response");
  return job;
}
