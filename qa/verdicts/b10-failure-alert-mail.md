# Verdict — b10-failure-alert-mail
Cycle checked: 0
Resume: 1 (fix cycle 0; the first pass on 6a2cbd7c was stopped for a review finding and wrote no verdict)
Verdict: PASS
Checker: /checker Mode A, single coordinator, bound to D:/KnowledgeBase/.worktrees/b10-failure-alert-mail (branch wave/b10-failure-alert-mail)
Base: 063a9b79 · Head checked: c8071e2e (code and tests; manifest commit 47f76149 adds only the manifest). Never judged: 6a2cbd7c (superseded).
Policy-Version: proportional-verification/2026-11-22.19
Contract: qa/contracts/meeting-bot-failure-alert-mail.md as amended by the checker at 1fffeefe (main tree). CONTRACT-GAP[B10-C2,B10-C7] is RESOLVED: the amendment drops the hyphen from the delimiter class and the repaired code matches it.
TIER: M (dispatched M; `tick.mjs --route 063a9b79..6a2cbd7c` -> `{"floor":null,"dual":false}`; no L trigger in the four product/test files, no raise). Single check; `Dual check: no` accepted.

## Check plan (step 0)
Signals: logic changed (reason lookup, launcher stderr read) -> affected tests plus the falsification floor. No UI, prompt/LLM output, data artifact, hook/config/auth change, no persona walk. One check type only, no sub-checkers. SERIAL: one test process at a time (low free memory); no sub-checkers spawned.
Step 4c: I read the whole product diff (lifecycle-alerts.mjs, reconnect-gaps.ts) and both test diffs on the repaired range, plus the siblings: alerts.ts (describeAlert), gws-channels.ts (buildRawEmail), telegram-channel.ts (notifiableReason), run-pipeline-deps.mjs, manual-jobs/worker.ts, dispatch.mjs.

## Rulings under the amendment rule (contract 1fffeefe; routine tighten/correct, no criterion softened for an artifact)
(a) Capture id in the mail: folded in. The premise was wrong (describeAlert and buildRawEmail do not print sessionKey; alerts.ts is byte-equal under B10-I1). B10-C3/C4 assert the id on the alert input given to `raise`.
(b) 35 s bound: folded in as the true ceiling of the existing retry code, 3 attempts x 30 s = 90 s; measured 2 attempts = 60 s per tick.
(c) Delimiter: hyphen removed from the class (C2, C7b, decision clauses 3 and 8) because listed names and real reasons contain hyphens (`rescheduled-completed` is written at auto-record-policy.ts:144). Confirmed on 6a2cbd7c, fixed in c8071e2e.

## Criteria (every row from my own runs on c8071e2e)
| id | Result | Evidence |
|---|---|---|
| B10-C1 | MET | One `capture-failed` send for X across 4+ ticks and a failing retry; Y gets its own; no repeat. Falsified: sessionKey made per-tick unique -> red. |
| B10-C2 | MET | Exact names, `name: x`, `name - x`, `name, x` match; `rescheduled-completed`, `cancelled-by-host`, `retry-limit-reached`, `admission_denied-x`, `_x`, `x2` do not; `''` and non-strings give `Coverage requires review.`. Falsified twice: delimiter test short-circuited -> red; `\x2d` re-added to the class (C2h) -> red. |
| B10-C3 | MET | `admission_denied: <fake secret>` -> `Coverage: admission_denied.`; decoded raw mail has no secret; event label present; sessionKey asserted on the input to `raise`. Falsified: detail uses the whole reason -> red. |
| B10-C4 | MET | Fake child through the real launcher rejects `admission_denied: Recording pipeline exited <code>` with `code`; scheduler path gives the failed row that reason; one fake mail. Falsified: launcher returns the plain error -> red. |
| B10-C5 | MET | Sender throws / exits non-zero / hangs: row status and reason unchanged, tick returns, log line only; test asserts at most 3 attempts and at most 90 s, measured 60000 ms over 2 attempts. Falsified: `.catch` rethrows -> red. |
| B10-C6 | MET | run-pipeline-deps.mjs and telegram-channel.ts byte-equal to base; Telegram unset -> `disabled`, set (fake) -> same text; failure mail enqueued with the existing path. Falsified: enqueueNotification dropped -> red. |
| B10-C7 | MET | (a) other name leaves message unchanged, no secret in row, logs or mail; (b) near-misses and `admission_denied-x` keep the plain message; (c) the LAST marker line wins; (d) 64 KiB most-recent window. Falsified: .shift() for .pop() (C7a) -> red; window cap dropped (C7d) -> red; hyphen re-added in reconnect-gaps.ts (C7h) -> red; end-delimiter test bypassed (C7x) -> red. |
| B10-I1 | MET | alerts.ts blob c733f7125542 equals base; ALERT_KINDS, outbox rules, cap of 3/hour, digest, HANDOFF set not in the diff; existing assertions in the two test files unedited (additions plus import-line extensions only); alerts.test.ts and alert-retries.test.ts green. |
| B10-I2 | MET | No address literal or credential added; recipient path (config.ts) untouched; mail has one To, no Cc or Bcc (decoded in the tests). |
| B10-I3 | MET | capture-started / capture-done paths and rate limit not in the diff; their tests green. |
| B10-I4 | MET | `git diff 063a9b79..c8071e2e --stat`: lifecycle-alerts.mjs, lifecycle-alerts.test.mjs, reconnect-gaps.ts, reconnect-gaps.test.ts, plus the maker manifest and my checkpoint (protocol files). run-pipeline.mjs, cli.ts, config.ts, gws-channels.ts untouched. Only the one list name is kept from stderr; nothing else stored or logged. |
| B10-I5 | MET | Harness uses the real createCanonicalAlerts / raiseAlert / flushFailureDigest with a fake gws runner and a temp stateDir; no network, no real gws, no `.env` read. |

