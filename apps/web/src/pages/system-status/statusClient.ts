/**
 * T-057 System status client (ISS-STATUSSCOPE-001). Reads the authenticated, tenant-scoped
 * `GET /system-status` ({ db, collections } counted for the caller's own tenant). It deliberately
 * does NOT call the public `/health` probe, whose counts are service-wide (all tenants), and there
 * is no fallback to it. `/system-status` has no watchSilent/watchUnreadable and there is no
 * tenant-safe source for them, so they are always null here (shown as unavailable). Any other
 * response shape is refused as invalid. The API key is only passed through to `apiFetch`.
 */
import { apiFetch, ApiError } from "../../api/client.js";

export interface SystemStatus {
  db: "ok" | "error";
  collections: Array<{ name: string; count: number }>;
  watchSilent: number | null;
  watchUnreadable: number | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export async function getSystemStatus(apiKey: string | null): Promise<SystemStatus> {
  const raw = await apiFetch<unknown>("/system-status", apiKey);
  const invalid = () => new ApiError(503, "Invalid system status response.");
  if (!isObject(raw) || (raw.db !== "ok" && raw.db !== "error") || !isObject(raw.collections)) throw invalid();
  const collections: SystemStatus["collections"] = [];
  for (const [name, value] of Object.entries(raw.collections)) {
    if (!count(value)) throw invalid();
    collections.push({ name, count: value });
  }
  collections.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return {
    db: raw.db,
    collections,
    watchSilent: null,
    watchUnreadable: null,
  };
}
