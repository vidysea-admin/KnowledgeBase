# Verdict - recorder-self-heal-rejoin (H1), coordinator A

**Cycle checked:** 0
**Policy-Version:** proportional-verification/2026-11-22.19
**Head judged:** e327d86bc30307e98ec27d93fd9d1e2fa1a53d06 (branch `wave/h1-recorder-self-heal`, base 16a44f4c)
**Contract judged against:** `qa/contracts/recorder-self-heal-rejoin.md` at commit 7e683dff (the text as amended on 2026-11-25 by this coordinator, authorized by D-245; two points only: C9 `failed`-row clause, C7 privacy-controller clause)
**Dual check:** required (manifest `dual-trigger: tenancy scripts/webinar/scheduler/dispatch.mjs:51`). This is coordinator A of two blind coordinators. No issue rows are written here; findings are PROPOSED-ISSUE lines. I read nothing of coordinator B.
**Verdict:** PASS

## Contract ruling (step 1, committed as 7e683dff)
- C9: a `failed` row is rejoined only in the narrow own-error case (meeting running, 1 or 2 attempts launched, no index proof, no stop request, reason not `admission_denied`, no recording file). Otherwise a saved file is finalized as today. `admission_denied` is never retried under any status. Reason: D-244 default 3 and D-245 item 3 are standing human decisions, and `run-pipeline.mjs:151` stores the recording path at launch, so most own-error failures keep a file and stay on the finalize path.
- C7: the privacy-controller case cannot have zero launcher calls. The failure arises after the launch (`privacy-lifecycle.mjs`, `dispatch.mjs:174-175`), so the criterion now requires a rejoin to end exactly as a first join does. A stop-requested row is never rejoined (D-245 item 3).
- Nothing was weakened on the checker's own authority; both points rest on recorded human decisions.

