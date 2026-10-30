import { apiFetch, ApiError } from "./client.js";
import type { MeetingCandidate, GmailSummary } from "./types.js";

export async function scanGmail(apiKey: string | null): Promise<{ created: number; autoApproved: number; gmailSummary?: GmailSummary }> {
  let work: string | null = null, owner: string | null = null;
  await apiFetch("/meeting-candidates", apiKey, {onResponseHeaders: headers => {
    work = headers.get("X-LKB-Work-DB"); owner = headers.get("X-LKB-Tenant");
  }});
  if (!work || !owner) throw new ApiError(503, "Gmail scan requires a configured isolated work database for this connection.");
  return apiFetch("/gmail/scan", apiKey, { method: "POST", headers: {"X-LKB-Work-DB": work} });
}

export function listMeetingCandidates(apiKey: string | null): Promise<{ candidates: MeetingCandidate[]; gmailSummary?: GmailSummary }> {
  return apiFetch("/meeting-candidates", apiKey);
}

export function approveMeetingCandidate(apiKey: string | null, id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/meeting-candidates/${encodeURIComponent(id)}/approve`, apiKey, { method: "POST" });
}

export function rejectMeetingCandidate(apiKey: string | null, id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/meeting-candidates/${encodeURIComponent(id)}/reject`, apiKey, { method: "POST" });
}
