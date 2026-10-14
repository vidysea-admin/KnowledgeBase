/** packages/meeting-bot/src/calendar/join-rules/join-rules-store-lock.test.ts — unit `t037-join-rules-store-lock`. Temp dirs only; REAL node processes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  loadJoinRules, saveJoinRules, recordTenantApproval, recordTenantOptOut, joinRulesFilePath, JoinRulesStoreError, type StoredJoinRules,
} from "./join-rules-store.js";
import { acquireLock, releaseLock, lockStillOwned, defaultIsAlive, LockFailure, type LockOptions } from "./join-rules-store-lock.js";

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

// ---- unit `t037-join-rules-stale-lock-takeover`: injected host / liveness / clock, real files in a temp dir ----
const HOST = "h1", DEAD = 424242;
const staleBody = (o: Record<string, unknown> = {}) => JSON.stringify({ token: "dead-token", pid: DEAD, host: HOST, at: new Date(Date.now() - 600000).toISOString(), ...o });
type Alive = (pid: number) => "alive" | "dead" | "unknown";
const deadOnly: Alive = p => (p === DEAD ? "dead" : "alive");
const inj = (alive: Alive = deadOnly): LockOptions => ({ hostname: () => HOST, isAlive: alive, waitMs: 0 });
const tenantLock = (dir: string, t = "acme", body = staleBody()) => { mkdirSync(path.join(dir, "join-rules"), { recursive: true }); writeFileSync(lockOf(dir, t), body); return lockOf(dir, t); };
const storeOpts = (extra: object = {}, alive: Alive = deadOnly) => ({ lockWaitMs: 0, lockTest: { hostname: () => HOST, isAlive: alive }, ...extra });
const HOLDER = `const [u, dir] = process.argv.slice(1); const s = await import(u);
s.recordTenantOptOut(dir, "ta", "e1", { afterRead: () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000) });`;

/** ISS-T037LOCK-001 recorded reproduction: a real child holds the lock inside recordTenantOptOut, is killed (hard), the lock stays. */
async function killedHolder(dir: string): Promise<string> {
  const p = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", HOLDER, STORE_URL, dir], { stdio: "ignore" });
  const lock = lockOf(dir, "ta"), t0 = Date.now(); let ok = false;
  while (!ok && Date.now() - t0 < 60000) { try { ok = !!JSON.parse(readFileSync(lock, "utf8")).pid; } catch { await new Promise(r => setTimeout(r, 50)); } }
  assert.ok(ok, "child acquired the lock");
  const exited = new Promise(r => p.on("exit", r)); p.kill("SIGKILL"); await exited;
  assert.ok(existsSync(lock), "precondition: the killed writer left its lock behind");
  return lock;
}
// CHANGED by the age requirement (fix cycle 1): the recorded repro 1 expected recovery the instant after the kill; a takeover now also needs lock age > staleMs,
// so the injected clock stands 31 s after the lock was written (real kill, real OS liveness probe). The young case is pinned by the next test.
for (const [name, extra] of [["ISS-T037LOCK-001 repro 1 (lockWaitMs:1000)", {}], ["ISS-T037LOCK-001 repro 2 (lockWaitMs:1000, lockStaleMs:200)", { lockStaleMs: 200 }]] as const)
  test(`${name}: killed writer's lock is recovered with no manual action; the write succeeds`, () => withDir(async dir => {
    const lock = await killedHolder(dir); let info: any;
    const st = recordTenantOptOut(dir, "ta", "e2", { lockWaitMs: 1000, onLockTakeover: i => { info = i; }, lockTest: { now: () => Date.now() + 31000 }, ...extra });
    assert.deepEqual(st.optedOutEventIds, ["e2"]); assert.ok(info && Number.isInteger(info.pid) && !JSON.stringify(info).includes(dir));
    assert.deepEqual(files(dir).filter(f => f !== "ta.json"), [], "no lock, tombstone or temp left"); assert.ok(!existsSync(lock));
  }));

test("ISS-T037LOCK-001 with the age rule: a killed writer's lock younger than staleMs stays `locked` (the delay), untouched; recovered once older", () => withDir(async dir => {
  const lock = await killedHolder(dir), before = readFileSync(lock, "utf8");
  assert.throws(() => recordTenantOptOut(dir, "ta", "e2", { lockWaitMs: 50 }), code("locked"));
  assert.equal(readFileSync(lock, "utf8"), before); assert.deepEqual(files(dir), ["ta.lock"]);
  recordTenantOptOut(dir, "ta", "e2", { lockWaitMs: 1000, lockTest: { now: () => Date.now() + 31000 } }); assert.deepEqual(files(dir), ["ta.json"]);
}));

