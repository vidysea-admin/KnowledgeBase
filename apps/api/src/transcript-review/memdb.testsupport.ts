/** Transcript review semantic fixture only; no real Mongo durability/concurrency claim. */
import { transactionalFixture } from "./refresh-testkit.js";
export type Row = Record<string, unknown>;
export function memoryDb() {
  const fixture = transactionalFixture();
  const writeMethods = new Set(["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany"]);
  return {
    db: fixture.db, rows: fixture.rows, failNext: fixture.failNext,
    get writes() { return fixture.calls.filter(c => writeMethods.has(c.method)).map(c => ({ collection: c.collection, op: c.method })); },
    seed(name: string, row: Row) {
      // Explicit fixture reseeding replaces the same tenant-owned document.
      const rows = fixture.rows(name), index = rows.findIndex(r => r._id === row._id && r.tenantId === row.tenantId);
      if (index >= 0) rows[index] = structuredClone(row); else fixture.seed(name, row);
    },
  };
}
