import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import { requireAuth } from "../auth.js";
import { createWatchRunsRouter, createMongoWatchRunsDeps, projectWatchRun, summarizeWatchRuns, unavailableWatchRunsDeps, type WatchRunsDeps } from "./watch-runs.js";

const rowsAll = [
  { _id: "a1", tenantId: "A", runAt: "2026-10-12T10:00:00Z", mode: "watch", digestPath: "qa/watch/secret-a.md", driveNewFound: 2, driveIngested: 1, driveFailed: 1, errors: ["token sk-AAA expired", "x"] },
  { _id: "a2", tenantId: "A", runAt: "2026-10-11T10:00:00Z", mode: "ingest", digestPath: "d", driveNewFound: 1, driveIngested: 1, driveFailed: 0 },
  { _id: "b1", tenantId: "B", runAt: "2026-10-12T11:00:00Z", mode: "watch", digestPath: "d", driveFailed: 9, errors: ["B-ONLY"] },
];
// A db whose find() HONOURS the tenantId filter, so a leak is expressible; records the filters it saw.
function fakeDb(seen: unknown[]): Db {
  return { collection: () => ({ find: (filter: Record<string, unknown>) => {
    seen.push(filter);
    const hits = rowsAll.filter((r) => r.tenantId === filter.tenantId).sort((x, y) => y.runAt.localeCompare(x.runAt));
    const cur = { sort: () => cur, limit: (n: number) => { hits.splice(n); return cur; }, toArray: async () => hits };
    return cur;
  } }) } as unknown as Db;
}
const reader = (seen: unknown[]) => {
  const db = fakeDb(seen);
  return async (t: string, l: number) => scopedCollection<never>(db, "watch_reports")(t).find({}).sort({ runAt: -1 }).limit(l).toArray() as unknown as Promise<unknown[]>;
};

async function fixture(deps: WatchRunsDeps, run: (url: string) => Promise<void>) {
  const app = express(); app.use(express.json());
  app.use(requireAuth({ verify: async (key) => key === "A" || key === "B" ? { tenantId: key, scopes: ["jobs"] } : key === "noscope" ? { tenantId: "A", scopes: ["sessions"] } : null }));
  app.use(createWatchRunsRouter(deps));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const a = server.address(); assert.ok(a && typeof a !== "string");
  try { await run(`http://127.0.0.1:${a.port}`); } finally { await new Promise<void>((r) => server.close(() => r())); }
}
const as = (key: string) => ({ headers: { authorization: `Bearer ${key}` } });

test("auth and the jobs scope are enforced before any read", async () => {
  const calls: string[] = [];
  await fixture({ readWatchRuns: async (t) => { calls.push(t); return { runs: [], truncated: false }; } }, async (url) => {
    assert.equal((await fetch(`${url}/watch-runs`)).status, 401);
    assert.equal((await fetch(`${url}/watch-runs`, as("bogus"))).status, 401);
    assert.equal((await fetch(`${url}/watch-runs`, as("noscope"))).status, 403);
    assert.deepEqual(calls, []);
    assert.equal((await fetch(`${url}/watch-runs`, as("A"))).status, 200);
  });
});

test("two tenants: each sees only its own runs; tenant selectors are refused; error text and digest path never served", async () => {
  const seen: unknown[] = [];
  await fixture(createMongoWatchRunsDeps(reader(seen)), async (url) => {
    const a = await (await fetch(`${url}/watch-runs`, { headers: { authorization: "Bearer A", "x-tenant-id": "B" } })).json() as { runs: { id: string }[]; summary: Record<string, unknown> };
    assert.deepEqual(a.runs.map((r) => r.id), ["a1", "a2"]);
    assert.deepEqual(a.summary, { runs: 2, runsWithFailures: 1, totalDriveFailed: 1, totalErrors: 2, lastFailureAt: "2026-10-12T10:00:00.000Z" });
    const bText = await (await fetch(`${url}/watch-runs`, as("B"))).text();
    assert.ok(bText.includes('"b1"') && !bText.includes("a1") && !bText.includes("a2"));
    const aText = JSON.stringify(a);
    assert.ok(!aText.includes("sk-AAA") && !aText.includes("secret-a") && !aText.includes("B-ONLY") && !aText.includes("digestPath"));
    for (const q of ["tenantId=B", "tenant=B", "limit=0", "limit=101", "limit=1&limit=2", "limit=1e1", "status=x"]) assert.equal((await fetch(`${url}/watch-runs?${q}`, as("A"))).status, 400, q);
    assert.deepEqual(seen.map((f) => (f as { tenantId: string }).tenantId), ["A", "B"]);
  });
});

test("empty data answers 200 with a null last failure; truncation is flagged at the limit", async () => {
  await fixture({ readWatchRuns: async () => ({ runs: [], truncated: false }) }, async (url) => {
    assert.deepEqual(await (await fetch(`${url}/watch-runs`, as("A"))).json(), { runs: [], limit: 50, truncated: false, summary: { runs: 0, runsWithFailures: 0, totalDriveFailed: 0, totalErrors: 0, lastFailureAt: null } });
  });
  await fixture(createMongoWatchRunsDeps(reader([])), async (url) => {
    const one = await (await fetch(`${url}/watch-runs?limit=1`, as("A"))).json() as { runs: unknown[]; truncated: boolean };
    assert.equal(one.runs.length, 1); assert.equal(one.truncated, true);
  });
});

test("unavailable, throwing and malformed readers answer 503 with a fixed body", async () => {
  const ok = { _id: "x", runAt: "2026-10-12T10:00:00Z", mode: "watch" };
  const bad: unknown[] = [{ ...ok, runAt: "nope" }, { ...ok, mode: "other" }, { ...ok, driveFailed: -1 }, { ...ok, errors: [1] }, null];
  for (const deps of [unavailableWatchRunsDeps, ...bad.map((r): WatchRunsDeps => ({ readWatchRuns: async () => ({ runs: [r], truncated: false }) }))]) {
    await fixture(deps, async (url) => {
      const res = await fetch(`${url}/watch-runs`, as("A")); assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "watch_runs_unavailable", message: "Watcher run history is unavailable for this tenant" });
    });
  }
});

test("projection and summary are pure and strict", () => {
  assert.equal(projectWatchRun({ _id: "z", runAt: "2026-10-12T10:00:00+05:30", mode: "ingest" }).driveFailed, null);
  assert.equal(summarizeWatchRuns([]).lastFailureAt, null);
});
