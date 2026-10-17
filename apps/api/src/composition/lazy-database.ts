import type { Db } from "mongodb";

/** A deferred handle, never an alternate database. Constructors may retain collections;
 * actual operations always resolve the current connected Db and preserve Mongo receivers.
 * Database-name policy must run on access, not against invented configuration metadata.
 */
export function createLazyDatabase(resolve: () => Db): Db {
  return new Proxy({} as Db, { get(_target, key) {
    if (key === "collection") return (...args: Parameters<Db["collection"]>) => {
      return new Proxy({}, { get(_collection, member) {
        const current = resolve().collection(...args);
        const value: unknown = Reflect.get(current, member, current);
        return typeof value === "function" ? value.bind(current) : value;
      } });
    };
    const current = resolve();
    const value: unknown = Reflect.get(current, key, current);
    return typeof value === "function" ? value.bind(current) : value;
  } });
}

/** Explicit route properties remain optional. Their real DB-name gates run when the
 * server registers/uses the route, after connection; no result survives a new connection.
 */
export function defineLazyProperties<T extends object>(target: T, readers: Partial<{ [K in keyof T]: () => T[K] }>): T {
  for (const key of Object.keys(readers) as (keyof T)[]) {
    const read = readers[key];
    if (read) Object.defineProperty(target, key, { enumerable: true, configurable: true, get: read });
  }
  return target;
}
