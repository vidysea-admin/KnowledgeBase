import type { Db } from "mongodb";

/**
 * Mongo topology detection (w27-standalone). A multi-document snapshot transaction exists only on a replica-set
 * member or a mongos; a plain standalone mongod refuses it with "Transaction numbers are only allowed on a replica
 * set member or mongos". Read paths use this once per client to drop the transaction wrapper (never the query
 * predicates) and read with readConcern "local". Write paths that need atomicity do NOT use it and keep refusing.
 *
 * LKB_MONGO_STANDALONE=1|true forces standalone, =0|false forces replica-set; anything else autodetects via `hello`
 * (no `setName` and not a mongos => standalone). A db handle without `command` (in-memory fakes) is treated as
 * transaction-capable so existing behaviour is unchanged. Only a successful detection is cached.
 */
const cache = new WeakMap<object, Promise<boolean>>();

export function standaloneOverride(env: NodeJS.ProcessEnv = process.env): boolean | null {
  const v = env.LKB_MONGO_STANDALONE?.trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return null;
}

export function isStandaloneHello(hello: unknown): boolean {
  const h = (hello && typeof hello === "object" ? hello : {}) as { setName?: unknown; msg?: unknown };
  return typeof h.setName !== "string" && h.msg !== "isdbgrid";
}

export async function isStandaloneMongo(db: Pick<Db, "collection"> & { client?: unknown; command?: unknown }): Promise<boolean> {
  const forced = standaloneOverride();
  if (forced !== null) return forced;
  if (typeof db.command !== "function") return false;
  const key = (db.client && typeof db.client === "object" ? db.client : db) as object;
  const hit = cache.get(key);
  if (hit) return hit;
  const probe = (db.command as (c: Record<string, unknown>) => Promise<unknown>).call(db, { hello: 1 }).then(isStandaloneHello);
  cache.set(key, probe);
  try { return await probe; } catch { cache.delete(key); return false; }
}
