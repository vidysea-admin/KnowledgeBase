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
