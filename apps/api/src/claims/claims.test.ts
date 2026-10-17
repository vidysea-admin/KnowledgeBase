import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import type { Db } from "mongodb";
import { requireAuth } from "../auth.js";
import { scopedCollection } from "../../../../packages/db/src/lib/tenantScope.js";
import { createServer } from "../server.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { createClaimsListRouter, parseClaimsQuery, unavailableClaimsListDeps, type ClaimsListDeps } from "./router.js";
import { createMongoClaimsListDeps } from "./store.js";

type Row = Record<string, unknown>;
const claim = (id: string, tenantId: string, status: string, sessionId = "s1"): Row =>
  ({ _id: id, tenantId, text: `text ${id}`, status, confidence: 0.5, evidence: [{ turnId: `t-${id}`, sessionId }] });
const DATA: Record<string, Row[]> = {
  claims: [claim("c1", "A", "verified"), claim("c2", "A", "needs-review"), claim("c3", "A", "verified", "gone"), claim("c4", "B", "verified", "sB"), claim("c5", "A", "verified")],
  sessions: [{ _id: "s1", tenantId: "A", sourceId: "source-A", title: "Session A1" }, { _id: "sB", tenantId: "B", sourceId: "source-B", title: "Secret B" }, { _id: "s1", tenantId: "B", sourceId: "source-B", title: "Other tenant s1" }],
  sources: [{ _id: "source-A", tenantId: "A", kind: "document" }, { _id: "source-B", tenantId: "B", kind: "document" }],
  turns: ["c1", "c2", "c5"].map(id => ({ _id: `t-${id}`, tenantId: "A", sessionId: "s1", speakerRef: "document", text: `text ${id}`, tStart: 0, tEnd: 1 }))
    .concat([{ _id: "t-c4", tenantId: "B", sessionId: "sB", speakerRef: "document", text: "text c4", tStart: 0, tEnd: 1 }]),
};
function match(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === "object" && "$in" in (v as Row)) return ((v as { $in: unknown[] }).$in).includes(row[k]);
    if (v && typeof v === "object" && "$gt" in (v as Row)) return String(row[k]) > String((v as Row).$gt);
    return row[k] === v;
  });
}
const fakeDb = {
  collection: (name: string) => ({
    findOne: async (filter: Row) => (DATA[name] ?? []).find(r => match(r, filter)) ?? null,
    find: (filter: Row) => {
      let rows = (DATA[name] ?? []).filter((r) => match(r, filter));
      const cur = {
        sort: (o: Record<string, 1 | -1>) => { const [[k, d]] = Object.entries(o) as [[string, 1 | -1]]; rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -d : String(a[k]) > String(b[k]) ? d : 0)); return cur; },
        skip: (n: number) => { rows = rows.slice(n); return cur; },
        limit: (n: number) => { rows = rows.slice(0, n); return cur; },
        toArray: async () => rows,
      };
      return cur;
    },
  }),
} as unknown as Db;
const realStore = () => createMongoClaimsListDeps({
  claims: scopedCollection(fakeDb, "claims") as never,
  sessions: scopedCollection(fakeDb, "sessions") as never,
}, () => fakeDb);

async function withServer(deps: ClaimsListDeps | undefined, run: (url: string) => Promise<void>) {
  const app = express();
  app.use(requireAuth(fakeKeyStore({ A: { tenantId: "A", scopes: ["citations"] }, B: { tenantId: "B", scopes: ["citations"] }, NS: { tenantId: "A", scopes: ["sessions"] } })));
  app.use(createClaimsListRouter(deps ?? unavailableClaimsListDeps));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const addr = server.address(); assert.ok(addr && typeof addr !== "string");
  try { await run(`http://127.0.0.1:${addr.port}`); } finally { await new Promise<void>((r) => server.close(() => r())); }
}
const h = (k: string) => ({ headers: { authorization: `Bearer ${k}` } });

test("auth and scope: no key 401, wrong scope 403, store not called", async () => {
  let calls = 0;
  await withServer({ listClaims: async (_t, q) => { calls++; return { claims: [], limit: q.limit, offset: q.offset, truncated: false }; } }, async (url) => {
    assert.equal((await fetch(`${url}/claims`)).status, 401);
    assert.equal((await fetch(`${url}/claims`, h("bad"))).status, 401);
    assert.equal((await fetch(`${url}/claims`, h("NS"))).status, 403);
    assert.equal(calls, 0);
    const ok = await fetch(`${url}/claims`, h("A"));
    assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "private, no-store");
    assert.equal(calls, 1);
  });
});

test("tenant isolation: key A reads only A's claims, key B only B's; client tenant hints ignored or refused", async () => {
  await withServer(realStore(), async (url) => {
    const a = await (await fetch(`${url}/claims`, h("A"))).json() as { claims: { _id: string }[] };
    assert.deepEqual(a.claims.map((c) => c._id), ["c1", "c2", "c5"]);
    const b = await (await fetch(`${url}/claims`, h("B"))).json() as { claims: { _id: string; evidence: { sessionTitle: string | null }[] }[] };
    assert.deepEqual(b.claims.map((c) => c._id), ["c4"]);
    assert.equal(b.claims[0]!.evidence[0]!.sessionTitle, "Secret B");
    assert.ok(!JSON.stringify(a).includes("Secret B"), "A must never see B's session title");
    assert.equal((await fetch(`${url}/claims?tenantId=B`, h("A"))).status, 400);
    const hdr = await (await fetch(`${url}/claims`, { headers: { authorization: "Bearer A", "x-tenant-id": "B" } })).json() as { claims: { _id: string }[] };
    assert.ok(!hdr.claims.some((c) => c._id === "c4"));
  });
});

