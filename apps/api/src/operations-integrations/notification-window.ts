import type { NotificationsResponse } from "../activity-health/notifications.js";
export interface NotificationWindow { returned: number; truncated: boolean; bySource: Record<"upload-queue" | "provider-jobs" | "watcher" | "file-queue", number>; unavailable: string[] }
/** Counts only accepted producer rows; raw notification titles/details/IDs never enter the email payload. */
export function notificationWindow(raw: NotificationsResponse): NotificationWindow {
  if (!raw || !Array.isArray(raw.notifications) || raw.limit !== 50 || raw.notifications.length > 50 || typeof raw.truncated !== "boolean" || !raw.sources || typeof raw.sources !== "object") throw new Error("Invalid notifications snapshot");
  const bySource: NotificationWindow["bySource"] = { "upload-queue": 0, "provider-jobs": 0, watcher: 0, "file-queue": 0 };
  const keys = ["uploadQueue", "providerJobs", "watcher", ...(raw.sources.fileQueue === undefined ? [] : ["fileQueue"])];
  const unavailable: string[] = [];
  for (const key of keys) {
    const value = raw.sources[key as keyof typeof raw.sources]; if (value !== "ok" && value !== "unavailable") throw new Error("Invalid source state"); if (value === "unavailable") unavailable.push(key);
  }
  const seen = new Set<string>();
  for (const row of raw.notifications) {
    if (!row || typeof row.id !== "string" || !row.id || seen.has(row.id) || !Object.hasOwn(bySource, row.source) || row.severity !== "error") throw new Error("Invalid notification");
    seen.add(row.id); bySource[row.source]++;
  }
  return { returned: raw.notifications.length, truncated: raw.truncated, bySource, unavailable };
}
