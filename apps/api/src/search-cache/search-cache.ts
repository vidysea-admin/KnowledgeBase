/**
 * apps/api/src/search-cache.ts - D-206 K5. A short-TTL per-tenant result cache for `GET /search`.
 *
 * No generic cache utility existed in apps/api (grepped `class .*Cache`, `ttlMs`, `TtlCache`), so this is the one
 * place it lives. It is deliberately dumb; the safety rules are enforced by structure, not by the caller's care:
 *
 *  1. TENANT ISOLATION IS STRUCTURAL. Entries live in `Map<tenantId, Map<key, entry>>`. `get(tenantA, key)` can only
 *     ever look inside tenant A's map, so no key collision, normalisation quirk or prefix trick can serve tenant A's
 *     result to tenant B (the ISS-078 class).
 *  2. AN ENTRY IS BOUND TO A VISIBILITY FINGERPRINT. `get` returns a value only when the caller's CURRENT fingerprint of
 *     everything that decides visibility equals the one stored with it. Consent withdrawal, a source relabel, a new or
 *     changed session, or a transcript correction changes the fingerprint, so the entry is dropped at once rather than
 *     living out its TTL. The TTL only bounds what the fingerprint cannot see (for example appended turns).
 *  3. Values are cloned on the way in and out, so a caller mutating a returned hit cannot poison the cache.
 *  4. THE FINGERPRINT IS SHARED. `visibilityFingerprint` below is the one definition both `GET /search` and `GET /route` use
 *     (ISS-420), so a consent withdrawal, relabel, index-status change, review edit or WhatsApp link invalidates BOTH caches on the
 *     very next request and the two can never drift apart.
 */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { assertValidTenantId, withTenant } from "@lkb/db";

export interface SearchCacheOptions { ttlMs: number; maxPerTenant?: number; maxTenants?: number; now?: () => number }
interface Entry<V> { expiresAt: number; fingerprint: string; value: V }

export class TenantSearchCache<V> {
  private readonly tenants = new Map<string, Map<string, Entry<V>>>();
  private readonly ttlMs: number; private readonly maxPerTenant: number; private readonly maxTenants: number;
  private readonly now: () => number;
  constructor(options: SearchCacheOptions) {
    this.ttlMs = options.ttlMs; this.maxPerTenant = options.maxPerTenant ?? 200; this.maxTenants = options.maxTenants ?? 100;
    this.now = options.now ?? Date.now;
  }
  get enabled(): boolean { return this.ttlMs > 0; }
  get(tenantId: string, key: string, fingerprint: string): V | undefined {
    if (!this.enabled) return undefined;
    const bucket = this.tenants.get(tenantId), entry = bucket?.get(key);
    if (!bucket || !entry) return undefined;
    if (entry.expiresAt <= this.now() || entry.fingerprint !== fingerprint) { bucket.delete(key); return undefined; }
    return structuredClone(entry.value);
  }
  set(tenantId: string, key: string, fingerprint: string, value: V): void {
    if (!this.enabled) return;
    let bucket = this.tenants.get(tenantId);
    if (!bucket) {
      if (this.tenants.size >= this.maxTenants) this.tenants.delete(this.tenants.keys().next().value as string);
      bucket = new Map(); this.tenants.set(tenantId, bucket);
    }
    if (bucket.size >= this.maxPerTenant && !bucket.has(key)) bucket.delete(bucket.keys().next().value as string);
    bucket.set(key, { expiresAt: this.now() + this.ttlMs, fingerprint, value: structuredClone(value) });
  }
  /** Explicit invalidation for in-process writers that know visibility just changed. */
  invalidate(tenantId: string): void { this.tenants.delete(tenantId); }
  size(tenantId: string): number { return this.tenants.get(tenantId)?.size ?? 0; }
}

/** Query key: case-folded, whitespace-collapsed, plus `k`. The tenant is NOT part of the key (see rule 1). */
export const searchCacheKey = (query: string, k: number): string => JSON.stringify([query.trim().toLowerCase().replace(/\s+/gu, " "), k]);

export interface VisibilityState { fingerprint: string; waSessions: Set<string> }