test("dead holder on this host: takeover, the write succeeds, takeover reported without a path", () => withDir(dir => {
  tenantLock(dir); let info: any, n = 0;
  const st = recordTenantOptOut(dir, "acme", "ev", storeOpts({ onLockTakeover: (i: any) => { info = i; n++; } }));
  assert.deepEqual(st.optedOutEventIds, ["ev"]); assert.equal(n, 1); assert.equal(info.pid, DEAD); assert.ok(info.ageMs >= 590000);
  assert.ok(!JSON.stringify(info).includes(dir)); assert.deepEqual(files(dir), ["acme.json"]);
  recordTenantOptOut(dir, "acme", "ev2", storeOpts({ onLockTakeover: () => { n++; } })); assert.equal(n, 1, "no takeover report on a plain acquire");
}));

test("live / undeterminable holder, pid reuse, another host, legacy lock without host: `locked`, lock byte-identical, nothing written", () => withDir(dir => {
  const legacy = JSON.stringify({ token: "dead", pid: DEAD, at: new Date(Date.now() - 600000).toISOString() });
  const cases: [string, string, Alive][] = [
    ["alive", staleBody(), () => "alive"], ["unknown", staleBody(), () => "unknown"], ["pid reused by a live process", staleBody(), () => "alive"],
    ["other host (probe would say dead)", staleBody({ host: "h2" }), () => "dead"], ["legacy lock, no host", legacy, () => "dead"],
  ];
  for (const [why, body, alive] of cases) {
    const lock = tenantLock(dir, "acme", body);
    assert.throws(() => recordTenantOptOut(dir, "acme", "ev", storeOpts({}, alive)), code("locked"), why);
    assert.equal(readFileSync(lock, "utf8"), body, why); assert.deepEqual(files(dir), ["acme.lock"], why); rmSync(lock);
  }
}));

test("garbage lock content is never taken over, even with the probe saying dead", () => withDir(dir => {
  const bad = ["", "{", "[]", "null", "x".repeat(5000), staleBody({ token: "../evil" }), staleBody({ token: "" }), staleBody({ pid: 0 }), staleBody({ pid: -1 }), staleBody({ pid: 1.5 }), staleBody({ pid: "1" }), staleBody({ host: "" }), staleBody({ host: 7 }), staleBody({ pid: undefined })];
  for (const body of bad) {
    const lock = tenantLock(dir, "acme", body);
    assert.throws(() => acquireLock(lock, inj(() => "dead")), (e: unknown) => e instanceof LockFailure && e.code === "locked", body.slice(0, 40));
    assert.equal(readFileSync(lock, "utf8"), body); assert.deepEqual(files(dir), ["acme.lock"]); rmSync(lock);
  }
}));

// CHANGED (fix cycle 1): was "a dead one is recovered regardless of the clock" for skew +3h AND -3h. With the age rule a clock stepped BACK makes the lock look
// younger/future, so it is NOT taken (delay only); stepped forward it still is. Old loop `[3 * 3600e3, -3 * 3600e3]` -> `[3 * 3600e3]` plus the back-step refusal.
test("clock stepped hours forward and back: a live holder is never taken over; a dead one is recovered after a forward step and refused (delay only) after a back step", () => withDir(dir => {
  const lock = tenantLock(dir, "acme", staleBody({ at: new Date().toISOString() }));
  for (const skew of [3 * 3600e3, -3 * 3600e3, 40 * 86400e3, -40 * 86400e3])
    for (const staleMs of [1, 30000]) {
      assert.throws(() => acquireLock(lock, { ...inj(() => "alive"), now: () => Date.now() + skew, staleMs }), (e: unknown) => e instanceof LockFailure && e.code === "locked", `skew ${skew}`);
      assert.equal(JSON.parse(readFileSync(lock, "utf8")).token, "dead-token");
    }
  const dead = tenantLock(dir, "acme", staleBody({ at: new Date().toISOString() }));
  for (const skew of [-3 * 3600e3, -40 * 86400e3]) assert.throws(() => acquireLock(dead, { ...inj(), now: () => Date.now() + skew }), (e: unknown) => e instanceof LockFailure && e.code === "locked", `back ${skew}`);
  assert.equal(JSON.parse(readFileSync(dead, "utf8")).token, "dead-token");
  const t = acquireLock(dead, { ...inj(), now: () => Date.now() + 3 * 3600e3 }); assert.ok(lockStillOwned(dead, t)); releaseLock(dead, t);
}));

// CHANGED (fix cycle 1): steps are now claim/reread/replace/verify (the hard-link tombstone steps judged/linked/verified/renamed are gone); the removed
// `seen` assertion pinned the tombstone sequence. Same property: exactly one winner at every interleaving point, nothing left behind.
test("two takers racing a dead lock: every interleaving of the critical steps yields exactly one holder", () => withDir(dir => {
  for (const at of ["claim", "reread", "replace", "verify"]) {
    const lock = tenantLock(dir); const out: (string | Error)[] = []; let fired = false;
    const run = (o: LockOptions) => { try { out.push(acquireLock(lock, o)); } catch (e) { out.push(e as Error); } };
    run({ ...inj(), step: n => { if (n === at && !fired) { fired = true; run(inj()); } } });
    assert.ok(fired, at); const wins = out.filter(x => typeof x === "string"), losses = out.filter(x => x instanceof LockFailure);
    assert.equal(wins.length, 1, `${at}: exactly one winner (${out.map(String)})`); assert.equal(losses.length, 1, at);
    if (at === "reread" || at === "replace") assert.match((losses[0] as Error).message, /takeover claim/, "the loser is told a claim exists");
    assert.equal(JSON.parse(readFileSync(lock, "utf8")).token, wins[0]); assert.deepEqual(files(dir), ["acme.lock"], `${at}: no claim or temp left`);
    rmSync(lock);
  }
}));

