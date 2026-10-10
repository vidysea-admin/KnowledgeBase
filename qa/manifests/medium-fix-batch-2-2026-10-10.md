# medium-fix-batch-2-2026-10-10

**Fix cycle:** 0 of max 3

**Issues addressed:** ISS-164, ISS-315, ISS-162, ISS-163, ISS-352, ISS-A035913-010

**Lane:** `lane/medfix2` (ledger shard `qa/issues.medfix2.jsonl`, no new issues filed). Maker: Sonnet 5.5 subagent.

**Persona walk:** skip (tooling and record corrections; no UI surface).

**Round cap:** ALLOWED. Seams touched: `scripts/tracker-audit` / G4 (`issue-ref-disambiguation`: 1 PASS), ledger-parse gate (0 PASS), `qa/loop.md` (0 PASS), iss-346 manifest (record fix, no new unit). No security-class item (no auth, tenancy or data-write surface) in this batch.

## Triage of all 24 rows

| id | bucket | reason / evidence |
|---|---|---|
| ISS-164 | DO (fixed) | Ruling spelled out its own fix; G4 gate counted checker-owned verdict findings toward the exit code. |
| ISS-315 | DO (fixed) | G2 already detected unparseable ledger lines but G2 is not in the commit gate; enforcement-path hook (`.claude/hooks/mc-precommit.ps1`) not touched, used the lint gate instead. |
| ISS-162 | DO (fixed) | False claim in `G4_FROZEN` doc comment and manifest; text correction. |
| ISS-163 | DO (fixed) | Narrowing of standing test undisclosed in manifest; disclosure addendum. |
| ISS-352 | DO (fixed) | `qa/loop.md:45-46` said "no open issues"; contradicted project CLAUDE.md BACKLOG_EMPTY. |
| ISS-A035913-010 | DO (fixed) | iss-346 manifest advertised the last-VERDICT-line rule the hook does not implement. |
| ISS-117 | STALE | `node scripts/tracker-audit.mjs` shows no G1 finding; U2.4 is `in_progress` at TASKS.md:108; the word `partial` no longer appears as a status cell. |
| ISS-133 | STALE | `qa/manifests/speaker-verbatim-token-boundary.md:12` now reads `Status: superseded-by speaker-denylist-ledger-corpus (cycle 3 checker PASS ...)` on this tree. |
| ISS-218 | STALE | Same line as ISS-133; the one-line merge the row asks for has landed. |
| ISS-161 | STALE | `qa/gates/loop-safety-contract-ratification.md:89` and `qa/gates/vector-retrieval-contract.md:52` carry "SUPERSEDED by the line below" in place of the pending line; a first-match grep no longer returns `_(pending)_`. |
| ISS-266 | STALE | `qa/manifests/delivery-gate-stamp-adoption.md:9` is `checked-PASS (cycle 2)`; verdict lines 3 and 14 are `Cycle checked: 2` / `VERDICT: PASS`. |
| ISS-135 | CAPPED | Symptom cleared (`grep -c 'EDITED SINCE' docs/PROGRESS.md` = 0). The structural half sits on the catalogue seam: `catalogue-progress-score` (2 PASS cycles), `catalogue-cli-clean-check`, `catalogue-input-integrity` give 3 PASSed verdicts; file-don't-fix. |
| ISS-232 | CAPPED | golden-set seam has 7 verdict files (`qa/verdicts/golden-set-*.md`), most PASS; also a data-file claim in `data/eval/`. |
| ISS-257 | GATED | BOM is gone but 24 TASKS.md lines still carry mojibake. Brief allows TASKS.md edits only for status corrections; a byte restore is out of lane scope. |
| ISS-134 | GATED | Fix is a manifest template plus a checker rule in the shared maker/checker skills, deliberately untouched here. |
| ISS-263 | GATED | Needs a DECISIONS or compound note covering the AGENTS.md landing: Approver territory. |
| ISS-327 | GATED | Asks for a design decision on where fixed to verified happens. |
| ISS-341 | GATED | Forward-looking observation for the next unit on that seam; the row itself says no retroactive edit. Nothing to build. |
| ISS-204 | COLLIDES | `docs/SNAPSHOT.md` is off limits in this lane. |
| ISS-143 | COLLIDES | Fix edits `qa/issues.jsonl`, which this lane may not edit. |
| ISS-276 | COLLIDES | Divergence lives in `.goal/goal.json` (off limits); correcting only TASKS.md would create the opposite divergence. |
| ISS-349 | COLLIDES | `.goal/goal.json` plus a roadmap choice the Approver is to make. |
| ISS-150 | TOO-BIG/UNCLEAR | Row says "consider" a G4 variant keyed on lane-merge files; a design question, and the same G4 seam. |
| ISS-261 | UNCLEAR | fix_direction is "treat as closed-at-6" plus future checker behaviour; no artefact to change. A checker can close it. |

