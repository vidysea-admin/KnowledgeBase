/**
 * ISS-T057SCREEN-001 regression. The issue's recorded reproductions (verbatim, evaluated against
 * the source) plus a two-tenant behavioural test over a fake database that holds rows for both
 * tenants and records every count filter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { createMongoSystemStatusDeps } from "../system-status-store.js";

const SERVER = fileURLToPath(new URL("../server.ts", import.meta.url));
const ROUTE = fileURLToPath(new URL("./system-status.ts", import.meta.url));
const STORE = fileURLToPath(new URL("../system-status-store.ts", import.meta.url));

const ROWS: Record<string, Array<{ tenantId: string }>> = {
  sessions: [...Array(3).fill({ tenantId: "A" }), ...Array(11).fill({ tenantId: "B" })],
  claims: [...Array(2).fill({ tenantId: "A" }), ...Array(40).fill({ tenantId: "B" })],
};

function fakeDb() {
  const filters: Array<{ name: string; filter: Record<string, unknown> }> = [];
  return {
    filters,
    db: {
      async command() { return { ok: 1 }; },
      collection(name: string) {
        return {
          async countDocuments(filter: Record<string, unknown> = {}) {
            filters.push({ name, filter });
            return (ROWS[name] ?? []).filter((r) => !("tenantId" in filter) || r.tenantId === filter.tenantId).length;
          },
        };
      },
    } as never,
  };
}

async function get(baseUrl: string, key: string | null, path = "/system-status") {
  const res = await fetch(`${baseUrl}${path}`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  return { status: res.status, body: (await res.json()) as { collections?: Record<string, number>; db?: string } };
}

async function withServer(fn: (url: string, f: ReturnType<typeof fakeDb>) => Promise<void>) {
  const f = fakeDb();
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ "key-a": { tenantId: "A", scopes: [] }, "key-b": { tenantId: "B", scopes: [] } }),
    systemStatus: createMongoSystemStatusDeps(() => f.db, () => ["sessions", "claims"]),
  }));
  try { await fn(server.baseUrl, f); } finally { await server.close(); }
}

test("two tenants: A sees only A's counts, B only B's", async () => {
  await withServer(async (url) => {
    assert.deepEqual((await get(url, "key-a")).body, { db: "ok", collections: { sessions: 3, claims: 2 } });
    assert.deepEqual((await get(url, "key-b")).body, { db: "ok", collections: { sessions: 11, claims: 40 } });
  });
});

test("every count carries the caller's tenantId filter; none is bare", async () => {
  await withServer(async (url, f) => {
    await get(url, "key-a");
    assert.equal(f.filters.length, 2);
    for (const c of f.filters) assert.deepEqual(c.filter, { tenantId: "A" });
  });
});

test("a tenant id supplied by the client (query/header) is ignored", async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/system-status?tenantId=B`, { headers: { Authorization: "Bearer key-a", "x-tenant-id": "B" } });
    assert.deepEqual(((await res.json()) as { collections: unknown }).collections, { sessions: 3, claims: 2 });
  });
});

test("unauthenticated and bad-key callers get 401, no counts", async () => {
  await withServer(async (url) => {
    for (const key of [null, "nope"]) {
      const r = await get(url, key);
      assert.equal(r.status, 401);
      assert.equal(r.body.collections, undefined);
    }
  });
});

test("unwired route fails closed with 503 and no counts", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const r = await get(server.baseUrl, "good-ask-key");
    assert.equal(r.status, 503);
    assert.deepEqual(r.body.collections, {});
  } finally { await server.close(); }
});

test("db failure returns 503 with empty collections", async () => {
  const server = await startTestServer(buildTestDeps({
    systemStatus: createMongoSystemStatusDeps(() => ({ command: async () => { throw new Error("boom"); } }) as never, () => ["sessions"]),
  }));
  try {
    const r = await get(server.baseUrl, "good-ask-key");
    assert.deepEqual([r.status, r.body.db, r.body.collections], [503, "error", {}]);
  } finally { await server.close(); }
});

test("source shape: tenant-scoped store uses scopedCollection and no bare count; route is behind requireAuth", () => {
  const store = readFileSync(STORE, "utf8");
  assert.match(store, /scopedCollection/);
  assert.doesNotMatch(store.replace(/\/\*[\s\S]*?\*\//g, ""), /\.collection\(/);
  const server = readFileSync(SERVER, "utf8");
  assert.ok(server.indexOf("createSystemStatusRouter(deps") > server.indexOf("requireAuth(deps.keyStore"));
  const route = readFileSync(ROUTE, "utf8");
  assert.match(route, /req\.auth\?\.tenantId/);
  assert.doesNotMatch(route, /req\.(query|body|params|headers)/);
});

// Recorded reproductions of ISS-T057SCREEN-001, verbatim. Both describe the OLD client/mount state and
// both remain TRUE by design after this unit (see manifest): they are asserted as "still open" so a later
// unit that closes them must update this test deliberately.
test("recorded reproduction 1 (still open, named): /health is mounted before requireAuth", () => {
  const server = readFileSync(SERVER, "utf8");
  assert.ok(server.indexOf("createHealthRouter(deps.health)") < server.indexOf("requireAuth(deps.keyStore"));
});
