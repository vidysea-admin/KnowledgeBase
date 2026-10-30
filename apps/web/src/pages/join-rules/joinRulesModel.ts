/**
 * Pure model for the join-rules editor. The rule-set shape and every refusal below mirror the engine's
 * `validateJoinRuleSet` (packages/meeting-bot/src/calendar/join-rules/join-rules.ts) and its normalisers
 * (join-rules-normalize.ts). apps/web may not import packages/meeting-bot, so the rules are re-stated here;
 * this is a CONVENIENCE for the form only. The server re-validates and stays the authority.
 */
import { validateJoinRuleSet } from "../../../../../packages/ingest/src/join-policy/join-rules.js";
import { safePublicResourceUrl } from "../../safe-url.js";
import { JOIN_RULES_ENFORCED } from "./enforcement.js";
export const PLATFORMS = ["meet", "teams", "zoom", "webex", "zoho", "cloudonair", "unknown"] as const;
export type Platform = typeof PLATFORMS[number];
export type Effect = "allow" | "deny";
export type Scope = "internal" | "external";

export interface RuleMatch { email?: string; domain?: string; subdomains?: boolean; platform?: Platform; scope?: Scope; titleIncludes?: string[]; descriptionIncludes?: string[]; purposeAny?: string[] }
export interface Rule { id: string; effect: Effect; match: RuleMatch }
export interface PurposeGroup { id: string; titleIncludes?: string[]; descriptionIncludes?: string[] }
export interface RuleSet { version: 1; ownDomains: string[]; rules: Rule[]; attendanceMode?: "all" | "rules"; purposeGroups?: PurposeGroup[] }
export interface RuleState { approvedSenders: string[]; approvedDomains: string[]; optedOutEventIds: string[]; optedOutMeetings?: string[] }
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
export interface RuleDraft { key: number; id: string; effect: Effect; email: string; domain: string; subdomains: boolean; platform: "" | Platform; scope: "" | Scope; titleIncludes?: string; descriptionIncludes?: string; purposeAny?: string }
export interface PurposeDraft { key: number; id: string; titleIncludes: string; descriptionIncludes: string }
export interface DraftSet { ownDomains: string; rules: RuleDraft[]; attendanceMode?: "" | "all" | "rules"; purposeGroups?: PurposeDraft[] }

export function draftFromRuleSet(set: RuleSet): DraftSet {
  return {
    ownDomains: set.ownDomains.join("\n"),
    attendanceMode: set.attendanceMode ?? "",
    purposeGroups: set.purposeGroups?.map((g, key) => ({key, id:g.id, titleIncludes:g.titleIncludes?.join("\n") ?? "", descriptionIncludes:g.descriptionIncludes?.join("\n") ?? ""})),
    rules: set.rules.map((r, key) => ({
      key, id: r.id, effect: r.effect, email: r.match.email ?? "", domain: r.match.domain ?? "", subdomains: r.match.subdomains !== false,
      platform: r.match.platform ?? "", scope: r.match.scope ?? "",
      titleIncludes: r.match.titleIncludes?.join("\n") ?? "", descriptionIncludes:r.match.descriptionIncludes?.join("\n") ?? "", purposeAny:r.match.purposeAny?.join("\n") ?? "",
    })),
  };
}

export function newRuleDraft(key: number, n: number): RuleDraft {
  return { key, id: `rule-${n}`, effect: "allow", email: "", domain: "", subdomains: true, platform: "", scope: "", titleIncludes:"", descriptionIncludes:"", purposeAny:"" };
}

