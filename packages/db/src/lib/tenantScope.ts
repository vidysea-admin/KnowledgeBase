// packages/db/src/lib/tenantScope.ts — T-018 C6. One shared definition of the
// tenant-scoping accessor pattern (ARCHITECTURE §5: "no handler accepts a tenant id from
// the client — session/auth-derived only"; every knowledge-layer row carries tenantId).
//
// scopedCollection(db, name) returns a function whose signature FORCES a tenantId argument
// at every call site — `coll(tenantId).find(filter)` — so a tenant-less query is a TS
// compile error, not a runtime bug. Every packages/db/src/collections/<coll>.ts file
// wraps this once; it is the only place the tenant-scoping logic itself is written.
import type { Collection, Db, Filter, OptionalUnlessRequiredId, UpdateFilter, UpdateOptions } from "mongodb";

export type TenantId = string;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** Throws unless `tenantId` is a non-empty string with no surrounding whitespace or control characters. A
 * truthy non-string (an object such as `{ $ne: null }`) would otherwise become a filter operator that matches
 * EVERY tenant; a number or array would match none. A query must never run without a valid tenant. */
export function assertValidTenantId(tenantId: unknown, where: string): asserts tenantId is TenantId {
  if (typeof tenantId !== "string" || tenantId.length === 0 || tenantId !== tenantId.trim() || CONTROL_CHARS.test(tenantId)) {
    throw new Error(`${where}: tenantId is required (a non-empty string without surrounding whitespace or control characters)`);
  }
}

/** Merges `{ tenantId }` into a filter so a caller can never omit it, even by accident. */
export function withTenant<T extends { tenantId: string }>(
  tenantId: TenantId,
  filter: Filter<T> = {},
): Filter<T> {
  assertValidTenantId(tenantId, "withTenant");
  return { ...filter, tenantId } as Filter<T>;
}

/**
 * Returns a `coll(tenantId): TenantScopedCollection<T>` accessor for one Mongo collection.
 * The returned object exposes only tenant-safe read/write helpers — never the raw
 * `Collection<T>` — so every query is pre-scoped and a tenant-less call cannot compile.
 * (ISS-065: `raw` used to be exposed as an escape hatch for `updateOne`, which had no
 * tenant-merged accessor of its own — seven call sites across this package and `apps/api`
 * went around the guard for exactly that reason, each hand-carrying its own `tenantId` in the
 * filter. `updateOne` below closes that gap; `raw` is gone.)
 */
export function scopedCollection<T extends { tenantId: string; _id: string }>(
  db: Db,
  name: string,
) {
  const raw: Collection<T> = db.collection<T>(name);

  return function coll(tenantId: TenantId) {
    assertValidTenantId(tenantId, `scopedCollection(${name})`);
    return {
      find: (filter: Filter<T> = {}) => raw.find(withTenant<T>(tenantId, filter)),
      findOne: (filter: Filter<T> = {}) => raw.findOne(withTenant<T>(tenantId, filter)),
      insertOne: (doc: Omit<T, "tenantId">) =>
        raw.insertOne({ ...doc, tenantId } as OptionalUnlessRequiredId<T>),
      insertMany: (docs: Omit<T, "tenantId">[]) =>
        raw.insertMany(docs.map((doc) => ({ ...doc, tenantId })) as OptionalUnlessRequiredId<T>[]),
      /** Tenant-merged delete. Added for ISS-060: `indexSession` reached `claims` and
       * `session_pages` through the RAW handle for its delete/insert half and carried the
       * tenantId by hand, so removing it from the filter compiled, passed every test, and
       * live destroyed a second tenant's claims. A write that can erase another tenant's rows
       * must not be the one operation this accessor makes people go around it for. */
      deleteMany: (filter: Filter<T> = {}) => raw.deleteMany(withTenant<T>(tenantId, filter)),
      /** Tenant-merged count. Added for ISS-068 (found by the checker verifying ISS-065's
       * removal of `raw`): `scripts/sync-real-turns.mjs`, a real runnable T-003 sync script
       * outside every workspace project's typecheck/test scope, called `raw.countDocuments`
       * directly and broke the moment `raw` was removed — the eighth `raw` call site, missed by
       * a grep scoped to `apps/`, `packages/` alone. */
      countDocuments: (filter: Filter<T> = {}) => raw.countDocuments(withTenant<T>(tenantId, filter)),
      /** Tenant-merged update. Added for ISS-065: this was the last write op with no accessor
       * of its own, so every caller reached `raw` and hand-carried `tenantId` in the filter —
       * exactly the shape of escape hatch ISS-060 went through on `deleteMany`, before that one
       * was closed the same way. */
      /** `options` was added for ISS-118, which needs an idempotent upsert (one gap row per
       * session, created or updated in a single write, never accumulating). It is deliberately
       * options-only and cannot weaken the scoping: the filter is still `withTenant`-merged before
       * it reaches the driver, so an upsert's inserted document is built from a filter that
       * already carries the tenantId. Passing options is not an escape hatch — `raw` stays gone. */
      updateOne: (filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions) =>
        raw.updateOne(withTenant<T>(tenantId, filter), update, options ?? {}),
    };
  };
}
