/**
 * scripts/catalogue.test.mjs — regression cover for the progress scorer's honesty guards
 * (plan §10 U0.5, ISS-030). Every one of these was proven by hand once and then had NO test, so a
 * later refactor could have silently deleted the guard and the score would have gone back to
 * being self-assessment. Each case below is an ATTACK on the score, not a happy path.
 *
 * Covers: (a) a manual upgrade is refused; (b) a lowering is honoured; (c) an unknown verdict
 * string cannot slip past the ordering check; (d) dropping a feature to shrink the denominator is
 * refused; (e) scoring is deterministic; (f) the probe fingerprint changes when a probe is edited.
 * CLI-level behaviour (exit statuses of the real command) lives in catalogue-cli.test.mjs.
 * Run: node --test scripts/catalogue.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  scoreCatalogue, scrapeRoutes, assertDenominator, hashProbes, expectedIds, POINTS, scaleDescription,
} from "./lib/catalogue.mjs";
import { loadCollectionCounts, trustOf, isTrustworthy, trustWarning, fingerprint } from "./lib/evidence.mjs";

/** Signals under which "chunks" is empty and POST /ask is live — mirrors the real repo state. */
const SIGNALS = {
  routes: { live: new Set(["POST /ask"]), stubs: new Set(["GET /search"]) },
  counts: { claims: 81, chunks: 0 },
  pages: new Set(["/sessions"]),
  packages: new Set(["@lkb/db"]),
};

/** A full-size catalogue (so assertDenominator passes) with the first row overridable. */
function catalogueWith(firstRow = {}) {
  const features = expectedIds().map((id) => ({ id, group: id[0], name: id, probes: {}, manual: null }));
  features[0] = { ...features[0], ...firstRow };
  return { features };
}

test("a manual upgrade is refused, and the auto verdict stands", () => {
  const c = catalogueWith({ probes: { collections: ["chunks"] }, manual: { verdict: "REAL", reason: "wishful" } });
  const s = scoreCatalogue(c, SIGNALS);
  assert.equal(s.rows[0].auto, "MISSING", "chunks is empty, so auto must be MISSING");
  assert.equal(s.rows[0].verdict, "MISSING", "the upgrade must NOT be applied");
  assert.equal(s.upgrades.length, 1, "the attempt must be reported so the CLI can exit non-zero");
});

test("a manual downgrade IS honoured — humans may only lower", () => {
  const c = catalogueWith({ probes: { routes: ["POST /ask"] }, manual: { verdict: "PARTIAL", reason: "tree-only retrieval" } });
  const s = scoreCatalogue(c, SIGNALS);
  assert.equal(s.rows[0].auto, "REAL");
  assert.equal(s.rows[0].verdict, "PARTIAL");
  assert.equal(s.upgrades.length, 0);
});

test("an unknown verdict string cannot bypass the ordering check", () => {
  // Regression for ISS-031: ORDER["EXCELLENT"] is undefined and `undefined > 0` is false, so the
  // upgrade branch was skipped and the bogus verdict was written out labelled "lowered", exit 0.
  const c = catalogueWith({ probes: { collections: ["chunks"] }, manual: { verdict: "EXCELLENT", reason: "nope" } });
  const s = scoreCatalogue(c, SIGNALS);
  assert.equal(s.rows[0].verdict, "MISSING", "a bogus verdict must never reach the output");
  assert.match(s.upgrades[0], /not one of/);
});

test("an empty-string manual verdict is refused, not silently ignored (ISS-036)", () => {
  // `manual.verdict` used to be tested for truthiness — `f.manual?.verdict` is falsy for "", so
  // the whole vocabulary-check branch was skipped and an intended human downgrade could be
  // deleted (edited to "") without the guard objecting, restoring the machine verdict silently.
  const c = catalogueWith({ probes: { collections: ["chunks"] }, manual: { verdict: "", reason: "cleared" } });
  const s = scoreCatalogue(c, SIGNALS);
  assert.equal(s.rows[0].verdict, "MISSING", "an empty-string verdict must never reach the output as if valid");
  assert.match(s.upgrades[0], /not one of/, "an empty string must be refused with the same message as any other bad value");
});

