import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import express from "express";
import type { Db } from "mongodb";
import { requireAuth } from "../auth.js";
import { createRateLimiter } from "../rate-limit.js";
import { jobs } from "../../../../packages/db/src/collections/jobs.js";
import { createMongoJobsReadDeps } from "./store.js";
import { createJobsRouter, type JobsReadDeps } from "./router.js";

const summary = {_id: "a", kind: "provider-call", status: "done" as const, createdAt: "2026-10-09T12:00:00Z"};
async function fixture(deps: JobsReadDeps, run: (url: string) => Promise<void>) {
  const app = express(); app.use(express.json());
  app.use(requireAuth({verify: async key => key === "A" || key === "B" ? {tenantId: key, scopes: ["jobs"]} :
    ["sessions", "keys"].includes(key) ? {tenantId: "A", scopes: [key]} : null}));
  app.use(createRateLimiter({max: 1000})); app.use(createJobsRouter(deps));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {await run(`http://127.0.0.1:${address.port}`);} finally {await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));}
}
const options = (key = "A") => ({headers: {authorization: `Bearer ${key}`}});

test("jobs auth and dedicated scope refuse before reads with owner-positive path", async () => {
  const calls: unknown[] = [];
  await fixture({listJobs: async (tenant, limit) => {calls.push([tenant, limit]); return {jobs: [], limit, truncated: false};}}, async url => {
    for (const key of [undefined, "invalid", "sessions", "keys"]) {
      const response = await fetch(`${url}/jobs`, key ? options(key) : {});
      assert.equal(response.status, key === "sessions" || key === "keys" ? 403 : 401);
    }
    assert.deepEqual(calls, []);
    const response = await fetch(`${url}/jobs`, {...options(), headers: {...options().headers, "x-tenant-id": "B"}});
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), {jobs: [], limit: 50, truncated: false}); assert.deepEqual(calls, [["A", 50]]);
  });
});

test("jobs strict query accepts decimal boundaries and rejects selectors and malformed limits before store", async () => {
  const calls: number[] = [];
  await fixture({listJobs: async (_tenant, limit) => {calls.push(limit); return {jobs: [], limit, truncated: false};}}, async url => {
    for (const query of ["limit=0", "limit=101", "limit=-1", "limit=01", "limit=1.0", "limit=1e2", "limit=+1", "limit=", "limit=%201", "limit=NaN", "limit=Infinity", "limit=1&limit=2", "limit[]=1", "limit[x]=1", "tenantId=B", "tenant=B", "status=done", "__proto__=B"]) {
      const response = await fetch(`${url}/jobs?${query}`, options()); assert.equal(response.status, 400, query);
      assert.deepEqual(await response.json(), {error: "invalid_jobs_query", message: "Invalid jobs query"});
    }
    assert.deepEqual(calls, []);
    for (const limit of [1, 50, 100]) assert.equal((await fetch(`${url}/jobs?limit=${limit}`, options())).status, 200);
    assert.deepEqual(calls, [1, 50, 100]);
  });
});

test("jobs refuses nonempty GET JSON bodies before reading any tenant", async () => {
  let reads = 0;
  await fixture({listJobs: async (_tenant, limit) => {reads++; return {jobs: [], limit, truncated: false};}}, async url => {
    for (const body of [{tenantId: "B"}, {tenant: "B"}, {limit: 1}, ["B"]]) {
      const bytes = JSON.stringify(body);
      const result = await new Promise<{status: number; body: unknown}>((resolve, reject) => {
        const call = request(`${url}/jobs`, {method: "GET", headers: {authorization: "Bearer A", "content-type": "application/json", "content-length": Buffer.byteLength(bytes)}}, response => {
          let text = ""; response.setEncoding("utf8"); response.on("data", chunk => {text += chunk;});
          response.once("end", () => resolve({status: response.statusCode!, body: JSON.parse(text)}));
        }); call.on("error", reject); call.end(bytes);
      });
      assert.equal(result.status, 400); assert.deepEqual(result.body, {error: "invalid_jobs_query", message: "Invalid jobs query"});
    }
    assert.equal(reads, 0);
  });
});

test("jobs projects poisoned HTTP extras and refuses malformed summaries/envelopes with sanitized503", async () => {
  let result: unknown = {jobs: [{...summary, tenantId: "B", request: "SECRET", response: "SECRET", credentials: "SECRET", paths: "SECRET"}], limit: 50, truncated: false, secret: "SECRET"};
  await fixture({listJobs: async () => result as never}, async url => {
    const response = await fetch(`${url}/jobs`, options()); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {jobs: [summary], limit: 50, truncated: false});
    for (const value of [null, {}, {jobs: [], limit: 1, truncated: false}, {jobs: [], limit: 50, truncated: "false"}, {jobs: [], limit: 50, truncated: true},
      ...[{status: "ready"}, {kind: ""}, {createdAt: "2026-02-30T12:00:00Z"}, {updatedAt: null}, {provider: 7}].map(change => ({jobs: [{...summary, ...change}], limit: 50, truncated: false}))]) {
      result = value; const failed = await fetch(`${url}/jobs`, options()); assert.equal(failed.status, 503);
      assert.deepEqual(await failed.json(), {error: "jobs_unavailable", message: "Provider audit jobs are unavailable"});
    }
  });
  await fixture({listJobs: async () => {throw new Error("SECRET /private/provider/path");}}, async url => {
    const response = await fetch(`${url}/jobs`, options()); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("SECRET"));
  });
});

test("jobs actual accessor to adapter to HTTP keeps tenants separate with foreign row sorted first", async () => {
  const lowercase = {...summary, createdAt: "2026-10-09t12:00:00z", updatedAt: "2026-10-09t12:01:00z"};
  const rows = [{...summary, _id: "z-foreign", tenantId: "B"}, {...summary, _id: "a-owner", tenantId: "A"}, {...lowercase, _id: "b-owner", tenantId: "A"}];
  const filters: unknown[] = [];
  const db = {collection: (name: string) => {assert.equal(name, "jobs"); return {find: (filter: {tenantId: string}) => {
    filters.push(filter); let selected = rows.filter(row => row.tenantId === filter.tenantId), cap = 0;
    const cursor = {project: () => cursor, sort: () => {selected.sort((a, b) => b._id.localeCompare(a._id)); return cursor;},
      limit: (limit: number) => {cap = limit; return cursor;}, toArray: async () => selected.slice(0, cap)};
    return cursor;
  }};}} as unknown as Db;
  await fixture(createMongoJobsReadDeps(tenant => jobs(tenant, db)), async url => {
    for (const tenant of ["A", "B"]) {
      const response = await fetch(`${url}/jobs?limit=1`, options(tenant)); assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {jobs: [{...(tenant === "A" ? lowercase : summary), _id: tenant === "A" ? "b-owner" : "z-foreign"}], limit: 1, truncated: tenant === "A"});
    }
    assert.deepEqual(filters, [{tenantId: "A"}, {tenantId: "B"}]);
  });
});
