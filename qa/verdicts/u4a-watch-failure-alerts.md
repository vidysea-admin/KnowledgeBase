# Verdict — u4a-watch-failure-alerts

**Cycle checked:** 0

VERDICT: PASS

## SCOREBOARD

| Claim | Checked | Result |
|---|---|---|
| R1 throttle is state-based, keyed on full `(tenantId, sourceType, sourceId)` triple | Yes — read `telegram-alerts.ts`, `run-watch.mjs`, `watch-state.ts`; traced `shouldAlertPollFailed(priorStatus)` = `priorStatus !== "failed"` against `findWatchState(TENANT, "drive", sourceId)` whose `_id` is the composite `${tenantId}:${sourceType}:${sourceId}` | CONFIRMED CORRECT. A source failing repeatedly (`priorStatus === "failed"`) does not re-alert; a source that recovered (any other status, including `undefined` on first poll) and fails again DOES alert. Key is the full triple, not a subset. |
| `failureReason` passed verbatim | Yes — read `notifyPollFailed`'s template literal and the test asserting the exact string `"401 Unauthorized: token expired"` appears unmodified | CONFIRMED CORRECT. No truncation/reformatting anywhere in the path. |
| Healthy run sends nothing | Yes — read the "healthy tick" test and the plan's own requirement | PARTIALLY CONFIRMED, gap filed (ISS-357). The test only proves the notifier is silent-by-construction when neither new method is called; it does not exercise `run-watch.mjs`'s real healthy-tick call sites. The mechanism itself (`isImminentDate` excluding non-imminent dates, `shouldAlertPollFailed` gating on prior status) is correct and independently verified by me via dynamic import, but there is no committed regression test at the integration level. |
| 3 failing tests are a pre-existing, unrelated flake | Yes — re-ran the full suite myself, re-ran `obs-windows.test.ts` in isolation 3 times, checked import graph | CONFIRMED unrelated + non-deterministic, but the manifest's specific phrasing overstates determinism (see below) — noted, not filed (low/style-class). |
| `lint-loc` shows same 4 violations, no 5th | Yes — ran `node scripts/lint-loc.mjs` myself | CONFIRMED. Same 4 files, `run-watch.mjs` now at line 522 (was 447), still one violation not two. |
| `tsc --noEmit` clean | Yes — ran myself | CONFIRMED. Exit 0, no output. |
| Entry-point guard correct | Yes — ran `node -e "import(...)"` (no `main()` side effects) AND `node scripts/watch/run-watch.mjs --dry-run` directly (full real run, correct digest output, `TELEGRAM alerts disabled` line, `--dry-run: nothing written`, exit 0) | CONFIRMED CORRECT both directions. This is the strongest part of the unit — I independently reproduced both the "safely importable" and "still runs as a script" halves of the claim, including a real read-only pass against production Drive/Gmail (the same read-only verification mode the manifest itself used). |
| No file outside the 4 authorized was touched; no new file created | Yes — `git status --short` in the worktree is clean at HEAD; diff matches the manifest's list exactly | CONFIRMED. |
| Worktree ff-merge left clean history | Yes — `git log` comparison, `merge-base --is-ancestor` | CONFIRMED. Worktree HEAD is exactly `master`'s `96048e4` plus the one unit commit `f642611` — a genuine fast-forward, no rewritten history. |

## FAILURES (if any)

None that block PASS. Two disclosed gaps promoted to filed issues (both medium, both scope/coverage-class, neither auth/tenancy/data-write, neither round-capped since this is cycle 0):

