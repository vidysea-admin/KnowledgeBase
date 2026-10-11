/** ISS-RUNSTORE-003: the two survivors of the t050 checker's mutation run (temp file beside the target; key-order independent CAS). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRunStateStore } from "./run-state-store.js";
import { realRunStateFs, type RunStateFsOps } from "./run-state-fs.js";
import { FakeRunStateFs } from "./run-state-fake-fs.js";
import { runStateWithAttempt as st } from "./run-state-test-kit.js";

const code = (r: { ok: boolean }) => (r.ok ? "ok" : (r as unknown as { code: string }).code);
const reorder = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(reorder)
    : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v as object).reverse().map(([k, x]) => [k, reorder(x)])) : v;

test("(a) the temp file is created beside the target: the fake refuses a cross-directory rename, so a store that put it elsewhere fails", () => {
  const fs = new FakeRunStateFs();
  assert.equal(code(createRunStateStore("/r", fs).save("r1", null, st(1))), "ok");
  const created = fs.opLog.filter((o) => o.startsWith("create ")).map((o) => path.dirname(o.slice(7)));
  assert.ok(created.length >= 2 && created.every((d) => path.normalize(d) === path.normalize("/r")), `created in ${created}`);
  fs.files.set(path.join("/elsewhere", "x.tmp"), "x");
  assert.throws(() => fs.rename(path.join("/elsewhere", "x.tmp"), path.join("/r", "x")), { code: "EXDEV" });
});

test("(a) on the real filesystem every file the store creates (lock, temp) sits in the target's own directory", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-gaps-"));
  try {
    const seen: string[] = [];
    const spy: RunStateFsOps = { ...realRunStateFs, createExclusive: (p) => { seen.push(path.dirname(p)); return realRunStateFs.createExclusive(p); } };
    const store = createRunStateStore(path.join(dir, "root"), spy);
    assert.equal(code(store.save("r1", null, st(1))), "ok");
    assert.equal(code(store.save("r1", st(1), st(2))), "ok");
    assert.ok(seen.length >= 4 && seen.every((d) => d === path.join(dir, "root")), `created in ${seen}`);
    assert.deepEqual(readdirSync(path.join(dir, "root")), ["r1.run-state.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("(b) an `expected` whose keys are in a different order than the stored state still matches (canonical revision, not JSON.stringify)", () => {
  const fs = new FakeRunStateFs();
  const store = createRunStateStore("/r", fs);
  assert.equal(code(store.save("r1", null, st(1))), "ok");
  const shuffled = reorder(st(1)) as ReturnType<typeof st>;
  assert.notEqual(JSON.stringify(shuffled), JSON.stringify(st(1)), "setup: the key order really differs");
  assert.equal(code(store.save("r1", shuffled, st(2))), "ok");
  assert.equal(code(store.save("r1", reorder(st(1)) as ReturnType<typeof st>, st(3))), "conflict", "still a conflict once the stored state moved on");
});
