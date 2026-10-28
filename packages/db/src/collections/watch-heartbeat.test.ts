// ISS-U4BHB-001: exercise the shipped accessor, not only the health route's injected reader.
import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "mongodb";
import type { WatchHeartbeat } from "@lkb/core";
import { findHeartbeat, listHeartbeats, markHeartbeat, watchHeartbeat } from "./watch-heartbeat.js";

type Call = { op: string; filter: Record<string, unknown>; update?: Record<string, unknown>; options?: object };
const oldTime = "2026-10-08T10:00:00.000Z";
const newTime = "2026-10-09T10:00:00.000Z";
function heartbeat(tenantId: string, sourceType: WatchHeartbeat["sourceType"] = "drive"): WatchHeartbeat {
  return { _id: `${tenantId}:${sourceType}`, tenantId, sourceType, lastHeartbeatAt: oldTime };
}

// A stateful fake applies exactly the filter the driver receives, including an empty raw filter.
// No fake-side tenant restriction: the ledger's raw-handle replacement would expose both tenants.
function fakeDb(seed = [heartbeat("owner"), heartbeat("victim")]) {
  const rows = seed.map(row => ({ ...row }));
  const calls: Call[] = [];
  const matches = (row: WatchHeartbeat, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) => row[key] === value);
  const raw = {
    find(filter: Record<string, unknown> = {}) {
      calls.push({ op: "find", filter });
      return { toArray: async () => rows.filter(row => matches(row, filter)).map(row => ({ ...row })) };
    },
    async findOne(filter: Record<string, unknown> = {}) {
      calls.push({ op: "findOne", filter });
      return rows.find(row => matches(row, filter)) ?? null;
    },
    async updateOne(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }, options = {}) {
      calls.push({ op: "updateOne", filter, update, options });
      const existing = rows.find(row => matches(row, filter));
      if (existing) Object.assign(existing, update.$set);
      else if ((options as { upsert?: boolean }).upsert) rows.push({ ...filter, ...update.$set } as WatchHeartbeat);
      return { acknowledged: true };
    },
  };
  const db = { collection(name: string) { assert.equal(name, "watch_heartbeat"); return raw; } } as unknown as Db;
  return { db, rows, calls };
}

test("ISS-U4BHB-001: listHeartbeats confines a real accessor's empty find to each tenant", async () => {
  const { db, calls } = fakeDb();
  assert.deepEqual(await listHeartbeats("owner", db), [heartbeat("owner")]);
  assert.deepEqual(await listHeartbeats("victim", db), [heartbeat("victim")]);
  assert.deepEqual(await listHeartbeats("missing", db), []);
  assert.deepEqual(calls, [
    { op: "find", filter: { tenantId: "owner" } },
    { op: "find", filter: { tenantId: "victim" } },
    { op: "find", filter: { tenantId: "missing" } },
  ]);
});

test("findHeartbeat reads its tenant's composite id and returns null for an unseen source", async () => {
  const { db, calls } = fakeDb();
  assert.deepEqual(await findHeartbeat("owner", "drive", db), heartbeat("owner"));
  assert.deepEqual(await findHeartbeat("victim", "drive", db), heartbeat("victim"));
  assert.equal(await findHeartbeat("owner", "gmail", db), null);
  assert.deepEqual(calls[0], { op: "findOne", filter: { _id: "owner:drive", tenantId: "owner" } });
});

test("accessor rejects a crafted foreign tenantId and foreign id even on direct findOne", async () => {
  const { db, calls } = fakeDb();
  const accessor = watchHeartbeat("owner", db);
  assert.deepEqual(await accessor.find({ tenantId: "victim" }).toArray(), [heartbeat("owner")]);
  assert.equal(await accessor.findOne({ _id: "victim:drive", tenantId: "victim" }), null);
  assert.deepEqual(calls[1], { op: "findOne", filter: { _id: "victim:drive", tenantId: "owner" } });
});

test("markHeartbeat ignores a foreign document id/tenant and updates only the scoped row", async () => {
  const { db, rows, calls } = fakeDb();
  const forged = { ...heartbeat("victim"), lastHeartbeatAt: newTime, extra: "must not persist" };
  await markHeartbeat("owner", forged, db);
  assert.deepEqual(rows, [{ ...heartbeat("owner"), lastHeartbeatAt: newTime }, heartbeat("victim")]);
  assert.deepEqual(calls[0], {
    op: "updateOne", filter: { _id: "owner:drive", tenantId: "owner" },
    update: { $set: { sourceType: "drive", lastHeartbeatAt: newTime } }, options: { upsert: true },
  });
});

test("markHeartbeat upsert stamps the scoped tenant and a second mark refreshes without duplicates", async () => {
  const { db, rows } = fakeDb([heartbeat("victim")]);
  await markHeartbeat("owner", heartbeat("victim"), db);
  await markHeartbeat("owner", { ...heartbeat("victim"), lastHeartbeatAt: newTime }, db);
  assert.deepEqual(rows, [heartbeat("victim"), { ...heartbeat("owner"), lastHeartbeatAt: newTime }]);
  assert.deepEqual(await listHeartbeats("owner", db), [{ ...heartbeat("owner"), lastHeartbeatAt: newTime }]);
});

test("an empty tenant is refused on accessor, reads, and writes before a driver operation", async () => {
  const { db, calls, rows } = fakeDb();
  assert.throws(() => watchHeartbeat("", db), /tenantId is required/);
  await assert.rejects(listHeartbeats("", db), /tenantId is required/);
  await assert.rejects(findHeartbeat("", "drive", db), /tenantId is required/);
  await assert.rejects(markHeartbeat("", heartbeat("victim"), db), /tenantId is required/);
  assert.deepEqual(calls, []);
  assert.deepEqual(rows, [heartbeat("owner"), heartbeat("victim")]);
});
