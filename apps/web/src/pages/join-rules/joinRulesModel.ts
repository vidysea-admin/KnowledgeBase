/**
 * Pure model for the join-rules editor. The rule-set shape and every refusal below mirror the engine's
 * `validateJoinRuleSet` (packages/meeting-bot/src/calendar/join-rules.ts) and its normalisers
 * (join-rules-normalize.ts). apps/web may not import packages/meeting-bot, so the rules are re-stated here;
 * this is a CONVENIENCE for the form only. The server re-validates and stays the authority.
 */
export const PLATFORMS = ["meet", "teams", "zoom", "webex", "zoho", "cloudonair", "unknown"] as const;
export type Platform = typeof PLATFORMS[number];
export type Effect = "allow" | "deny";
export type Scope = "internal" | "external";

export interface RuleMatch { email?: string; domain?: string; subdomains?: boolean; platform?: Platform; scope?: Scope }
export interface Rule { id: string; effect: Effect; match: RuleMatch }
export interface RuleSet { version: 1; ownDomains: string[]; rules: Rule[] }
export interface RuleState { approvedSenders: string[]; approvedDomains: string[]; optedOutEventIds: string[] }
export interface JoinRulesView { ruleSet: RuleSet; state: RuleState }

/** Request-size cap of the API (express.json default 100 kB). */
export const MAX_BODY_CHARS = 100_000;

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
/** Same as the engine: trim, lower-case, drop one trailing dot; multi-label hostnames only (so no wildcards). */
export function normalizeDomain(value: string): string | undefined {
  let d = value.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  return DOMAIN_RE.test(d) ? d : undefined;
}
/** Same as the engine: exactly one "@", non-empty local part without whitespace, valid domain. */
export function normalizeEmail(value: string): string | undefined {
  const e = value.trim().toLowerCase();
  const parts = e.split("@");
  if (parts.length !== 2 || !parts[0] || /\s/.test(parts[0])) return undefined;
  const domain = normalizeDomain(parts[1]!);
  return domain ? `${parts[0]}@${domain}` : undefined;
}

/** Editable form of a rule: every matcher is a string so a half-typed value is representable. */
export interface RuleDraft { key: number; id: string; effect: Effect; email: string; domain: string; subdomains: boolean; platform: "" | Platform; scope: "" | Scope }
export interface DraftSet { ownDomains: string; rules: RuleDraft[] }

export function draftFromRuleSet(set: RuleSet): DraftSet {
  return {
    ownDomains: set.ownDomains.join("\n"),
    rules: set.rules.map((r, key) => ({
      key, id: r.id, effect: r.effect, email: r.match.email ?? "", domain: r.match.domain ?? "", subdomains: r.match.subdomains !== false,
      platform: r.match.platform ?? "", scope: r.match.scope ?? "",
    })),
  };
}

export function newRuleDraft(key: number, n: number): RuleDraft {
  return { key, id: `rule-${n}`, effect: "allow", email: "", domain: "", subdomains: true, platform: "", scope: "" };
}

/** Builds the request body: ONLY version, ownDomains, rules. Never a tenant, never state. */
export function ruleSetFromDraft(draft: DraftSet): RuleSet {
  const ownDomains = draft.ownDomains.split(/\r?\n/).map(s => s.trim()).filter(s => s !== "");
  const rules = draft.rules.map((r): Rule => {
    const match: RuleMatch = {};
    if (r.email.trim() !== "") match.email = r.email.trim();
    if (r.domain.trim() !== "") { match.domain = r.domain.trim(); if (!r.subdomains) match.subdomains = false; }
    if (r.platform !== "") match.platform = r.platform;
    if (r.scope !== "") match.scope = r.scope;
    return { id: r.id, effect: r.effect, match };
  });
  return { version: 1, ownDomains, rules };
}

