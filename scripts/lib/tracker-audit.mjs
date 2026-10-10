/**
 * scripts/lib/tracker-audit.mjs — three integrity gates on the project's own trackers (plan §10 U0.6).
 *
 * These exist because the trackers drifted in ways nobody noticed for weeks, and every one of them
 * flattered the project:
 *   G1  `.goal/goal.json` covered 29 tasks while `TASKS.md` had 34 — five rows existed in one
 *       tracker only, so the percentage was computed over a denominator that quietly excluded work.
 *   G2  20 ledger issues sat `fixed` with `verified_date: null` — a fix nobody checked reads
 *       exactly like a fix that worked.
 *   G3  `.last-sweep` was two days older than HEAD, so the safety net had not seen the code it
 *       was vouching for.
 *
 * Extracted from `scripts/tracker-audit.mjs` (which is now a thin CLI entry point over this
 * module, matching the `catalogue-score.mjs` / `scripts/lib/catalogue.mjs` split already used in
 * this repo) so the CLI's own test file did not push `scripts/` over its 30-file lint-dirsize
 * budget — the fix for ISS-053 needing test coverage should not itself become a structure-lint
 * regression.
 *
 * G1 is fully in the authors' control and always clearable in-commit, so `--gate g1` runs ONLY
 * that check and is wired into `pnpm lint:structure` (ISS-053) — the drift it catches went
 * unnoticed for weeks precisely because no gate ran it. G2/G3 deliberately stay OUT of any commit
 * gate: G2 depends on someone else's later re-check landing, and G3 depends on a sweep being run —
 * neither is something the current commit can single-handedly fix, and a gate that blocks on
 * someone else acting is a gate people learn to bypass.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/**
 * Every ledger file: canonical `qa/issues.jsonl` first, then each lane shard
 * `qa/issues.<lane>.jsonl` alphabetically.
 *
 * ISS-129. D-019 declared that every reader treats this union as the ledger, and then no reader
 * did -- both production readers opened the single file by name, so a lane shard whose id is CITED
 * BY D-020 was counted by nothing and surfaced by nothing. A shard nobody reads is worse than no
 * shard: it looks like tracking while counting zero.
 *
 * Root cause worth keeping where it will be re-read: D-019's own `Changes-authorized` named only
 * `.claude/CLAUDE.md`, so the mechanism the rule required was never scoped to a file it was
 * allowed to touch. A governance rule whose mechanism sits outside its own authorization is a rule
 * that cannot be implemented.
 */
export function ledgerFiles(root) {
  const dir = join(root, "qa");
  const canonical = join(dir, "issues.jsonl");
  let shards = [];
  try {
    shards = readdirSync(dir)
      .filter((f) => /^issues\..+\.jsonl$/.test(f))
      .sort()
      .map((f) => join(dir, f));
  } catch (err) {
    // Only "the directory is not there" is an expected outcome. A bare `catch {}` here previously
    // swallowed a ReferenceError from a MISSING IMPORT and returned zero shards, so the union
    // silently read nothing while every call site looked correct -- the same silent-failure class
    // this audit exists to catch.
    if (err?.code !== "ENOENT") throw err;
  }
  return [...(existsSync(canonical) ? [canonical] : []), ...shards];
}

/** Every row across the ledger union, plus a count of lines no consumer could parse. */
export function readLedgerRows(root) {
  const rows = [];
  let unparseable = 0;
  const firstLocations = new Map();
  for (const file of ledgerFiles(root)) {
    for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { unparseable++; continue; }
      if (typeof row?.id === "string") {
        const location = `${file}:${index + 1}`, first = firstLocations.get(row.id);
        if (first) throw new Error(`Duplicate ledger id ${row.id}: ${first} and ${location}`);
        firstLocations.set(row.id, location);
      }
      rows.push(row);
    }
  }
  return { rows, unparseable };
}

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * TASKS.md and goal.json use different words for the same thing; compare meaning, not spelling.
 *
 * `blocked` is deliberately its OWN class rather than another spelling of not-done (ISS-090).
 * Collapsing it hid a real divergence twice: a correction was written to goal.json (`pending`)
 * and not to TASKS.md (`blocked`), and G1 stayed green because both sides normalised to
 * "not-done". But the two words do not mean the same thing to a reader or to the backlog — one
 * says "available to pull", the other says "cannot be pulled" — so a tracker claiming both at
 * once is exactly the untruth this gate exists to catch.
 */
