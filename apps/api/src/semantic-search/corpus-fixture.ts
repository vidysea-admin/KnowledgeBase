import type { Db } from "mongodb";
export type FixtureRow = Record<string, unknown>;
export type FixtureRead = { coll: string; op: string; filter: FixtureRow };
function values(value: unknown, path: string[]): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => values(item, path));
  if (!path.length) return [value];
  if (!value || typeof value !== "object") return [];
  return values((value as FixtureRow)[path[0]!], path.slice(1));
}
export function matchesFixture(row: FixtureRow, filter: FixtureRow): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = values(row, key.split("."));
    if (expected && typeof expected === "object") {
      if ("$in" in expected) return actual.some(value => (expected as { $in: unknown[] }).$in.includes(value));
      if ("$exists" in expected) return actual.some(value => value !== undefined) === (expected as { $exists: boolean }).$exists;
    }
    return actual.some(value => value === expected);
  });
}
/** Applies real tenant/id/session/dotted filters; absent collections are empty, never arbitrary rows. */
export function corpusFixtureDb(rows: Record<string, FixtureRow[]>, calls: FixtureRead[] = []) {
  return { collection: (name: string) => ({
    find: (filter: FixtureRow) => {
      calls.push({ coll: name, op: "find", filter });
      return { toArray: async () => structuredClone((rows[name] ?? []).filter(row => matchesFixture(row, filter))) };
    },
    findOne: async (filter: FixtureRow) => {
      calls.push({ coll: name, op: "findOne", filter });
      return structuredClone((rows[name] ?? []).find(row => matchesFixture(row, filter)) ?? null);
    },
  }) } as unknown as Pick<Db, "collection">;
}

/** MODEL ONLY: frozen collection state for the real snapshot adapter; no Mongo/MVCC claim. */
export function corpusSnapshotModel(rows: Record<string, FixtureRow[]>, calls: FixtureRead[] = []) {
  type ModelSession = { snapshot?: Record<string, FixtureRow[]>; active: boolean; ended: boolean };
  const transactions: { readConcern?: { level?: string } }[] = [];
  const sessions: ModelSession[] = [];
  const db = {
    client: { startSession() {
      const session: ModelSession = { active: false, ended: false };
      sessions.push(session);
      return Object.assign(session, {
        async withTransaction<T>(run: () => Promise<T>, options: { readConcern?: { level?: string } }) {
          transactions.push(options); session.snapshot = structuredClone(rows); session.active = true;
          try { return await run(); } finally { session.active = false; }
        },
        inTransaction: () => session.active,
        async abortTransaction() { session.active = false; },
        async endSession() { session.ended = true; },
      });
    } },
    collection: (name: string) => ({
      find: (filter: FixtureRow, options?: { session?: ModelSession }) => {
        if (!options?.session?.active || !options.session.snapshot) throw new Error("Snapshot model requires active transaction session");
        calls.push({ coll: name, op: "find", filter });
        const state = options.session.snapshot;
        return { toArray: async () => structuredClone((state[name] ?? []).filter(row => matchesFixture(row, filter))) };
      },
      findOne: async (filter: FixtureRow, options?: { session?: ModelSession }) => {
        if (!options?.session?.active || !options.session.snapshot) throw new Error("Snapshot model requires active transaction session");
        calls.push({ coll: name, op: "findOne", filter });
        return structuredClone((options.session.snapshot[name] ?? []).find(row => matchesFixture(row, filter)) ?? null);
      },
    }),
  };
  return { db: db as unknown as Pick<Db, "collection" | "client">, transactions, sessions };
}
