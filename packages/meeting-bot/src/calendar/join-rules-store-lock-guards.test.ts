/**
 * packages/meeting-bot/src/calendar/join-rules-store-lock-guards.test.ts — unit `t037-join-rules-stale-lock-takeover`, fix cycle 1.
 * One named test per guard of the claim-then-rename takeover (each is the kill for a mutation recorded in the manifest). Real files in a temp
 * dir, injected clock / probe / host; the protocol is driven step by step through the generators where a step must be interrupted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, utimesSync, statSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSteps, releaseSteps, realFs, LockFailure, type Ctx, type LockFs } from "./join-rules-store-lock-steps.js";
import { acquireLock, releaseLock } from "./join-rules-store-lock.js";

const HOST = "h1", DEAD = 424242, NOW = 1_760_000_000_000;
const iso = (t: number) => new Date(t).toISOString();
const body = (o: Record<string, unknown> = {}, age = 100000) => JSON.stringify({ token: "dead-token", pid: DEAD, host: HOST, at: iso(NOW - age), ...o });
const withDir = (fn: (dir: string, lock: string) => void) => {
  const dir = mkdtempSync(path.join(tmpdir(), "lock-guards-")); const parent = path.join(dir, "join-rules"); mkdirSync(parent);
  try { fn(parent, path.join(parent, "acme.lock")); assert.deepEqual(readdirSync(dir), ["join-rules"], "nothing created outside join-rules/"); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ fs: realFs, waitMs: 0, staleMs: 30000, now: () => NOW, host: HOST, pid: 1234, token: "me-token", isAlive: p => (p === DEAD ? "dead" : "alive"), ...o });
const locked = (e: unknown) => e instanceof LockFailure && e.code === "locked";
function drive<T>(g: Generator<string, T>, hook: (step: string) => void = () => {}): T { for (;;) { const n = g.next(); if (n.done) return n.value; hook(n.value); } }
const acquire = (lock: string, c: Ctx, hook?: (s: string) => void) => drive(acquireSteps(lock, c), hook);
const names = (dir: string) => readdirSync(dir).sort();
/** Asserts the acquire is refused with `locked`, the lock is byte-identical and nothing else was created. */
function refused(dir: string, lock: string, text: string, c: Ctx, why: string) {
  writeFileSync(lock, text); assert.throws(() => acquire(lock, c), locked, why);
  assert.equal(readFileSync(lock, "utf8"), text, why); assert.deepEqual(names(dir), ["acme.lock"], `${why}: no claim / temp left`); rmSync(lock);
}

test("guard: the host is compared EXACTLY as recorded (case, whitespace); a differently-cased host is another machine", () => withDir((dir, lock) => {
  for (const host of ["H1", "h1 ", " h1", "h1.local", "H1".toLowerCase() + "\u0000"]) refused(dir, lock, body({ host }), ctx(), `host ${JSON.stringify(host)}`);
  writeFileSync(lock, body()); assert.equal(acquire(lock, ctx()).token, "me-token", "the exact host is taken");
}));

test("guard: token pattern - separators, dots, NUL, newline, 65 and 300 chars, empty never reach a claim path (no file outside the directory, lock untouched)", () => withDir((dir, lock) => {
  const bad = ["../x", "a/b", "a\\b", "..", ".", "a.b", "a\nb", "a\u0000b", "a b", "x".repeat(65), "x".repeat(300), "", "..\\..\\evil"];
  for (const token of bad) refused(dir, lock, body({ token }), ctx(), `token ${JSON.stringify(token).slice(0, 30)}`);
  writeFileSync(lock, body({ token: "A".repeat(64) })); assert.equal(acquire(lock, ctx()).token, "me-token", "a 64-char token is valid");
}));

test("guard: age boundary - exactly staleMs is NOT old, staleMs + 1 is; unknown / future / non-numeric times are never old", () => withDir((dir, lock) => {
  const c = ctx({ staleMs: 1000 });
  refused(dir, lock, body({}, 1000), c, "age == staleMs"); refused(dir, lock, body({}, 0), c, "age 0"); refused(dir, lock, body({}, 999), c, "age staleMs-1");
  writeFileSync(lock, body({}, 1001)); assert.equal(acquire(lock, c).token, "me-token", "age == staleMs + 1");
  rmSync(lock);
  refused(dir, lock, body({}, -3600e3), c, "recorded time one hour in the future"); refused(dir, lock, body({}, -6000), c, "6 s in the future (beyond the 5 s skew)");
  refused(dir, lock, body({ at: "garbage" }), c, "unparseable at"); refused(dir, lock, body({ at: undefined }), c, "missing at"); refused(dir, lock, body({ at: 5 }), c, "numeric at");
  refused(dir, lock, body({}, 100000), ctx({ staleMs: 1000, now: () => NOW - 3600e3 }), "clock stepped back an hour: lock looks like it is from the future");
  writeFileSync(lock, body({}, 100)); assert.equal(acquire(lock, { ...c, now: () => NOW + 3600e3 }).token, "me-token", "clock stepped FORWARD: still needs proof of death, and has it");
}));