const NORMALISE = { open: "not-done", pending: "not-done", in_progress: "not-done", blocked: "blocked", done: "done" };

export function audit(root = ROOT, { exec = execFileSync } = {}) {
  const findings = [];
  const goal = JSON.parse(readFileSync(join(root, ".goal", "goal.json"), "utf8"));
  const md = readFileSync(join(root, "TASKS.md"), "utf8");

  // ---- G1: the two trackers must describe the same set of tasks, with the same meanings.
  const mdRows = new Map();
  // Two id shapes, deliberately: `T-###` are the original foundation rows, `U#.#` are the plan
  // §10 roadmap units imported 2026-09-08. Before that import the U-units lived ONLY in the plan
  // file, so the maker's roadmap backlog tier could not see them and fell through to
  // self-generated QA work — 84 of 85 ledger issues were filed by the loop about itself.
  // A Map silently keeps the LAST row for a duplicated id, so a second U3.1 row hid a real
  // conflict and G1 stayed green (ISS-089). Count occurrences before the Map collapses them.
  const mdSeen = new Map();
  // The `[a-z]?` suffix applies to BOTH id families. It was on `T-` only, so a `U1.0b` row in
  // TASKS.md was invisible here and G1 reported it as "in goal.json but not TASKS.md" — a
  // divergence the tool invented rather than found. The repo has used letter suffixes since
  // T-004b/T-009b/T-017b; U-ids acquired one at U1.0b. Found when G1 kept failing on a row that
  // was demonstrably present in the file.
  for (const m of md.matchAll(/^\|\s*(T-[0-9]+[a-z]?|U[0-9]+\.[0-9]+[a-z]?)\s*\|\s*([a-z_]+)\s*\|/gim)) {
    mdSeen.set(m[1], (mdSeen.get(m[1]) ?? 0) + 1);
    // An unknown status word normalises to `undefined`, which compares unequal to everything and
    // produces a confusing "is X but Y" finding instead of naming the real problem (`partial` was
    // in use and in NORMALISE for neither tracker). Flag the vocabulary itself.
    if (!(m[2] in NORMALISE)) findings.push(`G1 status: ${m[1]} uses unknown status "${m[2]}" in TASKS.md — known: ${Object.keys(NORMALISE).join(", ")}`);
    mdRows.set(m[1], m[2]);
  }
  const dupes = [...mdSeen].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
  if (dupes.length) findings.push(`G1 duplicate rows in TASKS.md — ${dupes.join(", ")} (a Map keeps only the last, so a conflicting row can hide)`);
  const goalRows = new Map(goal.tasks.map((t) => [t.id, t.status]));

  const onlyMd = [...mdRows.keys()].filter((id) => !goalRows.has(id));
  const onlyGoal = [...goalRows.keys()].filter((id) => !mdRows.has(id));
  if (onlyMd.length) findings.push(`G1 row-set: in TASKS.md but not goal.json — ${onlyMd.join(", ")}`);
  if (onlyGoal.length) findings.push(`G1 row-set: in goal.json but not TASKS.md — ${onlyGoal.join(", ")}`);
  for (const [id, mdStatus] of mdRows) {
    const g = goalRows.get(id);
    if (g === undefined) continue;
    if (NORMALISE[mdStatus] !== NORMALISE[g]) {
      findings.push(`G1 status: ${id} is "${g}" in goal.json but "${mdStatus}" in TASKS.md`);
    }
  }
  // The headline must be arithmetic on the rows, never a typed-in number.
  const done = goal.tasks.filter((t) => t.status === "done").length;
  const pct = Math.round((done / goal.tasks.length) * 100);
  if (goal.progress?.total !== goal.tasks.length) findings.push(`G1 progress.total says ${goal.progress?.total}, there are ${goal.tasks.length} tasks`);
  if (goal.progress?.done !== done) findings.push(`G1 progress.done says ${goal.progress?.done}, ${done} tasks are done`);
  if (goal.progress?.percent !== pct) findings.push(`G1 progress.percent says ${goal.progress?.percent}%, the rows give ${pct}%`);

  // ---- G2: a fix nobody verified is not a fix. (G5, below, shares this read: a ledger line that
  // does not parse is fully in the author's control and clearable in the same commit -- ISS-315.)
  const ledgerPaths = ledgerFiles(root);
  if (ledgerPaths.length > 0) {
    const { rows, unparseable } = readLedgerRows(root);
    const unverified = rows.filter((r) => r.status === "fixed" && !r.verified_date).map((r) => r.id);
    if (unparseable > 0) findings.push(`G5 ledger: ${unparseable} unparseable line(s) — a line-by-line consumer skips or crashes on them`);
    if (unverified.length > 0) {
      findings.push(`G2 unverified: ${unverified.length} issue(s) are "fixed" with no verified_date — ${unverified.slice(0, 8).join(", ")}${unverified.length > 8 ? ", …" : ""}`);
    }
  }

  // ---- G3: a sweep older than the code it vouches for has not seen that code.
  const stamp = join(root, "qa", ".last-sweep");
  if (existsSync(stamp)) {
    const swept = Date.parse((readFileSync(stamp, "utf8").trim().split("\n").pop() ?? "").slice(0, 20));
    let headAt = NaN;
    try {
      headAt = Date.parse(exec("git", ["log", "-1", "--format=%cI"], { cwd: root, encoding: "utf8" }).trim());
    } catch (err) {
      // ISS-139, found eight lines below the ISS-137 fix and in the same class: a bare catch here
      // meant ANY git failure — a broken PATH, a corrupt repo, a permissions error — silently
      // disabled G3 forever, and a gate that never fires looks exactly like a gate that passes.
      // "Not a git checkout" is the only expected case, and git says so with exit 128.
      const notARepo = err?.status === 128 || err?.code === "ENOENT";
      if (!notARepo) throw err;
    }
    if (!Number.isNaN(swept) && !Number.isNaN(headAt) && swept < headAt) {
      const days = ((headAt - swept) / 86_400_000).toFixed(1);
      findings.push(`G3 stale sweep: qa/.last-sweep predates HEAD by ${days} day(s) — the safety net has not seen the current code`);
    }
  }

  // ---- G4: an issue id that resolves to two different findings is not a citation.
  findings.push(...auditIssueRefs(root, readLedgerRows(root).rows));

  return findings;
}