Counts: DO 6, STALE 5, CAPPED 2, GATED 5, COLLIDES 4, TOO-BIG/UNCLEAR 2 (total 24).

## ISS-164 (commit 9b98ee7)

Files: `scripts/tracker-audit.mjs`, `scripts/lib/tracker-audit.test.mjs`.
Fix: new exported `splitAdvisory()`; a G4 finding whose path is not under `qa/manifests/` prints as `advisory (not gating)` and no longer counts toward the exit code. `qa/manifests/` findings and every other gate still gate.
D-015 count: ISS-164 records 1 reproduction (G4 red on `qa/contracts/entity-promotion.md`); 1/1 replayed verbatim as the test input, plus verdict and manifest controls.
Before and after, `node scripts/tracker-audit.mjs --gate g1,g4`: 6 gating findings before; 4 gating (all `qa/manifests/`) plus 2 advisory (`qa/verdicts/t-031-audio-watchdog.md`, `qa/verdicts/t-047-controller.md`) after.
Test: `ISS-164 splitAdvisory ...` passes.
Note: the gate still exits 1 on this tree because four lane MANIFESTS cite bare ISS-001/002; those are other lanes' files and are not touched.

## ISS-315 (commit b400661)

Files: `scripts/lib/tracker-audit.mjs` (label `G2 ledger:` becomes `G5 ledger:`), `scripts/lint-loc.mjs` (stage args `g1,g4,g5`), `scripts/lint.test.mjs` (pin updated), `scripts/lib/tracker-audit.test.mjs`.
Fix: an unparseable ledger line is author-controlled and clearable in the same commit, so it now fails `lint:structure`. The pre-commit hook was not edited (enforcement path).
D-015 count: ISS-315 records 2 failing rows (ISS-307 `\s`, ISS-U1-3 `\[\d`): 2/2 reproduced verbatim as unescaped-backslash rows; the audit reports `G5 ledger: 2 unparseable line(s)` and the g1,g4,g5 filter keeps it.
Test: `ISS-315 ...` passes; `scripts/lint.test.mjs` 18/18 pass (needed a temporary node_modules junction, removed with `cmd /c rmdir`).

## ISS-162 (commit a11075f)

Files: `scripts/lib/tracker-audit.mjs` (comment), `qa/manifests/issue-ref-disambiguation.md`.
Before: "any NEW one anywhere fails the gate, and the list can only shrink." After: the skip is per FILE, so a new ref inside the four frozen verdicts is also unreported (ISS-162); anywhere else it fails. The manifest sentence is corrected the same way.
Evidence the new text is true: `scripts/lib/tracker-audit.mjs` `auditIssueRefs` runs `if (G4_FROZEN.has(rel)) continue;` before reading the file. D-015: the row's single probe (append to `qa/verdicts/watched-sources-run.md`) follows directly from that line; not re-executed because it needs a verdict edit.

## ISS-163 (commit 7e7194a)

File: `qa/manifests/issue-ref-disambiguation.md`. Added an addendum naming the ccd81d4 narrowing of the standing test (excludes `qa/contracts/`) and pointing to ISS-164. Restoring the assertion to repo scope is left open (the lane manifests are still flagged). Evidence: `scripts/lib/ledger-union.test.mjs:175-183`.

## ISS-352 (commit 647737d)

File: `qa/loop.md`. Stop line now reads "no open critical/high/medium issues per D-013 -- open low issues do not keep the loop alive --". Check: `grep -n 'critical/high/medium' qa/loop.md` returns line 46. (The row's other check, `grep 'no open issues'`, never matched because the original text wrapped across lines; the diff is the evidence.)

## ISS-A035913-010 (commit 0a11ba4)

File: `qa/manifests/iss-346-round-cap-mechanical-check.md`. The C4 row is marked WITHDRAWN, struck through, with a pointer to the cycle-1 verdict. Evidence: `grep -c vLast .claude/hooks/*.ps1` is 0 for every hook, and the cycle-1 verdict (lines 380 and 402) rejects the rule.

## Verification

`node --test scripts/lib/tracker-audit.test.mjs scripts/lib/ledger-union.test.mjs scripts/lint.test.mjs`: tests 66, pass 64, fail 2. The 2 failures are pre-existing and unrelated: `G4: master's manifests ... clean` fails on the four lane manifests above, and `selected CLI gate cannot hide duplicate ledger IDs` fails with ERR_MODULE_NOT_FOUND for `scripts/qa/unmerged-worktrees.mjs` in its temp fixture (the fixture copy lacks that import, which predates this batch). Not checked against a pristine base run. `node scripts/lint-dirsize.mjs`: OK. No TypeScript changed, so no `tsc`.

Status: ready-for-check
Fix cycle: 0
