import { apiFetch } from "./client.js";

/** POST /calendar/send-now (scope `send-now`, tenant from the key). Body is exactly { meetingUrl, until }; nothing else is ever sent. */
export interface SendNowAccepted { jobId: string; status: string }
export function sendBotNow(apiKey: string | null, meetingUrl: string, until: string): Promise<SendNowAccepted> {
  return apiFetch<SendNowAccepted>("/calendar/send-now", apiKey, { method: "POST", body: { meetingUrl, until } });
}

export interface SendNowStatus { jobId: string; status: "launching" | "running" | "not-running"; joined: "unknown" }
export const SEND_NOW_JOB_ID = /^send-now-\d{14}-[0-9a-f]{6}$/;
/** Status measures recorder process liveness, never meeting admission. Reject malformed replies. */
export async function getSendNowStatus(apiKey: string | null, jobId: string): Promise<SendNowStatus> {
  if (!SEND_NOW_JOB_ID.test(jobId)) throw new Error("invalid send-now job id");
  const v = await apiFetch<SendNowStatus>(`/calendar/send-now/${encodeURIComponent(jobId)}`, apiKey);
  if (!v || v.jobId !== jobId || !["launching", "running", "not-running"].includes(v.status) || v.joined !== "unknown") {
    throw new Error("invalid send-now status response");
  }
  return v;
}
