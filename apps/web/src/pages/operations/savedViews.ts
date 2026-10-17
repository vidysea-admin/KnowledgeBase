import { operationViews, type OperationView } from "./operationsModel.js";
const STORAGE = "lkbOperationViewPresets.v1";
export function loadSavedViews(): { views: OperationView[]; notice: string | null } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
    if (!Array.isArray(raw) || raw.length > operationViews.length || !raw.every(v => operationViews.includes(v)) || new Set(raw).size !== raw.length)
      return { views: [], notice: "Saved preferences were invalid; choose a view to save again." };
    return { views: raw as OperationView[], notice: null };
  } catch { return { views: [], notice: "Browser storage is unavailable; saved views work for this session only." }; }
}
export function persistSavedViews(views: OperationView[]): string | null {
  if (views.length > operationViews.length || !views.every(v => operationViews.includes(v)) || new Set(views).size !== views.length) throw new Error("Invalid view preferences");
  try { localStorage.setItem(STORAGE, JSON.stringify(views)); return null; }
  catch { return "Browser storage is unavailable; this change is for this session only and was not persisted."; }
}
