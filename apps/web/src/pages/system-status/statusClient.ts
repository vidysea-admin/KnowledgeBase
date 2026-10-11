/**
 * T-057 System status client. Reads the EXISTING `GET /health` (apps/api/src/routes/health.ts):
 * db ping, aggregate per-collection document counts, and (when wired) watcher-silence counts.
 * The response is validated strictly; any other shape is refused as an invalid response rather
 * than rendered. The API key is only ever passed through to `apiFetch`, never stored here.
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
  const raw = await apiFetch<unknown>("/health", apiKey);
  const invalid = () => new ApiError(503, "Invalid system status response.");
  if (!isObject(raw) || (raw.db !== "ok" && raw.db !== "error") || !isObject(raw.collections)) throw invalid();
  for (const optional of ["watchSilent", "watchUnreadable"]) {
    if (Object.hasOwn(raw, optional) && !count(raw[optional])) throw invalid();
  }
  const collections: SystemStatus["collections"] = [];
  for (const [name, value] of Object.entries(raw.collections)) {
    if (!count(value)) throw invalid();
    collections.push({ name, count: value });
  }
  collections.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return {
    db: raw.db,
    collections,
    watchSilent: Object.hasOwn(raw, "watchSilent") ? (raw.watchSilent as number) : null,
    watchUnreadable: Object.hasOwn(raw, "watchUnreadable") ? (raw.watchUnreadable as number) : null,
  };
}
