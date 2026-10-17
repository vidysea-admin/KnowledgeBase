import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { jobs } from "../../../../packages/db/src/collections/jobs.js";
import { createMongoJobsReadDeps, type JobsReadCursor, type JobsReader } from "./store.js";

const row = (id: string, tenantId = "A") => ({_id: id, tenantId, kind: "transcribe", status: "done", createdAt: "2026-10-09T12:00:00Z"});
function fixture(rows: unknown[]) {
  const observed: Record<string, unknown> = {};
  const cursor: JobsReadCursor = {
    project: value => {observed.projection = value; return cursor;},
    sort: value => {observed.sort = value; return cursor;},
    limit: value => {observed.limit = value; return cursor;},
    toArray: async () => rows,
  };
  const reader: JobsReader = tenant => {observed.tenant = tenant; return {find: filter => {observed.filter = filter; return cursor;}};};
  return {deps: createMongoJobsReadDeps(reader), observed};
}

test("jobs store requests only bounded sorted metadata and projects poisoned fields", async () => {
  const f = fixture([{...row("one"), provider: "fixture", updatedAt: "2026-10-09T12:01:00+05:30", request: "SECRET", error: "SECRET", costUsd: 999}]);
  assert.deepEqual(await f.deps.listJobs("A", 1), {jobs: [{_id: "one", kind: "transcribe", status: "done", createdAt: "2026-10-09T12:00:00Z", provider: "fixture", updatedAt: "2026-10-09T12:01:00+05:30"}], limit: 1, truncated: false});
  assert.deepEqual(f.observed, {tenant: "A", filter: {}, projection: {_id: 1, kind: 1, status: 1, provider: 1, createdAt: 1, updatedAt: 1}, sort: {createdAt: -1, _id: -1}, limit: 2});
});

test("jobs store empty/below/exact/extra pages and cap100 have truthful truncation", async () => {
  for (const count of [0, 1, 2, 3]) {
    const f = fixture(Array.from({length: count}, (_, i) => row(String(i))));
    const result = await f.deps.listJobs("A", 2);
    assert.equal(result.jobs.length, Math.min(count, 2)); assert.equal(result.truncated, count > 2);
  }
  const f = fixture(Array.from({length: 101}, (_, i) => row(String(i))));
  const result = await f.deps.listJobs("A", 100);
  assert.equal(result.jobs.length, 100); assert.equal(result.truncated, true); assert.equal(f.observed.limit, 101);
});

test("jobs store refuses invalid limits/tenants before accessor and rejects malformed fetched rows", async () => {
  const f = fixture([]);
  for (const limit of [0, -1, 101, 1.1, NaN, Infinity]) await assert.rejects(f.deps.listJobs("A", limit));
  await assert.rejects(f.deps.listJobs("", 1)); assert.deepEqual(f.observed, {});
  for (const change of [{_id: 4}, {kind: " "}, {status: "ready"}, {createdAt: "2026-02-30T12:00:00Z"},
    {createdAt: "2026-10-09"}, {createdAt: "2026-10-09T24:00:00Z"}, {provider: null}, {updatedAt: "bad"}]) {
    await assert.rejects(fixture([row("visible"), {...row("extra"), ...change}]).deps.listJobs("A", 1));
  }
  await assert.rejects(fixture([row("a"), row("b"), row("c")]).deps.listJobs("A", 1));
});

test("real jobs accessor binds tenant filter before sorting and projection at DB boundary", async () => {
  const source = [row("z-foreign", "B"), row("a-owner", "A"), row("z-owner", "A")];
  const filters: unknown[] = [], collectionNames: string[] = [];
  const db = {collection(name: string) {
    collectionNames.push(name);
    return {find(filter: {tenantId: string}) {
      filters.push(filter); let selected = source.filter(r => r.tenantId === filter.tenantId), cap = 0;
      const cursor = {
        project: () => cursor,
        sort: (order: unknown) => {assert.deepEqual(order, {createdAt: -1, _id: -1}); selected.sort((a, b) => b._id.localeCompare(a._id)); return cursor;},
        limit: (limit: number) => {cap = limit; return cursor;},
        toArray: async () => selected.slice(0, cap),
      }; return cursor;
    }};
  }} as unknown as Db;
  const deps = createMongoJobsReadDeps(tenant => jobs(tenant, db));
  assert.deepEqual((await deps.listJobs("A", 1)).jobs.map(r => r._id), ["z-owner"]);
  assert.deepEqual((await deps.listJobs("B", 1)).jobs.map(r => r._id), ["z-foreign"]);
  assert.deepEqual(filters, [{tenantId: "A"}, {tenantId: "B"}]);
  assert.deepEqual(collectionNames, ["jobs", "jobs"]);
});
