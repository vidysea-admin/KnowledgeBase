# Verdict: t022-review-dirty-guard (Mode A, resume-reconcile 2026-10-26)

Date: 2026-10-26. Bound to D:/KnowledgeBase. Cycle checked: 1
Contract: qa/contracts/goal-t022-offline-review.md (the manifest names none; the dirty guard is a scoped repair of that unit).
Policy-Version: proportional-verification/2026-10-19.17 (manifest has no pin; current block version used).
Base: no cycle-0 artifact exists. The diff was judged as the preserved original HTML data/eval/t022-offline-review.pre-dirty-guard.html versus the current HTML and generator. The embedded snapshot is byte-identical in both.

## Check plan
Logic and UI changed -> focused tests, 1 falsification per changed criterion in throwaway copies, 4c diff-scope read, real-browser check (Mode D). Not applicable: security/auth/data-write, external data, LLM output, live provider.
Criteria changed in this cycle: C2 (usable controls: navigation), C5 (resume/restore), C6 (export). C1, C3, C4, C7-C10 have untouched inputs (saveOfflineItem, createOfflineDraft and validateOfflineDraft are unchanged in the diff). C3 and C4 were also observed in the browser run (submittedCount stays 0 until an explicit submit, then 1).

VERDICT: PASS
SCOREBOARD: 3/3 changed criteria met (C2, C5, C6); unchanged C1, C3, C4, C7-C10 are not re-claimed here; 0 invariants violated
TIER: M (UI behaviour of a generated offline artifact across generator, test and HTML; no L trigger in the changed non-test files)
FAILURES: none
CAPABILITY-COVERAGE: 5/5 falsifications reproduced (3 floor + 2 mutants)
LIVE-BROWSER: real Chrome (headless, local CDP driver, own http server on 127.0.0.1:18722, own profile dir) loaded the current data/eval/t022-offline-review.html. The Playwright MCP browser was held by another session, so a CDP driver was used. Evidence: qa/evidence/t022-review-dirty-guard/checker-cycle1.md
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent
EXPLANATION: The guard works as claimed in jsdom and in a real browser, each guard is pinned by a test that goes red when it is removed, and the shipped HTML is exactly what the current generator emits. Scope is the dirty-guard repair only; it does not certify T-022, human gold (0/30 real reviews) or the authenticated-transfer gates (C8, C10).

## Evidence produced in this check
1. Identity. The three candidate files hash to the manifest pins once line endings are normalised (the Windows autocrlf working tree is CRLF, the git blobs are LF; `tr -d '\r' | sha256sum` gives f3e971cd... / 0b55e774... / 918af50d..., equal to the pins). No pin drift.
2. Focused tests in the bound tree, KB_T022_PRIVATE_REVIEW_TESTS unset: `node --test --test-name-pattern='dirty form|async restore' scripts/eval/t022-offline-review.test.mjs` -> tests 2, pass 2, fail 0, skipped 0.
3. Artifact fidelity. renderOfflineHtml(snapshot parsed out of the current HTML) equals the current HTML byte for byte after LF normalisation (59963 = 59963).
4c. Diff scope (old versus current embedded script, diffed). Additions: dirty()/requireClean()/editVersion/displayedId/cleanFields, a guarded selector change handler, an affirm change listener, a discard button and handler, a beforeunload handler, guards in download() and restore, and the version recheck after file.text(). The only removal is `selector.addEventListener('change', show)`, replaced by the guarded handler. saveOfflineItem, validateOfflineDraft, createOfflineDraft, the storage key and the schema are unchanged. Only the 3 files named in the manifest changed.
4b. Falsification. Each row ran in its own fresh throwaway copy under the scratchpad (scripts/eval, apps/api, packages/ai, packages/ask; node_modules junctioned), green before, then red after the single-hunk edit; copies deleted. Raw output: qa/evidence/t022-review-dirty-guard/falsification.txt

| Row | Criterion | Single-hunk edit | Before | After (assertion that fired) |
|---|---|---|---|---|
| F1 | C2 | drop requireClean in the selector change handler | pass | red, selected item no longer retained (test line 56) |
| F2 | C6 | drop requireClean in download() | pass | red, downloads 1 !== 0 |
| F3 | C5 | drop `version !== editVersion` after the async read | pass | red, submittedCount 0 !== 1 (saved assertion overwritten by the restore) |
| M1 | mutant | beforeunload `if (dirty())` -> `if (false)` | pass | red, defaultPrevented false !== true |
| M2 | mutant | drop the pre-read requireClean in restore | pass | red, reads 1 !== 0 |

5b. Mode D, real Chrome on the authentic current artifact (30 items), scripted with fictional input, nothing persisted. Dirty edits then item change: selection reverted, fields kept, alert "Unsaved edits retained". Export click while dirty: no download. beforeunload while dirty: prevented. Discard: fields empty, submittedCount 0. beforeunload while clean: not prevented. Navigation after discard works. Explicit save with affirmation: submittedCount 1. Export after save: 1 download. beforeunload after save: not prevented.

## Judgement
C2 met: navigation cannot discard unsaved score, rationale or affirmation; explicit discard is the only way out.
C5 met: restore is refused while dirty, and a restore started on a clean form is refused if the form was edited or saved during the async read.
C6 met: export (partial and complete) is refused while dirty; exported content is unchanged.
C3/C4 not regressed: unsaved edits never change submittedCount, and the draft advances only through the unchanged submit path with fresh affirmation.

## Notes (non-blocking; no ledger rows written because qa/issues.jsonl is being modified by another session)
- LOW: the packet pins hash the LF form. On a Windows autocrlf checkout the raw bytes hash differently, and regenerating the HTML there embeds CRLF in the script. A line-ending note in the packet would avoid confusion.
- The 8 private-corpus tests are skipped by design (KB_T022_PRIVATE_REVIEW_TESTS unset, central restriction). They are outside this repair's changed criteria and were not run.
- All runs were deterministic; no load-sensitive failures.

Metrics: start=2026-10-26T16:18:00Z end=2026-10-26T16:27:00Z wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=540 mutants=2 defects_unit=0 defects_6c=0
