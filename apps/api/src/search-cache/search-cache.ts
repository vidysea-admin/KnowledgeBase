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
 */
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