/**
 * Files whose bare `ISS-NNN` citations are known-ambiguous and are NOT the maker's to rewrite.
 *
 * `qa/verdicts/` is checker-owned; a maker editing a verdict is the self-certification this pair
 * exists to prevent. So the debt is FROZEN and named here rather than silently tolerated: these
 * files keep their existing ambiguous references. The skip is per FILE, not per ref, so a NEW one
 * added inside these four is also unreported (ISS-162); anywhere else it fails. A checker that
 * qualifies its own verdict deletes its line from this table.
 */
export const G4_FROZEN = new Set([
  "qa/verdicts/guarded-fetcher.md",
  "qa/verdicts/watched-sources-entrypoint.md",
  "qa/verdicts/watched-sources-run.md",
  "qa/verdicts/watched-sources-url-normalisation.md",
]);

/**
 * G4: a bare `ISS-NNN` that a lane shard ALSO numbers is ambiguous — it resolves to two different
 * findings depending on which ledger the reader opens.
 *
 * ISS-142. Merging `lane/c-unrun-writers` brought 96 such references onto master: the docs said
 * "fix ISS-021 and ISS-022" meaning the lane's lint-red and test-count findings, while canonical
 * ISS-021/ISS-022 are verdict-wording standardisation and a T-010 goal-status row. Nothing was
 * corrupted; every citation simply started pointing somewhere else.
 *
 * This is not cosmetic, and it is the same defect ISS-132 corrected in the gate table. **D-015
 * requires a fix to be measured against its issue's own recorded reproductions, and that rule is
 * only as strong as the id resolving to the right row.**
 *
 * **Scoping, because the obvious rule is wrong.** Flagging every bare `ISS-NNN` that a shard also
 * numbers reported 58 files on the first run — nearly all of them historical documents written
 * long before any lane existed, whose bare references correctly mean the canonical row. A gate
 * that fires on correct usage teaches people to ignore it.
 *
 * So a file is judged only when it **already uses the qualified form somewhere**: mixing
 * `ISS-C-UNRUN-WRITERS-017` and bare `ISS-017` in one document is an inconsistency its own author
 * owns, and it cannot misfire on a document that predates lane ids. Measured: this catches the
 * three lane manifests and leaves every historical file alone.
 */
