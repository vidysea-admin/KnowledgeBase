/**
 * apps/api/src/claims/router.ts — T-007 read-only claims list. `GET /claims?status=&limit=&offset=`:
 * the calling tenant's claims, each with its evidence citation (session + turn ids, session title
 * when the session still exists). Read-only by construction: this router registers no non-GET
 * handler. Tenant comes ONLY from the verified key (`req.auth.tenantId`), never from the request.
 * Scope: reuses the existing `citations` scope (claims are what citations resolve); no new scope.
 */
import { Router } from "express";
import { requireScope } from "../auth.js";

export const CLAIM_STATUSES = ["verified", "needs-review", "conflicting"] as const;
export type ClaimStatusFilter = (typeof CLAIM_STATUSES)[number];

export interface ClaimListEvidence { turnId: string; sessionId: string; sessionTitle: string | null }
export interface ClaimListItem {
  _id: string;
  text: string;
  status: ClaimStatusFilter;
  confidence?: number;
  topicRefs?: string[];
  evidence: ClaimListEvidence[];
}
export interface ClaimsListQuery { status?: ClaimStatusFilter; limit: number; offset: number }
export interface ClaimsListResponse { claims: ClaimListItem[]; limit: number; offset: number; truncated: boolean }
export interface ClaimsListDeps { listClaims(tenantId: string, query: ClaimsListQuery): Promise<ClaimsListResponse> }

export const MAX_CLAIMS_LIMIT = 100;
export const DEFAULT_CLAIMS_LIMIT = 50;
export const MAX_CLAIMS_OFFSET = 10000;

/** Fail-closed default until production wires a store. */
export const unavailableClaimsListDeps: ClaimsListDeps = {
  async listClaims() { throw new Error("claims list unavailable"); },
};

export function parseClaimsQuery(search: URLSearchParams): ClaimsListQuery | null {
  const allowed = new Set(["status", "limit", "offset"]);
  for (const key of search.keys()) if (!allowed.has(key)) return null;
  for (const key of allowed) if (search.getAll(key).length > 1) return null;
  const status = search.get("status"), limit = search.get("limit"), offset = search.get("offset");
  if (status !== null && !(CLAIM_STATUSES as readonly string[]).includes(status)) return null;
  if (limit !== null && (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > MAX_CLAIMS_LIMIT)) return null;
  if (offset !== null && (!/^(0|[1-9][0-9]{0,4})$/.test(offset) || Number(offset) > MAX_CLAIMS_OFFSET)) return null;
  return {
    ...(status !== null ? { status: status as ClaimStatusFilter } : {}),
    limit: limit === null ? DEFAULT_CLAIMS_LIMIT : Number(limit),
    offset: offset === null ? 0 : Number(offset),
  };
}

export function createClaimsListRouter(deps: ClaimsListDeps): Router {
  const router = Router();
  router.get("/claims", requireScope("citations"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const query = parseClaimsQuery(new URL(req.originalUrl, "http://localhost").searchParams);
    if (!query) { res.status(400).json({ error: "invalid_claims_query", message: "Invalid claims query" }); return; }
    try {
      const tenantId = req.auth?.tenantId;
      if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Missing verified tenant");
      const result = await deps.listClaims(tenantId, query);
      if (!result || !Array.isArray(result.claims) || result.claims.length > query.limit) throw new Error("Invalid claims response");
      res.status(200).json({ claims: result.claims, limit: query.limit, offset: query.offset, truncated: result.truncated === true });
    } catch { res.status(503).json({ error: "claims_unavailable", message: "Claims are unavailable" }); }
  });
  return router;
}
