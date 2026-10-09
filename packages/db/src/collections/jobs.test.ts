import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "mongodb";
import { jobs, listJobs } from "./jobs.js";

type Row = Record<string, unknown>;
const createdAt = "2026-10-09T10:00:00Z";
const fields = { _id: 1, kind: 1, status: 1, provider: 1, createdAt: 1, updatedAt: 1 };
function row(_id: string, tenantId = "owner", extra: Row = {}): Row {
  return { _id, tenantId, kind: "provider-call", status: "done", createdAt, ...extra };
}
function fakeDb(seed: Row[], ignoreProjection = false) {
  const calls: Array<{ op: string; value: unknown }> = [];
  const db = { collection(name: string) {
    calls.push({ op: "collection", value: name });
    return { find(filter: Row = {}) {
      calls.push({ op: "find", value: filter });
      let projected: Row | undefined, order: Row | undefined, bound = Infinity;
      const cursor = {
        project(value: Row) { projected = value; calls.push({ op: "project", value }); return cursor; },
        sort(value: Row) { order = value; calls.push({ op: "sort", value }); return cursor; },
        limit(value: number) { bound = value; calls.push({ op: "limit", value }); return cursor; },
        async toArray() {
          calls.push({ op: "toArray", value: null });
          return seed.filter(record => Object.entries(filter).every(([key, value]) => record[key] === value))
            .sort((a, b) => {
              for (const [key, direction] of Object.entries(order ?? {})) {
                const comparison = a[key]! < b[key]! ? -1 : a[key]! > b[key]! ? 1 : 0;
                if (comparison) return comparison * Number(direction);
              }
              return 0;
            }).slice(0, bound).map(record => projected && !ignoreProjection
              ? Object.fromEntries(Object.keys(projected).filter(key => key in record).map(key => [key, record[key]]))
              : { ...record });
        },
      };
      return cursor;
    } };
  } } as unknown as Db;
  return { db, calls };
}

test("jobs uses real scoped accessor; each owner sees only own rows including newer foreign row", async () => {
  const { db, calls } = fakeDb([row("a"), row("b", "victim", { createdAt: "2026-10-10T10:00:00Z" })]);
  assert.deepEqual((await listJobs("owner", 1, db)).jobs.map(r => r._id), ["a"]);
  assert.deepEqual((await listJobs("victim", 1, db)).jobs.map(r => r._id), ["b"]);
  assert.deepEqual(await listJobs("missing", 1, db), { jobs: [], limit: 1, truncated: false });
  assert.deepEqual(calls.filter(c => c.op === "find").map(c => c.value), [
    { tenantId: "owner" }, { tenantId: "victim" }, { tenantId: "missing" },
  ]);
  assert.deepEqual(await jobs("owner", db).find({ tenantId: "victim", _id: "b" }).toArray(), []);
});

test("query projection, sort, limit+1 and deterministic same-time id tie ordering are exact", async () => {
  const { db, calls } = fakeDb([row("a"), row("c"), row("b")]);
  const result = await listJobs("owner", 2, db);
  assert.deepEqual(result.jobs.map(r => r._id), ["c", "b"]);
  assert.equal(result.truncated, true);
  assert.deepEqual(calls, [
    { op: "collection", value: "jobs" }, { op: "find", value: { tenantId: "owner" } },
    { op: "project", value: fields }, { op: "sort", value: { createdAt: -1, _id: -1 } },
    { op: "limit", value: 3 }, { op: "toArray", value: null },
  ]);
});

test("empty, below, exact and extra rows report truncation precisely at limits 1 and 100", async () => {
  for (const limit of [1, 100]) {
    for (const count of [0, Math.max(0, limit - 1), limit, limit + 1]) {
      const { db } = fakeDb(Array.from({ length: count }, (_, i) => row(String(i).padStart(3, "0"))));
      const result = await listJobs("owner", limit, db);
      assert.equal(result.jobs.length, Math.min(count, limit));
      assert.equal(result.truncated, count > limit);
      assert.equal(result.limit, limit);
    }
  }
});

test("all schema statuses and valid offset/leap dates are accepted; createdAt sorts before id", async () => {
  const records = [row("z", "owner", { status: "pending", createdAt: "2024-02-29T10:00:00+01:00" }),
    row("a", "owner", { status: "processing", createdAt }),
    row("b", "owner", { status: "failed", createdAt }), row("c")];
  const { db } = fakeDb(records);
  const result = await listJobs("owner", 100, db);
  assert.deepEqual(result.jobs.map(r => r._id), ["c", "b", "a", "z"]);
  assert.deepEqual(new Set(result.jobs.map(r => r.status)), new Set(["pending", "processing", "done", "failed"]));
});

test("default page is 50 and fetches 51; invalid bounds fail before collection access", async () => {
  const { db, calls } = fakeDb([]);
  assert.deepEqual(await listJobs("owner", undefined, db), { jobs: [], limit: 50, truncated: false });
  assert.deepEqual(calls.find(c => c.op === "limit"), { op: "limit", value: 51 });
  for (const limit of [0, -1, 101, 1.1, NaN, Infinity, "2", null, {}, []]) {
    const fake = fakeDb([]);
    await assert.rejects(listJobs("owner", limit as number, fake.db), /Invalid jobs limit/);
    assert.deepEqual(fake.calls, []);
  }
});

test("metadata excludes poisoned payloads even when driver returns unprojected rows", async () => {
  const safe = { _id: "a", kind: "provider-call", status: "done", createdAt, provider: "gemini", updatedAt: createdAt };
  const { db } = fakeDb([row("a", "owner", { ...safe, request: "secret", response: "secret", error: "secret",
    claimToken: "secret", leaseUntilMs: 1, credentials: "secret", paths: "secret", costUsd: 1, maxCost: 1 })], true);
  assert.deepEqual(await listJobs("owner", 1, db), { jobs: [safe], limit: 1, truncated: false });
});

test("malformed required/optional summary fields and malformed extra row reject the page", async () => {
  const malformed = [{ _id: 1 }, { kind: "" }, { kind: null }, { status: "complete" },
    { createdAt: "yesterday" }, { createdAt: "2026-02-30T10:00:00Z" }, { createdAt: "2026-10-09" },
    { createdAt: "2026-13-09T10:00:00Z" }, { createdAt: "2026-10-09T24:00:00Z" },
    { provider: 3 }, { updatedAt: "bad" }, { updatedAt: null }];
  for (const poison of malformed) {
    const { db } = fakeDb([row("a", "owner", poison)]);
    await assert.rejects(listJobs("owner", 1, db), /Invalid jobs metadata/);
  }
  const { db } = fakeDb([row("z"), row("a", "owner", { status: "complete" })]);
  await assert.rejects(listJobs("owner", 1, db), /Invalid jobs metadata/);
});

test("empty tenant is refused before find and never falls back to unscoped rows", async () => {
  const { db, calls } = fakeDb([row("a"), row("b", "victim")]);
  await assert.rejects(listJobs("", 1, db), /tenantId is required/);
  assert.equal(calls.some(call => call.op === "find"), false);
});