## Commands re-run by me (cwd worktree root unless noted; node 22, win32)
- `node --test scripts/webinar/scheduler/lifecycle-alerts.test.mjs scripts/webinar/scheduler/alert-kinds.test.mjs` -> 19 pass, 0 fail.
- `node --test --import tsx src/autojoin/alerts.test.ts src/autojoin/alert-retries.test.ts src/capture/notify/telegram-channel.test.ts src/capture/reconnect-gaps.test.ts` (cwd packages/meeting-bot) -> 47 pass, 0 fail.
- `node --test scripts/webinar/run-pipeline.test.mjs` -> 23 pass, 0 fail.
- `tsc --noEmit -p packages/meeting-bot` -> exit 0.
- Blobs judged: lifecycle-alerts.mjs 3c2257cf3a4d, reconnect-gaps.ts bc213a8e8af0 (both equal `git rev-parse c8071e2e:<file>`).

## Capability coverage (falsification in a throwaway copy under the session scratchpad, outside the bound root)
Runner: one mutant at a time, per-mutation byte backup, restore in `finally` and on SIGINT/SIGTERM, 120 s test timeout, `git hash-object` equals `git rev-parse c8071e2e:<file>` after every mutation (all 12 printed hash==HEAD). Green before, red after for 11: C1, C2, C2h, C3, C4, C5, C6, C7a, C7d, C7h, C7x. Floor (one per changed criterion C1..C7) met. Survivor: C7e (drop the `lines.shift()` on a truncated window): essentially equivalent, because the partial first line cannot start with the marker unless the cut falls exactly on it; a note, not a finding. Junctions in the copy are unlinked (link only); the worktree node_modules is intact.

## Notes (non-blocking)
- Mutants: 12 against floor 7 plus cap 3 = 10, two over (policy .17-3). Filed as one low `process` row, not a backlog unit.
- manual-jobs/worker.ts swallows the launcher error, so the new message and `code` do not reach it; Telegram `notifiableReason` is a whitelist, so the longer reason still maps to `pipeline-failed`. Neither is a defect of this unit.
- NOT-MEASURED: a real `gws` send and a real Meet admission denial (excluded by B10-I5 and the no-network rule); the live recipient address. These belong to go-live G08, not to this check.
- full-suite trigger: none (no shared signature changed, no L trigger).

ISSUES-WRITTEN: ISS-B10FAILUREALERTMAIL-001 (low, process; qa/issues.B10FAILUREALERTMAIL.jsonl)
PROPOSED-ISSUE: none
HUMAN_GATE-REQUEST: none
Metrics: start=2026-11-25T10:34:00Z end=2026-11-25T10:42:00Z wall_min=8 agent_min=8 blocked_min=0 suite_runs=4 repeat_runs=0 mutations=12 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=480 mutants=12 defects_unit=0 defects_6c=0 slow: mutation runner anchors re-done after the regex change (hash mismatch from a stale REF, fixed)
