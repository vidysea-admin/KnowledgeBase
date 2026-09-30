/**
 * packages/meeting-bot/src/calendar/auto-record-policy.ts — U5 (u5-auto-record-scheduler). Split
 * out of auto-join.ts to clear the 300-LOC file budget (structure.config.json), same precedent as
 * `record-finalize.ts` splitting off `record-commands.ts`. Two small, independent policy pieces
 * `selectAutoRecordItems` (auto-join.ts) needs: the config-level trusted-sender allowlist, and
 * join-link redaction for safe logging.
 */

/** Config-level trusted-sender allowlist (distinct from the DB-backed `trusted_senders`
 * 3-approvals mechanism in gmail-meeting-candidates-approval.md — this is a static bootstrap
 * list read from env/settings, see `loadTrustedSenderConfig`). An email is trusted iff it
 * exactly matches `emails`, OR its domain exactly matches an entry in `domains`. Matching is
 * case-insensitive; callers are expected to have already lower-cased both lists (
 * `loadTrustedSenderConfig` does this). */
import { createHash } from "node:crypto";
import { detectPlatform } from "../platform.js";
import type { WebinarReconciliationResult, CalendarEvent } from "./calendar-client.js";

export interface TrustedSenderConfig {
  emails: string[];
  domains: string[];
}

/** Strips a `tk=`/`token=`/`access_token=`/`pwd=` query-string value from a join link before it
 * is ever printed or logged — the join token itself must never appear in a log line (unit
 * brief). Leaves the rest of the URL (host, path, non-token params) intact so a human can still
 * tell which meeting it was. Never throws on a malformed URL — falls back to a fixed
 * placeholder. */
export function redactJoinLink(url: string): string {
  try {
    const parsed = new URL(url);
    const tokenKeys = ["tk", "token", "access_token", "pwd"];
    let redacted = false;
    for (const key of tokenKeys) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "REDACTED");
        redacted = true;
      }
    }
    return redacted ? parsed.toString() : url;
  } catch {
    return "<unparseable-join-link-redacted>";
  }
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

/** True iff `email`/`domain` matches the config allowlist. `domain` defaults to the part of
 * `email` after `@` when not given separately (calendar `organizer` has no separate domain
 * field). */
export function isTrustedSender(email: string | undefined, domain: string | undefined,
  cfg: TrustedSenderConfig): boolean {
  if (!email && !domain) return false;
  const emailLc = email?.toLowerCase();
  const domainLc = (domain ?? (email ? domainOf(email) : undefined))?.toLowerCase();
  if (emailLc && cfg.emails.includes(emailLc)) return true;
  if (domainLc && cfg.domains.includes(domainLc)) return true;
  return false;
}

// ISS-318 (fix cycle 2): zoho.com/zoom.us were removed from the defaults. They are the
// platform VENDORS' own public, multi-tenant email domains (anyone can register a free
// @zoho.com/@zoom.us address) — categorically different from the two entries that remain, which
// are actual vetted partner organizations. Umesh's approval (qa/feedback-inbox.md
// 2026-09-26T23:54:34+05:30 / 23:56:41+05:30) named "trusted senders", not "any sender on our
// vendors' own domains". umeshsugara@vidysea.com is added to the trusted EMAIL list (not a
// vidysea.com domain entry) because that is the real Gmail account the candidate pipeline reads
// (gws-gmail.ts, OAuth'd as umeshsugara@vidysea.com per gmail-meeting-candidates-approval.md) —
// a self-forwarded invite lands with that address as the From header's sender.
const DEFAULT_TRUSTED_SENDER_EMAILS = ["karunn@vidysea.com", "umeshsugara@vidysea.com"];
const DEFAULT_TRUSTED_SENDER_DOMAINS = ["theoutreachcollective.in", "ashoka.edu.in"];

function parseCsvEnv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Reads the trusted-sender allowlist from env (`AUTO_RECORD_TRUSTED_EMAILS` /
 * `AUTO_RECORD_TRUSTED_DOMAINS`, comma-separated), falling back to the fix-cycle-2 defaults
 * (ISS-318): karunn@vidysea.com, umeshsugara@vidysea.com, theoutreachcollective.in,
 * ashoka.edu.in — vetted partners/known accounts only, never a platform vendor's own public
 * domain. [ASSUMPTION] no existing settings/env key for this list was found in the repo (checked
 * qa/contracts/web-settings-keys.md, .env, config/) — these two new env keys are this unit's own
 * addition, documented here rather than silently invented; see the manifest's Known gaps.
 */
export function loadTrustedSenderConfig(env: NodeJS.ProcessEnv = process.env): TrustedSenderConfig {
  return {
    emails: parseCsvEnv(env.AUTO_RECORD_TRUSTED_EMAILS) ?? DEFAULT_TRUSTED_SENDER_EMAILS,
    domains: parseCsvEnv(env.AUTO_RECORD_TRUSTED_DOMAINS) ?? DEFAULT_TRUSTED_SENDER_DOMAINS,
  };
}

