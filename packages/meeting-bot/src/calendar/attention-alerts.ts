/**
 * packages/meeting-bot/src/calendar/attention-alerts.ts — r1-attention-alerts.
 * PURE: turns scheduler outcomes that need a HUMAN into alert records a notifier can send later.
 * No I/O, no sending, no clock, no machine time zone. Nothing here is wired to a sender yet.
 *
 * Telegram sinks in this repo POST `{chat_id, text}` with NO parse_mode (plain text), so nothing
 * is interpreted today; markup characters are still stripped so a later parse_mode cannot turn an
 * attacker-controlled invitation title into formatting or a link. No link is ever included.
 */
import type { SkippedItem } from "@lkb/core";

export type AttentionCase = "needs-registration" | "overlap-lost" | "action-required" | "untrusted-sender" | "join-link";
export type AttentionSeverity = "high" | "medium";

export interface AttentionAlert {
  /** Stable across ticks: `attn:<case>:<sessionKey>[:<reason>]`. Never time- or URL-derived. */
  key: string;
  case: AttentionCase;
  severity: AttentionSeverity;
  title: string;
  body: string;
  sessionKey: string;
  /** ISO start time when the caller supplied one; used for ordering. */
  startTime?: string;
  source: "skipped" | "job";
}

export interface AttentionInput {
  skipped?: readonly SkippedItem[];
  /** Operation rows keyed by session id (the `operations` map of the webinar operation state). */
  jobs?: Readonly<Record<string, unknown>>;
  /** Optional start times by sessionKey/job id: a SkippedItem carries none. */
  startTimes?: Readonly<Record<string, string>>;
  /** IANA zone used to render start times (e.g. "Asia/Kolkata"). Required, never implicit. */
  timeZone: string;
  now: string;
}

export interface AttentionResult {
  alerts: AttentionAlert[];
  ignored: { count: number; reasons: Record<string, number> };
}

const MAX_TITLE = 80;
const BIDI = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/g;
const URLISH = /\b(?:[a-z][a-z0-9+.-]*:\/\/|javascript:|data:|vbscript:|www\.)\S*/gi;
const EMAIL = /[^\s<>()@]+@[^\s<>()@]+/g;
const SECRETISH = /\b(?:pwd|passcode|password|token|tk|access_token)\s*[=:]\s*\S+/gi;
const MARKUP = /[*_`~[\]<>|\\{}#]/g;

/** Plain-text, single-line, bounded rendering of attacker-controlled text. */
export function neutralizeText(raw: unknown, max = MAX_TITLE): string {
  let s = typeof raw === "string" ? raw : "";
  s = s.slice(0, 2000).replace(URLISH, "[link]").replace(SECRETISH, "[secret]").replace(EMAIL, "[email]");
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(BIDI, "").replace(MARKUP, "").replace(/\s+/g, " ").trim();
  if (!s) return "(untitled)";
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max - 1).join("") + "\u2026" : s;
}

/** "2026-10-11 00:30 (Asia/Kolkata)"; an unparseable time or zone degrades, never throws. */
export function renderStart(iso: string | undefined, timeZone: string): string {
  const ms = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "start time unknown";
  let zone = "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone }); zone = timeZone; } catch { /* keep UTC */ }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "??";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")} (${neutralizeText(zone, 40)})`;
}

const keyPart = (s: string) => s.replace(/[^A-Za-z0-9:._|-]/g, "_").slice(0, 160);
const KNOWN_REASONS = new Set(["retry-limit", "interrupted-no-recording-artifact", "missed-while-processing", "missed-coverage",
  "cancelled", "rescheduled", "controller-disconnected", "coverage-review", "needs-review", "invalid-time", "source-discontinuity",
  "recurring-series", "rescheduled-completed", "rejected"]);

interface Spec { severity: AttentionSeverity; headline: string; what: string; todo: string }
const SPECS: Record<AttentionCase, Spec> = {
  "needs-registration": { severity: "high", headline: "Registration needed",
    what: "This webinar requires registration before the bot can join.", todo: "Register for it yourself, or mark it as not wanted. Until then it will not be recorded." },
  "overlap-lost": { severity: "medium", headline: "Session dropped: overlap",
    what: "This session overlaps another one and was dropped, so it will not be recorded.", todo: "If you need both, record one manually or start a second capture." },
  "untrusted-sender": { severity: "medium", headline: "Invite from unapproved sender",
    what: "This invitation came from a sender that is not approved, so it was not scheduled.", todo: "If you trust the sender, add them to the trusted senders list; otherwise ignore this." },
  "join-link": { severity: "high", headline: "No usable join link",
    what: "This event has no usable join link (missing or unsafe), so the bot cannot join.", todo: "Open the invitation, find the correct join link, and join or record it manually." },
  "action-required": { severity: "high", headline: "Needs your attention",
    what: "The job stopped and needs a person to look at it.", todo: "Open the operations view to see the details and decide whether to retry." },
};

