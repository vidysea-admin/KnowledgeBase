// corpus-lock.test.mjs -- ISS-PH3-003 / ISS-290: the corpus lock itself is tested. Mutation M8 (verifyCorpus a no-op)
// survived the whole suite in cycle 2. Run from the repo root:  node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-lock.test.mjs
// A tiny synthetic corpus in a temp dir is tampered with; the REAL corpus-lock.mjs and the REAL 05-score.mjs must refuse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const HERE = resolve(import.meta.dirname);
const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
const sha = (s) => createHash("sha256").update(s).digest("hex");

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "corpus-lock-"));
  mkdirSync(join(cwd, OUT), { recursive: true });
  mkdirSync(join(cwd, "data/toc-migrated/s1"), { recursive: true });
  const turns = JSON.stringify([{ _id: "t1", speakerRef: "spk:0", text: "Hello, Ruby here." }]);
  writeFileSync(join(cwd, "data/toc-migrated/s1/turns.json"), turns);
  writeFileSync(join(cwd, OUT, "gold-labels.json"), JSON.stringify({ sessions: [{ session: "s1" }] }));
  writeFileSync(join(cwd, OUT, "corpus.lock.json"), JSON.stringify({ sessions: { s1: sha(turns) } }));
  return cwd;
}
const verifyIn = (cwd) => spawnSync(process.execPath, ["--input-type=module", "-e",
  `const { verifyCorpus } = await import(${JSON.stringify(pathToFileURL(join(HERE, "corpus-lock.mjs")).href)}); verifyCorpus(); console.log("LOCK-OK");`],
  { cwd, encoding: "utf8" });
const scoreIn = (cwd) => spawnSync(process.execPath, [join(HERE, "05-score.mjs"), "--tag", "x"], { cwd, encoding: "utf8" });

test("the untampered pinned corpus passes the lock", () => {
  const cwd = fixture();
  try { assert.match(verifyIn(cwd).stdout, /LOCK-OK/); } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("a tampered pinned session (one appended byte) makes verifyCorpus AND 05-score.mjs refuse", () => {
  const cwd = fixture();
  try {
    appendFileSync(join(cwd, "data/toc-migrated/s1/turns.json"), " ");
    const v = verifyIn(cwd);
    assert.notEqual(v.status, 0);
    assert.match(v.stderr, /ISS-290: corpus drift -- changed\/missing: \[s1\]/);
    const s = scoreIn(cwd);
    assert.notEqual(s.status, 0, "the scoring gate must not run on a drifted corpus");
    assert.match(s.stderr, /ISS-290: corpus drift/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("a missing pinned session, and a lock entry with no pinned session, both refuse", () => {
  const a = fixture();
  try { rmSync(join(a, "data/toc-migrated/s1"), { recursive: true }); assert.match(verifyIn(a).stderr, /ISS-290: corpus drift/); } finally { rmSync(a, { recursive: true, force: true }); }
  const b = fixture();
  try {
    const lock = JSON.parse(readFileSync(join(b, OUT, "corpus.lock.json"), "utf8"));
    lock.sessions.ghost = "00";
    writeFileSync(join(b, OUT, "corpus.lock.json"), JSON.stringify(lock));
    assert.match(verifyIn(b).stderr, /lock-only: \[ghost\]/);
  } finally { rmSync(b, { recursive: true, force: true }); }
});

test("04-regate-eval.mts verifies the corpus before any provider work", () => {
  const src = readFileSync(join(HERE, "04-regate-eval.mts"), "utf8");
  const at = src.indexOf("verifyCorpus()");
  assert.ok(at > 0, "the eval script must call verifyCorpus");
  const firstCall = src.search(/await\s+complete\s*\(/);
  assert.ok(firstCall > at, "no provider CALL (the definition of complete() is fine) may precede the lock check");
});
