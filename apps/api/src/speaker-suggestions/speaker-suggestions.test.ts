/**
 * U2.4 suggested speaker names (D-141, pending append): the HTTP surface, over the REAL scoped @lkb/db accessor on an in-memory Db
 * (no Mongo). Pins: auth + scope, tenant isolation for list/confirm/reject, idempotency, no-store, the 409 state machine,
 * the final-vs-suggested boundary (a suggestion never shows up in /sessions, /ask, /search), and the human-confirmed provenance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SpeakerSuggestions } from "@lkb/core";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { memoryDb } from "../../../../packages/db/src/collections/speaker-suggestions.testdb.js";
import { createMongoSpeakerSuggestionDeps } from "./store.js";

const keys = fakeKeyStore({
  "key-a": { tenantId: "tenant-A", scopes: ["sessions", "ask", "search"] },
  "key-b": { tenantId: "tenant-B", scopes: ["sessions", "ask", "search"] },
  "key-noscope": { tenantId: "tenant-A", scopes: ["ask"] },
});
const auth = (k: string) => ({ authorization: `Bearer ${k}` });
const NAME = "Zorbaxia Quillfeather";   // unique token: any leak anywhere is a substring hit
const SESSION = "session-1";

function suggestion(tenantId: string): SpeakerSuggestions {
  const personId = "person:zorbaxia-quillfeather";
  return {
    _id: `${tenantId}-${SESSION}-spk:1-${personId}`, tenantId, sessionId: SESSION, speakerRef: "spk:1", personId, displayName: NAME, status: "suggested",
    provenance: [{ turnId: "t0", evidenceQuote: `${NAME}, what do you think about the rules`, evidenceKind: "called-on" }],
    evidence: [{ turnId: "t0", sessionId: SESSION }], blocks: [{ startTurnIndex: 1, endTurnIndex: 1 }], suggestedAt: "2026-10-13T08:00:00.000Z",
  };
}
const idOf = (t: string) => suggestion(t)._id;
const base = (path = "") => `/sessions/${SESSION}/speaker-suggestions${path}`;

async function boot() {
  const m = memoryDb();
  m.seed("speaker_suggestions", suggestion("tenant-A"));
  m.seed("speaker_suggestions", suggestion("tenant-B"));
  const server = await startTestServer(buildTestDeps({ keyStore: keys, speakerSuggestions: createMongoSpeakerSuggestionDeps(m.db) }));
  const call = (method: string, path: string, key: string | null, body?: unknown) =>
    fetch(`${server.baseUrl}${path}`, { method, headers: { ...(key ? auth(key) : {}), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { m, server, call };
}

test("auth: no key 401, wrong scope 403, and nothing is written", async () => {
  const { m, server, call } = await boot();
  try {
    for (const [method, path] of [["GET", base()], ["POST", base(`/${idOf("tenant-A")}/confirm`)], ["POST", base(`/${idOf("tenant-A")}/reject`)]] as const) {
      assert.equal((await call(method, path, null)).status, 401, `${method} ${path} no key`);
      assert.equal((await call(method, path, "key-noscope")).status, 403, `${method} ${path} wrong scope`);
    }
    assert.equal(m.rows("speakers").length, 0);
    assert.ok(m.rows("speaker_suggestions").every((r) => r.status === "suggested"));
  } finally { await server.close(); }
});

test("GET lists the caller's suggestions with quote and kind, no-store, as `suggestedName` (not a speaker identity)", async () => {
  const { server, call } = await boot();
  try {
    const res = await call("GET", base(), "key-a");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    const body = (await res.json()) as { suggestions: Record<string, unknown>[] };
    assert.equal(body.suggestions.length, 1);
    const s = body.suggestions[0]!;
    assert.equal(s.id, idOf("tenant-A"));
    assert.equal(s.suggestedName, NAME);
    assert.equal(s.status, "suggested");
    assert.deepEqual(s.quotes, [{ turnId: "t0", quote: `${NAME}, what do you think about the rules`, kind: "called-on" }]);
    for (const k of ["displayName", "aliases", "personId", "tenantId", "finalProvenance"]) assert.equal(k in s, false, k);
  } finally { await server.close(); }
});

test("tenant B cannot list, confirm or reject tenant A's suggestions", async () => {
  const { m, server, call } = await boot();
  try {
    const aId = idOf("tenant-A");
    const list = (await (await call("GET", base(), "key-b")).json()) as { suggestions: { id: string }[] };
    assert.deepEqual(list.suggestions.map((s) => s.id), [idOf("tenant-B")], "B sees only its own row");
    for (const action of ["confirm", "reject"]) {
      const r = await call("POST", base(`/${aId}/${action}`), "key-b", { tenantId: "tenant-A" });   // a body naming A's tenant is ignored
      assert.equal(r.status, 404, action);
      assert.match(r.headers.get("cache-control") ?? "", /no-store/);
      assert.equal((await r.text()).includes(NAME), false);
    }
    const a = m.rows("speaker_suggestions").find((r) => r._id === aId)!;
    assert.equal(a.status, "suggested", "A's row untouched");
    assert.equal(m.rows("speakers").length, 0, "no final row for anyone");
  } finally { await server.close(); }
});

test("a suggestion is bound to its session: right id under another session is 404", async () => {
  const { m, server, call } = await boot();
  try {
    for (const action of ["confirm", "reject"]) assert.equal((await call("POST", `/sessions/session-2/speaker-suggestions/${idOf("tenant-A")}/${action}`, "key-a")).status, 404);
    assert.deepEqual(((await (await call("GET", "/sessions/session-2/speaker-suggestions", "key-a")).json()) as { suggestions: unknown[] }).suggestions, []);
    assert.equal(m.rows("speaker_suggestions").find((r) => r._id === idOf("tenant-A"))?.status, "suggested");
  } finally { await server.close(); }
});

test("confirm makes the name final with human-confirmed provenance; a repeat is 200 changed:false and writes nothing more", async () => {
  const { m, server, call } = await boot();
  try {
    const first = await call("POST", base(`/${idOf("tenant-A")}/confirm`), "key-a");
    assert.equal(first.status, 200);
    assert.match(first.headers.get("cache-control") ?? "", /no-store/);
    const fb = (await first.json()) as { changed: boolean; suggestion: Record<string, unknown> };
    assert.equal(fb.changed, true);
    assert.deepEqual([fb.suggestion.status, fb.suggestion.finalProvenance], ["confirmed", "human-confirmed"]);
    const finals = m.rows("speakers").filter((r) => r.tenantId === "tenant-A");
    assert.equal(finals.length, 1);
    assert.deepEqual([finals[0]!.aliases, finals[0]!.provenance], [[NAME], "human-confirmed"]);
    assert.equal(m.rows("speakers").filter((r) => r.tenantId === "tenant-B").length, 0);
    const snapshot = JSON.stringify([m.rows("speakers"), m.rows("speaker_suggestions")]);
    const again = await call("POST", base(`/${idOf("tenant-A")}/confirm`), "key-a");
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { changed: boolean }).changed, false);
    assert.equal(JSON.stringify([m.rows("speakers"), m.rows("speaker_suggestions")]), snapshot);
    // the confirmed state survives a reload of the list
    const list = (await (await call("GET", base(), "key-a")).json()) as { suggestions: { status: string; finalProvenance?: string }[] };
    assert.deepEqual(list.suggestions.map((s) => [s.status, s.finalProvenance]), [["confirmed", "human-confirmed"]]);
  } finally { await server.close(); }
});

test("reject stores the rejection (no final row), is idempotent, hides the row, and blocks a later confirm with 409", async () => {
  const { m, server, call } = await boot();
  try {
    const r1 = await call("POST", base(`/${idOf("tenant-A")}/reject`), "key-a");
    assert.equal(r1.status, 200);
    assert.equal(((await r1.json()) as { changed: boolean }).changed, true);
    assert.equal(m.rows("speakers").length, 0);
    assert.equal(m.rows("speaker_suggestions").find((r) => r._id === idOf("tenant-A"))?.status, "rejected");
    const r2 = await call("POST", base(`/${idOf("tenant-A")}/reject`), "key-a");
    assert.equal(r2.status, 200);
    assert.equal(((await r2.json()) as { changed: boolean }).changed, false);
    assert.deepEqual(((await (await call("GET", base(), "key-a")).json()) as { suggestions: unknown[] }).suggestions, []);
    const c = await call("POST", base(`/${idOf("tenant-A")}/confirm`), "key-a");
    assert.equal(c.status, 409);
    assert.equal(m.rows("speakers").length, 0, "a rejected name can never become final");
  } finally { await server.close(); }
});

test("reject after confirm is 409 and the confirmed name stays final", async () => {
  const { m, server, call } = await boot();
  try {
    await call("POST", base(`/${idOf("tenant-A")}/confirm`), "key-a");
    assert.equal((await call("POST", base(`/${idOf("tenant-A")}/reject`), "key-a")).status, 409);
    assert.equal(m.rows("speakers").filter((r) => r.tenantId === "tenant-A").length, 1);
  } finally { await server.close(); }
});

test("a SUGGESTION never appears as a final name: not in /sessions, /ask answer or sources, /search, nor with the final marker", async () => {
  const { m, server, call } = await boot();
  try {
    assert.equal(m.rows("speakers").length, 0);
    const surfaces: [string, string, unknown?][] = [["GET", "/sessions"], ["GET", `/sessions/${SESSION}`], ["GET", "/search?q=hello&k=3"], ["POST", "/ask", { query: "who is the speaker" }]];
    for (const [method, path, body] of surfaces) {
      const res = await call(method, path, "key-a", body);
      assert.ok(res.status < 500, `${method} ${path} -> ${res.status}`);
      assert.equal((await res.text()).includes(NAME), false, `${method} ${path} leaked a suggested name`);
    }
    const list = (await (await call("GET", base(), "key-a")).json()) as { suggestions: { status: string; finalProvenance?: string }[] };
    assert.ok(list.suggestions.every((s) => s.status === "suggested" && s.finalProvenance === undefined));
  } finally { await server.close(); }
});

test("malformed ids are 400 with no store access; an unavailable store is a generic 503", async () => {
  const { server, call } = await boot();
  try {
    assert.equal((await call("POST", base("/..%2Fx/confirm"), "key-a")).status, 400);
    assert.equal((await call("GET", "/sessions/a%20b/speaker-suggestions", "key-a")).status, 400);
  } finally { await server.close(); }
  const down = await startTestServer(buildTestDeps({ keyStore: keys }));
  try {
    const r = await fetch(`${down.baseUrl}${base()}`, { headers: auth("key-a") });
    assert.equal(r.status, 503);
    assert.match(r.headers.get("cache-control") ?? "", /no-store/);
  } finally { await down.close(); }
});
