/**
 * Pure helpers for the meeting-bot page (T-046 web slice). Everything that turns API data into
 * display text lives here so it can be tested without rendering: nothing returned is ever HTML,
 * and no URL from data is returned except through safe-url.ts or as an internal route built from a validated id.
 */
import { ApiError } from "../../api/client.js";
import { safeHttpUrl } from "../../safe-url.js";

/** Rows rendered per section. The page says "showing N of M" when a list is longer. */
export const ROW_CAP = 25;
// Control characters and bidirectional overrides/isolates are removed so a title cannot reorder the text around it.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g;

export function safeText(value: unknown, fallback: string, max = 160): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(UNSAFE_CHARS, " ").trim();
  if (!clean) return fallback;
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function formatBytes(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "unknown";
  if (value < 1024) return `${Math.floor(value)} B`;
  const units = ["KB", "MB", "GB"];
  let n = value / 1024, i = 0;
  while ((n >= 1024 || Math.round(n * 10) / 10 >= 1024) && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

/** Parsed instant -> local text, or a placeholder. Never echoes the raw string. */
export function formatInstant(value: unknown, dateOnly = false): string {
  const ms = instantMs(value);
  if (ms === null) return "time unknown";
  const d = new Date(ms);
  return dateOnly ? d.toLocaleDateString() : d.toLocaleString();
}
export function instantMs(value: unknown): number | null {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

const PLATFORMS: [string, string][] = [["meet.google.com", "Google Meet"], ["zoom.us", "Zoom"], ["teams.microsoft.com", "Microsoft Teams"],
  ["teams.live.com", "Microsoft Teams"], ["webex.com", "Webex"]];
/** Platform label from the join link's host. The link itself is never rendered. */
export function platformOf(meetingUrl: unknown): { platform: string; linkKnown: boolean } {
  const safe = safeHttpUrl(meetingUrl);
  if (!safe) return { platform: "unknown", linkKnown: false };
  const host = new URL(safe).hostname.toLowerCase();
  const hit = PLATFORMS.find(([h]) => host === h || host.endsWith(`.${h}`));
  return { platform: hit ? hit[1] : "other", linkKnown: true };
}

const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype", "toString", "hasOwnProperty"]);
/** Internal route for a session id, only for ids of the safe shape; never built from a URL in data. */
export function sessionPath(id: unknown): string | null {
  if (typeof id !== "string" || RESERVED_IDS.has(id) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) return null;
  return `/sessions/${encodeURIComponent(id)}`;
}

/** Neutral labels for the API's skip/operation reason vocabulary (apps/api brain.ts WEBINAR_OPERATION_REASONS). */
const REASON_LABELS = new Map<string, string>([
  ["no-join-link", "no join link"], ["past", "already ended"], ["untrusted-sender", "sender not trusted"], ["needs-registration", "needs registration"],
  ["duplicate-session", "duplicate session"], ["overlap-lost", "overlaps another meeting"], ["not-webinar", "not a webinar"], ["needs-review", "needs review"],
  ["cancelled", "cancelled"], ["invalid-time", "invalid time"], ["unsafe-join-link", "join link not safe"], ["opted-out", "opt-out recorded"],
  ["rule-denied", "join rule recorded"], ["rules-unevaluable", "join rules not evaluated"], ["processing-failed", "processing failed"],
  ["retry-limit", "retry limit reached"], ["interrupted-no-recording-artifact", "interrupted, no recording"], ["missed-while-processing", "missed while processing"],
  ["missed-coverage", "missed coverage"], ["controller-disconnected", "controller disconnected"], ["coverage-review", "coverage review"],
  ["source-discontinuity", "source discontinuity"], ["unproven-calendar-history", "calendar history unproven"], ["rejected", "rejected"],
  ["rescheduled", "rescheduled"], ["rescheduled-completed", "rescheduled, completed"], ["recurring-series", "recurring series"],
  ["unknown-tombstone", "unknown tombstone"], ["ambiguous-provider", "ambiguous provider"], ["contradictory-revision", "contradictory revision"],
  ["missing-revision", "missing revision"], ["ambiguous-identity", "ambiguous identity"],
]);
export function reasonLabel(reason: unknown): string {
  return typeof reason === "string" && REASON_LABELS.has(reason) ? REASON_LABELS.get(reason)! : "unrecognised reason";
}

const OP_STATUS = new Map<string, string>([["queued", "queued"], ["recording", "recording"], ["processing", "processing"], ["failed", "failed"],
  ["ready", "ready"], ["action_required", "action required"]]);
export function opStatusLabel(status: unknown): string {
  return typeof status === "string" && OP_STATUS.has(status) ? OP_STATUS.get(status)! : "unrecognised status";
}
const PIPELINE_STATUS = new Set(["pending", "queued", "processing", "done", "failed"]);
export function pipelineLabel(status: unknown): string {
  return typeof status === "string" && PIPELINE_STATUS.has(status) ? status : "unknown";
}

export function describeLoadError(err: unknown, scope: string, label: string): string {
  if (err instanceof ApiError && err.status === 403) return `Your API key lacks the "${scope}" scope, so ${label} cannot be shown.`;
  if (err instanceof ApiError && err.status === 401) return "Sign-in is required again.";
  return `${label} unavailable.`;
}

export function capRows<T>(rows: T[]): { shown: T[]; total: number } {
  return { shown: rows.slice(0, ROW_CAP), total: rows.length };
}
export function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)) : [];
}
