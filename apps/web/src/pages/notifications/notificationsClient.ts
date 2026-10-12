/**
 * T-057 D5 notification center client: strict reader for GET /notifications plus the CLIENT-SIDE-ONLY
 * read state. There is no server store for read/unread, so "read" lives in this browser localStorage
 * (keyed by notification id only) and is lost with the browser.
 */
import { apiFetch, ApiError } from "../../api/client.js";

export type NotificationSource = "upload-queue" | "provider-jobs" | "watcher";
export interface NotificationItem { id: string; source: NotificationSource; severity: "error"; title: string; detail: string | null; occurredAt: string }
export type SourceState = "ok" | "unavailable";
export interface NotificationsResponse {
  notifications: NotificationItem[]; limit: number; truncated: boolean;
  sources: { uploadQueue: SourceState; providerJobs: SourceState; watcher: SourceState };
}
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const time = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const state = (v: unknown): v is SourceState => v === "ok" || v === "unavailable";

export async function loadNotifications(apiKey: string | null, limit = 50): Promise<NotificationsResponse> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, "Invalid notifications limit.");
  const bad = () => new ApiError(503, "Invalid notifications response.");
  const raw = await apiFetch<unknown>(`/notifications?limit=${limit}`, apiKey);
  if (!obj(raw) || !Array.isArray(raw.notifications) || raw.limit !== limit || typeof raw.truncated !== "boolean" ||
      raw.notifications.length > limit || !obj(raw.sources)) throw bad();
  const s = raw.sources;
  if (!state(s.uploadQueue) || !state(s.providerJobs) || !state(s.watcher)) throw bad();
  const seen = new Set<string>();
  for (const n of raw.notifications) {
    if (!obj(n) || typeof n.id !== "string" || !n.id || seen.has(n.id) || (n.source !== "upload-queue" && n.source !== "provider-jobs" && n.source !== "watcher") ||
        n.severity !== "error" || typeof n.title !== "string" || !(n.detail === null || typeof n.detail === "string") || !time(n.occurredAt)) throw bad();
    seen.add(n.id);
  }
  return raw as unknown as NotificationsResponse;
}

const STORAGE_KEY = "lkbNotificationsRead";
const MAX_REMEMBERED = 500;
export function loadReadIds(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch { return new Set(); }
}
/** Best effort: storage may be blocked; the page still works for the session. Returns the set to render. */
export function saveReadIds(ids: Set<string>): Set<string> {
  const kept = new Set([...ids].slice(-MAX_REMEMBERED));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...kept])); } catch { /* not persisted */ }
  return kept;
}
