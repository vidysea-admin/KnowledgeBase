/** Persistable state; every change goes through the pure helpers below. */
export interface JoinRuleState {
  approvedSenders: readonly string[];
  approvedDomains: readonly string[];
  optedOutEventIds: readonly string[];
  /** Optional (absent in older documents): meeting identities of opted-out meetings, see join-rules-optout.ts. */
  optedOutMeetings?: readonly string[];
}

import { normalizeMeetingEntries } from "./join-rules-optout.js";
/**
 * packages/ingest/src/join-policy/join-rules-normalize.ts — ISS-367: pure email/domain normalisers
 * split out of join-rules.ts (file-length budget). Re-exported from join-rules.ts; behaviour unchanged.
 */

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Lower-cased, trimmed domain, or undefined when it is not a plausible multi-label hostname. */
export function normalizeDomain(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let d = value.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  return DOMAIN_RE.test(d) ? d : undefined;
}

/** Lower-cased, trimmed `local@domain` (exactly one `@`, no whitespace), or undefined. */
export function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const e = value.trim().toLowerCase();
  const parts = e.split("@");
  if (parts.length !== 2 || !parts[0] || /\s/.test(parts[0])) return undefined;
  const domain = normalizeDomain(parts[1]);
  return domain ? `${parts[0]}@${domain}` : undefined;
}

/**
 * Strict sender parse for trust decisions (ISS-CAPTURE-001). Accepts only a bare `local@domain`
 * that is already in canonical form up to letter case: printable ASCII only (no whitespace, control
 * or non-ASCII characters), none of `<>(),;:"` or backslash, exactly one `@`, non-empty local part, a valid
 * multi-label domain with no trailing dot. Returns the lower-cased email and its domain, or
 * undefined. Unlike `normalizeEmail` it never repairs input (no trimming, no dot stripping).
 */
export function parseStrictEmail(value: unknown): { email: string; domain: string } | undefined {
  if (typeof value !== "string" || value.length > 320 || !/^[!-~]+$/.test(value) || /[<>(),;:"\\]/.test(value)) return undefined;
  const lower = value.toLowerCase();
  const n = normalizeEmail(lower);
  if (n === undefined || n !== lower) return undefined;
  return { email: n, domain: n.slice(n.indexOf("@") + 1) };
}

export const normalizePhrase = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();
export function phraseMatches(text: unknown, phrases?: readonly string[]): boolean {
  if (typeof text !== "string" || text.length > 20000 || !phrases) return false;
  const normalized = normalizePhrase(text);
  return phrases.some(phrase => normalized.includes(phrase));
}

export class JoinRuleSetValidationError extends Error {
  constructor(public readonly path: string, detail: string) {
    super(`invalid join rule set at ${path}: ${detail}`);
    this.name = "JoinRuleSetValidationError";
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function rejectUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new JoinRuleSetValidationError(path, `unknown field "${k}"`);
}

/** Validates persisted/untrusted state and returns a normalised copy. Throws `JoinRuleSetValidationError`. */
export function validateJoinRuleState(input: unknown): JoinRuleState {
  if (!isObj(input)) throw new JoinRuleSetValidationError("$state", "must be an object");
  rejectUnknownKeys(input, ["approvedSenders", "approvedDomains", "optedOutEventIds", "optedOutMeetings"], "$state");
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
  if (input.optedOutMeetings === undefined) return { approvedSenders, approvedDomains, optedOutEventIds }; // old document: shape unchanged
  let optedOutMeetings: string[];
  try { optedOutMeetings = normalizeMeetingEntries(input.optedOutMeetings); }
  catch (e) { throw new JoinRuleSetValidationError("$state.optedOutMeetings", e instanceof Error ? e.message : "invalid"); }
  return { approvedSenders, approvedDomains, optedOutEventIds, optedOutMeetings };
}
