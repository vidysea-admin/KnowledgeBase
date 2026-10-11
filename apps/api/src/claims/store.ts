import { claims as claimsColl } from "../../../../packages/db/src/collections/claims.js";
import { sessions as sessionsColl } from "../../../../packages/db/src/collections/sessions.js";
import type { Claims, Sessions } from "@lkb/core";
import type { ClaimListItem, ClaimsListDeps } from "./router.js";

/** Minimal read surface of the tenant-scoped accessors (injectable for tests). */
export interface ClaimsListReaders {
  claims(tenantId: string): { find(filter: Record<string, unknown>): { sort(o: Record<string, 1 | -1>): { skip(n: number): { limit(n: number): { toArray(): Promise<Claims[]> } } } } };
  sessions(tenantId: string): { find(filter: Record<string, unknown>): { toArray(): Promise<Sessions[]> } };
}
const defaultReaders = { claims: claimsColl, sessions: sessionsColl } as unknown as ClaimsListReaders;

/** Tenant-scoped read via `coll(tenantId)` only; `limit + 1` rows are read to report truncation. */
export function createMongoClaimsListDeps(readers: ClaimsListReaders = defaultReaders): ClaimsListDeps {
  return {
    async listClaims(tenantId, query) {
      if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Invalid claims tenant");
      const filter = query.status ? { status: query.status } : {};
      const rows = await readers.claims(tenantId).find(filter).sort({ _id: 1 }).skip(query.offset).limit(query.limit + 1).toArray();
      const page = rows.slice(0, query.limit);
      const ids = [...new Set(page.flatMap((c) => c.evidence.map((e) => e.sessionId)))];
      const titles = new Map<string, string>();
      if (ids.length > 0) for (const s of await readers.sessions(tenantId).find({ _id: { $in: ids } }).toArray()) titles.set(s._id, s.title);
      const items: ClaimListItem[] = page.map((c) => ({
        _id: c._id, text: c.text, status: c.status,
        ...(c.confidence !== undefined ? { confidence: c.confidence } : {}),
        ...(c.topicRefs !== undefined ? { topicRefs: c.topicRefs } : {}),
        evidence: c.evidence.map((e) => ({ turnId: e.turnId, sessionId: e.sessionId, sessionTitle: titles.get(e.sessionId) ?? null })),
      }));
      return { claims: items, limit: query.limit, offset: query.offset, truncated: rows.length > query.limit };
    },
  };
}
