/** T-037: explicit operator profile authorization, independent of registration success. */
import { parseStrictEmail, normalizeDomain } from "./join-rules-normalize.js";
import { PLATFORMS } from "./join-rules.js";
import { detectPlatform, type Platform } from "./platform.js";

export interface RegistrationPolicy {
  version: 1;
  operator: { firstName: string; lastName: string; email: string; organization?: string };
  form: { mode: "native-html"; formSelector: string; submitSelector: string; fields: {
    firstName: string; lastName: string; email: string; organization?: string;
  } };
  scope: { organizers: string[]; domains: string[]; platforms: Platform[]; allowedHosts: string[] };
  relevance: { includeTerms: string[]; excludeTerms: string[] };
}
export interface RegistrationCandidate {
  id: string; meetingUrl?: string; sessionKey?: string;
  /** Private verified reconciliation aliases: restriction-only, never returned in profile API/UI. */
  registrationIdentity?: {sourceOccurrenceKey: string; sourceIds: string[]; sessionKeys: string[]};
  title?: string; senderEmail?: string; senderAuthenticated?: boolean; registrationUrl?: string;
  platform?: string; status?: string; cancelled?: boolean;
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function fields(v: unknown, allowed: string[]): Record<string, unknown> {
  if (!object(v) || Object.keys(v).some(k => !allowed.includes(k))) throw new Error("Invalid registration policy fields");
  return v;
}
function text(v: unknown, max = 200): string {
  if (typeof v !== "string" || !v.trim() || v.length > max || /[\x00-\x1f\x7f]/.test(v)) throw new Error("Invalid registration policy value");
  return v.trim();
}
function list(v: unknown, normalize: (v: unknown) => string | undefined, empty = false, max = 40): string[] {
  if (!Array.isArray(v) || v.length > max || (!empty && !v.length)) throw new Error("Invalid registration policy list");
  const out = v.map(x => { const s = normalize(x); if (!s) throw new Error("Invalid registration policy list value"); return s; });
  if (new Set(out).size !== out.length) throw new Error("Duplicate registration policy value");
  return out;
}
const asciiEmail = (v: unknown) => typeof v === "string" && !/[\x00-\x1f\x7f]/.test(v) ? parseStrictEmail(v.trim())?.email : undefined;
/** Closed operator/form fields prevent uploading arbitrary credentials, payment or CAPTCHA values. */
export function validateRegistrationPolicy(raw: unknown): RegistrationPolicy {
  const p = fields(raw, ["version", "operator", "form", "scope", "relevance"]);
  if (p.version !== 1) throw new Error("Invalid registration policy version");
  const o = fields(p.operator, ["firstName", "lastName", "email", "organization"]);
  const email = asciiEmail(o.email); if (!email || email.length > 256) throw new Error("Invalid registration email");
  const f = fields(p.form, ["mode", "formSelector", "submitSelector", "fields"]);
  if (f.mode !== "native-html") throw new Error("Unsupported registration form");
  const ff = fields(f.fields, ["firstName", "lastName", "email", "organization"]);
  const s = fields(p.scope, ["organizers", "domains", "platforms", "allowedHosts"]);
  const organizers = list(s.organizers, asciiEmail, true), domains = list(s.domains, normalizeDomain, true);
  if (!organizers.length && !domains.length) throw new Error("Registration organizer scope required");
  const platforms = list(s.platforms, x => typeof x === "string" && PLATFORMS.includes(x as Platform) ? x : undefined) as Platform[];
  const allowedHosts = list(s.allowedHosts, normalizeDomain, false, 20);
  const r = fields(p.relevance, ["includeTerms", "excludeTerms"]);
  const term = (x: unknown) => text(text(x, 100).normalize("NFKC").toLowerCase(), 100);
  const operator = { firstName: text(o.firstName), lastName: text(o.lastName), email,
    ...(o.organization === undefined ? {} : {organization: text(o.organization)}) };
  const formFields = { firstName: text(ff.firstName, 256), lastName: text(ff.lastName, 256), email: text(ff.email, 256),
    ...(ff.organization === undefined ? {} : {organization: text(ff.organization, 256)}) };
  if ((operator.organization === undefined) !== (formFields.organization === undefined)) throw new Error("Organization field/value must match");
  if (new Set(Object.values(formFields)).size !== Object.values(formFields).length) throw new Error("Registration field selectors must be distinct");
  return {version: 1, operator, form: {mode: "native-html", formSelector: text(f.formSelector, 256),
    submitSelector: text(f.submitSelector, 256), fields: formFields}, scope: {organizers, domains, platforms, allowedHosts},
    relevance: {includeTerms: list(r.includeTerms, term), excludeTerms: list(r.excludeTerms, term, true)}};
}
/** All dimensions AND; exact organizer/domain/host, and exclusion always wins. No submission or confirmation occurs here. */
export function registrationPolicyAllows(policy: RegistrationPolicy, c: RegistrationCandidate): boolean {
  if (typeof c.id !== "string" || !c.id || c.id.length > 1024) return false;
  if (c.cancelled || !["approved", "auto_approved"].includes(c.status ?? "") || c.senderAuthenticated !== true) return false;
  const email = parseStrictEmail(c.senderEmail)?.email; if (!email) return false;
  const domain = email.slice(email.indexOf("@") + 1), s = policy.scope;
  if (!s.organizers.includes(email) && !s.domains.includes(domain)) return false;
  if (!s.platforms.includes(detectPlatform(c.registrationUrl ?? ""))) return false;
  let url: URL; try { url = new URL(c.registrationUrl ?? ""); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port || !s.allowedHosts.includes(url.hostname)) return false;
  if (typeof c.title !== "string" || c.title.length > 1000) return false;
  const title = c.title.normalize("NFKC").toLowerCase();
  return !policy.relevance.excludeTerms.some(t => title.includes(t)) && policy.relevance.includeTerms.some(t => title.includes(t));
}
