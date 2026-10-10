// scripts/tracker-audit.test.mjs — covers the `--gate` filter added for ISS-053: G1 is fully
// author-controlled and wired into `pnpm lint:structure`, but a commit gate must never fire on
// G2/G3 findings, which depend on someone else's later action (a re-check, a sweep run).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit, parseGateArg, filterByGate } from "./tracker-audit.mjs";

test("parseGateArg reads both --gate g1 and --gate=g1, and is null when absent", () => {
  assert.equal(parseGateArg(["--gate", "g1"]), "G1");
  assert.equal(parseGateArg(["--gate=g1"]), "G1");
  assert.equal(parseGateArg(["--json"]), null);
  assert.equal(parseGateArg([]), null);
});

/** A fixture project that fails BOTH G1 (row-set mismatch) and G2 (an unverified fix). */
function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({
      tasks: [{ id: "T-001", status: "done" }],
      progress: { total: 1, done: 1, percent: 100 },
    }),
  );
  // TASKS.md carries an extra row goal.json doesn't know about — a real G1 row-set mismatch.
  writeFileSync(
    join(root, "TASKS.md"),
    "| id | status | title |\n|---|---|---|\n| T-001 | done | thing |\n| T-002 | open | untracked in goal.json |\n",
  );
  writeFileSync(
    join(root, "qa", "issues.jsonl"),
    `${JSON.stringify({ id: "ISS-001", status: "fixed", verified_date: null })}\n`,
  );
  return root;
}