/** The engine's refusals, as readable messages. An empty array means the client sees nothing wrong. */
export function validateRuleSetClient(set: RuleSet): string[] {
  const errors: string[] = [];
  set.ownDomains.forEach((d, i) => {
    if (!normalizeDomain(d)) errors.push(`Own domain ${i + 1} ("${d}") is not a valid domain. Use a full name such as example.com; wildcards like *.example.com are not allowed.`);
  });
  const seen = new Set<string>();
  set.rules.forEach((r, i) => {
    const p = `Rule ${i + 1}`;
    if (r.id.trim() === "") errors.push(`${p}: the rule name must not be empty.`);
    else if (seen.has(r.id)) errors.push(`${p}: the rule name "${r.id}" is already used by another rule.`);
    seen.add(r.id);
    if (r.effect !== "allow" && r.effect !== "deny") errors.push(`${p}: choose allow or deny.`);
    const m = r.match;
    if (m.email === undefined && m.domain === undefined && m.platform === undefined && m.scope === undefined) {
      errors.push(`${p}: needs at least one matcher (sender, domain, platform or internal/external). A rule with no matcher is refused.`);
    }
    if (m.email !== undefined && !normalizeEmail(m.email)) errors.push(`${p}: sender "${m.email}" is not a valid email address.`);
    if (m.domain !== undefined && !normalizeDomain(m.domain)) {
      errors.push(`${p}: domain "${m.domain}" is not a valid domain. Wildcards like *.example.com are not allowed; subdomains are covered by the "include subdomains" option.`);
    }
    if (m.subdomains !== undefined && m.domain === undefined) errors.push(`${p}: "subdomains" is only valid together with a domain.`);
    if (m.platform !== undefined && !PLATFORMS.includes(m.platform)) errors.push(`${p}: platform must be one of ${PLATFORMS.join(", ")}.`);
    if (m.scope !== undefined && m.scope !== "internal" && m.scope !== "external") errors.push(`${p}: scope must be internal or external.`);
  });
  if (JSON.stringify(set).length > MAX_BODY_CHARS) errors.push("The rule set is too large to save (limit about 100 kB).");
  return errors;
}

/** Stable comparison key for "did the server's rule set change since I loaded it". */
export const canonicalRuleSet = (set: RuleSet): string => JSON.stringify(set);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] | null => Array.isArray(v) && v.every(x => typeof x === "string") ? v as string[] : null;

/** Defensive parse of a GET response; null when it is not the documented shape. */
export function parseView(raw: unknown): JoinRulesView | null {
  if (!isObj(raw) || !isObj(raw.ruleSet) || !isObj(raw.state)) return null;
  const rs = raw.ruleSet, st = raw.state;
  const ownDomains = strings(rs.ownDomains), approvedSenders = strings(st.approvedSenders);
  const approvedDomains = strings(st.approvedDomains), optedOutEventIds = strings(st.optedOutEventIds);
  if (rs.version !== 1 || !ownDomains || !Array.isArray(rs.rules) || !approvedSenders || !approvedDomains || !optedOutEventIds) return null;
  const rules: Rule[] = [];
  for (const r of rs.rules) {
    if (!isObj(r) || typeof r.id !== "string" || (r.effect !== "allow" && r.effect !== "deny") || !isObj(r.match)) return null;
    const m = r.match, match: RuleMatch = {};
    if (typeof m.email === "string") match.email = m.email;
    if (typeof m.domain === "string") match.domain = m.domain;
    if (typeof m.subdomains === "boolean") match.subdomains = m.subdomains;
    if (typeof m.platform === "string" && (PLATFORMS as readonly string[]).includes(m.platform)) match.platform = m.platform as Platform;
    if (m.scope === "internal" || m.scope === "external") match.scope = m.scope;
    rules.push({ id: r.id, effect: r.effect, match });
  }
  return { ruleSet: { version: 1, ownDomains, rules }, state: { approvedSenders, approvedDomains, optedOutEventIds } };
}

export type PendingKind = "sender" | "domain" | "optout";
/** Identity of the meeting an opt-out refers to. The editor does not know these today (it only has event ids); see postPending. */
export interface MeetingHints { meetingUrl?: string; sessionKey?: string }
export interface Pending { kind: PendingKind; value: string; hints?: MeetingHints }

/** Client-side value check for the three add forms (the server re-checks). Returns the trimmed value or an error. */
export function checkPendingValue(kind: PendingKind, raw: string): { value: string } | { error: string } {
  const value = raw.trim();
  if (kind === "sender") return normalizeEmail(value) && value.length <= 320 ? { value } : { error: "Enter a valid sender email address, for example speaker@example.com." };
  if (kind === "domain") return normalizeDomain(value) && value.length <= 320 ? { value } : { error: "Enter a valid domain such as example.com (no wildcard, no @)." };
  return value !== "" && value.length <= 1024 ? { value } : { error: "Enter the event id to opt out of." };
}

/** The plain-language consequence the user must confirm. Domain approval is deliberately stronger. */
export function confirmationText(p: Pending): string {
  if (p.kind === "sender") {
    return `Approving ${p.value} means the bot will join future meetings from ${p.value} automatically, with no human click.`;
  }
  if (p.kind === "domain") {
    return `Approving the domain ${p.value} means the bot will join future meetings from EVERY sender at ${p.value} automatically, with no human click. `
      + `That includes addresses you have never seen and people who join that organisation later. Approve a whole domain only if you fully trust everyone who can send from it.`;
  }
  return `Opting out of event ${p.value} means the bot will not join that meeting, even if a rule or an approval would otherwise allow it.`;
}
