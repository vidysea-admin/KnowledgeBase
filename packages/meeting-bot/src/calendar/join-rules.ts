/**
 * packages/meeting-bot/src/calendar/join-rules.ts — T-037 unit `t037-auto-join-rules-engine`.
 * Pure, serialisable auto-join rules and an evaluator. No I/O, no clock, no persistence; nothing
 * calls this yet (the scheduler still uses `selectAutoRecordItems` + `isTrustedSender`).
 *
 * DECISION: `join | skip | needs-approval`. A decision says only whether the bot may JOIN a
 * meeting without a click. It never says anything about registration: "approval does not prove
 * registration success" (T-037 task note), so there is deliberately no registration field here.
 *
 * PRECEDENCE (first match wins, evaluated top to bottom):
 *   1. per-meeting opt-out (state.optedOutEventIds contains event.id)  -> skip  (beats everything)
 *   2. a matching DENY rule (rule-list order)                          -> skip
 *   3. event cancelled                                                 -> skip
 *   4. event has no meeting URL                                        -> skip
 *   5. organiser missing/malformed                                     -> needs-approval (never join)
 *   6. a matching ALLOW rule (rule-list order)                         -> join
 *   7. approve-once sender (exact email) or approved domain (exact)    -> join
 *   8. nothing matched (DEFAULT-DENY)                                  -> needs-approval
 *
 * FAIL CLOSED ON INVALID DATA (C10): before any matching, the evaluator runs the SAME validators that
 * guard persistence (`validateJoinRuleSet` for the rule set, `validateJoinRuleState` for the state) and
 * matches against their normalised output. If either throws (wrong type, unknown field/kind/enum value,
 * bad domain/email, non-boolean flag, duplicate id, non-array list, null/undefined set...) the whole set
 * is invalid: the decision is `needs-approval` / `invalid-rule-set` and NEVER `join`; one bad rule
 * invalidates all rules (a broken deny rule cannot let a later allow win). The only thing honoured on
 * invalid data is a per-meeting opt-out (-> skip), because skip can never widen access.
 *
 * Matching: emails/domains are trimmed and lower-cased (one trailing dot on a domain is dropped).
 * A domain rule matches the exact domain or a TRUE subdomain (label boundary) only; set
 * `subdomains: false` on the rule for exact-only. Approved-once domains are exact-only.
 */
import { detectPlatform, type Platform } from "../platform.js";
import { normalizeDomain, normalizeEmail } from "./join-rules-normalize.js";

export const PLATFORMS: readonly Platform[] = ["meet", "teams", "zoom", "webex", "zoho", "cloudonair", "unknown"];

export type JoinRuleEffect = "allow" | "deny";
export type OrganizerScope = "internal" | "external";

/** All present fields must match (AND). At least one field is required. */
export interface JoinRuleMatch {
  email?: string;
  domain?: string;
  /** Domain rules only; default true (exact domain or true subdomain). false = exact domain only. */
  subdomains?: boolean;
  platform?: Platform;
  /** internal = organiser domain is (a subdomain of) one of `ownDomains`. */
  scope?: OrganizerScope;
}

export interface JoinRule {
  id: string;
  effect: JoinRuleEffect;
  match: JoinRuleMatch;
}

export interface JoinRuleSet {
  version: 1;
  ownDomains: readonly string[];
  rules: readonly JoinRule[];
}

/** Persistable state; every change goes through the pure helpers below. */
export interface JoinRuleState {
  approvedSenders: readonly string[];
  approvedDomains: readonly string[];
  optedOutEventIds: readonly string[];
}

export const EMPTY_JOIN_RULE_STATE: JoinRuleState = { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] };

/** Structural subset of `CalendarEvent`; `senderEmail` (when given) overrides `organizer`. */
export interface JoinRuleEvent {
  id: string;
  organizer?: string;
  senderEmail?: string;
  meetingUrl?: string;
  cancelled?: boolean;
}

export type JoinReason =
  | "meeting-opt-out" | "deny-rule" | "cancelled" | "no-meeting-url" | "sender-unverifiable"
  | "allow-rule" | "approved-sender" | "approved-domain" | "no-matching-rule" | "invalid-rule-set";

