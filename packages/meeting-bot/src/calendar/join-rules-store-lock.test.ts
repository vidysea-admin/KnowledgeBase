/** packages/meeting-bot/src/calendar/join-rules-store-lock.test.ts — unit `t037-join-rules-store-lock`. Temp dirs only; REAL node processes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  loadJoinRules, saveJoinRules, recordTenantApproval, recordTenantOptOut, joinRulesFilePath, JoinRulesStoreError, type StoredJoinRules,
} from "./join-rules-store.js";

const STORE_URL = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "join-rules-store.ts")).href;
function withDir(fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "join-rules-lock-"));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}
const sample = (): StoredJoinRules => ({
  ruleSet: { version: 1, ownDomains: ["corp.com"], rules: [{ id: "r1", effect: "allow", match: { domain: "trusted.org", subdomains: false } }] },
  state: { approvedSenders: ["a@b.com"], approvedDomains: [], optedOutEventIds: ["ev1"] },
});
const code = (c: string) => (e: unknown) => e instanceof JoinRulesStoreError && e.code === c;
const lockOf = (dir: string, t: string) => path.join(dir, "join-rules", `${t}.lock`);
const fresh = () => JSON.stringify({ token: "someone-else", pid: 1, at: new Date().toISOString() });
const files = (dir: string) => readdirSync(path.join(dir, "join-rules")).sort();

// Worker: waits for a common start time, then does `n` record operations; HOLD_MS (test-only hook) widens the read->write window.
const WORKER = `
const [storeUrl, dir, tenant, id, n, startAt, mode] = process.argv.slice(1);
const s = await import(storeUrl);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
while (Date.now() < Number(startAt)) sleep(1);
const hold = Number(process.env.HOLD_MS || 0);
const opts = { lockWaitMs: 60000, ...(hold ? { afterRead: () => sleep(Math.random() * hold) } : {}) };
const errors = []; let reads = 0;
if (mode === "read") {
  const fs = await import("node:fs");
  while (!fs.existsSync(n)) { try { s.loadJoinRules(dir, tenant); reads++; } catch (e) { errors.push(String(e.message)); } sleep(1); }
} else for (let j = 0; j < Number(n); j++) {
  try { s.recordTenantApproval(dir, tenant, { kind: "sender", value: id + "n" + j + "@x.com" }, opts); s.recordTenantOptOut(dir, tenant, id + "-ev-" + j, opts); }
  catch (e) { errors.push((e.code || "?") + ":" + e.message); }
}
console.log(JSON.stringify({ errors, reads }));`;

interface Result { errors: string[]; reads: number; exit: number | null }
function runWorker(dir: string, tenant: string, id: string, n: string | number, startAt: number, mode = "write", env: Record<string, string> = {}): Promise<Result> {
  return new Promise(resolve => {
    const p = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", WORKER, STORE_URL, dir, tenant, id, String(n), String(startAt), mode], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = ""; p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
    p.on("close", exit => { try { resolve({ ...JSON.parse(out.trim().split("\n").pop()!), exit }); } catch { resolve({ errors: [`worker died: ${err.slice(0, 300)}`], reads: 0, exit }); } });
  });
}

/** `workers` writers per tenant (distinct ids), `ops` approvals + `ops` opt-outs each, plus one reader process per tenant. */
async function contend(dir: string, tenants: string[], workers: number, ops: number, env: Record<string, string> = {}) {
  const startAt = Date.now() + 2500, doneFile = path.join(dir, "done.flag");
  const readers = tenants.map(t => runWorker(dir, t, "r", doneFile, startAt, "read"));
  const writers = tenants.flatMap(t => Array.from({ length: workers }, (_, i) => runWorker(dir, t, `w${i}`, ops, startAt, "write", env)));
  const w = await Promise.all(writers); writeFileSync(doneFile, "x"); const r = await Promise.all(readers);
  const errors = [...w, ...r].flatMap(x => x.errors); const bad = [...w, ...r].filter(x => x.exit !== 0);
  assert.deepEqual(errors, [], "no worker may see any error (lock timeout, spurious lock failure, partial read)");
  assert.equal(bad.length, 0, "every worker exits 0");
  for (const t of tenants) {
    const s = loadJoinRules(dir, t).state; // validates the file
    for (let i = 0; i < workers; i++) for (let j = 0; j < ops; j++) {
      assert.ok(s.approvedSenders.includes(`w${i}n${j}@x.com`), `${t}: approval w${i}n${j} lost`);
      assert.ok(s.optedOutEventIds.includes(`w${i}-ev-${j}`), `${t}: opt-out w${i}-ev-${j} lost`);
    }
    assert.equal(s.approvedSenders.length, workers * ops); assert.equal(s.optedOutEventIds.length, workers * ops);
  }
  assert.deepEqual(files(dir), tenants.map(t => `${t}.json`).sort(), "no lock or temp file left behind");
  return { reads: r.reduce((a, x) => a + x.reads, 0) };
}

