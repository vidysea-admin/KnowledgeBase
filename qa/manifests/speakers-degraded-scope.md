# Manifest — speakers-degraded-scope

Contract: none — issue-fix batch (qa/issues.jsonl ISS-269, ISS-270)
Goal task: none
Date: 2026-09-26
Fix cycle: 0 of max 3
Dual check: no
Persona walk: skip (backend-only, packages/index)
Issues addressed: ISS-269, ISS-270
Executor: ollama/deepseek-v4.1-flash (draft, killed at token cap) → claude-sonnet-subagent (finished)
Executor rationale: external worker hit its token cap mid-edit (partial diff already correct in
shape); this lane verified the draft, added the falsification evidence, and closed it out.

## What changed (file:lines)

`packages/index/src/pipeline/speakers-llm.ts`:
- 62-70: new `WindowFailure` interface `{ label, startTurnIndex, detail }` and
  `distinctWindowCount()`, which dedupes failures on `label@startTurnIndex` so a window that fails
  in more than one agreement run is counted once.
- 204-205: `windowFailures` is now `WindowFailure[]` (was `string[]`); a new `junkFailures:
  WindowFailure[]` tracks non-array provider responses separately from thrown-call failures.
- 217-225: after parsing a window's response, `!Array.isArray(parsed)` pushes into `junkFailures`
  with `detail: "response was not a JSON array"` (ISS-270) — this happens BEFORE `raws.push(parsed)`,
  so the junk value still flows into `raw`/`runRaw` unchanged and is still silently skipped by the
  existing claims-loop guard at line 246 (`typeof entry !== "object"` — a raw non-array survives
  `.flat()` as itself and fails that check). The all-junk fallback path (231, `allRaw.length === 0
  && windowFailures.length > 0`) and the all-junk-but-not-empty path (235-237, `allRaw.every((r) =>
  !Array.isArray(r))`) are untouched, so the header contract's all-junk fallback behaviour is
  unchanged, per the brief.
- 320-335: `degraded.reason` now computed from `failedWindows = distinctWindowCount([...
  windowFailures, ...junkFailures])` (numerator, never exceeds `windows.length`) and `failedCalls =
  windowFailures.length + junkFailures.length` over `totalCalls = windows.length * AGREEMENT_RUNS`,
  reported as `"<failedWindows> of <windows.length> speaker window(s) failed (<failedCalls> of
  <totalCalls> calls across <AGREEMENT_RUNS> runs)"`, with a thrown-error detail and/or a junk-call
  note appended when present.

`packages/index/src/pipeline/speakers-windows.test.ts`:
- +67 lines, 4 new tests (ISS-269 x2, ISS-270 x2), inserted after the existing partial-failure test;
  no existing test changed (the brief's "if the '1 of 2' test string must change" branch was not
  needed — the existing single-failure-call case still produces `1 of 2 ... (1 of 6 calls...)`,
  which the pre-existing regex `/1 of 2 speaker window\(s\) failed/` still matches unchanged).

## How to verify (commands + expected)

```
node --test --import tsx packages/index/src/pipeline/speakers-llm.test.ts packages/index/src/pipeline/speakers-windows.test.ts
```
Expected: exit 0, 0 fail.

Also (brief: "the rest of packages/index/src/pipeline/speakers*.test.ts files that exist"):
```
node --test --import tsx packages/index/src/pipeline/speakers-llm.test.ts packages/index/src/pipeline/speakers-windows.test.ts packages/index/src/pipeline/speakers.test.ts
```
Expected: exit 0, 76 pass / 0 fail.

## Actual outputs (real pasted output)

```
$ node --test --import tsx packages/index/src/pipeline/speakers-llm.test.ts packages/index/src/pipeline/speakers-windows.test.ts packages/index/src/pipeline/speakers.test.ts
...
ℹ tests 76
ℹ suites 0
ℹ pass 76
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 554.2155
```
Exit code: 0. (Re-run after both falsification/restore cycles below, confirming the working tree
came back clean.)

## Capability coverage

| Capability | Check | Falsifying edit | Observed PASS-before / FAIL-after |
|---|---|---|---|
| ISS-269 distinct-window accounting | new test "one window failing in ALL runs counts as ONE distinct window" + "three different windows failing once each count as THREE distinct windows" | Reverted `failedWindows = distinctWindowCount(...)` to `failedWindows = windowFailures.length + junkFailures.length` (the pre-fix per-call count) in `speakers-llm.ts`, byte-backed-up first | PASS-before: `✔ ISS-269: one window failing in ALL runs counts as ONE distinct window, never more (1.3279ms)` (from the full clean run). FAIL-after: `✖ ISS-269: one window failing in ALL runs counts as ONE distinct window, never more` — `AssertionError [ERR_ASSERTION]: The input did not match the regular expression /1 of 2 speaker window\(s\) failed \(3 of 6 calls across 3 runs\)/. Input: '3 of 2 speaker window(s) failed (3 of 6 calls across 3 runs): down'` — reproducing the exact '3 of 2' defect ISS-269 named. Restored from backup; `cmp` confirmed byte-identical. |
| ISS-270 junk-as-failure accounting | new test "a window returning non-array junk is recorded as degraded, not silently skipped" | Removed the single `if (!Array.isArray(parsed)) junkFailures.push(...)` line in `speakers-llm.ts`, byte-backed-up first | PASS-before: `✔ ISS-270: a window returning non-array junk is recorded as degraded, not silently skipped (0.7021ms)` (from the full clean run). FAIL-after: `✖ ISS-270: a window returning non-array junk is recorded as degraded, not silently skipped` — `AssertionError [ERR_ASSERTION]: partial junk must be reported, not left as a legitimate 'no speaker'` (`actual: null, expected: true`) — reproducing exactly the ISS-270 defect (partial junk leaves `degraded` null). Restored from backup; `cmp` confirmed byte-identical. |

Both falsification runs were wrapped in `timeout 120` with a `trap ... EXIT INT TERM ERR` that
restores the byte backup and runs `cmp` unconditionally (D-020). Both `cmp` checks reported no
difference (silent success = identical).

## D-015 measurement per issue id

- **ISS-269**: 2/2 recorded reproductions covered — "a window failing in all 3 agreement runs must
  NOT print '3 of 2'" (test: "one window failing in ALL runs counts as ONE distinct window, never
  more") and "three distinct windows failing once each must be distinguishable from one window
  failing thrice" (test: "three different windows failing once each count as THREE distinct
  windows" — asserts `3 of 3 ... (3 of 9 calls...)`, distinct from the other test's `1 of 2 ... (3
  of 6 calls...)`).
- **ISS-270**: 2/2 recorded reproductions covered — "partial non-array junk must yield non-null
  degraded" (test: "a window returning non-array junk is recorded as degraded, not silently
  skipped" — asserts `degraded` is truthy and its reason mentions both "junk" and the failing
  window's label) and "empty array must not [count as a failure]" (test: "an empty-array response
  is a legitimate 'no speaker', NOT degraded" — asserts `degraded === null`).

## Live browser evidence

Not UI-touching — no surface changed. Changed paths:
- `packages/index/src/pipeline/speakers-llm.ts`
- `packages/index/src/pipeline/speakers-windows.test.ts`
- `qa/manifests/speakers-degraded-scope.md` (this file)

## Status: checked-PASS — qa/verdicts/speakers-degraded-scope.md (Cycle checked: 0, 8d8ac20); merged to master

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
