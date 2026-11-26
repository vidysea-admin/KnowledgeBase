# Verdict (coordinator B, blind): recorder-self-heal-rejoin (H1)
Cycle checked: 0
Policy-Version: proportional-verification/2026-11-22.19
Head: e327d86bc30307e98ec27d93fd9d1e2fa1a53d06 (base 16a44f4c, branch wave/h1-recorder-self-heal)
Contract commit: 7e683dff
Dual check: required (dual-trigger: tenancy scripts/webinar/scheduler/dispatch.mjs:51). This is coordinator B; no issue rows written.
Worktree: D:/KnowledgeBase/.worktrees/h1-check-b (left in place). Blind to coordinator A.

## Evidence per criterion (my own runs, final head)
| id | evidence | result |
|---|---|---|
| C1 | self-heal-rejoin.test.mjs 23/23 green; same-cycle select() re-run dispatch.mjs:107-116; mutant A (rejoin append emptied) red 12 tests | PASS |
| C2 | same file; rejoin sets status queued, reason interrupted-rejoining, artifact and monitorGap cleared, old file kept as interruptedArtifact (dispatch.mjs:72); mutant A | PASS |
| C3 | tests green; alertKey plus #n outcome-keyed mail (lifecycle-alerts.mjs:23); mutant J (alerts.ts #n dedup suffix dropped) red 4; mutant B (outbox key suffix dropped) SURVIVED, see finding 2 | PASS (low) |
| C4 | running = end > now in dispatch.mjs; mutant C (>=) red 2 | PASS |
| C5 | ATTEMPT_LIMIT 3, previous >= attempts restart guard, attempts+1 written before launch (dispatch.mjs:177); mutant D (limit 4) red 3 | PASS |
| C6 | pool.has(id) guard; mutant E red 1 | PASS |
| C7 | rejoin goes through capture() gates dispatch.mjs:138-177 (validateTenant, applyJoinRules, prepareCapture, end check, validateTenant); mutants F (stop guard :18 removed) red 2, G (vanished-link conversion removed) red 1, H (monitorGap clear removed) red 1 | PASS |
| C8 | no same-session-id file-collision test; H1 never deletes or overwrites a file, names are tab-<ms>-<hex8>.webm (tab-browser.ts:129,136), lock opened "wx" (:87) | PASS (low, finding 3) |
| C9 | admission_denied never retried, own-error failed rejoin only with no recording file; mutant I (exclusion removed) red 1 | PASS |
| C10 | FAIL. Probe (scratchpad h1-check-b/probe-c10.test.mjs, real canonicalOperationAlert plus raiseAlert with fake gws, decoded mail): a title with a join URL carrying ?pwd=... AND a passcode sentence yields a mail that still contains the passcode sentence verbatim. A scheme-less link with pwd= also passes through. Only a scheme-ful URL becomes [link removed]. cleanBotText strips only https?://\S+ and control chars. The builder's tests put the passcode sentence in the row reason, never in the title, so the contract's literal scenario is unexercised. | FAIL |

## Invariants
I1-I4 and I6: PASS by code read plus the tests above (no deletion or overwrite, attempts persisted before launch, stop alert exempt from the failure-cap digest, kind stays capture-failed). I5 (tenancy): guard dispatch.mjs:51 read; direct tests at self-heal-rejoin.test.mjs:346 and :358 green; NOT falsified by me (10-mutant cap reached).

## Falsification (10 mutants, per-mutation byte backup, timeout, restored; every touched file hashes equal to its HEAD blob)
A, C, D, E, F, G, H, I, J killed (green before, red after, restored). B survived. Mutant G was first run with a bad pattern (load failure, not counted) and rerun correctly.

## Facts ruled
1 PASS (:18 returns undefined on stopDisposition; capture-stop.mjs writes it on a rejoined row like any row; read plus test, live stop NOT measured). 2 PASS (H). 3 PASS (A, F, G). 4 PASS (D, I; a restart cannot reset because attempts and interruption.n are persisted). 5 PASS on once per interruption, second not dropped (J), stop not digested; C10 FAIL. 6 PASS by read and tests (not falsified). 7 deviations 1-4 and "Filed, not built" accepted; D-245 two-mails-on-refusal filed low. 8 builder counts reproduced: 46/46, 36/36, 24/24, tsc exit 0, 5 changed files.

## Findings
1. PROPOSED-ISSUE: {"severity":"high","class":"security","criterion":"H1-C10","title":"Interruption mails carry the meeting title uncleaned beyond https URLs: passcode sentences and scheme-less links with pwd= reach the mail","repro":"probe-c10.test.mjs: title 'Webinar https://x.zoom.us/j/1?pwd=abc Passcode: 123456' gives a decoded mail containing 'Passcode: 123456'","fix_direction":"scrub the title for interruption mails (passcode sentences, pwd=, scheme-less links) or have the contract owner rule that 'rendered as today' governs; add a test with the sentence IN THE TITLE"}
2. PROPOSED-ISSUE: {"severity":"low","class":"test-gap","criterion":"H1-C3","title":"lifecycle-alerts.mjs alertKey #n suffix is unasserted (mutant B survives)","repro":"remove the suffix at lifecycle-alerts.mjs:23; 23/23 still green","fix_direction":"test two unsent interruptions of one session in the outbox"}
3. PROPOSED-ISSUE: {"severity":"low","class":"test-gap","criterion":"H1-C8","title":"No same-session-id recording-file collision test","repro":"read only","fix_direction":"add a test with identical file names across a rejoin"}

## NOT-MEASURED
Live stop of a rejoined capture, real Meet, real mail, a :51 mutant, the builder's M1-M13 (not counted), full suite (not run by policy).

VERDICT: FAIL
SCOREBOARD: C 9/10, I 6/6 (I5 unfalsified)
TIER: L
FAILURES: C10 (security class, never capped)
CAPABILITY-COVERAGE: no live capture, no network, no mail sent, no .env or sessions read
LIVE-BROWSER: not applicable
ISSUES-WRITTEN: none (dual check; findings are PROPOSED-ISSUE lines)
EXECUTOR: checker coordinator B (Sonnet 5.5)
EXPLANATION: Everything except C10 holds. C10 asks that a title with a join URL carrying pwd plus a passcode sentence yield a mail without those strings; the code only strips https URLs, so the passcode sentence ships. Low notes: the foreign-tenant guard skips processing rows (pre-existing, the state reader rejects first); the admission_denied regex is broader than B10's reasonName (safe direction); a fresh-process cancelled event ends as coverage-review; the rejoining mail precedes a possible refusal mail (D-245, filed low); the OPERATION_ONLY_REASONS line is long and run-pipeline.mjs is at its 300-line budget.
Metrics: start=2026-11-25T13:19:09Z end=2026-11-26T00:10:12Z wall_min=651 agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=10 defects=1