test("8 real processes: every approval and opt-out of ONE tenant survives; no lock/temp left; readers never see a partial file", () => withDir(async dir => {
  const { reads } = await contend(dir, ["acme"], 8, 6, { HOLD_MS: "6" });
  assert.ok(reads > 0, "the reader process actually read during the writes");
}));

test("two tenants contended in parallel by 8+8 real processes do not lose updates", () => withDir(async dir => {
  await contend(dir, ["acme", "beta"], 8, 4, { HOLD_MS: "4" });
}));

test("lock stress: tight contention, no hook, zero spurious errors (rounds via LOCK_STRESS_ROUNDS, default 3)", () => withDir(async dir => {
  const rounds = Number(process.env.LOCK_STRESS_ROUNDS || 3);
  for (let r = 0; r < rounds; r++) { const d = path.join(dir, `r${r}`); mkdirSync(d); await contend(d, ["acme"], 8, 12); }
  console.log(`stress: ${rounds} round(s) x 8 processes x 24 locked writes, 0 errors`);
}));

test("a held lock on tenant A does not block tenant B", () => withDir(async dir => {
  mkdirSync(path.join(dir, "join-rules")); writeFileSync(lockOf(dir, "acme"), fresh());
  const t0 = Date.now(); const r = await runWorker(dir, "beta", "w0", 3, Date.now());
  assert.deepEqual(r.errors, []); assert.ok(Date.now() - t0 < 20000);
  assert.equal(loadJoinRules(dir, "beta").state.approvedSenders.length, 3);
  assert.ok(existsSync(lockOf(dir, "acme")));
}));

test("held lock: timeout throws `locked` quickly, writes nothing, leaves the other holder's lock alone", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample());
  const before = readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), lock = lockOf(dir, "acme"), held = fresh();
  writeFileSync(lock, held);
  const t0 = Date.now();
  assert.throws(() => recordTenantOptOut(dir, "acme", "ev-new", { lockWaitMs: 150 }), code("locked"));
  assert.throws(() => recordTenantApproval(dir, "acme", { kind: "domain", value: "x.org" }, { lockWaitMs: 150 }), code("locked"));
  assert.throws(() => saveJoinRules(dir, "acme", sample(), { lockWaitMs: 150 }), code("locked"));
  assert.ok(Date.now() - t0 < 5000, "deadline is honoured");
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), before);
  assert.equal(readFileSync(lock, "utf8"), held);
  assert.deepEqual(files(dir), ["acme.json", "acme.lock"]);
  rmSync(lock); recordTenantOptOut(dir, "acme", "ev-new"); // released by hand -> works
  assert.ok(loadJoinRules(dir, "acme").state.optedOutEventIds.includes("ev-new"));
}));