/** Builds the request body: ONLY version, ownDomains, rules. Never a tenant, never state. */
export function ruleSetFromDraft(draft: DraftSet): RuleSet {
  const lines = (s?: string) => (s ?? "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const ownDomains = draft.ownDomains.split(/\r?\n/).map(s => s.trim()).filter(s => s !== "");
  const rules = draft.rules.map((r): Rule => {
    const match: RuleMatch = {};
    if (r.email.trim() !== "") match.email = r.email.trim();
    if (r.domain.trim() !== "") { match.domain = r.domain.trim(); if (!r.subdomains) match.subdomains = false; }
    if (r.platform !== "") match.platform = r.platform;
    if (r.scope !== "") match.scope = r.scope;
    for (const field of ["titleIncludes", "descriptionIncludes", "purposeAny"] as const) {
      const values = lines(r[field]); if (values.length) match[field] = values;
    }
    return { id: r.id, effect: r.effect, match };
  });
  return { version: 1, ownDomains, rules, ...(draft.attendanceMode ? {attendanceMode:draft.attendanceMode} : {}),
    ...(draft.purposeGroups !== undefined ? {purposeGroups:draft.purposeGroups.map(g => ({id:g.id,
      ...(lines(g.titleIncludes).length ? {titleIncludes:lines(g.titleIncludes)} : {}),
      ...(lines(g.descriptionIncludes).length ? {descriptionIncludes:lines(g.descriptionIncludes)} : {})}))} : {}) };
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
    if (m.email === undefined && m.domain === undefined && m.platform === undefined && m.scope === undefined && m.titleIncludes === undefined && m.descriptionIncludes === undefined && m.purposeAny === undefined) {
      errors.push(`${p}: needs at least one matcher (sender, domain, platform, internal/external, phrases or purpose). A rule with no matcher is refused.`);
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
  // Reuse the canonical pure validator for mode, groups, literal phrase bounds and unknown fields.
  if (errors.length === 0) { try { validateJoinRuleSet(set); } catch (e) { errors.push(e instanceof Error ? e.message : "Invalid join rules."); } }
  return errors;
}

/** Stable comparison key for "did the server's rule set change since I loaded it". */
export const canonicalRuleSet = (set: RuleSet): string => JSON.stringify(set);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);


/** Defensive parse of a GET response; null when it is not the documented shape. */
export function parseView(raw: unknown): JoinRulesView | null {
  if (!isObj(raw) || !isObj(raw.ruleSet) || !isObj(raw.state)) return null;
  try {
    validateJoinRuleSet(raw.ruleSet);
    // Preserve the existing display parser: server strings remain visible as text.
    // The canonical evaluator independently validates state before any preview join.
    const st = raw.state;
    for (const key of ["approvedSenders", "approvedDomains", "optedOutEventIds", ...(st.optedOutMeetings !== undefined ? ["optedOutMeetings"] : [])])
      if (!Array.isArray(st[key]) || !(st[key] as unknown[]).every(v => typeof v === "string")) return null;
    // Copy the validated response without silently stripping newly supported fields.
    return structuredClone({ruleSet:raw.ruleSet, state:raw.state}) as unknown as JoinRulesView;
  } catch { return null; }
}

export type PendingKind = "sender" | "domain" | "optout";
/** Identity of the meeting an opt-out refers to. The opt-out form supplies meetingUrl (optional, typed by the user); sessionKey has no web source yet. */
export interface MeetingHints { meetingUrl?: string; sessionKey?: string }
export interface Pending { kind: PendingKind; value: string; hints?: MeetingHints }

/** Client-side value check for the three add forms (the server re-checks). Returns the trimmed value or an error. */
export function checkPendingValue(kind: PendingKind, raw: string): { value: string } | { error: string } {
  const value = raw.trim();
  if (kind === "sender") {
    // ISS-T037UI-002: normalizeEmail accepts any non-whitespace local part, so zero-width, bidi-override and look-alike
    // (e.g. Cyrillic) characters would be approved as typed and be invisible in the confirmation. Printable ASCII only.
    if (/[^\x21-\x7e]/.test(value)) return { error: "The sender address may only use plain English letters, digits and ASCII punctuation. Invisible or look-alike characters (for example zero-width or Cyrillic letters) are not accepted." };
    return normalizeEmail(value) && value.length <= 320 ? { value } : { error: "Enter a valid sender email address, for example speaker@example.com." };
  }
  if (kind === "domain") return normalizeDomain(value) && value.length <= 320 ? { value } : { error: "Enter a valid domain such as example.com (no wildcard, no @)." };
  return value !== "" && value.length <= 1024 ? { value } : { error: "Enter the event id to opt out of." };
}

/** The optional meeting link of an opt-out: blank is "not given"; otherwise an http(s) URL of at most 2048 characters (the router's bound), kept as typed (trimmed). */
export function checkMeetingUrl(raw: string): { url?: string } | { error: string } {
  const v = raw.trim();
  if (v === "") return {};
  const ok = v.length <= 2048 && safePublicResourceUrl(v) !== null;
  return ok ? { url: v } : { error: "Enter the meeting link as a full http(s) address, or leave it empty." };
}

/** The plain-language consequence the user must confirm. Domain approval is deliberately stronger. */
export function confirmationText(p: Pending, enforced: boolean = JOIN_RULES_ENFORCED): string {
  const note = enforced ? "" : " Join rules are not enforced by the bot yet: this is recorded, and the bot may still join until enforcement is switched on.";
  if (p.kind === "sender") {
    return enforced
      ? `Approving ${p.value} means the bot will join future meetings from ${p.value} automatically, with no human click.`
      : `Approving ${p.value} records that, once enforcement is switched on, the bot joins future meetings from ${p.value} automatically, with no human click.${note}`;
  }
  if (p.kind === "domain") {
    return (enforced ? `Approving the domain ${p.value} means the bot will join future meetings from EVERY sender at ${p.value} automatically, with no human click. `
      : `Approving the domain ${p.value} records that, once enforcement is switched on, the bot joins future meetings from EVERY sender at ${p.value} automatically, with no human click. `)
      + `That includes addresses you have never seen and people who join that organisation later. Approve a whole domain only if you fully trust everyone who can send from it.${note}`;
  }
  const link = p.hints?.meetingUrl ? ` The meeting link ${p.hints.meetingUrl} is sent with it, so the opt-out also matches by link.` : "";
  return (enforced
    ? `Opting out of event ${p.value} means the bot will not join that meeting, even if a rule or an approval would otherwise allow it.`
    : `Opting out of event ${p.value} records an opt-out for that event.`) + link + note;
}
