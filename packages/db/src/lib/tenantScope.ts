// packages/db/src/lib/tenantScope.ts — T-018 C6. One shared definition of the
// tenant-scoping accessor pattern (ARCHITECTURE §5: "no handler accepts a tenant id from
// the client — session/auth-derived only"; every knowledge-layer row carries tenantId).
//
// scopedCollection(db, name) returns a function whose signature FORCES a tenantId argument
// at every call site — `coll(tenantId).find(filter)` — so a tenant-less query is a TS
// compile error, not a runtime bug. Every packages/db/src/collections/<coll>.ts file
// wraps this once; it is the only place the tenant-scoping logic itself is written.
import type { AnyBulkWriteOperation, BulkWriteOptions, Collection, Db, Filter, OptionalUnlessRequiredId, ReplaceOptions, UpdateFilter, UpdateOptions } from "mongodb";

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


/** Pins `tenantId` inside an update document so a caller cannot move a row to another tenant. Where a body already
 * names it (`$set` / `$setOnInsert` — callers carry it as belt-and-braces) its value is OVERRIDDEN with the scoped
 * tenant; every other mention (`$unset`, `$rename`, `$inc`, ...) is dropped. The filter already pins the tenant, which
 * also fills an upsert's inserted document. Pipeline-style (array) updates cannot be inspected safely and are refused. */
function pinUpdate<U>(update: U, tenantId: TenantId, where: string): U {
  if (Array.isArray(update) || update === null || typeof update !== "object") {
    throw new Error(`${where}: only operator-style update documents are accepted (aggregation-pipeline updates cannot be tenant-pinned)`);
  }
  const out: Record<string, unknown> = {};
  for (const [op, body] of Object.entries(update as Record<string, unknown>)) {
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      const entries = Object.entries(body as Record<string, unknown>);
      const kept = Object.fromEntries(entries.filter(([k, v]) => k !== "tenantId" && v !== "tenantId" && !k.startsWith("tenantId.")));
      const stamps = (op === "$set" || op === "$setOnInsert") && entries.some(([k]) => k === "tenantId");
      out[op] = stamps ? { ...kept, tenantId } : kept;
    } else out[op] = body;
  }
  return out as U;
}

const BULK_OPS = ["insertOne", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany"] as const;

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
        raw.updateOne(withTenant<T>(tenantId, filter), pinUpdate(update, tenantId, `scopedCollection(${name}).updateOne`), options ?? {}),
      /** Tenant-scoped replaceOne (ISS-AUTHTENANT2-001). The filter gets `tenantId` ANDed in and the replacement gets it
       * stamped LAST, so a caller-supplied `tenantId` on the replacement cannot win; an upsert therefore inserts under
       * this tenant and can only ever match this tenant's rows. */
      replaceOne: (filter: Filter<T>, replacement: Omit<T, "tenantId"> & Partial<Pick<T, "tenantId">>, options?: ReplaceOptions) =>
        raw.replaceOne(withTenant<T>(tenantId, filter), { ...replacement, tenantId } as never, options ?? {}),
      /** Tenant-scoped bulkWrite (ISS-AUTHTENANT2-001). EVERY op is rewritten: filters get `tenantId` merged,
       * inserted/replacement documents get it stamped last, update documents lose any `tenantId` mention. An op type
       * outside insertOne/updateOne/updateMany/replaceOne/deleteOne/deleteMany (or an op with several keys) throws
       * before anything reaches the driver. */
      bulkWrite: (ops: AnyBulkWriteOperation<T>[], options?: BulkWriteOptions) => {
        const scoped = ops.map((op, i): AnyBulkWriteOperation<T> => {
          const where = `scopedCollection(${name}).bulkWrite[${i}]`;
          const keys = op !== null && typeof op === "object" ? Object.keys(op) : [];
          const kind = keys[0] as (typeof BULK_OPS)[number] | undefined;
          if (keys.length !== 1 || !kind || !(BULK_OPS as readonly string[]).includes(kind)) {
            throw new Error(`${where}: unsupported bulk operation (${keys.join(",") || "none"}); allowed: ${BULK_OPS.join(", ")}`);
          }
          const body = (op as unknown as Record<string, Record<string, unknown>>)[kind]!;
          switch (kind) {
            case "insertOne": return { insertOne: { ...body, document: { ...(body.document as object), tenantId } } } as never;
            case "replaceOne": return { replaceOne: { ...body, filter: withTenant<T>(tenantId, body.filter as Filter<T>), replacement: { ...(body.replacement as object), tenantId } } } as never;
            case "updateOne":
            case "updateMany": return { [kind]: { ...body, filter: withTenant<T>(tenantId, body.filter as Filter<T>), update: pinUpdate(body.update, tenantId, where) } } as never;
            default: return { [kind]: { ...body, filter: withTenant<T>(tenantId, body.filter as Filter<T>) } } as never;
          }
        });
        return raw.bulkWrite(scoped, options ?? {});
      },
    };
  };
}
