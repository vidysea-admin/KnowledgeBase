import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { jobs } from "@lkb/db";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";
import { buildProductionDeps } from "../production.js";
import { createMongoJobsReadDeps } from "./store.js";
import { unavailableJobsReadDeps } from "./fixture-store.js";

const source = [
  {_id: "foreign-newest", tenantId: "B", kind: "secret", status: "done", createdAt: "2026-10-09T14:00:00Z"},
  {_id: "owner-newer", tenantId: "A", kind: "ask", status: "done", createdAt: "2026-10-09T13:00:00Z", response: "PRIVATE"},
  {_id: "owner-older", tenantId: "A", kind: "ask", status: "failed", createdAt: "2026-10-09T12:00:00Z", error: "PRIVATE"},
];
function fakeDatabase() {
  const observed: { filters: unknown[]; projections: unknown[]; sorts: unknown[]; limits: number[] } = {filters: [], projections: [], sorts: [], limits: []};
  const db = {collection(name: string) {
    assert.equal(name, "jobs");
    return {find(filter: {tenantId: string}) {
      observed.filters.push(filter);
      let rows = source.filter(row => row.tenantId === filter.tenantId), cap = 0;
      const cursor = {
        project(projection: Record<string, 1>) { observed.projections.push(projection); return cursor; },
        sort(order: unknown) { observed.sorts.push(order); rows = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b._id.localeCompare(a._id)); return cursor; },
        limit(value: number) { observed.limits.push(value); cap = value; return cursor; },
        toArray: async () => rows.slice(0, cap),
      }; return cursor;
    }};
  }} as unknown as Db;
  return {db, observed};
}
const keyStore = () => fakeKeyStore({
  owner: {tenantId: "A", scopes: ["jobs"]}, foreign: {tenantId: "B", scopes: ["jobs"]},
  sessions: {tenantId: "A", scopes: ["sessions"]}, keys: {tenantId: "A", scopes: ["keys"]},
});

test("real createServer auth and accessor->adapter->HTTP preserve tenant, metadata and truncation", async () => {
  const {db, observed} = fakeDatabase();
  const server = await startTestServer(buildTestDeps({keyStore: keyStore(), jobs: createMongoJobsReadDeps(tenant => jobs(tenant, db))}));
  try {
    for (const key of [null, "invalid", "sessions", "keys"]) {
      const response = await fetch(`${server.baseUrl}/jobs`, {headers: key ? {authorization: `Bearer ${key}`} : {}});
      assert.equal(response.status, key === "sessions" || key === "keys" ? 403 : 401);
      assert.equal(observed.filters.length, 0);
    }
    const response = await fetch(`${server.baseUrl}/jobs?limit=1`, {headers: {authorization: "Bearer owner", "x-tenant-id": "B"}});
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.deepEqual(body, {jobs: [{_id: "owner-newer", kind: "ask", status: "done", createdAt: "2026-10-09T13:00:00Z"}], limit: 1, truncated: true});
    assert.deepEqual(observed.filters, [{tenantId: "A"}]);
    assert.deepEqual(observed.projections, [{_id: 1, kind: 1, status: 1, provider: 1, createdAt: 1, updatedAt: 1}]);
    assert.deepEqual(observed.sorts, [{createdAt: -1, _id: -1}]); assert.deepEqual(observed.limits, [2]);
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE|foreign-newest|tenantId|response|error/);
    const foreign = await fetch(`${server.baseUrl}/jobs`, {headers: {authorization: "Bearer foreign"}});
    assert.equal(foreign.status, 200);
    const foreignBody = await foreign.json() as {jobs: {_id: string}[]};
    assert.deepEqual(foreignBody.jobs.map(row => row._id), ["foreign-newest"]);
    const invalid = await fetch(`${server.baseUrl}/jobs?tenantId=B`, {headers: {authorization: "Bearer owner"}});
    assert.equal(invalid.status, 400); assert.equal(observed.filters.length, 2);
  } finally { await server.close(); }
});

test("real createServer without jobs dependency reports honest unavailable503", async () => {
  const server = await startTestServer(buildTestDeps({keyStore: keyStore()}));
  try {
    const response = await fetch(`${server.baseUrl}/jobs`, {headers: {authorization: "Bearer owner"}});
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {error: "jobs_unavailable", message: "Provider audit jobs are unavailable"});
    await assert.rejects(unavailableJobsReadDeps.listJobs("A", 50));
  } finally { await server.close(); }
});

test("actual production composition binds lazy provider jobs reader without opening a database", () => {
  const deps = buildProductionDeps();
  assert.equal(typeof deps.jobs?.listJobs, "function");
  assert.notEqual(deps.jobs, unavailableJobsReadDeps);
});
