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
import { SKIP_REASONS, type SkippedItem } from "@lkb/core";
import { neutralizeText } from "./alert-text.js";
import { allowlistTitle } from "./title-allowlist.js";

/**
 * How the event title may appear in an alert. `omit` (the DEFAULT, and the value for anything absent,
 * invalid or unknown): no title text at all, nothing derived from it, not even its length. `masked`
 * is the deny-list renderer (alert-text.ts); a caller must ask for it by name, and it cannot catch a
 * secret with no recognised keyword (ISS-R1ALERTS-009) or a misspelt keyword (-010).
 */
export type TitlePolicy = "omit" | "masked";
export const DEFAULT_TITLE_POLICY: TitlePolicy = "omit";
export function resolveTitlePolicy(v: unknown): TitlePolicy {
  return v === "masked" ? "masked" : DEFAULT_TITLE_POLICY;
}

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
  /** Title policy; absent, invalid or unknown means "omit". "masked" must be asked for explicitly. */
  titlePolicy?: TitlePolicy;
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
/** Derived from the core list, so a new SkipReason cannot silently fall into `other` (W10 / ISS-T037W1-003). */
export const KNOWN_SKIP_REASONS: ReadonlySet<string> = new Set<string>(SKIP_REASONS);
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
  source: "skipped" | "job", policy: TitlePolicy, reason?: string): AttentionAlert {
  const spec = SPECS[c];
  const id = alertIdFor(sessionKey);
  const starts = renderStart(startTime, tz);
  const detail = c === "action-required" && reason ? ` Reason: ${reason}.` : "";
  // omit: the title argument is never read. Headline, formatted start and the hashed id identify the alert.
  const masked = policy === "masked";
  const t = masked ? allowlistTitle(title) : "";
  return {
    key: `attn:${c}:${id}${c === "action-required" && reason ? `:${reason}` : ""}`,
    case: c, severity: spec.severity, title: masked ? `${spec.headline}: ${t}` : `${spec.headline}: ${starts} [${id}]`,
    body: `${spec.what}${detail}\n${masked ? `Event: ${t}` : `Event ref: ${id} (title not shown)`}\nStarts: ${starts}\nWhat to do: ${spec.todo}`,
    id, ...(startTime ? { startTime } : {}), source,
  };
}

/** An option counts only if it is an OWN property of the input: nothing inherited (class prototype, Object.create, a polluted Object.prototype) is ever read. */
const opt = (input: unknown, k: keyof AttentionInput): unknown => (input !== null && typeof input === "object" ? own(input, k) : undefined);

/** Total: a throwing getter on the input cannot make the policy anything but "omit". Read once, own property only. */
function readPolicy(input: unknown): TitlePolicy {
  try { return resolveTitlePolicy(opt(input, "titlePolicy")); } catch { return DEFAULT_TITLE_POLICY; }
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
  const nowRaw = opt(input, "now"), startsRaw = opt(input, "startTimes"), skippedRaw = opt(input, "skipped"), jobsRaw = opt(input, "jobs");
  const nowMs = Date.parse(typeof nowRaw === "string" ? nowRaw : "");
  const tz = validZone(opt(input, "timeZone"));
  const policy = readPolicy(input);
  const starts = startsRaw && typeof startsRaw === "object" ? (startsRaw as Record<string, string>) : {};
  const startOf = (id: string): string | undefined => {
    const v = Object.prototype.hasOwnProperty.call(starts, id) ? starts[id] : undefined;
    return canonicalStart(v);
  };
  const stale = (s: string | undefined) => s !== undefined && Number.isFinite(nowMs) && Date.parse(s) < nowMs;
  const push = (a: AttentionAlert) => { if (stale(a.startTime)) ignore("already-started"); else alerts.push(a); };

  const skipped: readonly unknown[] = Array.isArray(skippedRaw) ? skippedRaw : [];
  if (skippedRaw !== undefined && !Array.isArray(skippedRaw)) ignore("malformed-skipped-list");
  for (const item of skipped) {
    try {
      const it = item as object | null;
      const sessionKey = it && typeof it === "object" ? own(it, "sessionKey") : undefined;
      if (typeof sessionKey !== "string" || !sessionKey) { ignore("malformed-skipped-item"); continue; }
      const reason = own(it as object, "reason");
      const c = caseForReason(reason);
      if (!c) { ignore(`no-alert-for-reason:${typeof reason === "string" ? (KNOWN_SKIP_REASONS.has(reason) ? reason : "other") : "none"}`); continue; }
      push(build(c, sessionKey, own(it as object, "title"), startOf(sessionKey), tz, "skipped", policy));
    } catch { ignore("unreadable-skipped-item"); }
  }

  const jobs = jobsRaw && typeof jobsRaw === "object" && !Array.isArray(jobsRaw) ? jobsRaw : undefined;
  if (jobsRaw !== undefined && !jobs) ignore("malformed-jobs-map");
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
      push(build(mapped ?? "action-required", id, own(row, "title"), startOf(id) ?? own0, tz, "job", policy, safeReason));
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