export function auditIssueRefs(root, ledgerRows) {
  const laneNumbers = new Set();
  for (const { id } of ledgerRows) {
    const m = /^ISS-(?:[A-Z][A-Z0-9-]*)-(\d{3})$/.exec(id);
    if (m) laneNumbers.add(m[1]);
  }
  if (laneNumbers.size === 0) return [];
  const findings = [];
  for (const sub of ["manifests", "verdicts", "contracts"]) {
    const dir = join(root, "qa", sub);
    let names = [];
    try {
      names = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
      continue;
    }
    for (const name of names) {
      const rel = `qa/${sub}/${name}`;
      if (G4_FROZEN.has(rel)) continue;
      const text = readFileSync(join(dir, name), "utf8");
      // Only a document that already speaks the qualified dialect can be inconsistent in it.
      if (!/ISS-[A-Z][A-Z0-9-]*-\d{3}/.test(text)) continue;
      /**
       * Spans covered by a range EXPRESSION, which requires a three-digit id on BOTH sides.
       *
       * ISS-151. Cycle 2 shipped this as a context sniff -- skip any bare id sitting next to `..`,
       * `--`, or a dash -- and dashes are this repo's house punctuation around citations, so it
       * silently muted **152 of the 2,031** bare references in `qa/*.md`, the sampled ones ordinary
       * citations rather than ranges. A gate with a hole shaped like the prose style of the corpus
       * it guards is worse than no gate: it reports green.
       *
       * Requiring digits on both ends is the whole fix. `ISS-001..022` and `ISS-001..ISS-022` are
       * ranges; `-- ISS-006` is an em-dash aside introducing a citation, and now still counts.
       */
      const ranges = [...text.matchAll(/ISS-\d{3}\s*(?:\.\.|--|–|—)\s*(?:ISS-)?\d{3}/g)]
        .map((r) => [r.index, r.index + r[0].length]);
      const hits = new Set();
      for (const m of text.matchAll(/(?<![A-Z0-9-])ISS-(\d{3})(?![0-9-])(\s*\(canonical\))?/g)) {
        // A bare id marked `(canonical)` is a DELIBERATE reference to the canonical row. The gate
        // is title-blind -- it sees an ambiguous NUMBER, never a wrong MEANING -- so the escape
        // makes the author state the judgement instead of the gate guessing it, and makes a
        // careless blanket qualification visibly wrong rather than silently wrong.
        if (m[2]) continue;
        // Inside a range EXPRESSION the number is a boundary, not a citation.
        if (ranges.some(([lo, hi]) => m.index >= lo && m.index < hi)) continue;
        if (laneNumbers.has(m[1])) hits.add(`ISS-${m[1]}`);
      }
      if (hits.size) {
        findings.push(`G4 ambiguous issue ref: ${rel} cites ${[...hits].sort().join(", ")} bare, but a lane shard numbers the same finding(s) — qualify as ISS-<LANE>-NNN`);
      }
    }
  }
  return findings;
}

/** Parses `--gate g1` / `--gate=g1` into an uppercase gate id, or null if the flag is absent. */
export function parseGateArg(argv) {
  const eq = argv.find((a) => a.startsWith("--gate="));
  if (eq) return eq.slice("--gate=".length).toUpperCase();
  const i = argv.indexOf("--gate");
  if (i !== -1 && argv[i + 1]) return argv[i + 1].toUpperCase();
  return null;
}

/**
 * Restricts a finding list to the named gate(s), or returns it unchanged when none is named.
 *
 * Accepts a comma-separated list (`--gate g1,g4`). G4 joins G1 in the commit gate on G1's own
 * stated criterion: it is fully in the author's control and always clearable in the same commit.
 * G2 and G3 stay out for the reason recorded at the top of this file -- each depends on someone
 * ELSE acting later, and a gate that blocks on another person is one people learn to bypass.
 */
export function filterByGate(findings, gate) {
  if (!gate) return findings;
  const wanted = gate.split(",").map((g) => g.trim()).filter(Boolean);
  return findings.filter((f) => wanted.some((g) => f.startsWith(g)));
}
