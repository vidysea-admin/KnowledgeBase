/** Pure pre-selection projection of persisted approval; never changes everyWebinar or candidate status.
 * Internal callers supply one document already read/validated by the primary/last-valid loader and
 * the current tick's authenticated API-key tenant. These values are NOT an authentication mechanism:
 * never construct this context from a client body. The existing selector and veto must consume the
 * same document before any scheduling. Undefined refuses projection, not an override of legacy policy.
 */
import type { AutoRecordCandidateInput, TrustedSenderConfig } from "@lkb/core";
import { evaluateJoinRules, normalizeDomain, parseStrictEmail, validateJoinRuleSet, validateJoinRuleState } from "./join-rules.js";
import { joinRulesFilePath, type StoredJoinRules } from "./join-rules-store.js";
import { JOIN_RULES_SNAPSHOT_TTL_MS } from "./join-rules-last-valid.js";
import { detectPlatform } from "../../platform.js";

export interface ApprovedTrustContext {
  configuredTenantId: string;
  keyTenantId: string;
  /** Current tick's verification clock, not a previous tick's successful key check. */
  verifiedAt: number;
  now: number;
  document: {tenantId: string; source: "primary" | "last-valid"; validatedAt: number; stored: StoredJoinRules};
}
export interface ApprovedTrustInput {
  context: ApprovedTrustContext;
  candidate: AutoRecordCandidateInput;
  base: TrustedSenderConfig;
  classification: "webinar" | "meeting" | "uncertain";
  leadMinutes: number;
  /** Only proven source/session aliases from accepted acquisition. Restriction-only, never grants. */
  identityIds?: readonly string[];
}

const validId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 1024 && !/[\s\x00-\x1f\x7f]/.test(v);
const clock = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** Adds only this authenticated candidate's exact saved mailbox/domain; no allow-rule expansion. */
export function projectApprovedSenderTrust(input: ApprovedTrustInput): TrustedSenderConfig | undefined {
  try {
    const {context: c, candidate: event, base, classification, leadMinutes} = input;
    const d = c.document;
    joinRulesFilePath(".", c.configuredTenantId); // canonical tenant validation; path calculation only
    if (c.keyTenantId !== c.configuredTenantId || d.tenantId !== c.keyTenantId ||
      !clock(c.now) || !clock(c.verifiedAt) || c.verifiedAt !== c.now || !clock(d.validatedAt)) return undefined;
    const age = c.now - d.validatedAt;
    if (d.source === "primary" ? age !== 0 : d.source !== "last-valid" || age < 0 || age >= JOIN_RULES_SNAPSHOT_TTL_MS) return undefined;
    const rules = validateJoinRuleSet(d.stored.ruleSet), state = validateJoinRuleState(d.stored.state);
    if (!Array.isArray(base.emails) || !Array.isArray(base.domains) ||
      base.emails.some(v => typeof v !== "string" || parseStrictEmail(v)?.email !== v) ||
      base.domains.some(v => typeof v !== "string" || normalizeDomain(v) !== v)) return undefined;
    const sender = parseStrictEmail(event.senderEmail);
    if (!sender || (event.senderDomain !== undefined && normalizeDomain(event.senderDomain) !== sender.domain) ||
      event.senderAuthenticated !== true || !["pending", "approved", "auto_approved"].includes(event.status) ||
      event.cancelled !== undefined && event.cancelled !== false || event.registrationOnly !== undefined && event.registrationOnly !== false ||
      classification !== "webinar" || event.meetingUrlSource !== "conference" || !validId(event.id) ||
      !Number.isFinite(leadMinutes) || leadMinutes < 0) return undefined;
    if (typeof event.meetingUrl !== "string" || typeof event.startTime !== "string" || typeof event.endTime !== "string") return undefined;
    const url = new URL(event.meetingUrl), start = Date.parse(event.startTime), end = Date.parse(event.endTime);
    if (event.meetingUrl !== event.meetingUrl.trim() || /[\x00-\x1f\x7f]/.test(event.meetingUrl) ||
      url.protocol !== "https:" || url.username || url.password || detectPlatform(event.meetingUrl) === "unknown" || !Number.isFinite(start) || !Number.isFinite(end) ||
      end <= start || c.now > end || c.now < start - leadMinutes * 60_000) return undefined;
    const aliases = input.identityIds ?? [];
    if (!Array.isArray(aliases) || aliases.length > 200 || aliases.some(id => !validId(id))) return undefined;
    for (const id of new Set([event.id, `gmail:${event.id}`, ...aliases])) {
      const decision = evaluateJoinRules({id, senderEmail: sender.email, meetingUrl: event.meetingUrl}, rules, state);
      if (decision.action !== "join") return undefined;
    }
    const email = state.approvedSenders.includes(sender.email), domain = state.approvedDomains.includes(sender.domain);
    if (!email && !domain) return undefined; // allow rules alone do not supply persisted approve-once authority
    return {emails: [...new Set([...base.emails, ...(email ? [sender.email] : [])])],
      domains: [...new Set([...base.domains, ...(domain ? [sender.domain] : [])])]};
  } catch { return undefined; }
}