test("dropping a feature to shrink the denominator is refused", () => {
  // Regression for ISS-029: deleting the probe-less rows moved the real score 20.2% -> 30.3%
  // with every gate green. Guarding the numerator alone was not enough.
  const c = catalogueWith();
  c.features.pop();
  assert.throws(() => assertDenominator(c), /dropped feature/);
});

test("an unknown or duplicated feature id is refused", () => {
  const extra = catalogueWith();
  extra.features.push({ id: "Z9", group: "Z", name: "smuggled", probes: {}, manual: null });
  assert.throws(() => assertDenominator(extra), /unknown feature/);

  const dupe = catalogueWith();
  dupe.features[1] = { ...dupe.features[1], id: dupe.features[0].id };
  assert.throws(() => assertDenominator(dupe), /duplicate id|dropped feature/);
});

test("the canonical denominator is 57 features, and a correct catalogue passes", () => {
  assert.equal(expectedIds().length, 57);
  assert.doesNotThrow(() => assertDenominator(catalogueWith()));
});

test("scoring is deterministic for identical input", () => {
  const a = scoreCatalogue(catalogueWith({ probes: { collections: ["claims"] } }), SIGNALS);
  const b = scoreCatalogue(catalogueWith({ probes: { collections: ["claims"] } }), SIGNALS);
  assert.deepEqual(a.rows.map((r) => r.verdict), b.rows.map((r) => r.verdict));
  assert.equal(a.adjustedPercent, b.adjustedPercent);
});

test("editing a probe changes the fingerprint, so the edit shows as a diff", () => {
  const before = hashProbes(catalogueWith({ probes: { collections: ["chunks"] } }));
  const after = hashProbes(catalogueWith({ probes: { collections: ["claims"] } }));
  assert.notEqual(before, after, "repointing a probe at a populated collection must be visible");
});

test("a stub route scores STUB, not REAL — a deliberate 501 is not a shipped feature", () => {
  const s = scoreCatalogue(catalogueWith({ probes: { routes: ["GET /search"] } }), SIGNALS);
  assert.equal(s.rows[0].verdict, "STUB");
});

test("a package imported by nothing scores STUB — dead code is not a feature", () => {
  const s = scoreCatalogue(catalogueWith({ probes: { packages: ["@lkb/meeting-bot"] } }), SIGNALS);
  assert.equal(s.rows[0].verdict, "STUB");
});

// ---- input integrity (ISS-034 / ISS-035): the verdicts were guarded, the INPUTS were not ----

test("the scoring scale is pinned — changing POINTS must break a test, not just the number", () => {
  // ISS-034: rewriting POINTS moved the headline +8.3 points with all tests green.
  assert.deepEqual(POINTS, { MISSING: 0, STUB: 0, PARTIAL: 0.5, REAL: 1 });
});

test("the scale printed in the doc is rendered from POINTS, not restated", () => {
  // ISS-034: the doc hardcoded "STUB/MISSING=0" and kept saying it while STUB scored 0.5.
  const d = scaleDescription();
  for (const [verdict, pts] of Object.entries(POINTS)) assert.match(d, new RegExp(`${verdict}=${pts}`));
});

// ---- evidence trust (ISS-037/038/039): trust must be by CONTENT, not by path ----

/** A throwaway git repo containing one committed evidence file. */
function gitRepoWithEvidence(chunks = 0) {
  const root = mkdtempSync(join(tmpdir(), "lkb-git-"));
  const rel = "qa/evidence/live-2026-09-07-01-00-00/preflight.json";
  mkdirSync(join(root, "qa", "evidence", "live-2026-09-07-01-00-00"), { recursive: true });
  const write = (c) => writeFileSync(join(root, rel), JSON.stringify({ stamp: "2026-09-07T01:00:00.000Z", collections: { chunks: c, claims: 81 } }, null, 2));
  write(chunks);
  const g = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
  g("init", "-q");
  g("config", "user.email", "t@t.t");
  g("config", "user.name", "t");
  g("add", "-A");
  g("commit", "-qm", "evidence");
  return { root, rel, write };
}