export interface JoinDecision {
  action: "join" | "skip" | "needs-approval";
  reason: JoinReason;
  /** Rule id, or a synthetic id: `opt-out:<eventId>`, `approval:sender:<e>`, `approval:domain:<d>`, `precondition`, `default-deny`, `invalid-rule-set`. */
  ruleId: string;
}

export { normalizeDomain, normalizeEmail, parseStrictEmail } from "./join-rules-normalize.js";

/** Exact domain, or (when `subdomains`) a true subdomain on a label boundary. */
function domainMatches(candidate: string, ruleDomain: string, subdomains: boolean): boolean {
  return candidate === ruleDomain || (subdomains && candidate.endsWith(`.${ruleDomain}`));
}

function ruleMatches(match: JoinRuleMatch, sender: { email: string; domain: string } | undefined,
  platform: Platform, internal: boolean | undefined): boolean {
  const keys = [match.email, match.domain, match.platform, match.scope].filter((v) => v !== undefined);
  if (keys.length === 0) return false; // empty matcher must never match everything
  if (match.email !== undefined) {
    const e = normalizeEmail(match.email);
    if (!sender || !e || sender.email !== e) return false;
  }
  if (match.domain !== undefined) {
    const d = normalizeDomain(match.domain);
    if (!sender || !d || !domainMatches(sender.domain, d, match.subdomains !== false)) return false;
  }
  if (match.platform !== undefined && match.platform !== platform) return false;
  if (match.scope !== undefined) {
    if (internal === undefined) return false; // unknown sender: scope can't be established
    if ((match.scope === "internal") !== internal) return false;
  }
  return true;
}

function norm(list: readonly string[], f: (v: unknown) => string | undefined): string[] {
  return list.map(f).filter((v): v is string => v !== undefined);
}

export function evaluateJoinRules(event: JoinRuleEvent, rawRuleSet: JoinRuleSet,
  rawState: JoinRuleState = EMPTY_JOIN_RULE_STATE): JoinDecision {
  const skip = (reason: JoinReason, ruleId: string): JoinDecision => ({ action: "skip", reason, ruleId });
  // Opt-out can only narrow access, so it is honoured even when the rest of the input is invalid.
  const rawOptOuts: unknown = isObj(rawState) ? rawState.optedOutEventIds : undefined;
  if (Array.isArray(rawOptOuts) && typeof event.id === "string" && rawOptOuts.includes(event.id)) {
    return skip("meeting-opt-out", `opt-out:${event.id}`);
  }
  let ruleSet: JoinRuleSet;
  let state: JoinRuleState;
  try {
    ruleSet = validateJoinRuleSet(rawRuleSet);
    state = validateJoinRuleState(rawState);
  } catch {
    return { action: "needs-approval", reason: "invalid-rule-set", ruleId: "invalid-rule-set" };
  }

  const email = normalizeEmail(event.senderEmail ?? event.organizer);
  const sender = email ? { email, domain: email.slice(email.indexOf("@") + 1) } : undefined;
  const platform: Platform = typeof event.meetingUrl === "string" ? detectPlatform(event.meetingUrl) : "unknown";
  const own = norm(ruleSet.ownDomains, normalizeDomain);
  const internal = sender ? own.some((d) => domainMatches(sender.domain, d, true)) : undefined;

  for (const rule of ruleSet.rules) {
    if (rule.effect === "deny" && ruleMatches(rule.match, sender, platform, internal)) return skip("deny-rule", rule.id);
  }
  if (event.cancelled === true) return skip("cancelled", "precondition");
  if (typeof event.meetingUrl !== "string" || event.meetingUrl.trim() === "") return skip("no-meeting-url", "precondition");
  if (!sender) return { action: "needs-approval", reason: "sender-unverifiable", ruleId: "precondition" };

  for (const rule of ruleSet.rules) {
    if (rule.effect === "allow" && ruleMatches(rule.match, sender, platform, internal)) {
      return { action: "join", reason: "allow-rule", ruleId: rule.id };
    }
  }
  if (norm(state.approvedSenders, normalizeEmail).includes(sender.email)) {
    return { action: "join", reason: "approved-sender", ruleId: `approval:sender:${sender.email}` };
  }
  const approvedDomain = norm(state.approvedDomains, normalizeDomain).find((d) => d === sender.domain);
  if (approvedDomain) return { action: "join", reason: "approved-domain", ruleId: `approval:domain:${approvedDomain}` };
  return { action: "needs-approval", reason: "no-matching-rule", ruleId: "default-deny" };
}

