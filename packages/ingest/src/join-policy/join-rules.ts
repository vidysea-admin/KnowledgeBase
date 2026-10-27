/**
 * Canonical pure, serialisable join policy; API and bot compatibility exports share it.
 * Opt-out wins, then deny, cancellation, missing link and unverifiable sender.
 * Explicit all mode joins otherwise eligible meetings. Explicit rules mode needs a
 * matching allow rule. Without a mode, allow rules and stored approvals retain legacy behaviour.
 * Invalid rules/state never join; valid opt-outs still skip. Match fields are ANDed;
 * phrase arrays and named purpose groups are ORed using normalized literal substrings.
 * This policy grants no registration permission. Invitation/link/time/freshness guards
 * remain the responsibility of the acquiring selector and runtime.
 */
import { detectPlatform, type Platform } from "./platform.js";
import { normalizeDomain, normalizeEmail, normalizePhrase, phraseMatches, isObj, rejectUnknownKeys, JoinRuleSetValidationError, validateJoinRuleState, type JoinRuleState } from "./join-rules-normalize.js";
import { addMeetingEntries, optedOutMeetingMatch, type OptOutMeeting } from "./join-rules-optout.js";

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
  titleIncludes?: readonly string[];
  descriptionIncludes?: readonly string[];
  purposeAny?: readonly string[];
}

export interface JoinRule {
  id: string;
  effect: JoinRuleEffect;
  match: JoinRuleMatch;
}

export interface JoinPurposeGroup { id: string; titleIncludes?: readonly string[]; descriptionIncludes?: readonly string[] }

export interface JoinRuleSet {
  version: 1;
  ownDomains: readonly string[];
  rules: readonly JoinRule[];
  /** Absent preserves legacy approval behaviour. Explicit rules requires a matching allow rule. */
  attendanceMode?: "all" | "rules";
  purposeGroups?: readonly JoinPurposeGroup[];
}

export type { JoinRuleState } from "./join-rules-normalize.js";
export const EMPTY_JOIN_RULE_STATE: JoinRuleState = { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] };

/** Structural subset of `CalendarEvent`; `senderEmail` (when given) overrides `organizer`. */
export interface JoinRuleEvent {
  id: string;
  organizer?: string;
  senderEmail?: string;
  meetingUrl?: string;
  cancelled?: boolean;
  /** Untrusted source text: compared only as bounded literal data, never executed. */
  title?: string;
  description?: string;
}

export type JoinReason =
  | "meeting-opt-out" | "deny-rule" | "cancelled" | "no-meeting-url" | "sender-unverifiable"
  | "all-mode" | "allow-rule" | "approved-sender" | "approved-domain" | "no-matching-rule" | "invalid-rule-set";

export interface JoinDecision {
  action: "join" | "skip" | "needs-approval";
  reason: JoinReason;
  /** Rule id, or a synthetic id: `opt-out:<eventId>`, `approval:sender:<e>`, `approval:domain:<d>`, `precondition`, `default-deny`, `invalid-rule-set`. */
  ruleId: string;
}

export { JoinRuleSetValidationError, validateJoinRuleState, normalizeDomain, normalizeEmail, parseStrictEmail } from "./join-rules-normalize.js";

/** Exact domain, or (when `subdomains`) a true subdomain on a label boundary. */
function domainMatches(candidate: string, ruleDomain: string, subdomains: boolean): boolean {
  return candidate === ruleDomain || (subdomains && candidate.endsWith(`.${ruleDomain}`));
}