test("guard: age comes from the lock's RECORDED time, not its mtime (old mtime + young record = locked; new mtime + old record = taken)", () => withDir((dir, lock) => {
  writeFileSync(lock, body({}, 100)); const old = new Date(NOW - 3600e3); utimesSync(lock, old, old);
  assert.throws(() => acquire(lock, ctx()), locked); assert.equal(readFileSync(lock, "utf8"), body({}, 100)); rmSync(lock);
  writeFileSync(lock, body({}, 100000)); utimesSync(lock, new Date(), new Date()); assert.equal(acquire(lock, ctx()).token, "me-token");
}));

test("guard: the claim carries the CLAIMANT's own token / pid / host / creation time, and its own mtime - not the dead lock's (ISS-LOCKTAKE-004 root cause)", () => withDir((dir, lock) => {
  writeFileSync(lock, body({}, 100000)); const hour = new Date(Date.now() - 3600e3); utimesSync(lock, hour, hour);
  let seen: any, mt = 0;
  acquire(lock, ctx(), s => { if (s === "reread") { const f = `${lock}.claim.dead-token`; seen = JSON.parse(readFileSync(f, "utf8")); mt = statSync(f).mtimeMs; } });
  assert.deepEqual(seen, { token: "me-token", pid: 1234, host: HOST, at: iso(NOW) }, "claim body is the claimant's own, stamped with ITS creation time");
  assert.ok(Date.now() - mt < 60000, "the claim's mtime is its own (a hard link would show the lock's age: 1 h)");
  assert.deepEqual(JSON.parse(readFileSync(lock, "utf8")), seen, "the claim IS the new lock: one rename, no temp file, no link"); assert.deepEqual(names(dir), ["acme.lock"]);
}));

test("guard: the claim is created exclusively (wx): a claim that exists is never overwritten, however old, and the takeover stops", () => withDir((dir, lock) => {
  writeFileSync(lock, body()); const claim = `${lock}.claim.dead-token`, cb = JSON.stringify({ token: "other", pid: DEAD, host: HOST, at: iso(NOW - 9e6) });
  writeFileSync(claim, cb); const old = new Date(NOW - 9e6); utimesSync(claim, old, old);
  assert.throws(() => acquire(lock, ctx()), (e: unknown) => locked(e) && /takeover claim/.test((e as Error).message));
  assert.equal(readFileSync(claim, "utf8"), cb); assert.equal(readFileSync(lock, "utf8"), body()); assert.deepEqual(names(dir), ["acme.lock", "acme.lock.claim.dead-token"]);
  rmSync(claim); assert.equal(acquire(lock, ctx()).token, "me-token", "a human removing the claim restores recovery");
}));

test("guard: re-read after the claim - a lock replaced by a LIVE one is never replaced; our claim is dropped", () => withDir((dir, lock) => {
  writeFileSync(lock, body()); const live = JSON.stringify({ token: "live-one", pid: 777, host: HOST, at: iso(NOW) });
  assert.throws(() => acquire(lock, ctx(), s => { if (s === "reread") writeFileSync(lock, live); }), locked);
  assert.equal(readFileSync(lock, "utf8"), live); assert.deepEqual(names(dir), ["acme.lock"]);
}));

test("guard: re-probe after the claim - a pid that turns out alive (or unknown) stops the takeover; lock untouched, claim dropped", () => withDir((dir, lock) => {
  for (const second of ["alive", "unknown"] as const) {
    writeFileSync(lock, body()); let calls = 0;
    assert.throws(() => acquire(lock, ctx({ isAlive: () => (++calls === 1 ? "dead" : second) })), locked, second);
    assert.equal(calls, 2, "probed again after the claim"); assert.equal(readFileSync(lock, "utf8"), body()); assert.deepEqual(names(dir), ["acme.lock"]); rmSync(lock);
  }
}));

test("guard: re-check of the age after the claim - a clock that steps back between judge and replace stops the takeover", () => withDir((dir, lock) => {
  writeFileSync(lock, body({}, 100000)); let t = NOW;
  assert.throws(() => acquire(lock, ctx({ now: () => t }), s => { if (s === "reread") t = NOW - 3600e3; }), locked);
  assert.equal(readFileSync(lock, "utf8"), body({}, 100000)); assert.deepEqual(names(dir), ["acme.lock"]);
}));

