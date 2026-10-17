import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRunId } from "./run-state-id.js";
import { createRunStateStore } from "./run-state-store.js";
import { FakeRunStateFs } from "./run-state-fake-fs.js";
import { runStateWithAttempt } from "./run-state-test-kit.js";

const HOSTILE: unknown[] = [
  "", "..", ".", "../x", "..\\x", "a/b", "a\\b", "/etc/passwd", "\\\\server\\share", "C:", "C:\\x", "c:x", "C:/x",
  "con", "CON", "con.txt", "nul", "aux.json", "prn", "com1", "lpt9", "com1.x", "x.", "a..b", " x", "x ", "a b", "A",
  "x".repeat(65), "a\0b", "a\nb", "a:b", "a*b", "a?b", "a|b", "a<b", "a>b", "a\"b", "~1", "-x", ".hidden", "_x",
  "é", "a%2fb", "a/../b", null, undefined, 42, {}, ["a"],
];

test("path-escape corpus: every hostile id is rejected (>= 25 ids)", () => {
  assert.ok(HOSTILE.length >= 25);
  for (const id of HOSTILE) assert.notEqual(validateRunId(id), null, `accepted ${JSON.stringify(id)}`);
});

test("ordinary ids are accepted", () => {
  for (const id of ["run-1", "abc", "s_2026.10.11-a", "x".repeat(64), "9", "console", "com10"]) assert.equal(validateRunId(id), null, id);
});

test("the store rejects hostile ids on load and save, and touches no file", () => {
  const fs = new FakeRunStateFs();
  const store = createRunStateStore("/root", fs);
  for (const id of HOSTILE) {
    const l = store.load(id as string);
    assert.deepEqual([l.ok, !l.ok && l.code], [false, "bad-run-id"]);
    const s = store.save(id as string, null, runStateWithAttempt(1));
    assert.deepEqual([s.ok, !s.ok && s.code], [false, "bad-run-id"]);
  }
  assert.deepEqual(fs.opLog, [], "a rejected id performs no fs operation at all");
});
