import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { createRunStateStore } from "./run-state-store.js";
import { holdChild, runTs, startTs, STORE_URL, FS_URL, KIT_URL, withTempDir } from "./run-state-lock-real-kit.js";
import { runStateWithAttempt as st } from "./run-state-test-kit.js";

const code = (r: { ok: boolean }) => (r.ok ? "ok" : (r as unknown as { code: string }).code);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const mine = (dir: string) => readdirSync(dir).filter((n) => n.startsWith("r1."));

/** ISS-RUNSTORE-001 recorded repro, verbatim: a child runs save() with the fs op `op` replaced by process.exit(9). */
const DIE = (op: string) => `
import { createRunStateStore } from ${JSON.stringify(STORE_URL)};
import { realRunStateFs } from ${JSON.stringify(FS_URL)};
import { runStateWithAttempt } from ${JSON.stringify(KIT_URL)};
const store = createRunStateStore(process.argv[2]!, { ...realRunStateFs, ${op}: () => process.exit(9) });
store.save("r1", null, runStateWithAttempt(1));
process.exit(0);
`;

test("ISS-RUNSTORE-001 repro (rename), real process, real NTFS: the child dies holding the lock; a fresh instance saves at once", () => withTempDir((dir) => {
  const r = runTs(dir, "die.ts", DIE("rename"), [dir]);
  assert.equal(r.status, 9, r.stderr);
  const left = mine(dir);
  assert.ok(left.includes("r1.run-state.lock") && left.some((n) => n.endsWith(".tmp")), `setup: ${left}`);
  const owner = JSON.parse(readFileSync(path.join(dir, "r1.run-state.lock"), "utf8"));
  assert.equal(owner.host, hostname());
  assert.ok(Number.isSafeInteger(owner.pid) && owner.pid > 0, "the lock names its owner");
  const fresh = createRunStateStore(dir);
  assert.equal(code(fresh.save("r1", null, st(1))), "ok");
  assert.deepEqual(fresh.load("r1"), { ok: true, state: st(1) });
  assert.deepEqual(mine(dir), ["r1.run-state.json"], "lock and orphan temp reaped");
}));

// "write" is the lock body's own write: the child dies with an EMPTY lock (bounded by staleMs); the others leave a readable owner.
for (const [op, empty] of [["fsync", false], ["close", false], ["write", true]] as const) {
  test(`ISS-RUNSTORE-001 variant, real process dying at ${op}: ${empty ? "empty lock, recovered after staleMs" : "recovered at once"}, no leftovers`, () => withTempDir(async (dir) => {
    assert.equal(runTs(dir, "die.ts", DIE(op), [dir]).status, 9);
    const fresh = createRunStateStore(dir, undefined, { staleMs: 600 });
    if (empty) { assert.equal(code(fresh.save("r1", null, st(1))), "locked"); await sleep(700); }
    assert.equal(code(fresh.save("r1", null, st(1))), "ok");
    assert.deepEqual(mine(dir), ["r1.run-state.json"]);
  }));
}

test("real empty lock + orphan temp (the pre-fix on-disk shape): `locked` while young, recovered once older than staleMs on the real clock", () => withTempDir(async (dir) => {
  writeFileSync(path.join(dir, "r1.run-state.lock"), "");
  writeFileSync(path.join(dir, "r1.run-state.json.deadbeef-1.tmp"), "{");
  const store = createRunStateStore(dir, undefined, { staleMs: 600 });
  assert.equal(code(store.save("r1", null, st(1))), "locked");
  await sleep(700);
  assert.equal(code(store.save("r1", null, st(1))), "ok");
  assert.deepEqual(mine(dir), ["r1.run-state.json"]);
}));

test("a REAL second process holding the lock is never displaced below the ceiling, whatever the lock age; once it is dead the lock is recovered", () => withTempDir(async (dir) => {
  const lock = path.join(dir, "r1.run-state.lock");
  const script = `import { writeFileSync } from "node:fs"; import { hostname } from "node:os";
    const at = new Date(Date.now() - 10 * 60_000).toISOString();
    writeFileSync(process.argv[2], JSON.stringify({ token: "child-hold-1", pid: process.pid, host: hostname(), at }), { flag: "wx" });
    console.log("ready"); setTimeout(() => {}, 60_000);`;
  const holder = await holdChild(dir, script, [lock]);
  try {
    const before = readFileSync(lock, "utf8");
    const store = createRunStateStore(dir, undefined, { staleMs: 50 }); // lock is 10 min old, owner is alive
    for (let i = 0; i < 3; i++) assert.equal(code(store.save("r1", null, st(1))), "locked");
    assert.equal(readFileSync(lock, "utf8"), before, "the live owner's lock is byte-identical");
    // above the (here lowered) ceiling the same live pid is treated as a reused pid and displaced
    const low = createRunStateStore(dir, undefined, { staleMs: 50, liveCeilingMs: 60_000 });
    assert.equal(code(low.save("r1", null, st(1))), "ok");
    writeFileSync(lock, before); // the live child "owns" it again
    assert.equal(code(store.save("r1", st(1), st(2))), "locked");
  } finally { await holder.stop(); }
  assert.equal(code(createRunStateStore(dir, undefined, { staleMs: 50 }).save("r1", st(1), st(2))), "ok", "owner killed: ESRCH, immediate takeover");
  assert.deepEqual(mine(dir), ["r1.run-state.json"]);
}));

const WORKER = `
import { createRunStateStore } from ${JSON.stringify(STORE_URL)};
import { realRunStateFs } from ${JSON.stringify(FS_URL)};
import { runStateWithAttempt } from ${JSON.stringify(KIT_URL)};
const store = createRunStateStore(process.argv[2]!);
const counts: Record<string, number> = {};
let done = 0;
while (done < 60) {
  const l = store.load("r1");
  if (!l.ok) { counts["load-" + l.code] = (counts["load-" + l.code] ?? 0) + 1; if (counts["load-" + l.code]! > 1000) process.exit(3); continue; }
  const n = l.state ? l.state.stages.capture!.attempt : 0;
  const r = store.save("r1", l.state, runStateWithAttempt(n + 1));
  const k = r.ok ? "ok" : r.code;
  counts[k] = (counts[k] ?? 0) + 1;
  if (k === "io-error") (counts as any).msg = (r as any).message;
  if (r.ok) done++; else realRunStateFs.sleep(1);
}
console.log(JSON.stringify(counts));
`;

test("ISS-RUNSTORE-002 repro, verbatim: 3 real processes x 60 load+CAS increments on one root end at 180 with zero io-error", () => withTempDir(async (dir) => {
  const root = path.join(dir, "root");
  const kids = [0, 1, 2].map((i) => startTs(dir, `worker${i}.ts`, WORKER, [root]));
  try {
    const outs = await Promise.all(kids.map((k) => k.done));
    let io = 0;
    for (const o of outs) {
      assert.equal(o.code, 0, o.out);
      const c = JSON.parse(o.out.trim().split("\n").pop()!);
      io += c["io-error"] ?? 0;
      if (c.msg) console.log("io-error example:", c.msg);
      assert.equal(c.ok, 60);
    }
    assert.equal(io, 0, "contention is `locked`/`conflict`, never io-error");
    const final = createRunStateStore(root).load("r1") as { ok: true; state: ReturnType<typeof st> };
    assert.equal(final.state.stages.capture!.attempt, 180, "no lost update");
    assert.deepEqual(readdirSync(root), ["r1.run-state.json"]);
  } finally { for (const k of kids) k.kill(); }
}));
