/**
 * scripts/lib/catalogue.mjs — machine signals + scoring for the feature catalogue (plan §10 U0.5).
 *
 * The whole point is that a verdict is DERIVED, not asserted. Four signals, all read off the real
 * repo/deployment rather than anyone's opinion:
 *   routes      — scraped from the route files under apps/api/src/routes, minus stubs.ts's 501 list
 *   collections — real document counts from the newest `qa/evidence/live-<stamp>` preflight.json
 *   pages       — scraped from apps/web/src/App.tsx's Route path entries
 *   packages    — reachability: is @lkb/<name> imported by anything outside its own package?
 *
 * A `manual` entry in catalogue.json may only LOWER a verdict. An attempted upgrade is refused
 * loudly rather than silently honoured — otherwise the score becomes self-congratulation again.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

/**
 * A reader that REMEMBERS what it read.
 *
 * The scorer's inputs used to be a hand-maintained list of one path, which was already wrong by
 * three surfaces: the route/page/package scrapers read source code as text with no trust check, so
 * uncommitted source edits bought +10.5 points with every gate green (ISS-047). "Which files did
 * this program read" is a fact the program already knows — so it is now recorded rather than
 * declared, and the trust check is applied to whatever comes back.
 */
export function createRecordingReader(root) {
  const files = new Set();
  return {
    files,
    read(abs) {
      files.add(relative(root, abs).replace(/\\/g, "/"));
      return readFileSync(abs, "utf8");
    },
  };
}

/**
 * Fingerprint of every feature's probes. Weakening or repointing a probe silently inflates the
 * score and no gate catches it (ISS-032) — a hash cannot PREVENT that, but it makes it show up as
 * a one-line diff in a generated, committed file, so the edit has to be argued for rather than
 * slipped in. Reviewability instead of enforcement, deliberately.
 */
export function hashProbes(catalogue) {
  const canonical = catalogue.features.map((f) => [f.id, f.probes ?? {}, f.manual?.verdict ?? null]);
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex").slice(0, 12);
}

const ORDER = { MISSING: 0, STUB: 1, PARTIAL: 2, REAL: 3 };
export const POINTS = { MISSING: 0, STUB: 0, PARTIAL: 0.5, REAL: 1 };
export const VERDICTS = Object.keys(ORDER);

/**
 * The scale, rendered from POINTS rather than restated. The generated doc used to hardcode
 * "REAL=1, PARTIAL=0.5, STUB/MISSING=0" as a string, so rewriting POINTS moved the headline
 * +8.3 points while the doc kept asserting the old scale — a generated document that misstates
 * its own scale is worse than no document (ISS-034, checker, 2026-09-07).
 */
export function scaleDescription() {
  return VERDICTS.slice().reverse().map((v) => `${v}=${POINTS[v]}`).join(", ");
}

/**
 * The canonical denominator, pinned to plan §4c. Guarding only the numerator was not enough:
 * deleting the probe-less rows moved the score 20.2% -> 30.3% with every gate still green
 * (ISS-029, checker, 2026-09-07). Dropping inconvenient features is the easiest way to flatter a
 * percentage, so the id set is asserted, not merely counted.
 */
export const CATALOGUE_SPEC = { A: 13, B: 13, C: 14, D: 8, E: 7, F: 2 };

export function expectedIds() {
  return Object.entries(CATALOGUE_SPEC).flatMap(([g, n]) =>
    Array.from({ length: n }, (_, i) => `${g}${i + 1}`),
  );
}

/** Throws if the catalogue's id set drifts from plan §4c, in either direction. */
export function assertDenominator(catalogue) {
  const expected = expectedIds();
  const actual = catalogue.features.map((f) => f.id);
  const missing = expected.filter((id) => !actual.includes(id));
  const extra = actual.filter((id) => !expected.includes(id));
  const dupes = actual.filter((id, i) => actual.indexOf(id) !== i);
  const problems = [];
  if (missing.length) problems.push(`dropped feature(s): ${missing.join(", ")}`);
  if (extra.length) problems.push(`unknown feature(s): ${extra.join(", ")}`);
  if (dupes.length) problems.push(`duplicate id(s): ${[...new Set(dupes)].join(", ")}`);
  if (problems.length) {
    throw new Error(
      `catalogue denominator drifted from plan §4c (${expected.length} features expected):\n  ${problems.join("\n  ")}`,
    );
  }
}
export const GROUP_NAMES = {
  A: "LEARN — ingestion", B: "REMEMBER — knowledge model", C: "REASON — ask & answer",
  D: "IMPROVE — the living loop", E: "PLATFORM — API & hosting", F: "OPERATIONS automation",
};

/** Routes the API really serves, and which of them are deliberate 501 stubs. */
export function scrapeRoutes(root, read = (a) => readFileSync(a, "utf8")) {
  const dir = join(root, "apps", "api", "src", "routes");
  const live = new Set();
  const stubs = new Set();
  // Route files may live in feature subfolders (routes/ask/ask.ts): walk the tree, not one level.
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(join(d, e.name)); }
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) files.push(join(d, e.name));
    }
  };
  walk(dir);
  for (const p of files) {
    const src = read(p);
    // `router.get("/x", …)` / `.post("/x/:id", …)` — the shape every route file uses.
    for (const m of src.matchAll(/\.(get|post|put|delete)\(\s*"([^"]+)"/g)) {
      live.add(`${m[1].toUpperCase()} ${m[2]}`);
    }
    if (p === join(dir, "stubs.ts")) {
      // STUB_ROUTES rows are `{ method: "get", path: "/search", … }` — mounted, but answer 501.
      for (const m of src.matchAll(/method:\s*"(\w+)"\s*,\s*path:\s*"([^"]+)"/g)) {
        stubs.add(`${m[1].toUpperCase()} ${m[2]}`);
      }
    }
  }
  return { live, stubs };
}

