import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRunStateStore } from "./run-state-store.js";
import { FakeRunStateFs } from "./run-state-fake-fs.js";
import { runStateWithAttempt as st } from "./run-state-test-kit.js";

function withTmp(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-runstate-"));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const code = (r: { ok: boolean }) => (r.ok ? "ok" : (r as unknown as { code: string }).code);

test("round trip on the real filesystem; missing loads as no state; only the final file remains", () => withTmp((dir) => {
  const store = createRunStateStore(path.join(dir, "nested", "runs"));
  assert.deepEqual(store.load("r1"), { ok: true, state: null });
  assert.equal(code(store.save("r1", null, st(1))), "ok");
  assert.deepEqual(store.load("r1"), { ok: true, state: st(1) });
  assert.equal(code(store.save("r1", st(1), st(2, "done"))), "ok");
  assert.deepEqual(store.load("r1"), { ok: true, state: st(2, "done") });
  assert.deepEqual(readdirSync(path.join(dir, "nested", "runs")), ["r1.run-state.json"]);
}));

test("CAS: stale expected, wrong create, and create-over-existing are conflicts that change nothing", () => withTmp((dir) => {
  const store = createRunStateStore(dir);
  store.save("r1", null, st(1));
  const before = readFileSync(path.join(dir, "r1.run-state.json"), "utf8");
  assert.equal(code(store.save("r1", null, st(9))), "conflict");
  assert.equal(code(store.save("r1", st(7), st(9))), "conflict");
  assert.equal(code(store.save("other", st(1), st(2))), "conflict");
  assert.equal(readFileSync(path.join(dir, "r1.run-state.json"), "utf8"), before);
}));

test("CAS distinguishes a change in status or attempt even when the attemptId is the same", () => {
  const fs = new FakeRunStateFs();
  const store = createRunStateStore("/r", fs);
  store.save("r1", null, st(1, "running"));
  assert.equal(code(store.save("r1", st(1, "done"), st(2))), "conflict");
  assert.equal(code(store.save("r1", st(1, "running"), st(1, "done"))), "ok");
});

test("two interleaved writers: both loaded, the first save wins, the second is refused and reloads", () => {
  const fs = new FakeRunStateFs();
  const a = createRunStateStore("/r", fs), b = createRunStateStore("/r", fs);
  a.save("r1", null, st(1));
  const loadedA = (a.load("r1") as { state: ReturnType<typeof st> }).state;
  const loadedB = (b.load("r1") as { state: ReturnType<typeof st> }).state;
  assert.equal(code(a.save("r1", loadedA, st(2))), "ok");
  const refused = b.save("r1", loadedB, st(3));
  assert.equal(code(refused), "conflict");
  assert.deepEqual(b.load("r1"), { ok: true, state: st(2) });
  assert.equal(code(b.save("r1", st(2), st(3))), "ok");
});

test("a writer arriving during another writer's rename window is refused as locked, never overwrites", () => {
  const fs = new FakeRunStateFs();
  const a = createRunStateStore("/r", fs), b = createRunStateStore("/r", fs);
  a.save("r1", null, st(1));
  let intruder = "";
  let armed = true;
  fs.beforeOp = (_n, op) => { if (op === "rename" && armed) { armed = false; intruder = code(b.save("r1", st(1), st(5))); } };
  assert.equal(code(a.save("r1", st(1), st(2))), "ok");
  assert.equal(intruder, "locked");
  assert.deepEqual(a.load("r1"), { ok: true, state: st(2) });
  assert.ok(!fs.names().some((n) => n.endsWith(".lock")), "lock released");
});

test("a pre-existing lock is reported and left alone", () => {
  const fs = new FakeRunStateFs();
  fs.files.set(path.join("/r", "r1.run-state.lock"), "");
  const store = createRunStateStore("/r", fs);
  assert.equal(code(store.save("r1", null, st(1))), "locked");
  assert.ok(fs.files.has(path.join("/r", "r1.run-state.lock")));
});

test("corrupt, wrong-envelope and schema-invalid files are typed errors, never overwritten or deleted", () => withTmp((dir) => {
  const store = createRunStateStore(dir);
  const good = JSON.stringify({ format: "lkb-run-state/1", runId: "r1", state: st(1) });
  const bad: Array<[string, string, string]> = [
    ["torn", good.slice(0, 40), "corrupt"],
    ["garbage", "\u0000\u0001 not json", "corrupt"],
    ["empty", "", "corrupt"],
    ["wrong-run", JSON.stringify({ format: "lkb-run-state/1", runId: "zzz", state: st(1) }), "corrupt"],
    ["wrong-format", JSON.stringify({ format: "v0", runId: "r1", state: st(1) }), "corrupt"],
    ["null", "null", "corrupt"],
    ["no-stages", JSON.stringify({ format: "lkb-run-state/1", runId: "r1", state: { sourceFingerprint: "x", stages: {} } }), "schema-invalid"],
    ["bad-status", JSON.stringify({ format: "lkb-run-state/1", runId: "r1", state: { ...st(1), stages: { capture: { ...st(1).stages.capture, status: "weird" } } } }), "schema-invalid"],
  ];
  for (const [label, text, want] of bad) {
    const file = path.join(dir, "r1.run-state.json");
    writeFileSync(file, text);
    const l = store.load("r1");
    assert.equal(code(l), want, label);
    assert.equal(code(store.save("r1", st(1), st(2))), "corrupt-existing", label);
    assert.equal(code(store.save("r1", null, st(2))), "corrupt-existing", label);
    assert.equal(readFileSync(file, "utf8"), text, `${label}: bytes preserved`);
    assert.deepEqual(readdirSync(dir), ["r1.run-state.json"], `${label}: nothing else left behind`);
    rmSync(file);
  }
}));

test("a directory where the file should be is not-a-file and survives", () => withTmp((dir) => {
  mkdirSync(path.join(dir, "r1.run-state.json"));
  const store = createRunStateStore(dir);
  assert.equal(code(store.load("r1")), "not-a-file");
  assert.equal(code(store.save("r1", null, st(1))), "corrupt-existing");
  assert.deepEqual(readdirSync(dir), ["r1.run-state.json"]);
}));

test("invalid next or expected state is refused before any fs operation", () => {
  const fs = new FakeRunStateFs();
  const store = createRunStateStore("/r", fs);
  const broken = { sourceFingerprint: "x", stages: { capture: { status: "nope" } } } as never;
  assert.equal(code(store.save("r1", null, broken)), "invalid-state");
  assert.equal(code(store.save("r1", broken, st(1))), "invalid-state");
  assert.deepEqual(fs.opLog, []);
});

test("Windows EPERM/EBUSY/EACCES on rename is retried and succeeds; other codes and exhaustion fail with old file intact", () => {
  const fs = new FakeRunStateFs();
  const store = createRunStateStore("/r", fs);
  store.save("r1", null, st(1));
  fs.renameFailures = [{ code: "EPERM", times: 2 }, { code: "EBUSY", times: 1 }, { code: "EACCES", times: 1 }];
  assert.equal(code(store.save("r1", st(1), st(2))), "ok");
  assert.deepEqual(store.load("r1"), { ok: true, state: st(2) });
  fs.renameFailures = [{ code: "EIO", times: 1 }];
  assert.equal(code(store.save("r1", st(2), st(3))), "io-error");
  assert.deepEqual(store.load("r1"), { ok: true, state: st(2) });
  fs.renameFailures = [{ code: "EPERM", times: 1_000_000 }];
  assert.equal(code(store.save("r1", st(2), st(3))), "io-error");
  assert.deepEqual(store.load("r1"), { ok: true, state: st(2) });
  assert.equal(fs.names().length, 1, "only the state file: no tmp or lock left after failed writes");
});
