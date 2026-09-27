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

const DEFAULT_TRUSTED_SENDER_EMAILS = ["karunn@vidysea.com"];
const DEFAULT_TRUSTED_SENDER_DOMAINS = ["theoutreachcollective.in", "ashoka.edu.in", "zoho.com", "zoom.us"];

function parseCsvEnv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Reads the trusted-sender allowlist from env (`AUTO_RECORD_TRUSTED_EMAILS` /
 * `AUTO_RECORD_TRUSTED_DOMAINS`, comma-separated), falling back to the defaults named in the U5
 * unit brief: karunn@vidysea.com, theoutreachcollective.in, ashoka.edu.in, zoho.com, zoom.us.
 * [ASSUMPTION] no existing settings/env key for this list was found in the repo (checked
 * qa/contracts/web-settings-keys.md, .env, config/) — these two new env keys are this unit's own
 * addition, documented here rather than silently invented; see the manifest's Known gaps.
 */
export function loadTrustedSenderConfig(env: NodeJS.ProcessEnv = process.env): TrustedSenderConfig {
  return {
    emails: parseCsvEnv(env.AUTO_RECORD_TRUSTED_EMAILS) ?? DEFAULT_TRUSTED_SENDER_EMAILS,
    domains: parseCsvEnv(env.AUTO_RECORD_TRUSTED_DOMAINS) ?? DEFAULT_TRUSTED_SENDER_DOMAINS,
  };
}