function ruleMatches(match: JoinRuleMatch, sender: { email: string; domain: string } | undefined,
  platform: Platform, internal: boolean | undefined, event: JoinRuleEvent, groups: readonly JoinPurposeGroup[]): boolean {
  const keys = [match.email, match.domain, match.platform, match.scope, match.titleIncludes, match.descriptionIncludes, match.purposeAny].filter((v) => v !== undefined);
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
  if (match.titleIncludes && !phraseMatches(event.title, match.titleIncludes)) return false;
  if (match.descriptionIncludes && !phraseMatches(event.description, match.descriptionIncludes)) return false;
  if (match.purposeAny && !match.purposeAny.some(id => groups.some(group => group.id === id &&
    (phraseMatches(event.title, group.titleIncludes) || phraseMatches(event.description, group.descriptionIncludes))))) return false;
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
  // Same meeting recorded under another record (ISS-T037W1-001): works even when the opted-out record is absent.
  const meetingHit = optedOutMeetingMatch(isObj(rawState) ? rawState.optedOutMeetings : undefined, event.id, event.meetingUrl);
  if (meetingHit !== undefined) return skip("meeting-opt-out", `opt-out:${meetingHit}`);
  let ruleSet: JoinRuleSet;
  let state: JoinRuleState;
  try {
    ruleSet = validateJoinRuleSet(rawRuleSet);
    state = validateJoinRuleState(rawState);
  } catch {
    return { action: "needs-approval", reason: "invalid-rule-set", ruleId: "invalid-rule-set" };
  }

  if (ruleSet.attendanceMode !== undefined || ruleSet.purposeGroups !== undefined ||
    ruleSet.rules.some(r => r.match.titleIncludes || r.match.descriptionIncludes || r.match.purposeAny))
  for (const field of ["title", "description"] as const) if (event[field] !== undefined &&
    (typeof event[field] !== "string" || event[field]!.length > 20000))
    return { action: "needs-approval", reason: "invalid-rule-set", ruleId: "invalid-rule-set" };
  const email = normalizeEmail(event.senderEmail ?? event.organizer);
  const sender = email ? { email, domain: email.slice(email.indexOf("@") + 1) } : undefined;
  const platform: Platform = typeof event.meetingUrl === "string" ? detectPlatform(event.meetingUrl) : "unknown";
  const own = norm(ruleSet.ownDomains, normalizeDomain);
  const internal = sender ? own.some((d) => domainMatches(sender.domain, d, true)) : undefined;

  for (const rule of ruleSet.rules) {
    if (rule.effect === "deny" && ruleMatches(rule.match, sender, platform, internal, event, ruleSet.purposeGroups ?? [])) return skip("deny-rule", rule.id);
  }
  if (event.cancelled === true) return skip("cancelled", "precondition");
  if (typeof event.meetingUrl !== "string" || event.meetingUrl.trim() === "") return skip("no-meeting-url", "precondition");
  if (!sender) return { action: "needs-approval", reason: "sender-unverifiable", ruleId: "precondition" };

  if (ruleSet.attendanceMode === "all") return { action: "join", reason: "all-mode", ruleId: "mode:all" };
  for (const rule of ruleSet.rules) {
    if (rule.effect === "allow" && ruleMatches(rule.match, sender, platform, internal, event, ruleSet.purposeGroups ?? [])) {
      return { action: "join", reason: "allow-rule", ruleId: rule.id };
    }
  }
  if (ruleSet.attendanceMode === "rules") return { action: "needs-approval", reason: "no-matching-rule", ruleId: "default-deny" };
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

/**
 * Per-meeting opt-out; returns NEW state. `meeting` (optional) adds the meeting identity / sessionKey so the veto does not
 * depend on this record being present later; underivable or degenerate hints are ignored (id-only, as before).
 */
export function recordOptOut(state: JoinRuleState, eventId: string, meeting?: OptOutMeeting): JoinRuleState {
  if (typeof eventId !== "string" || eventId === "") throw new Error("recordOptOut: eventId must be a non-empty string");
  const meetings = addMeetingEntries(state.optedOutMeetings, meeting);
  return { approvedSenders: [...state.approvedSenders], approvedDomains: [...state.approvedDomains],
    optedOutEventIds: state.optedOutEventIds.includes(eventId) ? [...state.optedOutEventIds] : [...state.optedOutEventIds, eventId],
    ...(meetings ? { optedOutMeetings: meetings } : {}) };
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

/** Validates JSON-parsed input and returns a normalised copy. Throws `JoinRuleSetValidationError`. */
export function validateJoinRuleSet(input: unknown): JoinRuleSet {
  if (!isObj(input)) throw new JoinRuleSetValidationError("$", "must be an object");
  rejectUnknownKeys(input, ["version", "ownDomains", "rules", "attendanceMode", "purposeGroups"], "$");
  if (input.attendanceMode !== undefined && input.attendanceMode !== "all" && input.attendanceMode !== "rules")
    throw new JoinRuleSetValidationError("$.attendanceMode", "must be all or rules");
  const phrases = (value: unknown, path: string): string[] => {
    if (!Array.isArray(value) || value.length < 1 || value.length > 20 ||
      value.some(v => typeof v !== "string" || v.length > 160 || normalizePhrase(v) === ""))
      throw new JoinRuleSetValidationError(path, "needs 1-20 non-empty literal phrases of at most 160 characters");
    return [...new Set((value as string[]).map(normalizePhrase))];
  };
  const groupIds = new Set<string>();
  let purposeGroups: JoinPurposeGroup[] | undefined;
  if (input.purposeGroups !== undefined) {
    if (!Array.isArray(input.purposeGroups) || input.purposeGroups.length > 50) throw new JoinRuleSetValidationError("$.purposeGroups", "must be an array of at most 50 groups");
    purposeGroups = input.purposeGroups.map((g, i) => {
      const p = `$.purposeGroups[${i}]`;
      if (!isObj(g)) throw new JoinRuleSetValidationError(p, "must be an object");
      rejectUnknownKeys(g, ["id", "titleIncludes", "descriptionIncludes"], p);
      if (typeof g.id !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(g.id) || groupIds.has(g.id)) throw new JoinRuleSetValidationError(p, "needs a unique lowercase group id (1-64 characters)");
      groupIds.add(g.id);
      if (g.titleIncludes === undefined && g.descriptionIncludes === undefined) throw new JoinRuleSetValidationError(p, "needs title or description phrases");
      return {id: g.id, ...(g.titleIncludes !== undefined ? {titleIncludes: phrases(g.titleIncludes, p + ".titleIncludes")} : {}),
        ...(g.descriptionIncludes !== undefined ? {descriptionIncludes: phrases(g.descriptionIncludes, p + ".descriptionIncludes")} : {})};
    });
  }
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
    rejectUnknownKeys(m, ["email", "domain", "subdomains", "platform", "scope", "titleIncludes", "descriptionIncludes", "purposeAny"], `${p}.match`);
    if (m.email === undefined && m.domain === undefined && m.platform === undefined && m.scope === undefined && m.titleIncludes === undefined && m.descriptionIncludes === undefined && m.purposeAny === undefined) {
      throw new JoinRuleSetValidationError(`${p}.match`, "needs at least one of email, domain, platform, scope, titleIncludes, descriptionIncludes, purposeAny");
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
    for (const field of ["titleIncludes", "descriptionIncludes"] as const) if (m[field] !== undefined) match[field] = phrases(m[field], `${p}.match.${field}`);
    if (m.purposeAny !== undefined) {
      if (!Array.isArray(m.purposeAny) || m.purposeAny.length < 1 || m.purposeAny.length > 20 || m.purposeAny.some(id => typeof id !== "string" || !groupIds.has(id)))
        throw new JoinRuleSetValidationError(`${p}.match.purposeAny`, "needs 1-20 configured purpose group ids");
      match.purposeAny = [...new Set(m.purposeAny as string[])];
    }
    return { id: r.id, effect: r.effect, match };
  });
  return { version: 1, ownDomains, rules, ...(input.attendanceMode !== undefined ? {attendanceMode: input.attendanceMode} : {}),
    ...(purposeGroups !== undefined ? {purposeGroups} : {}) };
}
