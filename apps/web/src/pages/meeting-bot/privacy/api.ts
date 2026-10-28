import { apiFetch } from "../../../api/client.js";

export interface PrivacyCaptureRow {
  sessionId: string;
  generation: string;
  status: "joining" | "recording" | "interrupted";
  privacy: "public" | "private" | "conservative" | "unavailable";
}
export type PrivacyAction = "private-start" | "private-end";
export async function listRecordingPrivacy(apiKey: string | null): Promise<PrivacyCaptureRow[]> {
  const value = await apiFetch<{captures: unknown}>("/meeting-bot/privacy", apiKey);
  if (!value || !Array.isArray(value.captures) || value.captures.length > 100) throw new Error("Invalid recording privacy response");
  return value.captures.map((row: PrivacyCaptureRow) => {
    if (!row || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(row.sessionId ?? "") ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.generation ?? "") ||
      !["joining", "recording", "interrupted"].includes(row.status) || !["public", "private", "conservative", "unavailable"].includes(row.privacy)) {
      throw new Error("Invalid recording privacy response");
    }
    return {sessionId: row.sessionId, generation: row.generation, status: row.status, privacy: row.privacy};
  });
}
export async function changeRecordingPrivacy(apiKey: string | null, row: PrivacyCaptureRow, action: PrivacyAction): Promise<void> {
  const value = await apiFetch<{status?: unknown; action?: unknown}>(`/meeting-bot/privacy/${encodeURIComponent(row.sessionId)}`, apiKey,
    {method: "POST", body: {generation: row.generation, action}});
  if (value?.status !== "accepted" || value.action !== action) throw new Error("The recorder did not confirm privacy");
}