/** SPA routes that really exist. */
export function scrapePages(root, read = (a) => readFileSync(a, "utf8")) {
  const src = read(join(root, "apps", "web", "src", "App.tsx"));
  return new Set([...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
}

/** A package is "reachable" only if something OUTSIDE it imports it — dead code is not a feature. */
export function reachablePackages(root, read = (a) => readFileSync(a, "utf8")) {
  const reachable = new Set();
  const scan = (dir, ownerPkg) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) scan(p, ownerPkg);
      else if (/\.(ts|tsx|mjs)$/.test(e.name)) {
        for (const m of read(p).matchAll(/from\s+"(@lkb\/[\w-]+)"/g)) {
          if (m[1] !== ownerPkg) reachable.add(m[1]);
        }
      }
    }
  };
  for (const app of ["api", "web"]) scan(join(root, "apps", app), `@lkb/${app}`);
  const pkgDir = join(root, "packages");
  if (existsSync(pkgDir)) {
    for (const p of readdirSync(pkgDir)) scan(join(pkgDir, p), `@lkb/${p}`);
  }
  return reachable;
}

/** Evaluate one feature's probes against the signals. Returns {verdict, passed, failed}. */
export function evaluate(feature, signals) {
  const probes = feature.probes ?? {};
  const passed = [];
  const failed = [];
  let anyStub = false;

  for (const r of probes.routes ?? []) {
    if (signals.routes.stubs.has(r)) { failed.push(`route ${r} (501 stub)`); anyStub = true; }
    else if (signals.routes.live.has(r)) passed.push(`route ${r}`);
    else failed.push(`route ${r} (absent)`);
  }
  for (const c of probes.collections ?? []) {
    const n = signals.counts?.[c];
    if (n === undefined) failed.push(`collection ${c} (uncounted)`);
    else if (n > 0) passed.push(`collection ${c} (${n} docs)`);
    else failed.push(`collection ${c} (empty)`);
  }
  for (const p of probes.pages ?? []) {
    if (signals.pages.has(p)) passed.push(`page ${p}`);
    else failed.push(`page ${p} (absent)`);
  }
  for (const pkg of probes.packages ?? []) {
    if (signals.packages.has(pkg)) passed.push(`package ${pkg}`);
    else { failed.push(`package ${pkg} (dead code — imported by nothing)`); anyStub = true; }
  }

  const total = passed.length + failed.length;
  let verdict;
  if (total === 0) verdict = "MISSING";              // nothing declared can prove it
  else if (failed.length === 0) verdict = "REAL";
  else if (passed.length === 0) verdict = anyStub ? "STUB" : "MISSING";
  else verdict = "PARTIAL";
  return { verdict, passed, failed };
}

/** Full scoring pass. Honesty rule enforced here: manual may lower, never raise. */
export function scoreCatalogue(catalogue, signals) {
  const rows = [];
  const upgrades = [];
  for (const f of catalogue.features) {
    const auto = evaluate(f, signals);
    let final = auto.verdict;
    // Test for the KEY, not a truthy value — `manual: { verdict: "" }` is a falsy value that
    // used to skip this whole branch, so an empty-string "verdict" slipped past the vocabulary
    // check below instead of being refused like any other value outside VERDICTS (ISS-036).
    if (f.manual && "verdict" in f.manual) {
      const m = f.manual.verdict;
      // Validate the vocabulary FIRST. An unknown value made `ORDER[m]` undefined, and
      // `undefined > n` is false, so the upgrade check silently passed and an upgraded verdict
      // was written labelled "lowered", exit 0 (ISS-031, checker, 2026-09-07).
      if (!VERDICTS.includes(m)) {
        upgrades.push(`${f.id}: manual verdict "${m}" is not one of ${VERDICTS.join("/")}`);
      } else if (ORDER[m] > ORDER[auto.verdict]) {
        upgrades.push(`${f.id}: manual "${m}" > auto "${auto.verdict}"`);
      } else {
        final = m;
      }
    }
    rows.push({ ...f, auto: auto.verdict, verdict: final, passed: auto.passed, failed: auto.failed });
  }
  const byGroup = {};
  for (const r of rows) {
    const g = (byGroup[r.group] ??= { total: 0, auto: 0, adjusted: 0, counts: {} });
    g.total += 1;
    g.auto += POINTS[r.auto];
    g.adjusted += POINTS[r.verdict];
    g.counts[r.verdict] = (g.counts[r.verdict] ?? 0) + 1;
  }
  const total = rows.length;
  const autoPts = rows.reduce((a, r) => a + POINTS[r.auto], 0);
  const adjPts = rows.reduce((a, r) => a + POINTS[r.verdict], 0);
  return {
    rows, byGroup, upgrades,
    total,
    probeless: rows.filter((r) => Object.keys(r.probes ?? {}).length === 0).map((r) => r.id),
    probeHash: hashProbes(catalogue),
    autoPercent: Math.round((autoPts / total) * 1000) / 10,
    adjustedPercent: Math.round((adjPts / total) * 1000) / 10,
  };
}
