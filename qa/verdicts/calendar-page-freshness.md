# Verdict - calendar-page-freshness (T1), cycle 0

Cycle checked: 0
Policy-Version: proportional-verification/2026-11-22.19
Contract: qa/contracts/calendar-page-freshness.md at ef054973 (unchanged since; `git diff ef054973 HEAD` on the file is empty). Manifest 8c481ad1 plus round-cap line cba7d1e8.
Head checked: 7832d789e8e57fa16e63513e0222fc8d3486568b (branch wave/t1-calendar-freshness, base 3357556d). Bound to D:/KnowledgeBase. Checker worktrees left in place: `.worktrees/t1-check` (check), `.worktrees/t1-check-mut` (mutation copy, holds one untracked probe file).
Dispatch counters: Resume 0, Retry 0. The run was interrupted once by an API network error (ENOTFOUND) and resumed by the coordinator; finished steps were not repeated except the mutation batch (see Metrics).

## Check plan
Logic and timing changed (hook, timer, listener, race): affected tests plus the falsification floor. UI changed (one notice on the Calendar page): Mode D. No persona walk (manifest skip is true: no new screen, flow or user type). No security or data path. Floor recompute (.19-2): `tick.mjs --route 3357556d..7832d789` printed `{"floor":null,"dual":false,"rules_fired":[]}`; Tier L stays on the contract's concurrency/timing trigger, one checker. Dispatch bans (no dev server, no live browser against a deployed address, no network) were obeyed.

## Evidence per criterion and invariant (all re-run by me in `.worktrees/t1-check` at 7832d789)
| Id | Evidence | Result |
|---|---|---|
| T1-C1 | `CalendarPage.test.tsx` whole file 73/73 green (own run). Read `useUpcomingMeetings.ts:71-106`: a success replaces state through `sameData`; added, changed, removed meetings show after one period in all four views (tests at :493-533) | met in jsdom |
| T1-C2 | Period 60 s counted from request end (`:103-104`), at most one request in flight (`:76`, `:110`), no retry loop; 10-minute test count 9..11, two pages 22, sessions/Gmail called once | met in jsdom |
| T1-C3 | Timer fired while hidden parks and starts nothing (`:72`); one listener per mount (`:57-61`); `resume` runs one refresh only when parked (`:110`) | met in jsdom |
| T1-C4 | Failure table (network, 500, 503, 429, two malformed, 403) keeps list, one notice with `<time dateTime>`, no degraded or empty note; 503 wording; 120/240/300/300 then 60; Retry-After honoured; 401/403 stop; first-load failure keeps the degraded note | met in jsdom |
| T1-C5 | Unmount and key-change tests green; timer-clear branch (`:116`) NOT exercised by the page suite (see M5 and finding P1); my own probe shows it holds | met (code read + own probe); test gap filed |
| T1-C6 | Same grid and chip nodes, focus, URL, selection, open opt-out confirm survive a refresh; a refresh sets no state before the await (`:75-86`). Scroll position is NOT-MEASURED (jsdom) | met in jsdom; scroll NOT-MEASURED |
| T1-C7 | `git diff 3357556d..7832d789 --name-only` lists only the three web files; nothing under `apps/api` or `apps/web/src/api`; plain GET test green | met |
| T1-I1 | 38 existing tests untouched: the only removed lines in the test diff are 4 import lines, replaced by wider imports; `tsc --noEmit` exit 0; `pages/calendar` + `enforcedVariant` + `App.readonly` + `runtime.wiring` 8 files: 206 of 208 green, see Red below | holds |
| T1-I2 | `rows` set only from a response (`:86`); no literal meeting in source | holds |
| T1-I3 | `lint-loc`, `lint-dirsize`, `lint-dupes` all OK on this head | holds |
| T1-I4 | No consent, bot or `apps/api` file in the diff | holds |
| T1-L1 | live-only, not run | NOT-MEASURED |