/** "Approve once -> trusted": returns NEW state; the input is never mutated. Throws on invalid value. */
export function recordRuleApproval(state: JoinRuleState, approval: { kind: "sender" | "domain"; value: string }): JoinRuleState {
  if (approval.kind === "sender") {
    const e = normalizeEmail(approval.value);
    if (!e) throw new Error(`recordRuleApproval: invalid sender email ${JSON.stringify(approval.value)}`);
    return { ...state, approvedSenders: state.approvedSenders.includes(e) ? [...state.approvedSenders] : [...state.approvedSenders, e],
      approvedDomains: [...state.approvedDomains], optedOutEventIds: [...state.optedOutEventIds] };
  }
  if (approval.kind === "domain") {
    const d = normalizeDomain(approval.value);
    if (!d) throw new Error(`recordRuleApproval: invalid domain ${JSON.stringify(approval.value)}`);
    return { ...state, approvedSenders: [...state.approvedSenders],
      approvedDomains: state.approvedDomains.includes(d) ? [...state.approvedDomains] : [...state.approvedDomains, d],
      optedOutEventIds: [...state.optedOutEventIds] };
  }
  throw new Error(`recordRuleApproval: unknown kind ${JSON.stringify((approval as { kind: unknown }).kind)}`);
}

/** Per-meeting opt-out; returns NEW state. */
export function recordOptOut(state: JoinRuleState, eventId: string): JoinRuleState {
  if (typeof eventId !== "string" || eventId === "") throw new Error("recordOptOut: eventId must be a non-empty string");
  return { approvedSenders: [...state.approvedSenders], approvedDomains: [...state.approvedDomains],
    optedOutEventIds: state.optedOutEventIds.includes(eventId) ? [...state.optedOutEventIds] : [...state.optedOutEventIds, eventId] };
}

/** Structural twin of core's `TrustedSenderConfig` (kept local so the module stays decoupled). */
export interface TrustedSenderConfigLike { emails: readonly string[]; domains: readonly string[] }

/**
 * Equivalent rule set for the env-based allowlist: each email -> allow(email), each domain ->
 * allow(domain, exact-only, matching `isTrustedSender`, which never matched subdomains).
 * Intentionally stricter than `isTrustedSender` on malformed senders (see tests).
 */
export function ruleSetFromTrustedSenderConfig(cfg: TrustedSenderConfigLike, ownDomains: readonly string[] = []): JoinRuleSet {
  // De-duplicate on the normalised value and drop entries the engine cannot represent (as the engine
  // always did), so the output stays valid: the evaluator now treats any invalid set as "never join".
  const emails = [...new Set(cfg.emails.map(normalizeEmail).filter((v): v is string => v !== undefined))];
  const domains = [...new Set(cfg.domains.map(normalizeDomain).filter((v): v is string => v !== undefined))];
  const rules: JoinRule[] = [
    ...emails.map((e): JoinRule => ({ id: `trusted-email:${e}`, effect: "allow", match: { email: e } })),
    ...domains.map((d): JoinRule => ({ id: `trusted-domain:${d}`, effect: "allow", match: { domain: d, subdomains: false } })),
  ];
  return { version: 1, ownDomains: [...ownDomains], rules };
}