/** Automatic recording is limited to positively identified webinars, never generic meetings. */
export function classifyWebinarInvite(title: string): "webinar" | "meeting" | "uncertain" {
  if (/\b(stand[ -]?up|one[ -]?on[ -]?one|1[: -]1|team meeting|interview|personal|catch[ -]?up)\b/i.test(title)) return "meeting";
  return /\b(webinar|seminar|educator dialogues|in[ -]focus|online workshop|virtual conference)\b/i.test(title)
    ? "webinar" : "uncertain";
}

/** Token rotations do not change a meeting's identity; date/time distinguishes recurring events. */
export function webinarIdentity(url: string, startTime: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || detectPlatform(url) === "unknown") return undefined;
    for (const key of [...u.searchParams.keys()]) {
      if (/^(tk|token|access_token|pwd|password|utm_.+)$/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    u.searchParams.sort();
    return `${u.toString()}|${new Date(startTime).toISOString()}`;
  } catch { return undefined; }
}

export function webinarSessionKey(identity: string): string {
  return `webinar-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

/** Source inventory uses the same proven identity/alias policy as capture selection. No I/O. */
export function projectWebinarInventory(previous: Record<string, Record<string, any>>, result: WebinarReconciliationResult,
  tenantId: string, checkedAt: string, series: (CalendarEvent & {recurrence?: string[]})[] = []) {
  const operations = JSON.parse(JSON.stringify(previous)) as typeof previous;
  const terminal = (row: Record<string, any> | undefined) => row &&
    (["ready", "recording", "processing", "failed"].includes(row.status) || (row.status === "action_required" &&
      !["needs-review", "invalid-time", "no-join-link", "unsafe-join-link", "source-discontinuity", "unproven-calendar-history"].includes(row.reason)));
  const put = (id: string, changes: Record<string, any>) => {
    if (terminal(operations[id])) return;
    operations[id] = {...operations[id], ...changes, tenantId, updatedAt: checkedAt};
  };
  for (const transition of result.transitions) {
    for (const alias of transition.aliases) {
      const prior = operations[alias];
      if (transition.reason === "rescheduled" && transition.currentKey && alias !== transition.currentKey && prior) {
        const current = operations[transition.currentKey];
        if (!terminal(current) && terminal(prior)) operations[transition.currentKey] = {...prior, tenantId, updatedAt: checkedAt,
          status: "action_required", reason: prior.status === "ready" ? "rescheduled-completed" : prior.reason ?? "rescheduled",
          priorSessionId: alias};
        else if (!terminal(current) && (prior.attempts ?? 0) > 0) operations[transition.currentKey] = {...current, tenantId, updatedAt: checkedAt,
          status: (prior.attempts ?? 0) >= 3 ? "action_required" : "queued", reason: (prior.attempts ?? 0) >= 3 ? "retry-limit" : undefined,
          attempts: Math.max(current?.attempts ?? 0, prior.attempts), priorSessionId: alias};
      }
      if (alias !== transition.currentKey || transition.reason !== "rescheduled") {
        if (prior?.status === "queued") put(alias, {status: "action_required", reason: transition.reason === "unresolved" ? "source-discontinuity" : transition.reason});
      }
    }
  }
  const inventory = new Map<string, {entry: WebinarReconciliationResult["inventory"][number]; reason?: string}>();
  for (const entry of result.inventory) {
    const id = entry.sessionKey ?? entry.reviewKey;
    const reason = entry.reason ?? (entry.snapshot.status === "rejected" ? "rejected" : entry.snapshot.registrationOnly ? "needs-registration" :
      entry.classification !== "webinar" ? "needs-review" : undefined);
    if (!inventory.has(id) || reason) inventory.set(id, {entry, reason});
  }
  for (const [id, {entry, reason}] of inventory) {
    const row = operations[id], attempts = row?.attempts ?? 0;
    put(id, {status: reason || !entry.sessionKey ? "action_required" : "queued", reason: reason ?? (!entry.sessionKey ? "needs-review" : undefined),
      title: (entry.snapshot.title ?? "Webinar").replace(/https?:\/\/\S+/gi, "[link removed]"), startTime: entry.snapshot.startTime, endTime: entry.snapshot.endTime, attempts});
  }
  for (const row of series) {
    if (!row.cancelled && classifyWebinarInvite(row.title) === "meeting") continue;
    put(webinarSessionKey(`source-series|${tenantId}|${row.id}`), {status: "action_required", reason: row.cancelled ? "cancelled" : "recurring-series",
      title: row.title.replace(/https?:\/\/\S+/gi, "[link removed]"), sourceKind: "series", sourceId: row.id, attempts: 0});
  }
  return operations;
}
