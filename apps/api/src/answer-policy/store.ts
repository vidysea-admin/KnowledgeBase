/**
 * Persistence seam for answer policies. Every method takes the tenant first and can only see that tenant's rows.
 * The in-memory implementation is the reference + test double; a Mongo implementation is a follow-up (see manifest).
 * Writes are append-only for revisions: history rows are never modified or deleted.
 */
import type { PolicyRevision, ReviewItem } from "./types.js";

export interface AnswerPolicyStore {
  /** Appends iff the current latest version equals `expectedLatest` (0 = none). Returns false when stale. Atomic. */
  appendRevision(tenantId: string, rev: PolicyRevision, expectedLatest: number): Promise<boolean>;
  history(tenantId: string, policyId: string): Promise<PolicyRevision[]>;
  latest(tenantId: string): Promise<PolicyRevision[]>;
  /** Inserts unless an item with the same kind+key already exists for the tenant; returns the stored item and whether it was new. */
  addItemIfAbsent(tenantId: string, item: ReviewItem): Promise<{ item: ReviewItem; created: boolean }>;
  items(tenantId: string): Promise<ReviewItem[]>;
  getItem(tenantId: string, id: string): Promise<ReviewItem | null>;
  /** Replaces the item only while it is still `open`; returns false if it was already closed (atomic). */
  closeItem(tenantId: string, id: string, closed: ReviewItem): Promise<boolean>;
}

interface TenantState { revisions: Map<string, PolicyRevision[]>; items: Map<string, ReviewItem>; keys: Set<string> }
const clone = <T>(v: T): T => structuredClone(v);

export function createInMemoryAnswerPolicyStore(): AnswerPolicyStore {
  const tenants = new Map<string, TenantState>();
  const state = (tenantId: string): TenantState => {
    let s = tenants.get(tenantId);
    if (!s) { s = { revisions: new Map(), items: new Map(), keys: new Set() }; tenants.set(tenantId, s); }
    return s;
  };
  const peek = (tenantId: string): TenantState | undefined => tenants.get(tenantId);
  return {
    async appendRevision(tenantId, rev, expectedLatest) {
      if (rev.tenantId !== tenantId) throw new Error("answer policy tenant mismatch");
      const s = state(tenantId);
      const rows = s.revisions.get(rev.policyId) ?? [];
      if ((rows.at(-1)?.version ?? 0) !== expectedLatest || rev.version !== expectedLatest + 1) return false;
      s.revisions.set(rev.policyId, [...rows, clone(rev)]);
      return true;
    },
    async history(tenantId, policyId) { return clone(peek(tenantId)?.revisions.get(policyId) ?? []); },
    async latest(tenantId) {
      const s = peek(tenantId);
      return s ? clone([...s.revisions.values()].map((rows) => rows.at(-1)!).sort((a, b) => a.policyId.localeCompare(b.policyId))) : [];
    },
    async addItemIfAbsent(tenantId, item) {
      if (item.tenantId !== tenantId) throw new Error("answer policy tenant mismatch");
      const s = state(tenantId);
      const dedupe = `${item.kind}|${item.key}`;
      if (s.keys.has(dedupe)) return { item: clone([...s.items.values()].find((i) => `${i.kind}|${i.key}` === dedupe)!), created: false };
      s.keys.add(dedupe); s.items.set(item.id, clone(item));
      return { item: clone(item), created: true };
    },
    async items(tenantId) { return clone([...(peek(tenantId)?.items.values() ?? [])]); },
    async getItem(tenantId, id) { const i = peek(tenantId)?.items.get(id); return i ? clone(i) : null; },
    async closeItem(tenantId, id, closed) {
      const s = peek(tenantId); const cur = s?.items.get(id);
      if (!s || !cur || cur.status !== "open" || closed.tenantId !== tenantId || closed.id !== id) return false;
      s.items.set(id, clone(closed));
      return true;
    },
  };
}
