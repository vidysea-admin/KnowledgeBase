/**
 * apps/api/src/join-rules/sender-ascii.test.ts — ISS-WEBHIGH-001. The join-rules write API refuses sender values outside printable ASCII
 * (approvals kind "sender", and PUT rule `match.email`) with 400 { error: "sender_not_printable_ascii" } and writes nothing.
 * The attacks are the ones recorded in the ledger row / ISS-T037UI-002 verdict: U+200B, U+202E, U+0430 (Cyrillic а) local parts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { spyStore, fakeValidator, empty } from "./test-store.js";

const P = "/calendar/join-rules";
const KEYS = { "k": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] } };
const ATTACKS: [string, string][] = [
  ["U+200B zero-width space", "a​b@x.example"],
  ["U+200B trailing", "ann@x.example​"],
  ["U+202E right-to-left override", "ann‮@x.example"],
  ["U+0430 Cyrillic a", "аnn@x.example"],
  ["Cyrillic domain", "ann@а.example"],
  ["U+00A0 no-break space", "ann @x.example"],
  ["U+FEFF BOM", "﻿ann@x.example"],
];
const OK = ["ann@x.example", "Ann.Smith+tag@Sub.X.Example", "ann@xn--bcher-kva.example", "ann@xn--80ak6aa92e.xn--p1ai"];

async function withServer(fn: (call: (m: string, p: string, body?: unknown, h?: Record<string, string>) => Promise<{ status: number; json: any; etag: string | null }>, s: ReturnType<typeof spyStore>) => Promise<void>) {
  const s = spyStore();
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), joinRules: s.deps }));
  const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => {
    const res = await fetch(`${server.baseUrl}${p}`, { method: m, headers: { authorization: "Bearer k", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...h }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const t = await res.text(); let json: any; try { json = JSON.parse(t); } catch { json = t; }
    return { status: res.status, json, etag: res.headers.get("etag") };
  };
  try { await fn(call, s); } finally { await server.close(); }
}
const writes = (s: ReturnType<typeof spyStore>) => s.calls.filter(c => ["save", "saveIf", "recordApproval"].includes(c.op));
const ruleSet = (email: string) => ({ version: 1, ownDomains: [], rules: [{ id: "r", effect: "allow", match: { email } }] });

test("approvals: every recorded non-ASCII sender is 400 sender_not_printable_ascii and nothing is written", async () => {
  await withServer(async (call, s) => {
    for (const [name, value] of ATTACKS) {
      const r = await call("POST", `${P}/approvals`, { kind: "sender", value });
      assert.equal(r.status, 400, name);
      assert.equal(r.json.error, "sender_not_printable_ascii", name);
    }
    assert.equal(writes(s).length, 0);
    assert.equal(s.bytes.size, 0);
  });
});

test("PUT rule set: a non-ASCII match.email is 400 sender_not_printable_ascii, stored rules untouched, ETag unchanged", async () => {
  await withServer(async (call, s) => {
    const first = await call("PUT", P, ruleSet("ann@x.example"), { "if-none-match": "*" });
    assert.equal(first.status, 200);
    const before = s.bytes.get("tenant-a");
    const etag = first.etag!;
    for (const [name, value] of ATTACKS) {
      const r = await call("PUT", P, ruleSet(value), { "if-match": etag });
      assert.equal(r.status, 400, name);
      assert.equal(r.json.error, "sender_not_printable_ascii", name);
      assert.equal(r.etag, null, name);
    }
    assert.equal(s.bytes.get("tenant-a"), before);
    assert.equal(writes(s).length, 1); // only the first, legitimate PUT
    assert.equal((await call("GET", P)).etag, etag);
  });
});

test("plain ASCII and punycode senders are accepted (approvals and PUT)", async () => {
  await withServer(async (call) => {
    let etag: string | null = null;
    for (const value of OK) {
      const r = await call("PUT", P, ruleSet(value), etag ? { "if-match": etag } : { "if-none-match": "*" });
      assert.equal(r.status, 200, value);
      etag = r.etag;
    }
    for (const value of OK) {
      const r = await call("POST", `${P}/approvals`, { kind: "sender", value });
      assert.equal(r.status, 200, value);
    }
  });
});

test("domain approvals and non-email matchers are not subject to the sender gate", async () => {
  await withServer(async (call) => {
    assert.equal((await call("PUT", P, { version: 1, ownDomains: [], rules: [{ id: "r", effect: "allow", match: { domain: "x.example" } }] }, { "if-none-match": "*" })).status, 200);
    assert.equal((await call("POST", `${P}/approvals`, { kind: "domain", value: "x.example" })).status, 200);
  });
});

test("ETag behaviour unchanged: 428 without precondition, 412 on stale, 200 on match", async () => {
  await withServer(async (call, s) => {
    assert.equal((await call("PUT", P, ruleSet("ann@x.example"))).status, 428);
    const a = await call("PUT", P, ruleSet("ann@x.example"), { "if-none-match": "*" });
    assert.equal(a.status, 200);
    assert.equal(a.etag, `"${fakeValidator(ruleSet("ann@x.example") as any)}"`);
    const stale = await call("PUT", P, ruleSet("bob@x.example"), { "if-match": `"${"0".repeat(64)}"` });
    assert.equal(stale.status, 412);
    assert.equal(stale.json.currentEtag, a.etag);
    assert.equal((await call("PUT", P, ruleSet("bob@x.example"), { "if-match": a.etag! })).status, 200);
    void s; void empty;
  });
});
