import { claims as claimsColl } from "../../../../packages/db/src/collections/claims.js";
import { sessions as sessionsColl } from "../../../../packages/db/src/collections/sessions.js";
import type { Claims, Sessions } from "@lkb/core";
import type { Db } from "mongodb";
import { assertValidTenantId, getDb } from "@lkb/db";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import type { ClaimListItem, ClaimsListDeps } from "./router.js";

/** Minimal read surface of the tenant-scoped accessors (injectable for tests). */
export interface ClaimsListReaders {
  claims(tenantId: string): { find(filter: Record<string, unknown>): { sort(o: Record<string, 1 | -1>): { skip(n: number): { limit(n: number): { toArray(): Promise<Claims[]> } } } } };
  sessions(tenantId: string): { find(filter: Record<string, unknown>): { toArray(): Promise<Sessions[]> } };
}
const defaultReaders = { claims: claimsColl, sessions: sessionsColl } as unknown as ClaimsListReaders;

export const CLAIMS_SCAN_BATCH = 200;
export const MAX_CLAIMS_SCAN = 12000;
type ClaimsReadDb = Pick<Db, "collection">;

/** Pagination and its extra-row signal count only currently eligible claims. */
export function createMongoClaimsListDeps(readers: ClaimsListReaders = defaultReaders, db: () => ClaimsReadDb = getDb): ClaimsListDeps {
  return {
    async listClaims(tenantId, query) {
      assertValidTenantId(tenantId, "claims.list");
      if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100 || !Number.isInteger(query.offset)
          || query.offset < 0 || query.offset > 10000) throw new Error("Invalid claims query");
      const visibility = createKnowledgeVisibility(db());
      const visible: Claims[] = [];
      const target = query.offset + query.limit + 1;
      let lastId: string | undefined, scanned = 0, complete = false;
      const safe = async (claim: Claims): Promise<boolean> => {
        if (!await visibility.claimVisible(tenantId, claim)) return false;
        for (const id of new Set(claim.evidence.map(e => e.sessionId))) {
          if (!await visibility.safeCitationSession(tenantId, id, claim)) return false;
        }
        return true;
      };
      while (visible.length < target && scanned < MAX_CLAIMS_SCAN) {
        const take = Math.min(CLAIMS_SCAN_BATCH, MAX_CLAIMS_SCAN - scanned);
        const filter = { ...(query.status ? { status: query.status } : {}), ...(lastId ? { _id: { $gt: lastId } } : {}) };
        const rows = await readers.claims(tenantId).find(filter).sort({ _id: 1 }).skip(0).limit(take).toArray();
        if (rows.length > take) throw new Error("Claims are unavailable");
        for (const claim of rows) {
          if (claim.tenantId !== tenantId || typeof claim._id !== "string" || !claim._id || (lastId !== undefined && claim._id <= lastId)) {
            throw new Error("Claims are unavailable");
          }
          lastId = claim._id; scanned++;
          if (await safe(claim)) visible.push(claim);
          if (visible.length === target) break;
        }
        if (rows.length < take) { complete = true; break; }
      }
      // Incomplete scans reveal neither a partial page nor a hidden-row-derived count/flag.
      if (!complete && visible.length < target) throw new Error("Claims are unavailable");
      const page = visible.slice(query.offset, query.offset + query.limit);
      const titles = new Map<string, string>();
      for (const claim of visible) {
        if (!await safe(claim)) throw new Error("Claims are unavailable");
      }
      for (const id of new Set(page.flatMap(c => c.evidence.map(e => e.sessionId)))) {
        const claim = page.find(c => c.evidence.some(e => e.sessionId === id));
        const session = await visibility.safeCitationSession(tenantId, id, claim);
        if (!session) throw new Error("Claims are unavailable");
        titles.set(id, session.title);
      }
      const items: ClaimListItem[] = page.map(c => ({
        _id: c._id, text: c.text, status: c.status,
        ...(c.source !== "whatsapp" && c.confidence !== undefined ? { confidence: c.confidence } : {}),
        ...(c.source !== "whatsapp" && c.topicRefs !== undefined ? { topicRefs: c.topicRefs } : {}),
        evidence: c.evidence.map(e => ({ turnId: e.turnId, sessionId: e.sessionId, sessionTitle: titles.get(e.sessionId) ?? null })),
      }));
      return { claims: items, limit: query.limit, offset: query.offset, truncated: visible.length > query.offset + query.limit };
    },
  };
}