// CHANGED (fix cycle 1): setup only - the wrongly-judged holder's lock must be older than staleMs to be taken, so the taker's clock stands 31 s later (assertions unchanged).
test("a holder wrongly judged dead wakes after the takeover: it cannot complete its write, and its release leaves the new lock alone", () => withDir(dir => {
  saveJoinRules(dir, "acme", sample()); const before = readFileSync(joinRulesFilePath(dir, "acme"), "utf8"); let newToken = "";
  assert.throws(() => recordTenantOptOut(dir, "acme", "ev-late", { afterRead: () => { newToken = acquireLock(lockOf(dir, "acme"), { waitMs: 0, now: () => Date.now() + 31000, isAlive: p => (p === process.pid ? "dead" : "alive") }); } }), code("locked"));
  assert.equal(readFileSync(joinRulesFilePath(dir, "acme"), "utf8"), before, "the woken holder wrote nothing");
  assert.ok(lockStillOwned(lockOf(dir, "acme"), newToken), "its release did not delete the new holder's lock");
  assert.deepEqual(files(dir), ["acme.json", "acme.lock"]);
  releaseLock(lockOf(dir, "acme"), "not-the-token"); assert.ok(lockStillOwned(lockOf(dir, "acme"), newToken), "release with a foreign token is a no-op");
  releaseLock(lockOf(dir, "acme"), newToken); assert.deepEqual(files(dir), ["acme.json"]);
}));

test("tenant isolation: taking over tenant A's dead lock never touches tenant B's lock or data", () => withDir(dir => {
  const lb = tenantLock(dir, "beta", staleBody({ token: "beta-live", pid: process.pid })); const bBody = readFileSync(lb, "utf8");
  tenantLock(dir, "acme"); recordTenantOptOut(dir, "acme", "ev", storeOpts());
  assert.equal(readFileSync(lb, "utf8"), bBody); assert.deepEqual(files(dir), ["acme.json", "beta.lock"]);
  assert.throws(() => recordTenantOptOut(dir, "beta", "ev", storeOpts()), code("locked"));
}));

// CHANGED (fix cycle 1): the tombstone-expiry test is replaced by the abandoned-claim policy (a claim is never removed automatically; it blocks only its own dead token).
test("an abandoned claim is never removed automatically and blocks only that dead token; a later dead lock with another token is recovered", () => withDir(dir => {
  const lock = tenantLock(dir); const claim = `${lock}.claim.dead-token`; const cb = staleBody({ token: "claimant", pid: DEAD });
  writeFileSync(claim, cb); const old = new Date(Date.now() - 3600e3); utimesSync(claim, old, old);
  assert.throws(() => acquireLock(lock, inj()), (e: unknown) => e instanceof LockFailure && e.code === "locked" && (e as Error).message.includes("takeover claim"));
  assert.equal(readFileSync(claim, "utf8"), cb, "claim untouched, however old"); assert.equal(JSON.parse(readFileSync(lock, "utf8")).token, "dead-token");
  writeFileSync(lock, staleBody({ token: "dead-two" })); // a different dead holder: a different claim name
  const t = acquireLock(lock, inj()); assert.ok(lockStillOwned(lock, t)); assert.equal(readFileSync(claim, "utf8"), cb);
}));

test("defaultIsAlive: this process alive, an exited child dead, nonsense pids never `dead`", async () => {
  assert.equal(defaultIsAlive(process.pid), "alive");
  for (const bad of [0, -1, 1.5, NaN, 2 ** 40]) assert.notEqual(defaultIsAlive(bad), "dead", String(bad));
  const p = spawn(process.execPath, ["-e", "0"], { stdio: "ignore" }); const pid = p.pid!; await new Promise(r => p.on("exit", r));
  assert.equal(defaultIsAlive(pid), "dead");
  const real = process.kill; // only ESRCH is death: EPERM = exists, anything else = cannot tell
  try {
    for (const [c, want] of [["EPERM", "alive"], ["ESRCH", "dead"], ["EACCES", "unknown"], [undefined, "unknown"]] as const) {
      (process as any).kill = () => { throw Object.assign(new Error("x"), { code: c }); };
      assert.equal(defaultIsAlive(1234), want, String(c));
    }
  } finally { process.kill = real; }
});
