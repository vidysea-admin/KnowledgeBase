# Verdict — speakers-degraded-scope

Date: 2026-09-26
Cycle checked: 0
Project root (bound): D:/KnowledgeBase-lanes/speakers-degraded-scope (branch wave/speakers-degraded-scope)
Base commit for diff scope: 802c52c (worktree HEAD: 46fcd19)
Checker: fresh Claude Sonnet subagent, Mode A unit check.

## What I re-ran myself

1. Full listing of `packages/index/src/pipeline/speakers*.test.ts` in the bound worktree confirmed
   exactly the 3 files the manifest names: `speakers.test.ts`, `speakers-llm.test.ts`,
   `speakers-windows.test.ts`.
2. `node --test --import tsx packages/index/src/pipeline/speakers-llm.test.ts
   packages/index/src/pipeline/speakers-windows.test.ts packages/index/src/pipeline/speakers.test.ts`
   in the bound tree → **76 pass / 0 fail**, matching the manifest's pasted output exactly.
3. `git diff 802c52c..HEAD --stat` and full diff in the bound tree: 3 files changed
   (`speakers-llm.ts`, `speakers-windows.test.ts`, the manifest itself) — all listed in "What
   changed". Every removed line (`grep '^-[^-]'`) is part of the old `windowFailures: string[]`
   implementation being replaced by the new `WindowFailure[]` shape — no existing function, test,
   export or config key was deleted or renamed beyond what the manifest describes. No file outside
   the named set was touched.
4. Read `qa/issues.jsonl` rows ISS-269 and ISS-270 (both `status: "open"`) from
   `D:/KnowledgeBase/qa/issues.jsonl` (permitted read exception). Their evidence/consequence text
   matches the brief and the manifest's fix claims exactly (numerator-exceeds-denominator /
   indistinguishable-repeat-failures for ISS-269; partial-junk-silently-skipped for ISS-270).
5. Read the full `speakers-llm.ts` and `speakers-windows.test.ts` diffs. The fix is exactly what
   the manifest describes: a `WindowFailure{label,startTurnIndex,detail}` shape, `distinctWindowCount`
   (Set-dedup on `label@startTurnIndex`), a separate `junkFailures` array populated at the point a
   parsed response is `!Array.isArray`, and `degraded.reason` built from
   `failedWindows = distinctWindowCount([...windowFailures, ...junkFailures])` /
   `failedCalls = windowFailures.length + junkFailures.length`. The all-junk fallback path
   (`allRaw.length===0 && windowFailures.length>0`, and `allRaw.every(!Array.isArray)`) is
   untouched — partial junk cannot trigger it, matching the brief's "all-junk fallback behaviour
   stays as it is."

## Capability coverage — reproduced in a THROWAWAY COPY, not the bound tree

Copied the worktree (excluding `.git`) to a scratch dir outside the bound root, recreated the two
`node_modules` junctions with `cmd /c mklink /J` (verified `LinkType: Junction` before and after),
confirmed the copy runs the two named test files **GREEN before any edit** (60/60 pass), then
applied each falsifying edit as a single-hunk change to the single named file, confirmed RED with
the manifest's claimed assertion, restored from byte backup inside a trap on EXIT/INT/TERM/ERR, and
confirmed `cmp` byte-identical after restore (D-020). Cleaned up by `cmd /c rmdir`-ing the junctions
first, then removing the copy; confirmed the real `D:/KnowledgeBase/node_modules` and
`D:/KnowledgeBase/packages/index/node_modules` are untouched.

| Row | Edit applied | Result |
|---|---|---|
| ISS-269 | Reverted `failedWindows = distinctWindowCount(...)` to `failedWindows = windowFailures.length + junkFailures.length` | RED, exact match: `AssertionError` — actual `'3 of 2 speaker window(s) failed (3 of 6 calls across 3 runs): down'` against the "one window failing in ALL runs" test. The sibling "three distinct windows" test stayed green under this same edit (expected: with only thrown failures and no junk, `windowFailures.length` and `distinctWindowCount` coincide at 3), so the edit isolates the specific case the row claims, not everything. |
| ISS-270 | Removed the `junkFailures.push(...)` line (single-hunk edit, same file) | RED, exact match: `AssertionError [ERR_ASSERTION]: partial junk must be reported, not left as a legitimate 'no speaker'`, `actual: null`. The sibling "empty array" test in the same file stayed green under this same edit, confirming the edit isolates the junk-accounting path only. |