export class JoinRuleSetValidationError extends Error {
  constructor(public readonly path: string, detail: string) {
    super(`invalid join rule set at ${path}: ${detail}`);
    this.name = "JoinRuleSetValidationError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function rejectUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new JoinRuleSetValidationError(path, `unknown field "${k}"`);
}

/** Validates persisted/untrusted state and returns a normalised copy. Throws `JoinRuleSetValidationError`. */
export function validateJoinRuleState(input: unknown): JoinRuleState {
  if (!isObj(input)) throw new JoinRuleSetValidationError("$state", "must be an object");
  rejectUnknownKeys(input, ["approvedSenders", "approvedDomains", "optedOutEventIds"], "$state");
  const list = (key: string): unknown[] => {
    const v = input[key];
    if (!Array.isArray(v)) throw new JoinRuleSetValidationError(`$state.${key}`, "must be an array");
    return v;
  };
  const approvedSenders = list("approvedSenders").map((v, i) => {
    const n = normalizeEmail(v);
    if (!n) throw new JoinRuleSetValidationError(`$state.approvedSenders[${i}]`, "not a valid email");
    return n;
  });
  const approvedDomains = list("approvedDomains").map((v, i) => {
    const n = normalizeDomain(v);
    if (!n) throw new JoinRuleSetValidationError(`$state.approvedDomains[${i}]`, "not a valid domain");
    return n;
  });
  const optedOutEventIds = list("optedOutEventIds").map((v, i) => {
    if (typeof v !== "string" || v === "") throw new JoinRuleSetValidationError(`$state.optedOutEventIds[${i}]`, "must be a non-empty string");
    return v;
  });
  return { approvedSenders, approvedDomains, optedOutEventIds };
}

/** Validates JSON-parsed input and returns a normalised copy. Throws `JoinRuleSetValidationError`. */
export function validateJoinRuleSet(input: unknown): JoinRuleSet {
  if (!isObj(input)) throw new JoinRuleSetValidationError("$", "must be an object");
  rejectUnknownKeys(input, ["version", "ownDomains", "rules"], "$");
  if (input.version !== 1) throw new JoinRuleSetValidationError("$.version", "must be 1");
  if (!Array.isArray(input.ownDomains)) throw new JoinRuleSetValidationError("$.ownDomains", "must be an array");
  if (!Array.isArray(input.rules)) throw new JoinRuleSetValidationError("$.rules", "must be an array");
  const ownDomains = input.ownDomains.map((d, i) => {
    const n = normalizeDomain(d);
    if (!n) throw new JoinRuleSetValidationError(`$.ownDomains[${i}]`, "not a valid domain");
    return n;
  });
  const seen = new Set<string>();
  const rules = input.rules.map((r, i): JoinRule => {
    const p = `$.rules[${i}]`;
    if (!isObj(r)) throw new JoinRuleSetValidationError(p, "must be an object");
    rejectUnknownKeys(r, ["id", "effect", "match"], p);
    if (typeof r.id !== "string" || r.id.trim() === "") throw new JoinRuleSetValidationError(`${p}.id`, "must be a non-empty string");
    if (seen.has(r.id)) throw new JoinRuleSetValidationError(`${p}.id`, `duplicate id "${r.id}"`);
    seen.add(r.id);
    if (r.effect !== "allow" && r.effect !== "deny") throw new JoinRuleSetValidationError(`${p}.effect`, 'must be "allow" or "deny"');
    const m = r.match;
    if (!isObj(m)) throw new JoinRuleSetValidationError(`${p}.match`, "must be an object");
    rejectUnknownKeys(m, ["email", "domain", "subdomains", "platform", "scope"], `${p}.match`);
    if (m.email === undefined && m.domain === undefined && m.platform === undefined && m.scope === undefined) {
      throw new JoinRuleSetValidationError(`${p}.match`, "needs at least one of email, domain, platform, scope");
    }
    const match: JoinRuleMatch = {};
    if (m.email !== undefined) {
      const e = normalizeEmail(m.email);
      if (!e) throw new JoinRuleSetValidationError(`${p}.match.email`, "not a valid email");
      match.email = e;
    }
    if (m.domain !== undefined) {
      const d = normalizeDomain(m.domain);
      if (!d) throw new JoinRuleSetValidationError(`${p}.match.domain`, "not a valid domain");
      match.domain = d;
    }
    if (m.subdomains !== undefined) {
      if (typeof m.subdomains !== "boolean" || m.domain === undefined) {
        throw new JoinRuleSetValidationError(`${p}.match.subdomains`, "must be a boolean and only valid with domain");
      }
      match.subdomains = m.subdomains;
    }
    if (m.platform !== undefined) {
      if (typeof m.platform !== "string" || !PLATFORMS.includes(m.platform as Platform)) {
        throw new JoinRuleSetValidationError(`${p}.match.platform`, `must be one of ${PLATFORMS.join(", ")}`);
      }
      match.platform = m.platform as Platform;
    }
    if (m.scope !== undefined) {
      if (m.scope !== "internal" && m.scope !== "external") throw new JoinRuleSetValidationError(`${p}.match.scope`, 'must be "internal" or "external"');
      match.scope = m.scope;
    }
    return { id: r.id, effect: r.effect, match };
  });
  return { version: 1, ownDomains, rules };
}
