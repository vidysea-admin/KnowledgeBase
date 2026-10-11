/**
 * apps/api/src/join-rules/un-opt.test.ts — `t037-join-rules-un-opt` (ISS-T037OPT-001 / -003), router half.
 * POST /calendar/join-rules/opt-outs/remove through the real server stack over the byte-level spy store (test-store.ts), so each
 * test can assert WHICH tenant's data was touched. The pure removal and the real store are covered in meeting-bot and the host tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { empty, spyStore } from "./test-store.js";

const P = "/calendar/join-rules";
const R = `${P}/opt-outs/remove`;
const KEYS = {
  "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] },
  "b-key": { tenantId: "tenant-b", scopes: ["calendar", "join-rules"] },
  "read-key": { tenantId: "tenant-a", scopes: ["calendar"] },
  "write-only": { tenantId: "tenant-a", scopes: ["join-rules"] },
};
const seeded = (ids: string[], meetings?: string[]) => {
  const v = empty(); v.state.optedOutEventIds = ids; if (meetings) v.state.optedOutMeetings = meetings; return v;
};

async function withServer(fn: (call: (m: string, p: string, key?: string, body?: unknown, raw?: string) => Promise<{ status: number; json: any }>, s: ReturnType<typeof spyStore>) => Promise<void>) {
  const s = spyStore();
  s.put("tenant-a", seeded(["e1", "e2"], ["url:zoom:111", "key:k1", "key:k10"]));
  s.put("tenant-b", seeded(["e1", "e2"], ["url:zoom:111", "key:k1"]));
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), joinRules: s.deps }));
  const call = async (m: string, p: string, key?: string, body?: unknown, raw?: string) => {
    const res = await fetch(`${server.baseUrl}${p}`, {
      method: m, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body !== undefined || raw !== undefined ? { "content-type": "application/json" } : {}) },
      ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json().catch(() => undefined) };
  };
  try { await fn(call, s); } finally { await server.close(); }
}

test("auth: no key / bad key 401, read-only key 403, join-rules-only key allowed; nothing is read or written for the refusals", () => withServer(async (call, s) => {
  const before = [s.bytes.get("tenant-a"), s.bytes.get("tenant-b")];
  assert.equal((await call("POST", R, undefined, { eventId: "e1" })).status, 401);
  assert.equal((await call("POST", R, "nope", { eventId: "e1" })).status, 401);
  assert.equal((await call("POST", R, "read-key", { eventId: "e1" })).status, 403);
  assert.equal(s.calls.length, 0);
  assert.deepEqual([s.bytes.get("tenant-a"), s.bytes.get("tenant-b")], before);
  assert.equal((await call("POST", R, "write-only", { eventId: "e1" })).status, 200);
}));

test("other methods and path variants never reach the removal (DELETE / PUT / GET on the route, trailing slash, case)", () => withServer(async (call, s) => {
  for (const [m, p] of [["DELETE", R], ["PUT", R], ["GET", R], ["PATCH", R], ["DELETE", `${P}/opt-outs`]] as const) {
    const r = await call(m, p, "a-key", m === "GET" ? undefined : { eventId: "e1" }); assert.ok(r.status >= 400, `${m} ${p} -> ${r.status}`);
  }
  assert.ok(!s.calls.some(c => c.op === "removeOptOut" || c.op === "save"), JSON.stringify(s.calls));
}));

test("tenant comes from the key only: tenant-b's key removes tenant-b's entries, tenant-a's bytes are untouched; a body tenantId is 400", () => withServer(async (call, s) => {
  const a = s.bytes.get("tenant-a");
  const r = await call("POST", R, "b-key", { eventId: "e1", meetingUrl: "zoom:111", sessionKey: "k1" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.removed, { eventId: true, meetings: ["url:zoom:111", "key:k1"] });
  assert.equal(s.bytes.get("tenant-a"), a, "tenant A untouched");
  assert.deepEqual(JSON.parse(s.bytes.get("tenant-b")!).state.optedOutEventIds, ["e2"]);
  assert.ok(s.calls.every(c => c.tenantId === "tenant-b"), JSON.stringify(s.calls));
  for (const extra of [{ tenantId: "tenant-a" }, { tenant: "tenant-a" }, { state: {} }, { __proto__: null, kind: "x" }]) {
    assert.equal((await call("POST", R, "b-key", { eventId: "e2", ...extra })).status, 400, JSON.stringify(extra));
  }
  assert.equal(s.bytes.get("tenant-a"), a);
}));

test("response shape, exact matching and idempotence: the second identical removal is a 200 no-op that reports nothing removed and writes nothing", () => withServer(async (call, s) => {
  const first = await call("POST", R, "a-key", { eventId: "e1", sessionKey: "k1" });
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.removed, { eventId: true, meetings: ["key:k1"] });
  assert.deepEqual(first.json.state.optedOutMeetings, ["url:zoom:111", "key:k10"], "k10 is another meeting: not a prefix match");
  assert.deepEqual(Object.keys(first.json).sort(), ["removed", "state"]);
  const bytes = s.bytes.get("tenant-a"); const saves = s.calls.filter(c => c.op === "save").length;
  const second = await call("POST", R, "a-key", { eventId: "e1", sessionKey: "k1" });
  assert.equal(second.status, 200);
  assert.deepEqual(second.json.removed, { eventId: false, meetings: [] });
  assert.deepEqual(second.json.state, first.json.state);
  assert.equal(s.bytes.get("tenant-a"), bytes);
  assert.equal(s.calls.filter(c => c.op === "save").length, saves, "no write on a no-op");
}));

test("an id alone removes only the id: stored identities are not guessed (the document does not link them)", () => withServer(async (call, s) => {
  const r = await call("POST", R, "a-key", { eventId: "e1" });
  assert.deepEqual(r.json.removed, { eventId: true, meetings: [] });
  assert.deepEqual(JSON.parse(s.bytes.get("tenant-a")!).state.optedOutMeetings, ["url:zoom:111", "key:k1", "key:k10"]);
}));

test("hostile bodies are 400 before any store call: wrong types, extra keys, huge values, non-objects", () => withServer(async (call, s) => {
  const bad: unknown[] = [
    {}, { eventId: "" }, { eventId: 5 }, { eventId: null }, { eventId: ["e1"] }, { eventId: { $ne: 1 } }, { eventId: "e".repeat(1025) },
    { eventId: "e1", meetingUrl: 5 }, { eventId: "e1", meetingUrl: "u".repeat(2049) }, { eventId: "e1", sessionKey: {} }, { eventId: "e1", sessionKey: "k".repeat(257) },
    { eventId: "e1", extra: 1 }, { eventId: "e1", kind: "sender" }, { eventId: "e1", "__proto__x": 1 }, [], ["e1"], "e1", 7, null,
  ];
  for (const b of bad) assert.equal((await call("POST", R, "a-key", b)).status, 400, JSON.stringify(b)?.slice(0, 60));
  assert.equal((await call("POST", R, "a-key", undefined, "{not json")).status, 400);
  assert.equal(s.calls.length, 0, JSON.stringify(s.calls));
}));

test("tagged-string injection: an id like `url:zoom:111` or `key:k1` removes only that exact id; a hint never widens to other entries", () => withServer(async (call, s) => {
  s.put("tenant-a", seeded(["url:zoom:111", "key:k1", "e1"], ["url:zoom:111", "key:k1"]));
  const r = await call("POST", R, "a-key", { eventId: "key:k1" });
  assert.deepEqual(r.json.removed, { eventId: true, meetings: [] });
  assert.deepEqual(JSON.parse(s.bytes.get("tenant-a")!).state, { ...empty().state, optedOutEventIds: ["url:zoom:111", "e1"], optedOutMeetings: ["url:zoom:111", "key:k1"] });
  const r2 = await call("POST", R, "a-key", { eventId: "zz", sessionKey: "url:zoom:111" });
  assert.deepEqual(r2.json.removed, { eventId: false, meetings: [] });
}));

test("GET exposes the caller's own stored identities (optedOutMeetings) and never another tenant's", () => withServer(async (call, s) => {
  s.put("tenant-b", seeded(["b-only"], ["key:b-secret-room"]));
  const a = await call("GET", P, "a-key"); const b = await call("GET", P, "b-key");
  assert.deepEqual(a.json.state.optedOutMeetings, ["url:zoom:111", "key:k1", "key:k10"]);
  assert.deepEqual(b.json.state.optedOutMeetings, ["key:b-secret-room"]);
  assert.ok(!JSON.stringify(a.json).includes("b-secret-room") && !JSON.stringify(a.json).includes("b-only"));
  assert.ok(s.calls.filter(c => c.op === "load").every((c, i) => c.tenantId === (i === 0 ? "tenant-a" : "tenant-b")));
}));

test("query string, headers and path never select a tenant: b-key with ?tenantId=tenant-a only ever touches tenant-b", () => withServer(async (call, s) => {
  const a = s.bytes.get("tenant-a");
  const r = await call("POST", `${R}?tenantId=tenant-a&tenant=tenant-a`, "b-key", { eventId: "e1" });
  assert.equal(r.status, 200);
  assert.equal(s.bytes.get("tenant-a"), a);
  assert.ok(s.calls.length > 0 && s.calls.every(c => c.tenantId === "tenant-b"), JSON.stringify(s.calls));
}));