Both restores verified byte-identical via `cmp`. **CAPABILITY-COVERAGE: 2/2 rows reproduced.**

## D-015 measurement against the issues' own recorded reproductions

- **ISS-269** — its row's exact scenario ("one window failing in all 3 agreement runs must never
  print a numerator > windows.length" / "one window failing thrice must be distinguishable from
  three windows failing once") is covered by the two new tests verbatim: "one window failing in
  ALL runs counts as ONE distinct window, never more" (asserts `1 of 2 ... (3 of 6 calls...)`) and
  "three different windows failing once each count as THREE distinct windows" (asserts
  `3 of 3 ... (3 of 9 calls...)`). Both pass in the bound tree and both were exercised by my own
  falsifying edit above — not a corpus the builder authored itself, the issue's own stated defect.
- **ISS-270** — its row's exact scenario ("partial non-array junk must give non-null degraded" /
  "legitimate empty-array must not") is covered by "a window returning non-array junk is recorded
  as degraded, not silently skipped" (asserts non-null, reason matches `/junk/` and `/spk:0/`) and
  "an empty-array response is a legitimate 'no speaker', NOT degraded" (asserts `degraded === null`).
  Both pass in the bound tree and the first was exercised by my own falsifying edit above.

No gap between what the ledger rows demand and what the tests check.

## Scope note — ledger status update NOT performed by this checker

This dispatch binds me to `D:/KnowledgeBase-lanes/speakers-degraded-scope` and permits reading
(not writing) `D:/KnowledgeBase/qa/issues.jsonl`. Per Mode A step 6 I would normally flip ISS-269
and ISS-270 from `open` to `fixed` in the ledger their row lives in — but that ledger is outside my
bound root and I was given no write exception for it, so doing so here would itself be a scope
violation. **I did not write to `D:/KnowledgeBase/qa/issues.jsonl`.** The maker/orchestrator should
apply the `open → fixed` transition (with `fixed_date: 2026-09-26`, `found_by` unchanged, and a
`regression_check` of
`node --test --import tsx packages/index/src/pipeline/speakers-llm.test.ts packages/index/src/pipeline/speakers-windows.test.ts packages/index/src/pipeline/speakers.test.ts`)
on the main-tree ledger once this lane merges — the evidence for that transition is everything
above. No new issues were minted (no findings), so nothing was written to
`qa/issues.speakers-degraded-scope.jsonl` either.

## Persona / audience

Manifest: `Persona walk: skip (backend-only, packages/index)`. Changed paths are
`packages/index/src/pipeline/speakers-llm.ts` and its test file only — no `src/app`, `pages`, or
`components` path. The skip reason is true; no `false-persona-skip` finding.

---

```
VERDICT: PASS
SCOREBOARD: 2/2 criteria met (ISS-269, ISS-270), 0/0 invariants (contract: none named beyond the two ledger rows + brief)
FAILURES (if any): none
CAPABILITY-COVERAGE: 2/2 rows reproduced
LIVE-BROWSER: not-applicable (backend-only; changed paths: packages/index/src/pipeline/speakers-llm.ts, packages/index/src/pipeline/speakers-windows.test.ts, qa/manifests/speakers-degraded-scope.md)
ISSUES-WRITTEN: none
EXECUTOR: ollama/deepseek-v4.1-flash (draft, killed at token cap) -> claude-sonnet-subagent (finished) (checker: claude-sonnet-subagent)
EXPLANATION: Both ledger rows' exact reproduction scenarios are covered by tests I independently
re-ran green, and I independently falsified each fix in a throwaway copy to confirm the check
isolates the right assertion, restoring byte-identical via cmp under a D-020-compliant trap. Diff
scope is clean (only the 3 named files, no deletions beyond the superseded string[]-based
windowFailures shape). The only gap is process, not defect: I could not flip ISS-269/ISS-270 to
`fixed` in the main-tree ledger because that file sits outside my bound root with only a read
exception granted — the orchestrator should do that transition using the evidence above.
```
