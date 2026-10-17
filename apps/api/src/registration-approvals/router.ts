/** D-180 ruling 1: POST /registration-approvals. Mounted after the shared requireAuth perimeter; needs the dedicated
 * `registration:approve` scope AND a server-configured human reviewer identity. Bots and service keys are refused.
 * Tenant and approver come only from the verified key and server-owned review authority, never from the body. */
import { createHash, randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { isValidTenantId, requireScope } from "../auth.js";
import type { ReviewPolicyResolver } from "../review-authority/policy.js";
import { REGISTRATION_APPROVAL_MAX_TTL_MS, type RegistrationApprovalRow, type RegistrationApprovalStore } from "./store.js";

export const REGISTRATION_APPROVE_SCOPE = "registration:approve";
export interface ApprovalPrincipal { readonly tenantId: string; readonly keyId: string; readonly scopes: readonly string[] }
export interface RegistrationApprovalRouterDeps {
  store: RegistrationApprovalStore;
  /** Server-owned identity lookup. Returns a subject only for a configured HUMAN reviewer of that tenant. */
  humanFor(principal: ApprovalPrincipal): Promise<{ subject: string } | null>;
  now?: () => Date;
  newId?: () => string;
}
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const shape = (v: unknown, required: string[], optional: string[] = []): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) &&
  required.every(k => Object.prototype.hasOwnProperty.call(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
/** The WHATWG serialization of an https URL without credentials or fragment; anything else is not approvable. */
export function canonicalRegistrationLink(link: unknown): string | null {
  if (typeof link !== "string" || link.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(link)) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.port ? url.href : null;
  } catch { return null; }
}
/** Composition adapter over the server-owned review authority (LKB_REVIEW_AUTHORITY_JSON): only a configured human reviewer
 * key of the SAME tenant yields a subject. Automation (bot/service) keys and unlisted keys yield null. */
export function createHumanApproverLookup(resolver: ReviewPolicyResolver): RegistrationApprovalRouterDeps["humanFor"] {
  return async principal => {
    const p = resolver.resolve(principal);
    if (!p || p.tenantId !== principal.tenantId || p.reviewerKind !== "human" || !id(p.subject)) return null;
    return { subject: p.subject };
  };
}
const fail = (res: Response, status: number, error: string) => { res.status(status).json({ error }); };

export function createRegistrationApprovalRouter(deps: RegistrationApprovalRouterDeps): Router {
  const router = Router(), now = deps.now ?? (() => new Date()), newId = deps.newId ?? randomUUID;
  async function approver(req: Request, res: Response): Promise<{ tenantId: string; subject: string } | null> {
    res.setHeader("Cache-Control", "private, no-store");
    const auth = req.auth;
    if (!auth || !isValidTenantId(auth.tenantId) || !id(auth.keyId) || !Array.isArray(auth.scopes)) { fail(res, 401, "unauthorized"); return null; }
    const principal = Object.freeze({ tenantId: auth.tenantId, keyId: auth.keyId, scopes: Object.freeze([...auth.scopes]) });
    let human: { subject: string } | null = null;
    try { human = typeof deps.humanFor === "function" ? await deps.humanFor(principal) : null; } catch { human = null; }
    if (!human || !id(human.subject)) { fail(res, 403, "human_approver_required"); return null; }
    return { tenantId: principal.tenantId, subject: human.subject };
  }
  router.post("/registration-approvals", requireScope(REGISTRATION_APPROVE_SCOPE), async (req, res) => {
    try {
      const who = await approver(req, res); if (!who) return;
      const b: unknown = req.body;
      if (Object.keys(req.query).length || !shape(b, ["link", "scopeHash", "policyHash"], ["zoom", "ttlDays"]) || !sha(b.scopeHash) || !sha(b.policyHash)) return fail(res, 400, "invalid");
      const canonical = canonicalRegistrationLink(b.link);
      const ttlDays = b.ttlDays === undefined ? 30 : b.ttlDays;
      if (!canonical || !Number.isSafeInteger(ttlDays) || (ttlDays as number) < 1 || (ttlDays as number) > 30) return fail(res, 400, "invalid");
      const zoom = b.zoom;
      if (zoom !== undefined && (!shape(zoom, ["bindingHash", "policyRevision", "hostScopeHash"]) || !sha(zoom.bindingHash) || !sha(zoom.hostScopeHash) ||
        !Number.isSafeInteger(zoom.policyRevision) || (zoom.policyRevision as number) < 1)) return fail(res, 400, "invalid");
      const approvedAt = now(), decisionId = newId();
      const expiresAt = new Date(approvedAt.getTime() + Math.min((ttlDays as number) * 86400000, REGISTRATION_APPROVAL_MAX_TTL_MS));
      const row: RegistrationApprovalRow = { _id: decisionId, tenantId: who.tenantId, decisionId,
        linkHash: createHash("sha256").update(canonical).digest("hex"), scopeHash: b.scopeHash as string, policyHash: b.policyHash as string,
        ...(zoom ? { bindingHash: zoom.bindingHash as string, policyRevision: zoom.policyRevision as number, hostScopeHash: zoom.hostScopeHash as string } : {}),
        approvedBy: who.subject, approvedAt: approvedAt.toISOString(), expiresAt: expiresAt.toISOString() };
      await deps.store.create(row);
      res.status(201).json({ approval: { decisionId, linkHash: row.linkHash, approvedBy: row.approvedBy, approvedAt: row.approvedAt, expiresAt: row.expiresAt } });
    } catch { if (!res.headersSent) fail(res, 503, "unavailable"); }
  });
  router.post("/registration-approvals/:decisionId/revoke", requireScope(REGISTRATION_APPROVE_SCOPE), async (req, res) => {
    try {
      const who = await approver(req, res); if (!who) return;
      if (Object.keys(req.query).length || !id(req.params.decisionId) || (req.body !== undefined && !shape(req.body, []))) return fail(res, 400, "invalid");
      if (!await deps.store.revoke(who.tenantId, req.params.decisionId, now())) return fail(res, 404, "not_found");
      res.json({ revoked: req.params.decisionId });
    } catch { if (!res.headersSent) fail(res, 503, "unavailable"); }
  });
  return router;
}