- **ISS-356** — R3's "why it was selected" is `run-watch.mjs`'s own upcoming-candidate surfacing, not the real auto-record selection engine (`auto-join.ts`/`schedule-tick.ts`, outside this unit's authorized files). Real, tested, narrower-than-spec signal; maker's own follow-up recommendation (wire into `runScheduleTickOnce`) is sound. Includes the disclosed cross-process repeat-alert residual risk as a sub-point. **Ruling: R3 is PARTIALLY satisfied** — the letter (name the meeting + a reason) ships and is tested; the spirit (the actual selection reason) does not yet. Not FAIL-worthy: plan.md itself named `run-watch.mjs` as R3's file (a plan-level premise the maker caught and flagged rather than silently building around), the maker did not touch the unauthorized file, and the gap was disclosed with a concrete, well-reasoned recommendation. Raised as HUMAN_GATE material for Umesh (fold into U4b vs. new small unit vs. accept as final).
- **ISS-357** — No automated regression test for `run-watch.mjs`'s R1/R3 call-site wiring (state-read-before-write sequencing; the two `notifyUpcomingRecording` call sites). Verified today only by diff-reading plus an ad hoc `node -e` dynamic-import script pasted into the manifest — real and correct, but not committed/re-runnable, so a future edit could silently break R1's throttle sequencing with nothing failing CI. **Ruling: acceptable at cycle 0, not FAIL-worthy.** `run-watch.mjs` had no pre-existing test file, `main()` does real I/O, and D-046's new-file grant covers only U4c's three files by name — the maker correctly declined to create a test file unilaterally (textbook anti-drift discipline) and flagged it plainly rather than hiding it or padding coverage with an unrelated test. This is exactly the gap the task brief asked me to weigh, and I weigh it in the maker's favor given the disclosure quality, but the gap is real and sits on the live capture path that failed silently on 2026-09-27, so it is filed medium rather than low. Also raised as HUMAN_GATE material (authorize `scripts/watch/run-watch.test.mjs` as a narrow 4th new file, or accept current coverage for this cycle).

## Note on the flake-attribution claim (not filed, informational only)

The manifest states `obs-windows.test.ts` "reproduces identically in isolation... twice in a row, same assertion each time." I ran it in isolation 3 times myself and got: 0 failures, then 2 failures (different specific tests than the full-suite run), then 3 failures (2 of which matched the full-suite run, 1 different). This is clearly a load-dependent timing flake (consistent with the tests' own `ISS-324` naming and D-039's disclosed timing-flake precedent), and the import-graph check (`grep -n "telegram-alerts|notify-channels|run-watch" src/capture/obs-windows.test.ts` → no matches) independently confirms these files share no code path with this unit's diff. So the core claim — **pre-existing, unrelated, not introduced by this unit** — holds and is the load-bearing part. The narrower phrasing ("identically," "same assertion each time") is inaccurate against my own repeated runs and reads as more deterministic than the evidence supports. Style/evidence-quality note only, capped under D-014's non-security class; does not affect the verdict.

## CAPABILITY-COVERAGE

R1 (alert on failed poll, state-based throttle, verbatim reason): fully covered and independently verified, both by re-running the notifier's own test suite and by tracing/exercising the call-site logic in `run-watch.mjs` myself.

R3 (alert before a recording starts, naming meeting + reason): covered at the letter of plan.md's file assignment, not at the full spirit of spec.md's "why it was selected" — see ISS-356. Real and tested for what it does cover.

Everything else (R2, R4-R8): out of scope for this unit, not built, not claimed — confirmed via `git status --short` (only the 4 authorized files touched).

## LIVE-BROWSER

Not applicable — no UI surface changed. Confirmed myself: no file under `apps/web` appears in the diff, and plan.md's own U4a row says "skip (no screen)."

## ISSUES-WRITTEN

ISS-356, ISS-357 (both medium, both filed to `qa/issues.jsonl`, ids allocated sequentially after the prior max of 355 across the union of `qa/issues.jsonl` and `qa/issues.*.jsonl`).

## EXECUTOR

Checker (fresh context, read-only toward the artifact), verifying `f642611` in `D:\KnowledgeBase\.claude\worktrees\agent-a46ceda26ef357011` (branch `worktree-agent-a46ceda26ef357011`) against `docs/features/u4-watch-dashboard/spec.md` (R1/R3), `plan.md` (U4a row), `qa/gates/plan-approved-u4-watch-dashboard.md`, and `docs/DECISIONS.md` D-046.

## EXPLANATION

Every command in the manifest was re-run independently rather than accepted on the maker's word, per this brief's instruction not to trust the manifest:

- `node --test --import tsx "src/capture/telegram-alerts.test.ts"` → **27/27 pass**, matches claim exactly (output reproduced above in my own run).
- `node --test --import tsx "src/**/*.test.ts"` (full meeting-bot suite) → **265/268, 3 failures, all in `obs-windows.test.ts`**, matches claim exactly.
- `obs-windows.test.ts` in isolation → non-deterministic (0/2/3 failures across 3 runs), confirming it is a genuine load-dependent flake and not a hidden deterministic break; import-graph check confirms zero code overlap with this unit's 4 changed files.
- `npx tsc --noEmit -p tsconfig.json` → clean, exit 0, matches claim.
- `node scripts/lint-loc.mjs` → same 4 violations as baseline (`speakers-llm.ts:313`, `sb_join.py:437`, `obs-windows.ts:359`, `run-watch.mjs:522`), matches claim. `run-watch.mjs` growing from 447→522 while already over budget is judged acceptable here: the D-046 new-file grant explicitly did not extend to this unit, so there was no headroom file to move logic into, and the maker disclosed the growth plainly rather than hiding it or requesting an unauthorized new file.
- Entry-point guard: independently verified both directions — importing the module runs no I/O and exposes only the two pure functions; invoking it directly (`node scripts/watch/run-watch.mjs --dry-run`) runs `main()` fully, produces a correct real digest (new Drive file found, 4 upcoming calendar items, 18 pending Gmail candidates, Telegram alerts correctly logged as disabled since no token is configured in this environment), and respects `--dry-run`'s "writes nothing" contract with exit 0. This is a genuine, if minor, live read-only touch of production Google Drive/Gmail (the same mode the unit's own manifest used for its live-check evidence) — no writes, no Mongo, no Telegram send occurred.
- Fast-forward merge: `git log` on both branches and `merge-base --is-ancestor` confirm the worktree's history is `master` plus exactly one commit — a clean fast-forward as claimed, not a rebase or synthetic merge.
- D-046 scope: read in full. New-file grant is verified to cover only `WatchPage.tsx`/`WatchPage.test.tsx`/`watched-sources.ts`; this unit created no new file, confirmed by `git status --short`.

Net judgement: this is a solid, honestly-disclosed cycle-0 unit. The core R1 mechanism (the load-bearing "one alert, then silence until it changes state" throttle) is correct, complete, and well-tested. The two gaps (R3's approximated selection-reason, and the untested call-site wiring) are real but non-security, scope-bound by D-046's authorization boundary, and disclosed with more care and more concrete follow-up reasoning than most units in this ledger — exactly the anti-drift behavior this repo's rules ask for rather than a maker quietly padding over a gap. PASS, with both gaps filed at medium severity and flagged as HUMAN_GATE material for Umesh's call on the two follow-up scope questions (R3's true wiring location; whether to authorize a 4th test file).