test("evidence edited in place after commit is 'modified', not trusted", () => {
  // ISS-037, the fifth layer: `git ls-files` asks "is this PATH tracked?" — which stayed true
  // while the bytes said 4242. Editing the committed file in place restored the full +19.3-point
  // lever with --check exit 0 and no banner. Trust must be content-vs-HEAD.
  const { root, rel, write } = gitRepoWithEvidence(0);
  try {
    assert.equal(trustOf(root, rel), "committed");
    assert.equal(isTrustworthy("committed"), true);
    write(4242); // tamper, do not commit
    assert.equal(trustOf(root, rel), "modified", "a tracked-but-edited file must NOT read as committed");
    assert.equal(isTrustworthy(trustOf(root, rel)), false);
    assert.match(trustWarning("modified", rel), /EDITED SINCE COMMIT/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("trust is measured against HEAD — STAGING a change does not make it trustworthy", () => {
  // ISS-042: nothing pinned the comparison to HEAD. `git diff --quiet -- <path>` (no HEAD)
  // compares the working tree to the INDEX, so a bare `git add` would make tampered evidence read
  // as clean and restore the whole lever. This test fails if the HEAD argument is ever dropped.
  const { root, rel, write } = gitRepoWithEvidence(0);
  try {
    write(4242);
    execFileSync("git", ["add", rel], { cwd: root, stdio: "ignore" });
    assert.equal(trustOf(root, rel), "modified", "staged-but-uncommitted is NOT committed");
    assert.equal(isTrustworthy(trustOf(root, rel)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("untracked evidence is untrusted, and only 'committed' is trustworthy", () => {
  const { root } = gitRepoWithEvidence(0);
  try {
    writeFileSync(join(root, "stray.json"), "{}");
    assert.equal(trustOf(root, "stray.json"), "untracked");
    for (const t of ["untracked", "modified", "unknown"]) assert.equal(isTrustworthy(t), false);
    assert.equal(isTrustworthy("committed"), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the evidence fingerprint is content-based, not byte-based (CRLF must not change it)", () => {
  // ISS-039: hashing raw bytes flipped the sha on checkout under core.autocrlf=true, sending
  // --check STALE on an untouched clone. A fingerprint that moves when nothing meaningful moved
  // trains people to ignore it.
  const lf = { stamp: "s", collections: { a: 1, b: 2 } };
  const crlf = JSON.parse(JSON.stringify(lf));
  assert.equal(fingerprint(lf), fingerprint(crlf));
  assert.equal(fingerprint({ stamp: "s", collections: { b: 2, a: 1 } }), fingerprint(lf), "key order must not matter");
  assert.notEqual(fingerprint({ stamp: "s", collections: { a: 1, b: 3 } }), fingerprint(lf), "a real change must show");
});

/** An evidence dir with one folder per [name, stamp, chunksCount]. */
function evidenceRoot(runs) {
  const root = mkdtempSync(join(tmpdir(), "lkb-cat-"));
  for (const [name, stamp, chunks] of runs) {
    mkdirSync(join(root, "qa", "evidence", name), { recursive: true });
    writeFileSync(
      join(root, "qa", "evidence", name, "preflight.json"),
      JSON.stringify({ stamp, collections: { chunks, claims: 81 } }),
    );
  }
  return root;
}

test("evidence is chosen by the timestamp INSIDE the file, not by folder name", () => {
  // ISS-035, the largest lever found: loadCollectionCounts took the lexically-last folder, so a
  // folder NAME could decide the score. Here the lexically-last folder is the OLDER run.
  const root = evidenceRoot([
    ["live-2026-01-01-00-00-00", "2026-09-07T02:00:00.000Z", 999],
    ["live-2026-12-31-23-59-59", "2026-01-01T00:00:00.000Z", 4242],
  ]);
  try {
    const { counts } = loadCollectionCounts(root, Date.parse("2026-09-08T00:00:00.000Z"));
    assert.equal(counts.chunks, 999, "must pick the run with the newest internal stamp");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("future-dated evidence is refused outright", () => {
  const root = evidenceRoot([["live-2026-12-31-23-59-59", "2026-12-31T23:59:59.000Z", 4242]]);
  try {
    assert.throws(
      () => loadCollectionCounts(root, Date.parse("2026-09-07T00:00:00.000Z")),
      /dated in the future/,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the chosen evidence is fingerprinted, so a swapped file is visible", () => {
  const a = evidenceRoot([["live-a", "2026-09-07T02:00:00.000Z", 0]]);
  const b = evidenceRoot([["live-a", "2026-09-07T02:00:00.000Z", 4242]]);
  try {
    assert.notEqual(loadCollectionCounts(a).hash, loadCollectionCounts(b).hash);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test("a BOM-prefixed preflight.json is parsed, not skipped (ISS-040)", () => {
  // Windows PowerShell 5.1's `Out-File -Encoding utf8` writes a UTF-8 BOM (EF BB BF); before the
  // fix this made JSON.parse throw and the run was silently dropped, falling back to stale evidence.
  const root = mkdtempSync(join(tmpdir(), "lkb-cat-"));
  const dir = join(root, "qa", "evidence", "live-bom");
  mkdirSync(dir, { recursive: true });
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const body = Buffer.from(JSON.stringify({ stamp: "2026-09-07T02:00:00.000Z", collections: { chunks: 7 } }), "utf8");
  writeFileSync(join(dir, "preflight.json"), Buffer.concat([bom, body]));
  try {
    const { counts, unreadable } = loadCollectionCounts(root, Date.parse("2026-09-08T00:00:00.000Z"));
    assert.equal(counts.chunks, 7, "BOM must be stripped, not treated as a parse failure");
    assert.deepEqual(unreadable, [], "a successfully-parsed BOM file must not be reported unreadable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a genuinely malformed preflight.json is reported, not silently skipped (ISS-040)", () => {
  const root = mkdtempSync(join(tmpdir(), "lkb-cat-"));
  const goodDir = join(root, "qa", "evidence", "live-good");
  mkdirSync(goodDir, { recursive: true });
  writeFileSync(join(goodDir, "preflight.json"), JSON.stringify({ stamp: "2026-01-01T00:00:00.000Z", collections: { chunks: 1 } }));
  const badDir = join(root, "qa", "evidence", "live-bad");
  mkdirSync(badDir, { recursive: true });
  writeFileSync(join(badDir, "preflight.json"), "{ not valid json");
  try {
    const { counts, unreadable } = loadCollectionCounts(root, Date.parse("2026-09-08T00:00:00.000Z"));
    assert.equal(counts.chunks, 1, "the readable run still scores — this is a warning, not a hard failure");
    assert.equal(unreadable.length, 1, "the unparseable candidate must be named, not silently continued past");
    assert.equal(unreadable[0].rel, "qa/evidence/live-bad/preflight.json");
    assert.match(unreadable[0].reason, /JSON/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("scrapeRoutes finds routes in feature subfolders, skips tests, reads only the top-level stubs.ts as stubs", () => {
  const root = mkdtempSync(join(tmpdir(), "scrape-routes-"));
  try {
    const dir = join(root, "apps", "api", "src", "routes");
    mkdirSync(join(dir, "ask"), { recursive: true });
    const put = (p, text) => writeFileSync(p, text + "\n");
    put(join(dir, "top.ts"), 'router.get("/top", h);');
    put(join(dir, "ask", "ask.ts"), 'router.post("/ask", h);');
    put(join(dir, "ask", "ask.test.ts"), 'router.post("/ghost", h);');
    put(join(dir, "stubs.ts"), '{ method: "get", path: "/search", x: 1 }');
    put(join(dir, "ask", "stubs.ts"), '{ method: "get", path: "/nested", x: 1 }');
    const { live, stubs } = scrapeRoutes(root);
    assert.ok(live.has("GET /top") && live.has("POST /ask"), "nested route file must be scraped");
    assert.ok(!live.has("POST /ghost"), "test files are not routes");
    assert.deepEqual([...stubs], ["GET /search"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
