/**
 * ISS-RUNLOCK-003, the ledger row's four recorded reproductions, replayed on the REAL filesystem with a REAL separate process as the
 * stalled writer A (the contender B runs in this test process). Stall = A blocks inside its own fs wrapper until released; "time" for
 * the 1 h liveness ceiling is a clock offset both processes read (the ceiling cannot be waited out). The one injected failure is the
 * row's second failure: B's reap unlink throwing EPERM on a temp file (antivirus / indexer), which a test cannot cause for real.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRunStateStore } from "./run-state-store.js";
import { realRunStateFs, type RunStateFsOps } from "./run-state-fs.js";
import { runStateWithAttempt as st } from "./run-state-test-kit.js";
import { STORE_URL, FS_URL, KIT_URL, startTs, withTempDir } from "./run-state-lock-real-kit.js";

const code = (r: { ok: boolean }) => (r.ok ? "ok" : (r as unknown as { code: string }).code);

const WORKER_A = `
import { createRunStateStore } from ${JSON.stringify(STORE_URL)};
import { realRunStateFs } from ${JSON.stringify(FS_URL)};
import { runStateWithAttempt } from ${JSON.stringify(KIT_URL)};
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const [root, ctl, point] = process.argv.slice(2);
const offset = () => Number(readFileSync(ctl + "/offset", "utf8") || 0);
let wrote = false, fired = false;
const stall = () => {
  writeFileSync(ctl + "/stalled", "1");
  const t0 = Date.now();
  while (!existsSync(ctl + "/go")) { if (Date.now() - t0 > 120000) throw new Error("never released"); realRunStateFs.sleep(20); }
};
const fs = {
  ...realRunStateFs,
  now: () => Date.now() + offset(),
  createExclusive: (p) => { if (p.endsWith(".tmp")) { if (point === "create" && !fired) { fired = true; stall(); } wrote = true; } return realRunStateFs.createExclusive(p); },
  kind: (p) => { if (point === "recheck" && wrote && !fired && p.endsWith("r1.run-state.json")) { fired = true; stall(); } return realRunStateFs.kind(p); },
  rename: (a, b) => { if (point === "rename" && !fired && a.endsWith(".tmp") && b.endsWith("r1.run-state.json")) { fired = true; stall(); } realRunStateFs.rename(a, b); },
};
const store = createRunStateStore(root, fs);
const l = store.load("r1");
const r = store.save("r1", l.state, runStateWithAttempt(5));
console.log("RESULT " + JSON.stringify(r.ok ? { ok: true } : { code: r.code, message: r.message }));
`;

async function until(cond: () => boolean, what: string, ms = 60_000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 20)); }
}

/** One replay. `stallMs` = how far B's clock is ahead of A's when B runs; `reapFails` = the row's second failure on B's unlink. */
async function replay(point: "create" | "recheck" | "rename", stallMs: number, reapFails: boolean) {
  let out!: { b: string; bMessage: string; bDebris: string[]; a: Record<string, string>; data: unknown; finalDir: string[] };
  await withTempDir(async (dir) => {
    const root = path.join(dir, "root"), ctl = path.join(dir, "ctl");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(ctl, { recursive: true });
    writeFileSync(path.join(ctl, "offset"), "0");
    assert.equal(code(createRunStateStore(root).save("r1", null, st(1))), "ok");
    const a = startTs(dir, "workerA.ts", WORKER_A, [root, ctl, point]);
    try {
      await until(() => existsSync(path.join(ctl, "stalled")), "A to stall");
      writeFileSync(path.join(ctl, "offset"), String(stallMs));
      const bFs: RunStateFsOps = {
        ...realRunStateFs,
        now: () => Date.now() + stallMs,
        unlink: (p) => { if (reapFails && p.endsWith(".tmp")) throw Object.assign(new Error("EPERM: operation not permitted, unlink"), { code: "EPERM" }); realRunStateFs.unlink(p); },
      };
      const bRes = createRunStateStore(root, bFs).save("r1", st(1), st(2));
      const bDebris = readdirSync(root).sort();
      writeFileSync(path.join(ctl, "go"), "1");
      const done = await a.done;
      assert.equal(done.code, 0, done.out);
      const line = done.out.split("\n").find((l) => l.startsWith("RESULT "))!;
      const ar = JSON.parse(line.slice(7));
      const dataFile = path.join(root, "r1.run-state.json");
      out = {
        b: code(bRes), bMessage: bRes.ok ? "" : bRes.message, bDebris,
        a: { result: ar.ok ? "ok" : ar.code, message: ar.message ?? "" },
        data: existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")).state : null,
        finalDir: readdirSync(root).sort(),
      };
    } finally { a.kill(); }
  });
  return out;
}

test("ISS-RUNLOCK-003 case 1 (the row's EXACT repro): A stalls ON the data rename, B's reap unlink fails -> B refuses, nothing written; A's save is the only acknowledged one", async () => {
  const r = await replay("rename", 3_700_000, true);
  assert.equal(r.b, "conflict", `B: ${r.bMessage}`);
  assert.match(r.bMessage, /orphan temp file/);
  assert.equal(r.bDebris.filter((n) => n.endsWith(".lock")).length, 0, `B left no lock: ${r.bDebris}`);
  assert.equal(r.a.result, "ok");
  assert.deepEqual(r.data, st(5), "data = A's; B acknowledged nothing, so no acknowledged state was replaced");
  assert.deepEqual(r.finalDir, ["r1.run-state.json"]);
});

test("ISS-RUNLOCK-003 case 2: same stall, B's unlink works -> B ok, A gets io-error (its reaped temp is gone), B's state intact", async () => {
  const r = await replay("rename", 3_700_000, false);
  assert.equal(r.b, "ok", r.bMessage);
  assert.equal(r.a.result, "io-error", r.a.message);
  assert.deepEqual(r.data, st(2));
  assert.deepEqual(r.finalDir, ["r1.run-state.json"]);
});

test("ISS-RUNLOCK-003 case 3: a 2 h stall BEFORE the token re-check -> B takes over and saves, A refuses `locked`, nothing lost", async () => {
  const r = await replay("create", 7_200_000, false);
  assert.equal(r.b, "ok", r.bMessage);
  assert.equal(r.a.result, "locked", r.a.message);
  assert.deepEqual(r.data, st(2));
  assert.deepEqual(r.finalDir, ["r1.run-state.json"]);
});

test("ISS-RUNLOCK-003 case 4: a 59 min stall -> the live same-host holder is not displaced: B `locked`, A saves", async () => {
  const r = await replay("recheck", 59 * 60_000, false);
  assert.equal(r.b, "locked", r.bMessage);
  assert.equal(r.a.result, "ok");
  assert.deepEqual(r.data, st(5));
  assert.deepEqual(r.finalDir, ["r1.run-state.json"]);
});

test("the stall before the revision re-check read with a failing reap (the fixed twin of case 1): B refuses, A's save lands", async () => {
  const r = await replay("recheck", 3_700_000, true);
  assert.equal(r.b, "conflict", r.bMessage);
  assert.equal(r.a.result, "ok");
  assert.deepEqual(r.data, st(5));
  assert.deepEqual(r.finalDir, ["r1.run-state.json"]);
});