test("audit() reports both G1 and G2 findings on a fixture with both defects", () => {
  const root = fixtureRoot();
  try {
    const findings = audit(root);
    assert.ok(findings.some((f) => f.startsWith("G1")), "expected a G1 finding");
    assert.ok(findings.some((f) => f.startsWith("G2")), "expected a G2 finding");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("--gate g1 filters out G2/G3 findings — a commit gate must not block on someone else's later action (ISS-053)", () => {
  const root = fixtureRoot();
  try {
    const all = audit(root);
    const gate = parseGateArg(["--gate", "g1"]);
    const filtered = filterByGate(all, gate);
    assert.ok(filtered.length > 0, "the G1 defect in this fixture must still be caught");
    assert.ok(filtered.every((f) => f.startsWith("G1")), "no G2/G3 finding may leak through the g1 gate filter");
    assert.ok(all.some((f) => f.startsWith("G2")), "sanity: the unfiltered set does contain a G2 finding");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("filterByGate with no gate returns findings unchanged", () => {
  const findings = ["G1 x", "G2 y", "G3 z"];
  assert.deepEqual(filterByGate(findings, null), findings);
});

test("a clean fixture passes both the full audit and the g1 gate", () => {
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({ tasks: [{ id: "T-001", status: "done" }], progress: { total: 1, done: 1, percent: 100 } }),
  );
  writeFileSync(join(root, "TASKS.md"), "| id | status | title |\n|---|---|---|\n| T-001 | done | thing |\n");
  writeFileSync(join(root, "qa", "issues.jsonl"), `${JSON.stringify({ id: "ISS-001", status: "verified", verified_date: "2026-01-01" })}\n`);
  try {
    assert.deepEqual(audit(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("G1 sees U#.# roadmap ids, not just T-### (the import that made the roadmap reachable)", () => {
  // Before 2026-09-08 the row regex accepted only `T-[0-9]+`, so the plan §10 roadmap units
  // (U0.5 … U4.2) could not be tracked at all: adding them to goal.json would have reported all
  // 21 as "in goal.json but not TASKS.md" and failed the commit gate, while leaving them out kept
  // the maker's roadmap backlog tier permanently empty — which is why the loop fed on its own
  // findings instead. This asserts both id shapes parse and are compared on MEANING, so a
  // regression to the old pattern fails here rather than silently emptying the roadmap again.
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-u-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({
      tasks: [
        { id: "T-001", status: "done" },
        { id: "U0.5", status: "done" },
        { id: "U1.1", status: "pending" }, // "pending" here vs "open" in TASKS.md — same meaning
        { id: "U0.10", status: "blocked" }, // two-digit minor, and a status only the gate normalises
      ],
      progress: { total: 4, done: 2, percent: 50 },
    }),
  );
  writeFileSync(
    join(root, "TASKS.md"),
    "| ID | Status | Task |\n|---|---|---|\n| T-001 | done | t |\n| U0.5 | done | u |\n" +
      "| U1.1 | open | u |\n| U0.10 | blocked | u |\n",
  );
  writeFileSync(join(root, "qa", "issues.jsonl"), "");

  const findings = filterByGate(audit(root), "G1");
  assert.deepEqual(findings, [], `expected no G1 findings, got: ${findings.join(" | ")}`);
  rmSync(root, { recursive: true, force: true });
});

test("G1 sees a LETTER-SUFFIXED U id (U1.0b), not just U#.# — the suffix applies to both id families", () => {
  // The suffix was on `T-` only (`T-[0-9]+[a-z]?`), so `| U1.0b | done |` in TASKS.md simply did
  // not match and G1 reported "in goal.json but not TASKS.md" for a row that was demonstrably
  // present in the file — a divergence the tool INVENTED rather than found, which is worse than a
  // missed one because the honest fix (add the row) cannot clear it. The repo has used letter
  // suffixes since T-004b/T-009b/T-017b; U ids acquired one at U1.0b.
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-suffix-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({
      tasks: [
        { id: "U1.0", status: "done" },
        { id: "U1.0b", status: "done" },
        { id: "T-017b", status: "done" },
      ],
      progress: { total: 3, done: 3, percent: 100 },
    }),
  );
  writeFileSync(
    join(root, "TASKS.md"),
    "| ID | Status | Task |\n|---|---|---|\n| U1.0 | done | u |\n| U1.0b | done | u |\n| T-017b | done | t |\n",
  );
  writeFileSync(join(root, "qa", "issues.jsonl"), "");

  const findings = filterByGate(audit(root), "G1");
  assert.deepEqual(findings, [], `expected no G1 findings, got: ${findings.join(" | ")}`);
  rmSync(root, { recursive: true, force: true });
});

test("G1 still catches a mismatch on a letter-suffixed U id — the widened suffix did not blind it", () => {
  // The widening must not turn U1.0b into an id the gate merely ignores.
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-suffix-bad-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({ tasks: [{ id: "U1.0b", status: "done" }], progress: { total: 1, done: 1, percent: 100 } }),
  );
  writeFileSync(join(root, "TASKS.md"), "| ID | Status | Task |\n|---|---|---|\n| U1.0b | open | u |\n");
  writeFileSync(join(root, "qa", "issues.jsonl"), "");

  const findings = filterByGate(audit(root), "G1");
  assert.ok(
    findings.some((f) => f.includes("U1.0b")),
    `a real done/open divergence on U1.0b must still be caught, got: ${findings.join(" | ")}`,
  );
  rmSync(root, { recursive: true, force: true });
});

test("G1 still catches a genuine U-unit mismatch — the widened regex did not weaken the check", () => {
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-u2-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({
      tasks: [{ id: "U1.1", status: "done" }],
      progress: { total: 1, done: 1, percent: 100 },
    }),
  );
  // Claimed done in goal.json, still open in TASKS.md — the exact drift G1 exists to catch.
  writeFileSync(join(root, "TASKS.md"), "| ID | Status |\n|---|---|\n| U1.1 | open | u |\n");
  writeFileSync(join(root, "qa", "issues.jsonl"), "");

  const findings = filterByGate(audit(root), "G1");
  assert.equal(findings.length, 1, `expected exactly one G1 finding, got: ${findings.join(" | ")}`);
  assert.match(findings[0], /U1\.1/);
  rmSync(root, { recursive: true, force: true });
});

test("G1 catches a DUPLICATE TASKS.md row — a Map keeps only the last, so a conflict can hide (ISS-089)", () => {
  // Found in the wild: a roadmap import added a second U3.1 row while a richer one already existed.
  // G1 stayed GREEN because `mdRows.set` let the later row win, so the two rows' disagreement was
  // invisible to the only gate that reads them. The row-set check cannot see this by construction —
  // it compares key SETS, and a duplicate key is still one key.
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-dup-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({ tasks: [{ id: "U3.1", status: "in_progress" }], progress: { total: 1, done: 0, percent: 0 } }),
  );
  writeFileSync(
    join(root, "TASKS.md"),
    "| ID | Status |\n|---|---|\n| U3.1 | done | first |\n| U3.1 | in_progress | second |\n",
  );
  writeFileSync(join(root, "qa", "issues.jsonl"), "");

  const findings = filterByGate(audit(root), "G1");
  assert.equal(findings.length, 1, `expected the duplicate to be reported, got: ${findings.join(" | ")}`);
  assert.match(findings[0], /duplicate/i);
  assert.match(findings[0], /U3\.1×2/);
  rmSync(root, { recursive: true, force: true });
});

test("G1 names an unknown status word, alongside the mismatch line it also emits", () => {
  // `partial` was in real use in TASKS.md and is in NORMALISE for neither tracker, so it mapped to
  // `undefined` — which compares unequal to everything and would have produced
  // `is "in_progress" but "partial"` rather than saying the vocabulary is wrong.
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-vocab-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({ tasks: [{ id: "U3.1", status: "in_progress" }], progress: { total: 1, done: 0, percent: 0 } }),
  );
  writeFileSync(join(root, "TASKS.md"), "| ID | Status |\n|---|---|\n| U3.1 | partial | x |\n");
  writeFileSync(join(root, "qa", "issues.jsonl"), "");

  const findings = filterByGate(audit(root), "G1");
  assert.ok(
    findings.some((f) => /unknown status "partial"/.test(f)),
    `expected the unknown status to be named, got: ${findings.join(" | ")}`,
  );
  rmSync(root, { recursive: true, force: true });
});

test("G1 treats `blocked` as its own class — a pending/blocked split is a real divergence (ISS-090)", () => {
  // Found twice in one unit: a correction landed in goal.json (`pending`) and not in TASKS.md
  // (`blocked`), and G1 stayed GREEN because both normalised to "not-done". The words do not mean
  // the same thing — one says the row is available to pull, the other says it cannot be — so a
  // tracker asserting both at once is precisely the untruth this gate exists to catch.
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-blocked-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({ tasks: [{ id: "T-021", status: "pending" }], progress: { total: 1, done: 0, percent: 0 } }),
  );
  writeFileSync(join(root, "TASKS.md"), "| ID | Status |\n|---|---|\n| T-021 | blocked | x |\n");
  writeFileSync(join(root, "qa", "issues.jsonl"), "");

  const findings = filterByGate(audit(root), "G1");
  assert.equal(findings.length, 1, `expected the split to be reported, got: ${findings.join(" | ")}`);
  assert.match(findings[0], /T-021 is "pending" in goal\.json but "blocked" in TASKS\.md/);
  rmSync(root, { recursive: true, force: true });
});

test("G1 still accepts agreeing `blocked` rows — the new class did not make blockage unrepresentable", () => {
  const root = mkdtempSync(join(tmpdir(), "lkb-audit-blocked2-"));
  mkdirSync(join(root, ".goal"), { recursive: true });
  mkdirSync(join(root, "qa"), { recursive: true });
  writeFileSync(
    join(root, ".goal", "goal.json"),
    JSON.stringify({ tasks: [{ id: "T-021", status: "blocked" }], progress: { total: 1, done: 0, percent: 0 } }),
  );
  writeFileSync(join(root, "TASKS.md"), "| ID | Status |\n|---|---|\n| T-021 | blocked | x |\n");
  writeFileSync(join(root, "qa", "issues.jsonl"), "");

  assert.deepEqual(filterByGate(audit(root), "G1"), []);
  rmSync(root, { recursive: true, force: true });
});

/**
 * ISS-139. G3's `git log` call had a bare catch, so any git failure silently disabled the gate
 * forever — and a gate that never fires looks exactly like a gate that passes. Only "not a git
 * checkout" (exit 128) and a missing git binary (ENOENT) are expected.
 */
test("G3: a non-repo directory is quiet, and G3 simply does not fire", () => {
  const root = fixtureRoot();
  try {
    const findings = audit(root);
    assert.ok(!findings.some((f) => f.startsWith("G3")), "no .last-sweep and no repo -> no G3 finding");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/**
 * ISS-139, pinned properly. My first attempt at this test passed whether the catch rethrew or
 * swallowed — both produce no G3 finding — so the mutant survived and I had "fixed" something
 * nothing enforced. That is precisely the ISS-137 failure repeating one test later.
 *
 * The git call is now injectable, so the branch can actually be exercised: an unexpected failure
 * must propagate, because a gate that silently never fires looks exactly like a gate that passes.
 */
test("G3: an UNEXPECTED git failure propagates instead of silently disabling the gate", () => {
  const root = fixtureRoot();
  writeFileSync(join(root, "qa", ".last-sweep"), "2020-01-01T00:00:00Z\n");
  const boom = () => { const e = new Error("git exploded"); e.status = 1; throw e; };
  try {
    assert.throws(() => audit(root, { exec: boom }), /git exploded/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("G3: 'not a git checkout' (exit 128) stays quiet, as intended", () => {
  const root = fixtureRoot();
  writeFileSync(join(root, "qa", ".last-sweep"), "2020-01-01T00:00:00Z\n");
  const notRepo = () => { const e = new Error("not a git repository"); e.status = 128; throw e; };
  try {
    const findings = audit(root, { exec: notRepo });
    assert.ok(!findings.some((f) => f.startsWith("G3")), "expected case -> no finding, no throw");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("filterByGate accepts a comma-separated list, so one run can gate G1 and G4", () => {
  const f = ["G1 a", "G2 b", "G4 c"];
  assert.deepEqual(filterByGate(f, "G1,G4"), ["G1 a", "G4 c"]);
  assert.deepEqual(filterByGate(f, "G1"), ["G1 a"], "a single gate still behaves exactly as before");
  assert.deepEqual(filterByGate(f, null), f, "no gate named means no filtering");
});

// ISS-164: replays the issue's recorded case verbatim -- G4 reddened on qa/contracts/entity-promotion.md,
// a checker-authored file landed ten minutes earlier -- plus the manifest case that must keep gating.
test("ISS-164 splitAdvisory: checker-owned G4 findings are advisory, qa/manifests/ findings still gate", async () => {
  const { splitAdvisory } = await import("../tracker-audit.mjs");
  const g4 = (rel) => `G4 ambiguous issue ref: ${rel} cites ISS-017 bare, but a lane shard numbers the same finding(s) — qualify as ISS-<LANE>-NNN`;
  const contract = g4("qa/contracts/entity-promotion.md");
  const verdict = g4("qa/verdicts/t-031-audio-watchdog.md");
  const manifest = g4("qa/manifests/t-033-bot-tests.md");
  const g1 = "G1 status: T-001 is \"done\" in goal.json but \"open\" in TASKS.md";
  const r = splitAdvisory([contract, verdict, manifest, g1]);
  assert.deepEqual(r.gating, [manifest, g1]);
  assert.deepEqual(r.advisory, [contract, verdict]);
});
