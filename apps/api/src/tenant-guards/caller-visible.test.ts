/**
 * apps/api/src/tenant-guards/caller-visible.test.ts - tenant-filter-guards-outside-db (ISS-AUTHTENANT-002).
 *
 * What the CALLER sees when a guard fires: (1) over HTTP, a tenant guard throwing inside a store (here the REAL
 * keys store, reached by simulating a bypass of requireAuth) yields a fixed 500 body with no stack; errors that
 * carry an HTTP status (malformed JSON) are untouched; (2) the mint-key CLI refuses a malformed --tenant with a
 * one-line message and exit 1, before it connects or reads MONGODB_URL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BlindDb, bindDb } from "../ask/tenant-test-kit.js";
import { createMongoKeysDeps } from "../store.js";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeKeysDeps } from "../fixtures.js";

const noStack = (t: string) => !/\n\s+at |node_modules|\.ts:\d+|Error:|tenantId is required/.test(t);
const auth = { authorization: "Bearer k" };
const keyStore = fakeKeyStore({ k: { tenantId: "tA", scopes: ["keys"] } });

test("a tenant guard throwing inside the REAL keys store reaches the caller as a fixed 500 JSON body: no stack, no guard text, nothing written", async () => {
  const db = new BlindDb({ api_keys: [{ _id: "ka", tenantId: "tA", label: "SENT-A", revokedAt: null }] }); bindDb(db);
  const real = createMongoKeysDeps(); // simulated bypass: auth said tA, the store is handed a hostile value
  const server = await startTestServer(buildTestDeps({ keyStore, keys: { ...fakeKeysDeps(), listKeys: () => real.listKeys({ $ne: null } as never), createKey: () => real.createKey("", "x", ["ask"]), revokeKey: () => real.revokeKey(undefined as never, "ka") } }));
  const log = console.error; console.error = () => {};
  try {
    const list = await fetch(`${server.baseUrl}/keys`, { headers: auth });
    const create = await fetch(`${server.baseUrl}/keys`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ label: "x", scopes: ["ask"] }) });
    const revoke = await fetch(`${server.baseUrl}/keys/ka`, { method: "DELETE", headers: auth });
    for (const r of [list, create, revoke]) {
      assert.equal(r.status, 500); assert.match(r.headers.get("content-type") ?? "", /application\/json/);
      const text = await r.text();
      assert.deepEqual(JSON.parse(text), { error: "internal_error", message: "internal error" }); assert.ok(noStack(text), text);
    }
  } finally { console.error = log; await server.close(); }
  assert.deepEqual(db.queries, [], "no query reached the database"); assert.equal(db.all("api_keys").length, 1);
});

test("the terminal handler leaves status-carrying errors alone: malformed JSON is still the default 400, a good request still succeeds", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore, keys: fakeKeysDeps() }));
  const log = console.error; console.error = () => {};
  try {
    const bad = await fetch(`${server.baseUrl}/keys`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: "{not json" });
    assert.equal(bad.status, 400);
    assert.ok(!(await bad.text()).includes("internal_error"));
    assert.equal((await fetch(`${server.baseUrl}/keys`, { headers: auth })).status, 200);
  } finally { console.error = log; await server.close(); }
});

// ---------------------------------------------------------------- scripts/mint-key.mjs
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
function mint(args: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "mint-key-"));
  try { // cwd outside the repo so dotenv cannot load a real .env; MONGODB_URL empty so a VALID tenant stops at the url check, never connects
    const r = spawnSync(process.execPath, [join(ROOT, "scripts", "mint-key.mjs"), ...args], { cwd, encoding: "utf8", timeout: 90000, env: { ...process.env, MONGODB_URL: "" } });
    return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
for (const bad of ["   ", " x", "a\tb", "t\u0001A"]) {
  test(`mint-key --tenant ${JSON.stringify(bad)}: one-line error, exit 1, no stack, refused before the MONGODB_URL check`, () => {
    const r = mint(["--tenant", bad]);
    assert.equal(r.code, 1, r.err); assert.equal(r.out, "");
    assert.match(r.err, /^mint-key: .*tenantId is required/); assert.equal(r.err.trim().split("\n").length, 1, r.err);
    assert.ok(!/MONGODB_URL|\n\s+at /.test(r.err), r.err);
  });
}
test("mint-key positive control: a valid tenant passes the guard (and then stops at the DB guard, never connecting)", () => {
  const r = mint(["--tenant", "tA", "--label", "unit"]);
  assert.notEqual(r.code, 0); assert.match(r.err, /^mint-key: explicit isolated work database and Mongo URL required/); assert.ok(!/tenantId is required/.test(r.err)); // ISS-LEGACYSEED-002/ISS-DBGUARD2-001: refused by requireScriptDatabase before any connect
});