/**
 * Everything that decides what a tenant may see, hashed: source kind + consent, session -> source binding and index status,
 * every transcript-review head revision and every WhatsApp review candidate link (a candidate over a non-WhatsApp source hides it).
 * Read on EVERY cached request (four small tenant-scoped reads), so a consent withdrawal, relabel, index-status change, new session
 * or transcript correction invalidates the cache immediately instead of after the TTL. `waSessions` are sessions whose source is a
 * whatsapp-batch: results touching them are never cached, because WhatsApp visibility also depends on per-candidate approvals this
 * fingerprint does not read. A failure to read it THROWS; callers must bypass the cache, never substitute a constant.
 */
export async function visibilityFingerprint(db: Pick<Db, "collection">, tenantId: string): Promise<VisibilityState> {
  assertValidTenantId(tenantId, "search.cache");
  const read = async (name: string, projection: Record<string, 1>): Promise<Record<string, unknown>[]> => {
    const rows = await db.collection<Record<string, unknown> & { tenantId: string }>(name).find(withTenant<Record<string, unknown> & { tenantId: string }>(tenantId, {}), { projection }).toArray();
    if (rows.some(row => row.tenantId !== tenantId)) throw new Error("fingerprint scope mismatch");
    return rows;
  };
  // tenantId is part of every projection so the scope check above is a real check, not a vacuous one.
  const [sources, sessions, heads, candidates] = await Promise.all([
    read("sources", { _id: 1, tenantId: 1, kind: 1, consent: 1 }), read("sessions", { _id: 1, tenantId: 1, sourceId: 1, status: 1 }),
    read("transcript_reviews", { _id: 1, tenantId: 1, revision: 1 }), read("whatsapp_candidates", { _id: 1, tenantId: 1, sourceId: 1, sessionId: 1 }),
  ]);
  const byId = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const waSources = new Set(sources.filter(row => row.kind === "whatsapp-batch").map(row => String(row._id)));
  const fingerprint = createHash("sha256").update(JSON.stringify([byId(sources), byId(sessions), byId(heads), byId(candidates)])).digest("hex");
  return { fingerprint, waSessions: new Set(sessions.filter(row => waSources.has(String(row.sourceId))).map(row => String(row._id))) };
}

/**
 * Cycle 1: the fingerprint read bounded by the request's deadline. Resolves to the state, or to `null` (= bypass the cache, store
 * nothing) when the read fails, throws synchronously, or is still pending after HALF of the time left to `deadlineAt` (a cache
 * lookup must not spend the budget the real work needs).
 * NEVER rejects and never outlives the deadline: `maxTimeMS` only bounds server time, a driver-side wait (server selection, pool exhaustion) needs this race.
 */
export function fingerprintWithin(read: () => Promise<VisibilityState>, deadlineAt: number | undefined, now: () => number = Date.now): Promise<VisibilityState | null> {
  return new Promise((resolve) => {
    const timer = deadlineAt === undefined ? undefined : setTimeout(() => resolve(null), Math.max(0, Math.floor((deadlineAt - now()) / 2)));
    Promise.resolve().then(read).then((state) => { clearTimeout(timer); resolve(state); }, () => { clearTimeout(timer); resolve(null); });
  });
}

/**
 * ISS-427: a db handle whose every `find`/`findOne` carries `maxTimeMS` = the time left until `deadlineAt` (floor 1 ms), so the
 * server stops working when the request's hard deadline passes instead of burning on after the 503. An already-lower
 * `maxTimeMS`/`timeoutMS` on the call wins. Everything else on the collection is forwarded untouched. No deadline -> the db itself.
 */
export function withReadDeadline<D extends Pick<Db, "collection">>(db: D, deadlineAt: number | undefined, now: () => number = Date.now): D {
  if (deadlineAt === undefined) return db;
  const left = () => Math.max(1, Math.floor(deadlineAt - now()));
  const bounded = (options: Record<string, unknown> | undefined): Record<string, unknown> => {
    const cap = left(), maxTimeMS = typeof options?.maxTimeMS === "number" ? Math.min(options.maxTimeMS, cap) : cap;
    return { ...options, maxTimeMS, ...(typeof options?.timeoutMS === "number" ? { timeoutMS: Math.min(options.timeoutMS, cap) } : {}) };
  };
  return { collection: (name: string) => {
    const raw = db.collection(name);
    return new Proxy(raw, { get(target, property) {
      if (property === "find") return (filter?: object, options?: Record<string, unknown>) => (target as unknown as { find(f?: object, o?: object): unknown }).find(filter, bounded(options));
      if (property === "findOne") return (filter?: object, options?: Record<string, unknown>) => (target as unknown as { findOne(f?: object, o?: object): unknown }).findOne(filter, bounded(options));
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  } } as D;
}