test("guard: post-replace verification - if the lock is not ours after the rename we are NOT the holder", () => withDir((dir, lock) => {
  writeFileSync(lock, body());
  const sneaky: LockFs = { ...realFs, rename: (a, b) => { renameSync(a, b); writeFileSync(b, JSON.stringify({ token: "someone", pid: 9, host: HOST, at: iso(NOW) })); } };
  assert.throws(() => acquire(lock, ctx({ fs: sneaky })), locked); assert.equal(JSON.parse(readFileSync(lock, "utf8")).token, "someone", "and we did not touch it again");
}));

test("guard: a failed replace (EPERM) drops our claim and leaves the dead lock byte-identical; the next contender can still recover", () => withDir((dir, lock) => {
  writeFileSync(lock, body());
  const failing: LockFs = { ...realFs, rename: () => { throw Object.assign(new Error("x"), { code: "EPERM" }); } };
  assert.throws(() => acquire(lock, ctx({ fs: failing })), locked); assert.equal(readFileSync(lock, "utf8"), body()); assert.deepEqual(names(dir), ["acme.lock"]);
  assert.equal(acquire(lock, ctx()).token, "me-token");
}));

test("claim-holder death: a claimant that died holding the claim blocks that dead lock (manual recovery names the claim); deleting claim + lock restores service (ISS-LOCKTAKE-006 sibling)", () => withDir((dir, lock) => {
  writeFileSync(lock, body()); const dieAfterClaim = new Error("killed");
  assert.throws(() => acquire(lock, ctx({ token: "claimant", pid: DEAD }), s => { if (s === "reread") throw dieAfterClaim; }), e => e === dieAfterClaim);
  assert.deepEqual(names(dir), ["acme.lock", "acme.lock.claim.dead-token"], "the dead claimant left its claim");
  assert.throws(() => acquire(lock, ctx()), (e: unknown) => locked(e) && (e as Error).message.includes("acme.lock.claim.dead-token"));
  rmSync(lock); rmSync(`${lock}.claim.dead-token`); assert.equal(acquire(lock, ctx()).token, "me-token");
}));

test("ISS-LOCKTAKE-006 (open, low): an empty or truncated lock is never taken over, even old with the probe saying dead; manual recovery", () => withDir((dir, lock) => {
  for (const text of ["", "{", '{"token":"dead-token","pid":42', "\u0000".repeat(40)]) {
    writeFileSync(lock, text); const old = new Date(NOW - 3600e3); utimesSync(lock, old, old);
    assert.throws(() => acquire(lock, ctx({ isAlive: () => "dead" })), locked); assert.equal(readFileSync(lock, "utf8"), text); assert.deepEqual(names(dir), ["acme.lock"]); rmSync(lock);
  }
}));

test("ISS-LOCKTAKE-003 (release gap): releasing a lock that is not ours reads it and does nothing else - no rename, no link-back, no create", () => withDir((dir, lock) => {
  const live = body({ token: "live-one", pid: 777 }, 0); writeFileSync(lock, live); const ops: string[] = [];
  const spy: LockFs = { create: (p, d) => { ops.push("create"); realFs.create(p, d); }, read: p => { ops.push("read"); return realFs.read(p); }, stat: realFs.stat, rename: (a, b) => { ops.push("rename"); realFs.rename(a, b); }, unlink: p => { ops.push("unlink"); realFs.unlink(p); } };
  drive(releaseSteps(lock, "me-token", spy)); assert.deepEqual(ops, ["read"]); assert.equal(readFileSync(lock, "utf8"), live);
  releaseLock(lock, "live-one"); assert.deepEqual(names(dir), [], "the real holder's release removes exactly its own lock");
}));

test("no hard link anywhere: the takeover works on a volume without link support because it never calls link (ISS-LOCKTAKE-004: nothing shares the dead lock's inode)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const f of ["join-rules-store-lock.ts", "join-rules-store-lock-steps.ts", "join-rules-store.ts"])
    assert.ok(!/(?<![A-Za-z])linkSync|\bfs\.link\b|\.link\(/.test(readFileSync(path.join(here, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), `${f} must not call link`);
});

test("takeover through the public API reports the dead holder (pid, age) once and the lock then belongs to us", () => withDir((dir, lock) => {
  writeFileSync(lock, JSON.stringify({ token: "dead-token", pid: DEAD, host: "h1", at: new Date(Date.now() - 600000).toISOString() })); let info: any;
  const t = acquireLock(lock, { hostname: () => "h1", isAlive: p => (p === DEAD ? "dead" : "alive"), waitMs: 0, onTakeover: i => { info = i; } });
  assert.equal(info.pid, DEAD); assert.ok(info.ageMs >= 590000); releaseLock(lock, t); assert.deepEqual(names(dir), []);
}));
