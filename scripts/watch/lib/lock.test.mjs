// scripts/watch/lib/lock.test.mjs — U2. Real filesystem, a scratch temp dir per test (no shared
// state, no mocking fs — the lock's whole job is atomic file creation, so this exercises it for
// real).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, releaseLock } from "./lock.mjs";

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "watch-lock-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("acquireLock succeeds when no lock file exists", () => {
  withTmpDir((dir) => {
    const lockPath = join(dir, "watch.lock");
    const result = acquireLock(lockPath);
    assert.equal(result.acquired, true);
    assert.ok(existsSync(lockPath));
  });
});

test("acquireLock refuses a second concurrent acquire (two runs never overlap)", () => {
  withTmpDir((dir) => {
    const lockPath = join(dir, "watch.lock");
    const first = acquireLock(lockPath);
    const second = acquireLock(lockPath);
    assert.equal(first.acquired, true);
    assert.equal(second.acquired, false);
    assert.ok(second.heldSince);
  });
});

test("releaseLock removes the file so a later acquire succeeds", () => {
  withTmpDir((dir) => {
    const lockPath = join(dir, "watch.lock");
    acquireLock(lockPath);
    releaseLock(lockPath);
    assert.equal(existsSync(lockPath), false);
    const reacquired = acquireLock(lockPath);
    assert.equal(reacquired.acquired, true);
  });
});

test("releaseLock on a non-existent lock is a safe no-op", () => {
  withTmpDir((dir) => {
    assert.doesNotThrow(() => releaseLock(join(dir, "never-existed.lock")));
  });
});

test("a stale lock (older than staleMs) is stolen rather than blocking forever", () => {
  withTmpDir((dir) => {
    const lockPath = join(dir, "watch.lock");
    acquireLock(lockPath);
    // Simulate a crashed run: back-date the lock file's mtime well past staleMs.
    const old = new Date(Date.now() - 10 * 60 * 60 * 1000);
    utimesSync(lockPath, old, old);
    const result = acquireLock(lockPath, { staleMs: 6 * 60 * 60 * 1000 });
    assert.equal(result.acquired, true);
  });
});

test("a fresh lock (younger than staleMs) is NOT stolen", () => {
  withTmpDir((dir) => {
    const lockPath = join(dir, "watch.lock");
    acquireLock(lockPath);
    const result = acquireLock(lockPath, { staleMs: 6 * 60 * 60 * 1000 });
    assert.equal(result.acquired, false);
  });
});
