import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunStateStore } from "./run-state-store.js";
import { FakeRunStateFs, FakeRunStateCrash } from "./run-state-fake-fs.js";
import { runStateWithAttempt as st } from "./run-state-test-kit.js";

const norm = (p: string) => p.replace(/\\/g, "/");

function prepared(): FakeRunStateFs {
  const fs = new FakeRunStateFs();
  assert.equal(createRunStateStore("/r", fs).save("r1", null, st(1)).ok, true);
  fs.opLog = [];
  return fs;
}

/** Crash the process at every operation of an overwrite and of a first create; the target is always old-or-new, whole. */
for (const mode of ["overwrite", "create"] as const) {
  test(`crash at every step of an atomic ${mode}: the target is the complete old or the complete new file`, () => {
    const probe = prepared();
    if (mode === "create") probe.files.clear();
    const store0 = createRunStateStore("/r", probe);
    assert.equal(store0.save("r1", mode === "create" ? null : st(1), st(2)).ok, true);
    const steps = probe.opLog.length;
    assert.ok(steps >= 10, `expected a multi-step write, saw ${steps}`);
    const seen = new Set<string>();
    for (let k = 0; k < steps; k++) {
      const fs = prepared();
      if (mode === "create") fs.files.clear();
      fs.crashAt = k;
      const r = createRunStateStore("/r", fs);
      let crashed = false;
      try { r.save("r1", mode === "create" ? null : st(1), st(2)); } catch (e) { crashed = e instanceof FakeRunStateCrash; }
      // Save swallows I/O errors into a result, so the crash may surface as io-error rather than a throw.
      assert.ok(fs.crashed, `step ${k} (${fs.opLog[k]}) must have crashed the process`);
      void crashed;
      // A fresh process (fresh fake ops over the surviving files) inspects the target.
      const after = new FakeRunStateFs();
      after.files = new Map(fs.files);
      const target = [...after.files.keys()].find((p) => norm(p).endsWith("/r1.run-state.json"));
      const loaded = createRunStateStore("/r", after).load("r1");
      if (target === undefined) { assert.equal(mode, "create", `step ${k}: old file vanished`); assert.deepEqual(loaded, { ok: true, state: null }); seen.add("none"); continue; }
      assert.equal(loaded.ok, true, `step ${k} (${fs.opLog[k]}): target unreadable ${JSON.stringify(loaded)}`);
      const state = (loaded as { state: unknown }).state;
      const isOld = JSON.stringify(state) === JSON.stringify(st(1)), isNew = JSON.stringify(state) === JSON.stringify(st(2));
      assert.ok(isOld || isNew, `step ${k} (${fs.opLog[k]}): neither old nor new`);
      seen.add(isNew ? "new" : "old");
    }
    assert.ok(seen.has("new"), "a crash after the rename leaves the new file");
    assert.ok(seen.has(mode === "create" ? "none" : "old"), "a crash before the rename leaves the old state");
  });
}

test("a crash leaves at most a stray tmp/lock; the lock is reported (not silently stolen) and the tmp never mistaken for state", () => {
  const fs = prepared();
  fs.crashAt = 7; // inside the temp-file write
  createRunStateStore("/r", fs).save("r1", st(1), st(2));
  const survivors = fs.names().map(norm);
  assert.ok(survivors.some((n) => n.endsWith(".tmp")), "partial temp file survives");
  const after = new FakeRunStateFs();
  after.files = new Map(fs.files);
  const store = createRunStateStore("/r", after);
  assert.deepEqual(store.load("r1"), { ok: true, state: st(1) });
  const again = store.save("r1", st(1), st(2));
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.code, "locked");
});

test("a throwing (non-crash) failure at each step cleans up its tmp and lock and keeps the old file", () => {
  const probe = prepared();
  createRunStateStore("/r", probe).save("r1", st(1), st(2));
  const steps = probe.opLog.length;
  for (let k = 0; k < steps; k++) {
    const fs = prepared();
    fs.beforeOp = (n, op) => { if (n === k && op !== "unlink") throw Object.assign(new Error("boom"), { code: "EIO" }); };
    const r = createRunStateStore("/r", fs).save("r1", st(1), st(2));
    fs.beforeOp = null;
    const names = fs.names().map(norm);
    if (r.ok) continue;
    assert.ok(!names.some((n) => n.endsWith(".tmp") || n.endsWith(".lock")), `step ${k} (${fs.opLog[k]}): leftovers ${names}`);
    assert.deepEqual(createRunStateStore("/r", fs).load("r1"), { ok: true, state: st(1) }, `step ${k}`);
  }
});