test("stale lock is reported with path, age and how to clear it; never stolen; manual clear works", () => withDir(dir => {
  mkdirSync(path.join(dir, "join-rules")); const lock = lockOf(dir, "acme");
  const stale = JSON.stringify({ token: "dead", pid: 999999, at: new Date(Date.now() - 600000).toISOString() });
  writeFileSync(lock, stale);
  assert.throws(() => recordTenantOptOut(dir, "acme", "ev"), (e: unknown) => code("locked")(e) && /stale/.test((e as Error).message) &&
    (e as Error).message.includes(lock) && /age 6\d\ds/.test((e as Error).message) && /NOT stealing/.test((e as Error).message) && /delete the file/.test((e as Error).message));
  assert.equal(readFileSync(lock, "utf8"), stale, "stale lock untouched");
  assert.equal(existsSync(joinRulesFilePath(dir, "acme")), false, "nothing written");
  rmSync(lock); recordTenantOptOut(dir, "acme", "ev");
  assert.deepEqual(files(dir), ["acme.json"]);
}));

test("lock file is named from the tenant id and carries token/pid/at while held", () => withDir(dir => {
  let seen = "";
  recordTenantOptOut(dir, "acme", "ev", { afterRead: () => { seen = readFileSync(lockOf(dir, "acme"), "utf8"); } });
  const c = JSON.parse(seen); assert.equal(c.pid, process.pid); assert.ok(c.token && Date.parse(c.at) > 0);
  assert.ok(!existsSync(lockOf(dir, "acme")));
}));

test("the lock is released after a validation error, a refused load and a failed rename", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample());
  assert.throws(() => recordTenantApproval(dir, "acme", { kind: "sender", value: "not-an-email" }), code("invalid"));
  assert.throws(() => saveJoinRules(dir, "acme", null as any), code("invalid"));
  assert.throws(() => recordTenantOptOut(dir, "acme", "ev", { rename: () => { throw new Error("disk full"); } }), code("write-failed"));
  assert.throws(() => recordTenantOptOut(dir, "acme", "ev", { afterRead: () => { throw new Error("boom"); } }), /boom/);
  writeFileSync(joinRulesFilePath(dir, "beta"), "{bad");
  assert.throws(() => recordTenantOptOut(dir, "beta", "ev"), code("corrupt"));
  assert.deepEqual(files(dir), ["acme.json", "beta.json"]);
  recordTenantOptOut(dir, "acme", "ev"); // and the tenant is usable again
}));

test("an unusable lock location fails as `lock-failed`, not as contention", () => withDir(dir => {
  writeFileSync(path.join(dir, "join-rules"), "i am a file");
  assert.throws(() => recordTenantOptOut(dir, "acme", "ev"), code("lock-failed"));
  assert.throws(() => saveJoinRules(dir, "acme", sample()), code("lock-failed"));
}));

test("save refuses an unreadable / corrupt / wrong-tenant / invalid file by default; overwriteInvalid repairs", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample());
  const good = readFileSync(joinRulesFilePath(dir, "acme"), "utf8");
  const bad: [string, string][] = [
    ["{not json", "corrupt"], [good.replace('"acme"', '"other"'), "tenant-mismatch"], [good.replace('"version": 1,', '"version": 2,'), "invalid"],
    [" ".repeat(1024 * 1024 + 1), "too-large"], ["[]", "invalid"],
  ];
  const empty: StoredJoinRules = { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
  for (const [text, c] of bad) {
    writeFileSync(joinRulesFilePath(dir, "acme"), text);
    assert.throws(() => saveJoinRules(dir, "acme", empty), code(c), c);
    assert.throws(() => saveJoinRules(dir, "acme", empty, { overwriteInvalid: false }), code(c), c);
    assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), text, "nothing written");
    assert.deepEqual(files(dir), ["acme.json"], "no lock/temp left");
    saveJoinRules(dir, "acme", empty, { overwriteInvalid: true });
    assert.deepEqual(loadJoinRules(dir, "acme"), empty);
  }
  saveJoinRules(dir, "acme", sample()); saveJoinRules(dir, "acme", empty); // a valid existing file replaces normally
  assert.deepEqual(loadJoinRules(dir, "acme"), empty);
  rmSync(joinRulesFilePath(dir, "acme")); mkdirSync(joinRulesFilePath(dir, "acme"));
  assert.throws(() => saveJoinRules(dir, "acme", empty, { overwriteInvalid: true }), code("not-a-file"));
}));
