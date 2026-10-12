// T-057 D4: the shipped accessor against a stateful fake Db (no Mongo): exact row shape, tenant scoping.
import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "mongodb";
import { buildUsageEvent, listUsageEvents, recordUsageEvent, usageDay, USAGE_READ_ROW_CAP } from "./usage-events.js";

type Row = Record<string, unknown>;
function fakeDb() {
  const rows: Row[] = [];
  const filters: Record<string, unknown>[] = [];
  const raw = {
    async insertOne(doc: Row) { rows.push({ ...doc }); return { acknowledged: true }; },
    find(filter: Record<string, unknown>) {
      filters.push(filter);
      const day = (filter.day as { $gte?: string } | undefined)?.$gte;
      let out: Row[] = rows.filter((r) => r.tenantId === filter.tenantId && (day === undefined || (r.day as string) >= day));
      const cursor = {
        project: (p: Record<string, number>) => { out = out.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => p[k] === 1))); return cursor; },
        limit: (n: number) => { out = out.slice(0, n); return cursor; },
        toArray: async () => out,
      };
      return cursor;
    },
  };
  return { db: { collection: (name: string) => { assert.equal(name, "usage_events"); return raw; } } as unknown as Db, rows, filters };
}
const now = new Date("2026-10-12T23:59:59.500Z");

test("buildUsageEvent writes exactly the schema fields and drops anything else", () => {
  const evil = { kind: "ask", outcome: "ok", latencyMs: 12.6, query: "secret question", answer: "a", keyId: "k", ip: "1.1.1.1", headers: {} } as never;
  const doc = buildUsageEvent(evil, now, "id-1");
  assert.deepEqual(doc, { _id: "id-1", kind: "ask", at: "2026-10-12T23:59:59.500Z", day: "2026-10-12", outcome: "ok", latencyMs: 13 });
  assert.deepEqual(Object.keys(doc).sort(), ["_id", "at", "day", "kind", "latencyMs", "outcome"]);
});

test("buildUsageEvent rejects unknown kind/outcome/latency and clamps negatives", () => {
  assert.throws(() => buildUsageEvent({ kind: "chat", outcome: "ok", latencyMs: 1 } as never, now));
  assert.throws(() => buildUsageEvent({ kind: "ask", outcome: "timeout", latencyMs: 1 } as never, now));
  assert.throws(() => buildUsageEvent({ kind: "ask", outcome: "ok", latencyMs: Number.NaN }, now));
  assert.equal(buildUsageEvent({ kind: "ask", outcome: "ok", latencyMs: -4 }, now).latencyMs, 0);
});

test("usageDay is the UTC day", () => {
  assert.equal(usageDay(new Date("2026-10-12T23:30:00-05:00")), "2026-10-13");
});

test("recordUsageEvent stores the tenant from the scoped argument, with the closed shape", async () => {
  const { db, rows } = fakeDb();
  await recordUsageEvent("owner", { kind: "search", outcome: "error", latencyMs: 5 }, db, now);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]!).sort(), ["_id", "at", "day", "kind", "latencyMs", "outcome", "tenantId"]);
  assert.equal(rows[0]!.tenantId, "owner");
  await assert.rejects(recordUsageEvent("", { kind: "ask", outcome: "ok", latencyMs: 1 }, db, now));
});

test("listUsageEvents is tenant-scoped, day-bounded and projects three fields only", async () => {
  const { db, rows, filters } = fakeDb();
  await recordUsageEvent("owner", { kind: "ask", outcome: "ok", latencyMs: 1 }, db, new Date("2026-10-12T01:00:00Z"));
  await recordUsageEvent("owner", { kind: "ask", outcome: "ok", latencyMs: 1 }, db, new Date("2026-09-01T01:00:00Z"));
  await recordUsageEvent("victim", { kind: "search", outcome: "error", latencyMs: 1 }, db, new Date("2026-10-12T01:00:00Z"));
  assert.equal(rows.length, 3);
  const res = await listUsageEvents("owner", "2026-10-01", db);
  assert.deepEqual(res, { rows: [{ day: "2026-10-12", kind: "ask", outcome: "ok" }], truncated: false });
  assert.deepEqual(filters.at(-1), { day: { $gte: "2026-10-01" }, tenantId: "owner" });
  await assert.rejects(listUsageEvents("owner", "yesterday", db));
  assert.ok(USAGE_READ_ROW_CAP > 0);
});