test("citation: session title resolved within tenant only; missing evidence claim withheld, same id in another tenant is not borrowed", async () => {
  await withServer(realStore(), async (url) => {
    const a = await (await fetch(`${url}/claims`, h("A"))).json() as { claims: { _id: string; evidence: { turnId: string; sessionId: string; sessionTitle: string | null }[] }[] };
    const byId = Object.fromEntries(a.claims.map((c) => [c._id, c.evidence[0]!]));
    assert.deepEqual(byId.c1, { turnId: "t-c1", sessionId: "s1", sessionTitle: "Session A1" });
    assert.equal(byId.c3, undefined, "orphan evidence cannot disclose claim text or borrow another tenant's title");
    const b = await (await fetch(`${url}/claims`, h("B"))).json() as { claims: unknown[] };
    assert.ok(!JSON.stringify(b).includes("Session A1"));
  });
});

test("filter and paging: status filter, limit/offset, truncated flag, stable order", async () => {
  await withServer(realStore(), async (url) => {
    const get = async (q: string) => await (await fetch(`${url}/claims${q}`, h("A"))).json() as { claims: { _id: string }[]; limit: number; offset: number; truncated: boolean };
    assert.deepEqual((await get("?status=needs-review")).claims.map((c) => c._id), ["c2"]);
    const p1 = await get("?limit=2");
    assert.deepEqual(p1.claims.map((c) => c._id), ["c1", "c2"]); assert.equal(p1.truncated, true);
    const p2 = await get("?limit=2&offset=2");
    assert.deepEqual(p2.claims.map((c) => c._id), ["c5"]); assert.equal(p2.truncated, false); assert.equal(p2.offset, 2);
    assert.deepEqual((await get("?limit=2&offset=4")).claims, []);
    const exact = await get("?limit=4");
    assert.equal(exact.claims.length, 3); assert.equal(exact.truncated, false);
  });
});

test("query validation rejects malformed input before the store", () => {
  const bad = ["status=nope", "limit=0", "limit=101", "limit=01", "limit=1.5", "limit=-1", "offset=-1", "offset=10001", "offset=01", "offset=1e2", "x=1", "limit=1&limit=2", "status=verified&status=verified"];
  for (const q of bad) assert.equal(parseClaimsQuery(new URLSearchParams(q)), null, q);
  assert.deepEqual(parseClaimsQuery(new URLSearchParams("")), { limit: 50, offset: 0 });
  assert.deepEqual(parseClaimsQuery(new URLSearchParams("status=conflicting&limit=100&offset=10000")), { status: "conflicting", limit: 100, offset: 10000 });
});

test("store failure and unwired deps answer 503 with a fixed body; response is bounded", async () => {
  await withServer(undefined, async (url) => {
    const r = await fetch(`${url}/claims`, h("A"));
    assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: "claims_unavailable", message: "Claims are unavailable" });
  });
  await withServer({ listClaims: async (_t, q) => ({ claims: Array.from({ length: q.limit + 1 }, () => ({}) as never), limit: q.limit, offset: 0, truncated: false }) }, async (url) => {
    assert.equal((await fetch(`${url}/claims?limit=1`, h("A"))).status, 503);
  });
});

test("read-only: only GET is served; write verbs do not reach the store", async () => {
  let calls = 0;
  await withServer({ listClaims: async (_t, q) => { calls++; return { claims: [], limit: q.limit, offset: q.offset, truncated: false }; } }, async (url) => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await fetch(`${url}/claims`, { method, headers: { authorization: "Bearer A", "content-type": "application/json" }, body: method === "DELETE" ? undefined : "{}" });
      assert.ok(r.status === 404 || r.status === 405, `${method} -> ${r.status}`);
    }
    assert.equal(calls, 0);
  });
});

test("createServer wiring: /claims mounted behind auth and defaults to 503 when claims deps absent", async () => {
  const deps = buildTestDeps({ keyStore: fakeKeyStore({ K: { tenantId: "t", scopes: ["citations"] } }) });
  const server = createServer(deps).listen(0, "127.0.0.1"); await once(server, "listening");
  const addr = server.address(); assert.ok(addr && typeof addr !== "string");
  try {
    const url = `http://127.0.0.1:${addr.port}/claims`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, h("K"))).status, 503);
  } finally { await new Promise<void>((r) => server.close(() => r())); }
  const wired = createServer({ ...deps, claims: realStore() }).listen(0, "127.0.0.1"); await once(wired, "listening");
  const a2 = wired.address(); assert.ok(a2 && typeof a2 !== "string");
  try { assert.equal((await fetch(`http://127.0.0.1:${a2.port}/claims`, h("K"))).status, 200); } finally { await new Promise<void>((r) => wired.close(() => r())); }
});
