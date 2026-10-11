/**
 * packages/meeting-bot/src/calendar/attention-alerts.ts — r1-attention-alerts.
 * PURE: turns scheduler outcomes that need a HUMAN into alert records a notifier can send later.
 * No I/O, no sending, no clock, no machine time zone. Nothing here is wired to a sender yet.
 *
 * Telegram sinks in this repo POST `{chat_id, text}` with NO parse_mode (plain text), so nothing
 * is interpreted today. Titles go through the allowlist renderer in alert-text.ts (no link, secret,
 * number run or markup survives), and the raw session key is never emitted: only its opaque hash id.
 */
import { createHash } from "node:crypto";
import type { SkippedItem } from "@lkb/core";
import { neutralizeText } from "./alert-text.js";

export type AttentionCase = "needs-registration" | "overlap-lost" | "action-required" | "untrusted-sender" | "join-link";
export type AttentionSeverity = "high" | "medium";

export interface AttentionAlert {
  /** Stable across ticks: `attn:<case>:<id>[:<reason>]`. Never time- or URL-derived. */
  key: string;
  case: AttentionCase;
  severity: AttentionSeverity;
  title: string;
  body: string;
  /** alertIdFor(sessionKey): opaque; the raw key is never in an alert. A consumer keeps its own id-to-key map. */
  id: string;
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

export { neutralizeText };

/** The zone string itself, only if Intl accepts it AND it has a plain zone-name charset; else "UTC". Printed unchanged (underscores kept). */
function validZone(z: unknown): string {
  if (typeof z !== "string" || !/^[A-Za-z0-9_+:/-]{1,64}$/.test(z)) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return z; } catch { return "UTC"; }
}

/** "2026-10-11 00:30 (Asia/Kolkata)"; an unparseable time or zone degrades, never throws. */
export function renderStart(iso: string | undefined, timeZone: string): string {
  const ms = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "start time unknown";
  const zone = validZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "??";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")} (${zone})`;
}

/**
 * Opaque id for a session key: first 20 hex chars (80 bits) of SHA-256 over the exact UTF-16 code units
 * of the key. Birthday collision odds for n keys ~ n^2 / 2^81 (about 4e-19 for 500), so negligible; a
 * lone surrogate hashes distinctly (utf8 would map it to U+FFFD). Keys differing only in case,
 * whitespace or Unicode normalisation are different strings and get different ids on purpose.
 */
export function alertIdFor(sessionKey: string): string {
  return createHash("sha256").update(Buffer.from(sessionKey, "utf16le")).digest("hex").slice(0, 20);
}
const SKIP_REASONS = new Set(["no-join-link", "past", "untrusted-sender", "needs-registration", "duplicate-session", "overlap-lost", "not-webinar", "needs-review", "cancelled", "invalid-time", "unsafe-join-link"]);
/** Only a plain ISO-8601 date or date-time WITH an explicit zone is accepted; the output is FORMATTED from the parsed instant, so no caller byte is ever echoed. */
const STRICT_ISO = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
export function canonicalStart(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 40 || !STRICT_ISO.test(v)) return undefined;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}
const own = (o: object, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined);
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
    key: `attn:${c}:${alertIdFor(sessionKey)}${c === "action-required" && reason ? `:${reason}` : ""}`,
    case: c, severity: spec.severity, title: `${spec.headline}: ${t}`,
    body: `${spec.what}${detail}\nEvent: ${t}\nStarts: ${renderStart(startTime, tz)}\nWhat to do: ${spec.todo}`,
    id: alertIdFor(sessionKey), ...(startTime ? { startTime } : {}), source,
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

/** Total: a throwing getter or Proxy anywhere in the input yields an empty, counted result. */
export function buildAttentionAlerts(input: AttentionInput): AttentionResult {
  try { return buildInner(input); } catch { return { alerts: [], ignored: { count: 1, reasons: { "unreadable-input": 1 } } }; }
}

function buildInner(input: AttentionInput): AttentionResult {
  const reasons: Record<string, number> = {};
  let count = 0;
  const ignore = (why: string) => { count++; reasons[why] = (reasons[why] ?? 0) + 1; };
  const alerts: AttentionAlert[] = [];
  const nowMs = Date.parse(typeof input?.now === "string" ? input.now : "");
  const tz = validZone(input?.timeZone);
  const starts = input?.startTimes && typeof input.startTimes === "object" ? input.startTimes : {};
  const startOf = (id: string): string | undefined => {
    const v = Object.prototype.hasOwnProperty.call(starts, id) ? starts[id] : undefined;
    return canonicalStart(v);
  };
  const stale = (s: string | undefined) => s !== undefined && Number.isFinite(nowMs) && Date.parse(s) < nowMs;
  const push = (a: AttentionAlert) => { if (stale(a.startTime)) ignore("already-started"); else alerts.push(a); };

  const skipped = Array.isArray(input?.skipped) ? input.skipped : [];
  if (input?.skipped !== undefined && !Array.isArray(input.skipped)) ignore("malformed-skipped-list");
  for (const item of skipped) {
    try {
      const it = item as object | null;
      const sessionKey = it && typeof it === "object" ? own(it, "sessionKey") : undefined;
      if (typeof sessionKey !== "string" || !sessionKey) { ignore("malformed-skipped-item"); continue; }
      const reason = own(it as object, "reason");
      const c = caseForReason(reason);
      if (!c) { ignore(`no-alert-for-reason:${typeof reason === "string" ? (SKIP_REASONS.has(reason) ? reason : "other") : "none"}`); continue; }
      push(build(c, sessionKey, own(it as object, "title"), startOf(sessionKey), tz, "skipped"));
    } catch { ignore("unreadable-skipped-item"); }
  }

  const jobs = input?.jobs && typeof input.jobs === "object" && !Array.isArray(input.jobs) ? input.jobs : undefined;
  if (input?.jobs !== undefined && !jobs) ignore("malformed-jobs-map");
  for (const id of Object.keys(jobs ?? {})) {
    try {
      const row = own(jobs as object, id) as object | null;
      const status = row && typeof row === "object" && !Array.isArray(row) ? own(row, "status") : undefined;
      if (!row || typeof status !== "string") { ignore("malformed-job-row"); continue; }
      if (status !== "action_required") { ignore("job-not-action-required"); continue; }
      const r = own(row, "reason"), st = own(row, "startTime");
      const reason = typeof r === "string" ? r : undefined;
      const mapped = caseForReason(reason);
      const own0 = canonicalStart(st);
      const safeReason = reason && KNOWN_REASONS.has(reason) ? reason : "unspecified";
      push(build(mapped ?? "action-required", id, own(row, "title"), startOf(id) ?? own0, tz, "job", safeReason));
    } catch { ignore("unreadable-job-row"); }
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
