import { apiFetch } from "./client.js";

/** POST /calendar/send-now (scope `send-now`, tenant from the key). Body is exactly { meetingUrl, until }; nothing else is ever sent. */
export interface SendNowAccepted { jobId: string; status: string }
export function sendBotNow(apiKey: string | null, meetingUrl: string, until: string): Promise<SendNowAccepted> {
  return apiFetch<SendNowAccepted>("/calendar/send-now", apiKey, { method: "POST", body: { meetingUrl, until } });
}
