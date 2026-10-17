import { apiFetch } from "../../api/client.js";
import { readActivitySnapshot, type ActivitySnapshot } from "./activityHealthModel.js";

export async function loadActivityHealth(apiKey: string, limit = 50): Promise<ActivitySnapshot> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid activity limit");
  return readActivitySnapshot(await apiFetch<unknown>(`/activity-health?limit=${limit}`, apiKey));
}
