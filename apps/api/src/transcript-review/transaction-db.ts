import type { ClientSession, Db } from "mongodb";
import { readEffectiveTurns } from "./effective-reader.js";

const READS = new Set(["findOne", "countDocuments", "distinct"]);
const WRITES = new Set(["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany"]);

/** Minimal explicit Mongo view for the real indexer. Every operation is bound to one transaction
 * and tenant. Serialization avoids parallel Mongo operations in a transaction, even when callers
 * use Promise.all. Turns are overlaid on reads and physically immutable in this view. */
export function transactionReviewDb(db: Db, session: ClientSession | undefined, tenantId: string): Pick<Db, "collection"> {
  let pending: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const result = pending.then(work);
    pending = result.catch(() => {});
    return result;
  };
  const scoped = (filter: unknown) => {
    if (!filter || typeof filter !== "object" || (filter as { tenantId?: unknown }).tenantId !== tenantId) throw new Error("Unscoped refresh operation");
  };
  const view = { collection(name: string) {
    const collection = db.collection(name);
    return new Proxy(collection, { get(target, property) {
      if (property === "find") return (filter: Record<string, unknown>, options: Record<string, unknown> = {}) => {
        scoped(filter);
        let cursor = target.find(filter, { ...options, session });
        let projected = options.projection !== undefined;
        const wrapped: Record<string, unknown> = {
          toArray: async () => {
            const rows = await enqueue(() => cursor.toArray());
            return name === "turns" && !projected ? readEffectiveTurns(view as Pick<Db, "collection">, tenantId, rows as never, typeof filter.sessionId === "string" ? filter.sessionId : undefined) : rows;
          },
        };
        for (const method of ["sort", "limit", "skip", "project"] as const) wrapped[method] = (...args: unknown[]) => {
          if (method === "project") projected = true;
          cursor = (cursor[method] as (...values: unknown[]) => typeof cursor).apply(cursor, args);
          return wrapped;
        };
        return wrapped;
      };
      if (typeof property !== "string" || !READS.has(property) && !WRITES.has(property)) throw new Error(`Unsupported refresh operation: ${String(property)}`);
      return (...args: unknown[]) => {
        if (name === "turns" && WRITES.has(property)) throw new Error("Original transcript writes forbidden");
        const inserts = property === "insertOne" || property === "insertMany";
        if (inserts) for (const doc of property === "insertMany" ? args[0] as unknown[] : [args[0]]) scoped(doc);
        else scoped(args[0]);
        const optionIndex = ["updateOne", "updateMany", "replaceOne", "distinct"].includes(property) ? 2 : 1;
        args[optionIndex] = { ...(args[optionIndex] as Record<string, unknown> | undefined), session };
        return enqueue(async () => {
          const value = await (target[property as keyof typeof target] as (...values: unknown[]) => Promise<unknown>).apply(target, args);
          return value;
        }).then(async (value) => name === "turns" && property === "findOne" && value ?
          (await readEffectiveTurns(view as Pick<Db, "collection">, tenantId, [value] as never))[0] : value);
      };
    } });
  } };
  return view as Pick<Db, "collection">;
}
