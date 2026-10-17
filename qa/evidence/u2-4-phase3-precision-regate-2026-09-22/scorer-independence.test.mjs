// scorer-independence.test.mjs -- ISS-289 / ISS-283 / ISS-290 (w23-spkscorer). Run from the repo root:
//   node --test qa/evidence/u2-4-phase3-precision-regate-2026-09-22/scorer-independence.test.mjs
// D-015: the recorded reproductions are replayed from the recorded files (run-results.jsonl, gold-labels.json,
// data/toc-migrated), not from a corpus authored here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { invalidCitations } from "./citation-check.mjs";
import { bar4 } from "./bar4-stability.mjs";

const HERE = resolve(import.meta.dirname);
const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
const gold = JSON.parse(readFileSync(join(OUT, "gold-labels.json"), "utf8")).sessions;
const recorded = readFileSync(join(OUT, "run-results.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

// ---- ISS-289
test("ISS-289 recorded case: spk:3 -> Jubin (and its spk:1 twin) cited on leeds t088 are invalid citations", () => {
  const session = "2026-08-24-uniaccess-leeds-arts-university";
  const line = recorded.find((l) => l.session === session);
  const checks = line.resolved.map((s) => ({ speakerRef: s.speakerRef, displayName: s.displayName, evidenceTurns: s.evidence.map((e) => e.turnId), blocks: s.blocks }));
  assert.deepEqual(checks.map((c) => c.speakerRef).sort(), ["spk:1", "spk:3"]);
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", session, "turns.json"), "utf8"));
  const bad = invalidCitations({ turns, gold: gold.find((g) => g.session === session), checks });
  assert.equal(bad.length, 2, "ISS-289: 2/2 recorded wrong citations flagged");
  assert.ok(bad.every((b) => b.turnId.endsWith("-t088")));
});

const T = (i, ref) => ({ _id: `t${i}`, speakerRef: ref });
const turns = [T(0, "spk:0"), T(1, "spk:1"), T(2, "spk:0"), T(3, "spk:1")];
const g = { session: "s", blocks: [{ block: 1, person: "Rashi" }, { block: 2, person: "Kshitij" }, { block: 3, person: "Rashi" }, { block: 4, person: null }] };
const chk = (o) => ({ speakerRef: "spk:0", displayName: "Rashi", evidenceTurns: ["t0"], blocks: [{ startTurnIndex: 0, endTurnIndex: 0 }], ...o });
test("ISS-289 geometry: self-naming and adjacent-by-another-speaker are valid; wrong block, wrong person, label-wide are not", () => {
  const run = (o) => invalidCitations({ turns, gold: g, checks: [chk(o)] }).length;
  assert.equal(run({}), 0, "cited turn inside the claimed gold block");
  assert.equal(run({ evidenceTurns: ["t1"] }), 0, "adjacent turn spoken by a different speaker");
  assert.equal(run({ evidenceTurns: ["t3"] }), 1, "turn not in or beside the claimed block");
  assert.equal(run({ displayName: "Kshitij" }), 1, "claimed block's gold person is someone else");
  assert.equal(run({ blocks: [] }), 1, "label-wide claim has no anchor block");
  assert.equal(run({ evidenceTurns: ["nope"] }), 1, "cited turn not in session");
});
test("ISS-289 independence: the citation check imports no production acceptance predicate", () => {
  const src = readFileSync(join(HERE, "citation-check.mjs"), "utf8");
  assert.doesNotMatch(src.replace(/^\/\/.*$/gm, ""), /speaker-name-rules|containsNameVerbatim|citesNameAsAnIntroduction/);
  assert.match(readFileSync(join(HERE, "05-score.mjs"), "utf8"), /invalidCitations\(/, "05-score.mjs must use the independent check");
});

// ---- ISS-283
test("ISS-283 recorded run-results.jsonl: bar 4 is unmeasurable, 957/2340 calls, 0/11 sessions complete, never allStable", () => {
  const perRun = recorded.map((r) => ({ ...r, acceptedSet: [] }));
  const b = bar4({ pinned: gold.map((x) => x.session), perRun });
  assert.equal(b.callsExecuted, 957);
  assert.equal(b.callsExpected, 2340);
  assert.equal(b.perSession.filter((p) => p.complete).length, 0);
  assert.equal(b.measurable, false);
  assert.equal(b.allStable, false);
});
test("ISS-283 synthetic: only complete 3-run sessions can be stable; two identical runs or a short run are not", () => {
  const run = (o, over = {}) => ({ session: "a", outerRun: o, windows: 2, providerCalls: 6, acceptedSet: ["x"], ...over });
  assert.equal(bar4({ pinned: ["a"], perRun: [run(1), run(2), run(3)] }).allStable, true);
  assert.equal(bar4({ pinned: ["a"], perRun: [run(1), run(2)] }).allStable, false, "two runs");
  assert.equal(bar4({ pinned: ["a"], perRun: [run(1), run(2), run(3, { providerCalls: 5 })] }).measurable, false, "run stopped early");
  assert.equal(bar4({ pinned: ["a"], perRun: [run(1), run(2), run(3, { acceptedSet: ["y"] })] }).allStable, false, "unstable but measurable");
  assert.equal(bar4({ pinned: ["a", "b"], perRun: [run(1), run(2), run(3)] }).measurable, false, "a pinned session with no runs");
});

// ---- ISS-290
const sha = (s) => createHash("sha256").update(s).digest("hex");
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "stats-lock-"));
  mkdirSync(join(cwd, OUT), { recursive: true });
  const pos = JSON.stringify([{ _id: "a1", speakerRef: "spk:0" }, { _id: "a2", speakerRef: "spk:1" }]);
  for (const s of ["s1", "s2"]) { mkdirSync(join(cwd, "data/toc-migrated", s), { recursive: true }); writeFileSync(join(cwd, "data/toc-migrated", s, "turns.json"), pos); }
  writeFileSync(join(cwd, OUT, "gold-labels.json"), JSON.stringify({ sessions: [{ session: "s1" }] }));
  writeFileSync(join(cwd, OUT, "corpus.lock.json"), JSON.stringify({ sessions: { s1: sha(pos) } }));
  return cwd;
}
const stats = (cwd) => spawnSync(process.execPath, [join(HERE, "01-block-stats.mjs")], { cwd, encoding: "utf8" });
test("ISS-290: 01-block-stats measures the pinned corpus only and names the unpinned session", () => {
  const cwd = fixture();
  try {
    const r = stats(cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /affected sessions: 1\b/);
    assert.match(r.stdout, /TOTAL positional: 2 \| blocks: 2 \| session\/label pairs: 2/);
    assert.match(r.stderr, /ISS-290 NOTE: 1 positional session\(s\) .* s2/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("ISS-290: 01-block-stats refuses a drifted pinned session", () => {
  const cwd = fixture();
  try {
    appendFileSync(join(cwd, "data/toc-migrated/s1/turns.json"), " ");
    const r = stats(cwd);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ISS-290: corpus drift/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