Red: 2 failures in the affected set. `App.readonly` `/knowledge-outputs` passed alone (load flake). `runtime.wiring` "routes /knowledgebase/ask" times out at 5000 ms alone on this head AND at base 3357556d in my copy: pre-existing, not this unit (page renders Ask, not Calendar).

## Falsification (isolated copy `.worktrees/t1-check-mut`, one mutation at a time, per-mutation byte backup, restore in `finally`/SIGINT/SIGTERM, 240 s timeout, `git hash-object` equals `git rev-parse HEAD:<file>` after every mutation: all equal). Logs: qa/evidence/calendar-page-freshness/checker-mutants-batch*.log
| Mutant | Criterion | Green before (copy) | After | Result |
|---|---|---|---|---|
| M1 `sameData` compares only length | C1 | 35/0 | 6 red (4 view tests, C3 resume, C6 gone-selection) | killed |
| M2a `REFRESH_PERIOD_MS` 150 s | C2 | 35/0 | 32 red | killed |
| M2b in-flight guard removed in `run()` and `resume()` | C2 | 35/0 | 1 red: "hiding and showing the tab while a request is pending" | killed |
| M2 guard removed in `resume()` only | C2 | 39/0 | 0 red | survived, equivalent: `run()` keeps the same guard (M2b proves the pair is covered) |
| M3 `resume` ignores a pending timer | C3 | 39/0 | 1 red: "back to visible less than one period ... nothing extra" | killed |
| M4 Retry-After line removed | C4 | 39/0 | 1 red: "429 waits at least Retry-After" | killed |
| M5 `clearTimeout` removed at cleanup | C5 | 39/0 | page suite 0 red (survived); my probe P1+P2 2 red | survived in the unit's tests, killed by my probe |
| M6 `setState(null)` at each refresh start | C6 | 35/0 | 9 red, all inside the C4 tests; no C6 test red | killed (by C4 tests only) |
| M7 request `?sync=1` | C7 | 39/0 | 33 red | killed |
Probe (`qa/evidence/calendar-page-freshness/T1CheckerProbe.test.tsx.txt`): P1 unmount with a pending timer leaves zero timers, P2 key change leaves exactly one; both green at HEAD, red under M5. Batch note: batch 1 ran with a loose `-t` (39 tests: the 35 T1 tests plus 4 others); batches 2-4 ran exactly 35. A first batch run was discarded (stale JSON on timeout); nothing from it is used.

## Facts ruled on
1. Timing: meets the contract. Timer from request end (`:103-104`), hidden pause (`:72`), resume once (`:110`), in-flight guard (`:76-77`) all evidenced by green tests and killed mutants.
2. Failure handling: meets T1-C4 (a)-(f); cleanup at `:114-119` correct by read and probe. Stale-notice text `:35-45` carries the 503 cause.
3. Review lows, none breaks a criterion as written: Retry-After uncapped (`:93`): the contract says "at least Retry-After", the client parses at most 6 digits (999999 s, under the setTimeout limit, `client.ts parseRetryAfter`), and the API sets Retry-After from the rate-limit window (`rate-limit.ts:29`, at most 60 s). Conditional `role="status"` mount (`CalendarPage.tsx:188-192`) matches the existing worker banner pattern; a11y wording is outside T1-C4. One re-render per failed tick (`:100`) is not named by any criterion.
4. Scope: only meetings refresh; sessions and Gmail effects are untouched (diff read); `MeetingBotPage.tsx:26` uses `listUpcomingMeetings` once, unchanged and out of scope.
5. Builder numbers reproduced: 35 new, 73 passing, tsc clean. Builder's 10 mutants not re-run (floor only); mine are above. The builder's "29 passed" for `App.readonly` + `runtime.wiring` does not reproduce (1 pre-existing red).

