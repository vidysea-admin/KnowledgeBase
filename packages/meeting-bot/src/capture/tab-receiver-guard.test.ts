// T-034 (lane t034next): receiver guard. Real receiver on ephemeral 127.0.0.1, fake extension = fetch client. No browser.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTabBrowserDeps, createTabCaptureReceiver } from "./tab-browser.js";
import { assertInsideDir, assertSafeCaptureFileName, assertSafeCaptureId, tabReceiverGuardFromEnv } from "./tab-receiver-guard.js";

const ORIGIN = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const auth = (token: string) => ({Origin: ORIGIN, Authorization: `Bearer ${token}`});
const tmp = () => mkdtempSync(path.join(tmpdir(), "lkb-tabguard-"));

test("flag off by default: env without LKB_TAB_RECEIVER_GUARD=1 yields no guard", () => {
  for (const env of [{}, {LKB_TAB_RECEIVER_GUARD: ""}, {LKB_TAB_RECEIVER_GUARD: "0"}, {LKB_TAB_RECEIVER_GUARD: "true"}, {LKB_TAB_MAX_TOTAL_MB: "1"}])
    assert.equal(tabReceiverGuardFromEnv(env), undefined);
  const g = tabReceiverGuardFromEnv({LKB_TAB_RECEIVER_GUARD: "1", LKB_TAB_MAX_CHUNK_MB: "2", LKB_TAB_MAX_TOTAL_MB: "5"});
  assert.deepEqual(g, {maxChunkBytes: 2 * 1048576, maxTotalBytes: 5 * 1048576});
  assert.equal(tabReceiverGuardFromEnv({LKB_TAB_RECEIVER_GUARD: "1", LKB_TAB_MAX_CHUNK_MB: "99"})!.maxChunkBytes, 8 * 1048576, "chunk cap can only be lowered");
  for (const bad of ["0", "-1", "1.5", "abc", "1e3", "0x10"]) assert.throws(() => tabReceiverGuardFromEnv({LKB_TAB_RECEIVER_GUARD: "1", LKB_TAB_MAX_TOTAL_MB: bad}), /positive integer/);
});

test("ids: traversal, separators, drive letters, empty, non-strings refused; ordinary ids pass", () => {
  for (const ok of ["s1", "sess-2026.10_13", "T".repeat(128)]) assert.equal(assertSafeCaptureId("session id", ok), ok);
  for (const bad of ["", "..", "../x", "a/b", "a\b", "C:x", ".hidden", "a..b", "a b", "x\u0000", "T".repeat(129), "%2e%2e", undefined, null, 5, {}])
    assert.throws(() => assertSafeCaptureId("session id", bad), /Unsafe session id/, JSON.stringify(bad));
});

test("file names and output dir: single safe component, output stays inside record dir", () => {
  assert.equal(assertSafeCaptureFileName("tab-1-ab.webm"), "tab-1-ab.webm");
  for (const bad of ["", ".", "..", "../a.webm", "a/b.webm", "a\b.webm", "C:evil.webm", "a.webm:stream", "a\nb", "x".repeat(201), undefined])
    assert.throws(() => assertSafeCaptureFileName(bad), /Unsafe capture file name/, JSON.stringify(bad));
  const dir = tmp();
  assert.doesNotThrow(() => assertInsideDir(dir, path.join(dir, "a.webm")));
  for (const out of [path.join(dir, "..", "a.webm"), dir, dir + "-sibling", path.join(dir, "..", path.basename(dir) + "x", "a.webm")])
    assert.throws(() => assertInsideDir(dir, out), /escapes/);
});

test("receiver with guard: oversize chunk 413 (nothing written), total cap 413 + capture-error, in-cap chunks still land", async () => {
  const dir = tmp(), output = path.join(dir, "a.webm"), events: string[] = [];
  const r = await createTabCaptureReceiver(output, (e) => events.push(e.event + (e.error ? `:${e.error}` : "")), {maxChunkBytes: 10, maxTotalBytes: 25});
  const post = (seq: number, body: string) => fetch(`${r.endpoint}/chunk?seq=${seq}`, {method: "POST", headers: auth(r.token), body});
  try {
    assert.equal((await post(0, "x".repeat(11))).status, 413);
    assert.equal(statSync(output).size, 0);
    assert.equal((await post(0, "a".repeat(10))).status, 200);
    assert.equal((await post(1, "b".repeat(10))).status, 200);
    assert.equal((await post(2, "c".repeat(6))).status, 413, "20 + 6 > 25");
    assert.equal(r.bytes(), 20);
    assert.equal((await post(2, "c".repeat(5))).status, 200, "exactly at the cap is allowed");
    assert.equal((await post(3, "d")).status, 413);
    assert.equal(readFileSync(output, "utf8"), "a".repeat(10) + "b".repeat(10) + "c".repeat(5));
    assert.ok(events.some((e) => e.includes("total size cap exceeded")));
  } finally { await r.close(); }
});

test("receiver without guard: unchanged (oversize-by-guard-numbers body is accepted, malformed stays 400, endpoint is 127.0.0.1)", async () => {
  const dir = tmp(), output = path.join(dir, "a.webm");
  const r = await createTabCaptureReceiver(output, () => {});
  try {
    assert.match(r.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
    const post = (seq: string, body: string) => fetch(`${r.endpoint}/chunk?seq=${seq}`, {method: "POST", headers: auth(r.token), body});
    assert.equal((await post("0", "x".repeat(100_000))).status, 200);
    assert.equal((await post("abc", "x")).status, 400);
  } finally { await r.close(); }
});

test("deps with guard: unsafe tenant/session ids refused before any file, lock or process is created", async () => {
  for (const [tenantId, sessionId] of [["t1", "../evil"], ["a/b", "s1"], [undefined, "s1"], ["t1", undefined], ["t1", "C:s"]] as const) {
    const root = tmp(), recordDir = path.join(root, "rec"), profileDir = path.join(root, "prof");
    const d = createTabBrowserDeps({python: process.execPath, joinScript: "nope.mjs", profileDir, recordDir, tenantId, sessionId, guard: {maxChunkBytes: 1024, maxTotalBytes: 4096}, startupTimeoutMs: 500});
    await assert.rejects(() => d.deps.launch("http://127.0.0.1:1/", {tenantId: "fixture", consentNote: "fixture capture only"}), /Unsafe (tenant|session) id/);
    assert.deepEqual(readdirSync(root), [], "nothing created");
  }
});