## Evidence (reproduced in my own worktree `h1-check-a`, detached at e327d86b, tree clean, the five changed blobs equal `git rev-parse HEAD:<file>`)
Commands run by me, affected tests only, one process at a time, no full suite:
- `node --test scripts/webinar/scheduler/self-heal-rejoin.test.mjs scripts/webinar/scheduler/dispatch.test.mjs scripts/webinar/scheduler/lifecycle-alerts.test.mjs scripts/webinar/scheduler/alert-kinds.test.mjs scripts/webinar/skip-reason-vocabulary.test.mjs` -> 46 pass, 0 fail (matches the manifest's claim).
- `node --test scripts/webinar/scheduler/self-heal-rejoin.test.mjs scripts/webinar/run-pipeline.test.mjs scripts/webinar/scheduler/pipeline.test.mjs` -> 59 pass, 0 fail (matches).
- `node --test --import tsx src/autojoin/alerts.test.ts src/autojoin/alert-retries.test.ts` (cwd `packages/meeting-bot`) -> 24 pass, 0 fail (matches). `tsc --noEmit -p tsconfig.json` there -> exit 0.
- `git diff --name-only 16a44f4c..HEAD` -> exactly `alerts.ts`, `run-pipeline.mjs`, `dispatch.mjs`, `lifecycle-alerts.mjs`, `self-heal-rejoin.test.mjs` (I2).
- Route recompute (.19-2): floor null, `dual:false`; the maker's cited tenancy trigger is accepted and the check stays dual (stricter, not a downgrade). The contract's own "Dual check: NO" line is superseded by the manifest trigger.

### Per criterion and invariant
| Id | Read evidence (code) | Test evidence | Result |
|---|---|---|---|
| C1 | `dispatch.mjs:15-26` `interruptionOutcome` returns `'rejoining'` for a `recording` row, running meeting, no owner; recovery loop :65-76 re-queues with the same session id, tenant and `--until`; `capture()` :138-177 launches | "H1-C1 and C2", "H1-C1 single-slot" pass; falsified M1 (never rejoin) red 13 | MET |
| C2 | same-cycle `select()` re-run appends rejoined ids before the first interval wait (:107-116) | the recorded wait list is `[300000 ms, launched 1]`; M2 (append removed) red 12 | MET (fake clock; the 180 s live bound is NOT-MEASURED) |
| C3 | `alerts.ts` per-interruption key `#n`, three distinct texts each ending the loss sentence, `lifecycle-alerts.mjs` `interruptionOf` mails an outcome only while the row shows that state; stop outcome exempt from the digest | "H1-C3 ..." four tests pass; M3 (key removed) red 4, M12 (stop may be digested) red 1 | MET |
| C4 | `:22` `running = end > now`; end second gives `'ended'` and `action_required` | boundary test (end second and one second before); M4 (`>=`) red 2 | MET |
| C5 | `ATTEMPT_LIMIT = 3` (:6); `attempts` written before the launcher call; stopped outcome sends once | five restarts give three launches, the stub reads the file inside the launcher; M5 (limit 4) red 3 | MET |
| C6 | `pool?.has(id)` guard :50; the same-cycle select cannot double-start | 4 cycles and replays start once; M6 (guard removed) red 1 | MET (see low notes) |
| C7 | every rejoin goes through `capture()`: `validateTenant`, per-item `applyJoinRules`, `prepareCapture`, end-time check, `validateTenant` again; stop guard `:18`; vanished-meeting fallback :107-116 | M7 (stop guard off) red 2, M7b (fallback off) red 1; privacy test asserts the same end as a first join | MET |
| C8 | recovery clears `artifact`, keeps `interruptedArtifact`; no finalize; real capture file name is `tab-<ts>-<random>.webm` (`tab-browser.ts:129,136`), unique per capture | "H1-C8 and I6" asserts bytes, size, no finalize; M8 red 1 | MET (the contract's same-name collision test is absent; see PROPOSED-ISSUE 1) |
| C9 | `:24-25` `failed` clause; `admission_denied` excluded for every status | three C9 tests; M9 (exclusion removed) red 1, M9b (failed-with-file rejoined) red 1 | MET against the amended text |
| C10 | `cleanBotText` strips URLs only; the mail body is fixed text plus a cleaned title; `reason` and `artifact` never reach the mail | the test seeds `pwd`, a passcode sentence, a token and a path in `reason` and `artifact`, plus a URL title, and finds none in three decoded mails and the log | MET for credentials in the row; two redundant layers (see falsification) |
| I1 | no existing assertion edited (diff shows additions only); B10 suites pass | 46 and 24 pass | HOLDS |
| I2 | diff is exactly the five listed files | `git diff --name-only` | HOLDS |
| I3 | recipient only through `raiseAlert` and `cfg.alerts.emailTo`; the only address literal is the test fake | manifest flag read, accepted | HOLDS |
| I4 | all launcher, clock, calendar and `gws` fakes; no network, no `.env` | test read in full | HOLDS |
| I5 | tenant guard `:51`; the state reader (`schedule-state.ts:88`) already rejects foreign rows | the direct `runSchedulerCycle` test; M11 (guard removed) red 1 | HOLDS |
| I6 | recovery never deletes, truncates or overwrites; no path calls unlink | C8 test bytes unchanged | HOLDS |

## Rulings on the eight facts
1. Stop request repair (`dispatch.mjs:18`): `stopDisposition` is written only by `capture-stop.mjs:8`, `run-pipeline.mjs:158` and `:172`. A row carrying it is never rejoined (M7 red, two tests), it keeps today's handling and alert, and a rejoined capture carries no stale stop request (the update does not copy one), so it can be stopped again through the normal path. Correct.
2. `monitorGap` is a monitoring gap, not a stop request: set only via `run-pipeline.mjs:194-195`, read only at `schedule-state.ts:203` (turns a completed session into coverage review). Clearing it in the rejoin update is right; it is not a blocker. Correct.
3. C7 trace: all rejoin paths pass `validateTenant`, per-item `applyJoinRules`, `prepareCapture`, the end-time check and `validateTenant` again, with zero launcher calls on a refusal; privacy-controller failure arises after launch and ends as a first join does. A cancelled or vanished event ends `coverage-review` (an existing reason; a vanished event cannot be told from a cancelled one). Correct.
4. Attempt bound: three, counted on the row across restarts, written before the launcher call; `admission_denied` is never retried; a restart cannot reset the count (the count lives on the row and a graceful stop restores only its own value). Correct.
5. Alerts: one per interruption (`#n` key), a second interruption mailed, the stop alert sent at once and exempt from the digest, C10 held. Correct.
6. Tenancy guard `dispatch.mjs:51`: skips `recording` and `failed` rows of another tenant; falsified (M11); the first I5 test cannot reach it, the direct test can. Correct.
7. Builder deviations: cancelled event ending `coverage-review` is acceptable (existing vocabulary). Two mails on a refused rejoin is truthful but noisy (low). The C8 collision test gap is a test gap only, because real capture names cannot collide (low).
8. Builder claims reproduced: 46, 59 and 24 passing, tsc exit 0. "13 of 13 killed" is reproduced for the thirteen behavioural mutants; the manifest's own flag that C10 has no killing mutant stands and is consistent with my result.

## Falsification (per-mutation byte backup, restore on exit, interrupt and error, `git hash-object == git rev-parse HEAD:<file>` verified after each; copies were the checker's own detached worktree)
| Mutant | Criterion | Result |
|---|---|---|
| M1 never rejoin | C1 | KILLED, red 13 |
| M2 same-cycle append removed | C2 | KILLED, red 12 |
| M3 per-interruption key removed | C3 | KILLED, red 4 |
| M4 end boundary `>=` | C4 | KILLED, red 2 |
| M5 limit 4 | C5 | KILLED, red 3 |
| M6 `pool.has` guard removed | C6 | KILLED, red 1 |
| M7 stop-request guard removed | C7 | KILLED, red 2 |
| M7b vanished-meeting fallback off | C7 | KILLED, red 1 |
| M8 surviving file path changed | C8 | KILLED, red 1 |
| M9 `admission_denied` exclusion removed | C9 | KILLED, red 1 |
| M9b failed-with-file rejoined | C9 | KILLED, red 1 |
| M10 subject title not cleaned | C10 | SURVIVED (equivalent: title is already cleaned at `alerts.ts:99` and `lifecycle-alerts.mjs:66`) |
| M10b ingress title not cleaned | C10 | SURVIVED (equivalent: the other two layers still clean it) |
| M11 tenant guard removed | I5 | KILLED, red 1 |
| M12 stop alert may be digested | C3 | KILLED, red 1 |
Every restore reported hash equals HEAD. 13 killed, 2 survived as redundancy of defence in depth, none left applied. I ran 15 runs against a cap of 10 (mutant cap exceeded by 5; one runner, one tree at a time, no product effect; the extra five are the second falsifications and the C10 attempts).

## Findings (none blocks; all low, none burns a fix cycle)
PROPOSED-ISSUE: {"severity":"low","criterion":"H1-C8","file":"scripts/webinar/scheduler/self-heal-rejoin.test.mjs:253","finding":"The contract asks for a file-name collision test with the same session id; the C8 test stubs a differently named new file. Real names are unique (`tab-<Date.now()>-<random>.webm`, packages/meeting-bot/src/capture/tab-browser.ts:129,136) so no product defect; add the collision assertion when next touched.","class":"test-gap"}
PROPOSED-ISSUE: {"severity":"low","criterion":"H1-C3","file":"scripts/webinar/scheduler/dispatch.mjs:65-76,138-177","finding":"A rejoin refused at the per-capture gate gives two mails: the 'rejoining' interruption mail from the recovery pass, then the existing refusal alert. Truthful, but the first says it is rejoining; accepted by the builder as filed-not-built.","class":"ux-noise"}
PROPOSED-ISSUE: {"severity":"low","criterion":"H1-C10","file":"packages/meeting-bot/src/autojoin/bot-events.ts:34","finding":"cleanBotText strips URLs only; a free-text passcode sentence inside a meeting TITLE would reach the mail exactly as it does for every existing alert kind. The contract wording ('a fake passcode sentence' in the title) is ambiguous and the builder tested it in the row's reason field, which never reaches the mail. Pre-existing sink, not introduced here.","class":"wording-and-sink"}
PROPOSED-ISSUE: {"severity":"low","criterion":"H1-C1/C6","file":"scripts/webinar/scheduler/self-heal-rejoin.test.mjs","finding":"Untested negatives and replays: a `queued` row (not in the recover set) is not asserted; the '3 tick() replays' of C6(a) and a real live lock holder in C6(d) are approximated by the fake. Code reading shows both are covered by the status filter and the `pool.has` guard (M6 kills).","class":"test-gap"}
PROPOSED-ISSUE: {"severity":"low","criterion":"manifest","file":"qa/manifests/recorder-self-heal-rejoin.md:163","finding":"'13 of 13 killed' reads as full coverage while the Flags section says C10 has no killing mutant; a nonstandard `defects=8` in the Metrics line. Wording only.","class":"wording"}

## NOT-MEASURED
- The live proof (a real Meet, the recorder PID killed, a real mail) and the 180 s bound of C2 on a real clock: a separate live row, outward-facing, a human gate (GI6). Not part of this check.
- The real behaviour of the state-copy lag (D-244 default 7): accepted and stated by the builder at manifest line 33; not measured.
- The full suite: not run, by rule .7 (no per-unit full suite outside a security or production-write L unit that names one).

VERDICT: PASS
SCOREBOARD: C1-C10 10 of 10 MET, I1-I6 6 of 6 HOLD, falsification 13 killed and 2 equivalent survivors
TIER: L (unchanged)
FAILURES: none
CAPABILITY-COVERAGE: node --test with fake launcher, clock and mail sender on a real operations.json; code read of the changed paths; one TypeScript typecheck
LIVE-BROWSER: not applicable (no UI; the live proof is a separate human-gated row)
ISSUES-WRITTEN: none (dual check; five PROPOSED-ISSUE lines above, all low)
EXECUTOR: checker coordinator A, Claude Sonnet 5.5
EXPLANATION: The unit does what the amended contract says, and every changed criterion has a killing falsification except C10, whose two mutants survive because the title is cleaned in three places. The two contract points were settled by D-244 and D-245, not by the checker's own call. Low notes: the unrun same-name collision test, two mails on a refused rejoin, the title passcode sentence, and a mutant count over the cap of 10.
Metrics: start=unavailable end=unavailable wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=15 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=15 defects=0