function build(c: AttentionCase, sessionKey: string, title: unknown, startTime: string | undefined, tz: string,
  source: "skipped" | "job", reason?: string): AttentionAlert {
  const spec = SPECS[c];
  const t = neutralizeText(title);
  const detail = c === "action-required" && reason ? ` Reason: ${reason}.` : "";
  return {
    key: `attn:${c}:${keyPart(sessionKey)}${c === "action-required" && reason ? `:${reason}` : ""}`,
    case: c, severity: spec.severity, title: `${spec.headline}: ${t}`,
    body: `${spec.what}${detail}\nEvent: ${t}\nStarts: ${renderStart(startTime, tz)}\nWhat to do: ${spec.todo}`,
    sessionKey, ...(startTime ? { startTime } : {}), source,
  };
}

function caseForReason(reason: unknown): AttentionCase | undefined {
  switch (reason) {
    case "needs-registration": return "needs-registration";
    case "overlap-lost": return "overlap-lost";
    case "untrusted-sender": return "untrusted-sender";
    case "no-join-link": case "unsafe-join-link": return "join-link";
    default: return undefined;
  }
}

export function buildAttentionAlerts(input: AttentionInput): AttentionResult {
  const reasons: Record<string, number> = {};
  let count = 0;
  const ignore = (why: string) => { count++; reasons[why] = (reasons[why] ?? 0) + 1; };
  const alerts: AttentionAlert[] = [];
  const nowMs = Date.parse(typeof input?.now === "string" ? input.now : "");
  const tz = typeof input?.timeZone === "string" ? input.timeZone : "UTC";
  const starts = input?.startTimes && typeof input.startTimes === "object" ? input.startTimes : {};
  const startOf = (id: string): string | undefined => {
    const v = Object.prototype.hasOwnProperty.call(starts, id) ? starts[id] : undefined;
    return typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : undefined;
  };
  const stale = (s: string | undefined) => s !== undefined && Number.isFinite(nowMs) && Date.parse(s) < nowMs;
  const push = (a: AttentionAlert) => { if (stale(a.startTime)) ignore("already-started"); else alerts.push(a); };

  const skipped = Array.isArray(input?.skipped) ? input.skipped : [];
  if (input?.skipped !== undefined && !Array.isArray(input.skipped)) ignore("malformed-skipped-list");
  for (const item of skipped) {
    const it = item as Partial<SkippedItem> | null;
    if (!it || typeof it !== "object" || typeof it.sessionKey !== "string" || !it.sessionKey) { ignore("malformed-skipped-item"); continue; }
    const c = caseForReason(it.reason);
    if (!c) { ignore(`no-alert-for-reason:${typeof it.reason === "string" ? keyPart(it.reason) : "none"}`); continue; }
    push(build(c, it.sessionKey, it.title, startOf(it.sessionKey), tz, "skipped"));
  }

  const jobs = input?.jobs && typeof input.jobs === "object" && !Array.isArray(input.jobs) ? input.jobs : undefined;
  if (input?.jobs !== undefined && !jobs) ignore("malformed-jobs-map");
  for (const id of Object.keys(jobs ?? {})) {
    const row = (jobs as Record<string, unknown>)[id] as Record<string, unknown> | null;
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.status !== "string") { ignore("malformed-job-row"); continue; }
    if (row.status !== "action_required") { ignore("job-not-action-required"); continue; }
    const reason = typeof row.reason === "string" ? row.reason : undefined;
    const mapped = caseForReason(reason);
    const own = typeof row.startTime === "string" && Number.isFinite(Date.parse(row.startTime)) ? row.startTime : undefined;
    const safeReason = reason && KNOWN_REASONS.has(reason) ? reason : "unspecified";
    push(build(mapped ?? "action-required", id, row.title, startOf(id) ?? own, tz, "job", safeReason));
  }

  alerts.sort((a, b) => {
    if (a.startTime !== b.startTime) {
      if (a.startTime === undefined) return 1;
      if (b.startTime === undefined) return -1;
      const d = Date.parse(a.startTime) - Date.parse(b.startTime);
      if (d) return d;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return { alerts, ignored: { count, reasons } };
}

/**
 * Returns only alerts whose key is not already in `seen`, plus the updated key list (oldest first,
 * trimmed from the front to `maxKeys`). Duplicate keys within one batch alert once. Caller persists.
 */
export function selectNewAlerts(alerts: readonly AttentionAlert[], seen: readonly string[], maxKeys = 500):
  { fresh: AttentionAlert[]; keys: string[] } {
  const known = new Set(Array.isArray(seen) ? seen.filter((k) => typeof k === "string") : []);
  const keys = Array.from(known);
  const fresh: AttentionAlert[] = [];
  for (const a of alerts) {
    if (known.has(a.key)) continue;
    known.add(a.key); keys.push(a.key); fresh.push(a);
  }
  const cap = Number.isInteger(maxKeys) && maxKeys > 0 ? maxKeys : 500;
  return { fresh, keys: keys.length > cap ? keys.slice(keys.length - cap) : keys };
}
