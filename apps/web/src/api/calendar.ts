import { apiFetch } from "./client.js";
import type { UpcomingMeeting } from "./types.js";

export interface CalendarWorkerHealth { status: "fresh" | "stale" | "unavailable"; receivedAt?: string; checkedAt?: string; complete?: boolean }

export function listUpcomingMeetings(apiKey: string | null): Promise<{ meetings: UpcomingMeeting[]; worker?: CalendarWorkerHealth }> {
  return apiFetch("/calendar/upcoming", apiKey);
}