## Findings (non-blocking; D-014 file, do not build)
PROPOSED-ISSUE: {"severity":"medium","feature":"calendar-page-freshness","type":"test-gap","title":"T1-C5 unmount and key-change tests never have a pending timer, so removing clearTimeout survives","evidence":"CalendarPage.test.tsx:783-803 unmounts while request 2 is pending (timer null); :805-829 switches key while a request is pending; mutant removing useUpcomingMeetings.ts:116 `if (timer !== null) clearTimeout(timer);` leaves 39/39 green (qa/evidence/calendar-page-freshness/checker-mutants-batch1.log, M5-C5); probe P1/P2 goes red"}
PROPOSED-ISSUE: {"severity":"low","feature":"calendar-page-freshness","type":"test-gap","title":"T1-C6 tests never observe the page during a pending refresh","evidence":"mutant `setState(null)` at refresh start (useUpcomingMeetings.ts:78) is killed only by C4 tests (batch4-M6.log); no C6 test is red because the fake fetch resolves inside one advance"}
PROPOSED-ISSUE: {"severity":"low","feature":"calendar-page-freshness","type":"process","title":"Checker L wall budget exceeded by a flawed mutation harness (stale JSON, loose -t, 300 s timeouts under host load)","evidence":"first mutation run 41 min; rerun of the same seven mutants 6.5 min (qa/evidence/calendar-page-freshness/checker-mutants-batch1.log)"}
PROPOSED-ISSUE: {"severity":"low","feature":"calendar-page-freshness","type":"manifest","title":"Manifest lacks `Sibling:` lines (.13-8) and its Metrics line carries `defects=` instead of defects_unit/defects_6c; builder's `App.readonly`+`runtime.wiring` 29-pass claim not reproducible (runtime.wiring ask test red at base too)","evidence":"manifest lines 76-101; checker run at 7832d789 and 3357556d"}

## NOT-MEASURED
Mode D live browser check of the Calendar page (blocked, see below); T1-L1 hosted end-to-end within 10 minutes and the bot's real publish interval; grid scroll position; real background-tab timer throttling; StrictMode double mount; real 429/503 from the deployed API; first-load failure now retries on the backoff schedule (builder's reading, disclosed; the contract sentence "keeps today's behaviour exactly" is read as the degraded note, which is kept).

VERDICT: BLOCKED-CAPABILITY
SCOREBOARD: 7/7 criteria met on jsdom evidence (T1-C6 scroll and T1-L1 NOT-MEASURED, Mode D not run), 4/4 invariants hold
TIER: L (contract trigger concurrency/timing/race: repeating timer, in-flight request, key switch; `--route` floor null, no raise)
FAILURES: none. Remaining mandatory item: Mode D (D-024; contract line "A real browser check is required"). Not run because the dispatch forbids a dev server and any live browser against a deployed address, so there is no page to drive; I will not PASS a UI-touching unit without it. Needs a re-dispatch that allows a local Vite dev server on a loopback port with a faked API plus my own Playwright, no deployed address and no network. All other checks are complete and reusable by evidence identity (qa/checkpoints/calendar-page-freshness.md).
CAPABILITY-COVERAGE: 7/7 criteria falsified by me (C5 by my probe, the unit's own tests let M5 survive)
LIVE-BROWSER: BLOCKED-CAPABILITY (a served page to drive: dev server and browser against a page were excluded by the dispatch)
ISSUES-WRITTEN: none (PROPOSED-ISSUE lines above; ledger rows are minted by the maker)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The code meets T1-C1 to C7 and I1 to I4 on every deterministic instrument I ran, and the three review lows break no criterion. Two test-quality gaps (clearTimeout at cleanup, refresh-pending view) are filed, not blocking. The only thing between this unit and PASS is the Mode D browser run the dispatch excluded; it burns no fix cycle.
Metrics: start=2026-11-25T13:22:08Z end=2026-11-26T00:20:00Z wall_min=59 agent_min=unavailable blocked_min=598 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=3540 mutants=3 defects_unit=0 defects_6c=0 slow: mutation batch 1 41 min (harness flaw, rerun 6.5 min); blocked_min is the API outage between the two legs (ENOTFOUND, cited by the coordinator)
