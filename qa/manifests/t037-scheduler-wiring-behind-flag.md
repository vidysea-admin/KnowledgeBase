# t037-scheduler-wiring-behind-flag

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 (roadmap T-037: wiring precondition set W1-W7 of `qa/contracts/t037-join-rules-veto-select.md`); it also removes a false-assurance blocker (the web copy tells users an opt-out stops the bot while no scheduler applies join rules).
Security class: decides which meetings the bot records (data-write / recording decision) - FULL ceremony, never round-capped.
Lane: `lane/t037wire` (worktree `KnowledgeBase-lanes/t037wire`, from 8520fa8), ledger shard `qa/issues.t037wire.jsonl` (ISS-T037WIRE-001).
D-119 reserved-file check: D-119's Changes-authorized list names only packages/ai, scripts/upload|transcribe, qa/manifests/u4.1*; `packages/meeting-bot/src/calendar/schedule-tick.ts` is not reserved. No file here is reserved.

## Scope

Wire the existing veto layer into the scheduler tick BEHIND ONE SETTING. Enforcement is OFF: nothing is turned on, no config/script/host command enables it.

### The setting
`LKB_JOIN_RULES_ENFORCE`, read in exactly ONE place (`schedule-tick.ts buildRealScheduleTickDeps`, raw value into `deps.joinRulesEnforce`), parsed in exactly ONE place (`parseJoinRulesEnforce`, join-rules-enforce.ts), decided in exactly ONE place (`enforceJoinRules`).

| value | behaviour |
|---|---|
| `off` (DEFAULT; also absent, empty, `OFF`, `garbage`, `true`, `1`, any non-string, strings with spaces) | `enforceJoinRules` returns the selection itself (same reference) as its first statement: the store is never opened, `applyJoinRules` is never called, nothing is logged. |
| `fail-closed` | rules enforced for the tick's own tenant; if they cannot be read/evaluated NONE of that tenant's items are scheduled this tick, each skipped `rules-unevaluable` (detail without paths or file content), plus ONE loud log line. |
| `fail-open` | rules enforced when evaluable; if not, the selection is left exactly as today's and ONE loud warning is logged. Items individually unevaluable (evaluator threw) are put back; a genuine opt-out/deny in the same tick stays removed. |

Only the exact strings `fail-closed` and `fail-open` enable anything.

### Files
- `packages/meeting-bot/src/calendar/join-rules-enforce.ts` (new, 100 non-blank lines)
- `packages/meeting-bot/src/calendar/join-rules-enforce.test.ts` (new, 326 lines)
- `packages/meeting-bot/src/calendar/schedule-tick.ts` (+12 lines: 3 optional deps fields, 2 env reads in `buildRealScheduleTickDeps`, the `enforceJoinRules` call; 288 non-blank lines)
- `.env.example` (+2 lines: a one-line description and `LKB_JOIN_RULES_ENFORCE=` empty = off; not an enforcement path)
- `qa/manifests/t037-scheduler-wiring-behind-flag.md`, `qa/issues.t037wire.jsonl`
- calendar directory: 28 files (limit 30), +2.
NOT touched: qa/contracts, qa/verdicts, enforcement paths, apps/web, join-rules-store*.ts, ledger statuses of other rows.

## W-preconditions

- **W1 (dedicated reasons): MET.** `opted-out`, `rule-denied`, `rules-unevaluable` already exist in core `SkipReason` (earlier unit); the tick's skipped list carries them and `describeSkip` prints the true reason with its meaning (tests assert `skip [opted-out] ... the bot will not join it`).
- **W2 / W7 (opt-out identity): gates (a), (c), (d) already MET by earlier units; gate (b) STILL UNMET (ISS-T037OPT-002 / ISS-WEBHINTS-001: the join-rules page sends only `{eventId}`).** Residuals listed under "Not done".
- **W3 (invalid rule set policy): BOTH policies implemented; the Approver chooses by setting the value; enforcement is OFF.** Loud once-per-tick log carrying the validation message, flag defaulting to today's behaviour. Messages: only `invalid`/`corrupt`/`too-large` store errors show their message (control chars stripped, path-like text redacted, 300 chars max); `tenant-mismatch` (embeds the other tenant's name), `not-a-file` (path), `bad-tenant`, `lock-failed` report the code only.
- **W4 (tenancy): MET at the tick.** A tick serves one tenant (its API key; env `LKB_TENANT_ID` is the tick's own tenant). Rules are loaded for that tenant only (`load(stateDir, tenantId)` is the only store call; test records every tenant opened: only `ten-a`, with a deliberately corrupt `ten-b` file present). Items of more than one tenant cannot appear in one tick: the loaders use one `LKB_API_KEY`. A missing/invalid tenant id is "cannot be evaluated" (policy applies), never a guess. Caveat filed as ISS-T037WIRE-001 (medium): `LKB_TENANT_ID` is not verified to equal the API key's tenant (not observable client-side); the operator must confirm before enabling.
- **W5 (real evaluator, three arguments): MET.** `applyJoinRules(selection, rules, {state}, io.evaluate)` with `io.evaluate` undefined in production, so the default `evaluateJoinRules` runs; test asserts every evaluator call has exactly 3 arguments. A Promise/garbage result is read as keep (test, both policies); a throwing evaluator is unevaluable under the chosen policy.
- **W6 (recurring ids): NOT addressed**, unchanged (exact id match; series-id opt-outs do not remove instances). Listed under "Not done".

## Decisions

- **No rules file = no rules.** `loadJoinRules` returns an empty set; nothing removed, no warning, no file created (test, both policies).
- **`locked` / transient.** The store's load takes NO lock (confirmed in `join-rules-store.ts`: only mutations call `withTenantLock`; reads see old or new file via temp+rename), so `locked`/`lock-failed` should not occur on the read path. Defensive handling anyway: `locked`, `lock-failed`, EBUSY/EPERM/EACCES are retried up to 2 more times (waits 150 ms, 300 ms, injectable) using the store's own `loadJoinRules`; still failing means unevaluable under the chosen policy, NEVER "no rules". Non-transient errors (invalid, corrupt, tenant-mismatch) are not retried (test: 1 call).
- **Veto-only.** The result is always built from the input selection: removal by `applyJoinRules`, whole-tenant removal (fail-closed), or putting back an item the input already scheduled (fail-open). Nothing the input did not schedule can be scheduled.
- **ISS-376 / D-058 untouched.** The trust decision is not changed; opt-outs and denies apply on top of whatever `selectAutoRecordItems` produced (tests run with `everyWebinar: true`; an item with no explicit refusal comes back unchanged).

## Not done

- Nothing is enabled: no config, script, env default or host start command sets the variable.
- The web copy still says enforcement is not active; it was not edited (apps/web out of scope).
- ISS-376 (every-webinar mode skips the sender trust check) is the Approver's decision and untouched.
- W7 residuals: gate (b) unmet (page sends id only; ISS-WEBHINTS-001); the verbatim id-only opt-out (`optedOutEventIds:["calX"]` alone, calX absent from the selection) STILL lets g1 through (0/2 refused below), by design of the stored data; W6 series ids; the API-key tenant vs `LKB_TENANT_ID` coupling (ISS-T037WIRE-001).
- No retry budget tied to a tick deadline: the tick has none; the retry is at most 450 ms.

## One-line change to enable each policy
- fail-closed: set `LKB_JOIN_RULES_ENFORCE=fail-closed` (and `LKB_TENANT_ID=<tenant of LKB_API_KEY>`) in the host `.env`, then restart the tick process.
- fail-open: set `LKB_JOIN_RULES_ENFORCE=fail-open` likewise.
Reverting: empty the variable. Each of these is the Approver's decision.

## Evidence (all run from `C:/Users/product/Desktop/KnowledgeBase-lanes/t037wire/packages/meeting-bot`, node v24.19.0 from the codex runtime)

1. `node --test --import tsx src/calendar/join-rules-enforce.test.ts` -> `ℹ tests 18 / ℹ pass 18 / ℹ fail 0`.
   - Default parity (in suite): 200 seeded selections x 14 non-enabling values (undefined, "off", "", "OFF", "garbage", "true", "1", 1, true, null, " fail-closed", "Fail-Open", "fail-closed ", {}) = 2800 tick runs deep-equal to a direct `selectAutoRecordItems` reference AND to the reconstructed log lines; the injected `load` and `evaluate` spies: 0 calls; `<root>/join-rules` never created. Plus a real (non-dry) run: scheduler calls, persisted dedup keys and logs identical for every value, while a rules file that WOULD remove the item exists.
   - One-off pre-change comparison (script deleted after the run): the HEAD version of `schedule-tick.ts` copied beside the new one, 200 seeds x 7 values: `pre-change vs wired parity: 1400 tick comparisons identical (output + log lines), 357 scheduled items compared`.
   - Veto-only property: 300 seeded rules x selections (valid, invalid version, failing store with 6 error codes, throwing/Promise/undefined evaluator) x 4 modes (off, fail-closed, fail-open, garbage) = 1200 cases, 61 removed items, 16 fail-open restore cases: wired scheduled is always a subsequence (same objects, same order) of un-wired scheduled; `skipped` = un-wired skipped + one entry per removed item with reason in {opted-out, rule-denied, rules-unevaluable}; `off`/`garbage` return the same reference.
2. `node --test --import tsx` on `schedule-tick.test.ts` 14/14, `auto-join.test.ts` 33/33, `join-rules-select.test.ts` 11/11, `join-rules.test.ts` 24/24, `join-rules-store.test.ts` 21/21, `join-rules-store-lock.test.ts` 10/10, `join-rules-optout-identity.test.ts` 22/22, `src/send-now.test.ts` 28/28, `src/send-now-command.test.ts` 10/10; zero failures.
3. `node <repo>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot): no output (clean).
4. `node scripts/lint-dirsize.mjs`: FAILS on `packages/index/src/pipeline: 34 files (budget 30)`, a directory this unit does not touch (another lane's); calendar directory is at 28 of 30. Not introduced here.

### D-015 counts (ledger reproductions replayed through the REAL tick, real store in a temp root)
- ISS-T037VETO-002: 2/2 refused (g1 removed, reason `opted-out`; fail-closed and fail-open; calX present, state `optedOutEventIds:["calX"]`).
- ISS-T037W1-001 (the recorded scenario: calX opted out, Calendar returns nothing, gmail g1 alone): verbatim id-only state 0/2 refused (g1 still scheduled, named and asserted as the known open limitation, W7); same scenario with the opt-out recorded with a `meetingUrl` hint 2/2 refused; with the real `sessionKey` hint 2/2 refused. The issue stays open.
- ISS-T037VETO-003 (`{version:2}` rule set, 2 items): fail-closed 2/2 items skipped `rules-unevaluable` with one log line carrying the validation text; fail-open: selection unchanged, one warning.
- ISS-376: untouched, not measured.

### Mutations (harness `mut-t037wire.mjs`, lane-unique, in-worktree, deleted before commit; per-mutation byte backup, restore in `finally`, 200 s hard timeout, `git hash-object` equals the pre-run blob after the run) - 14/14 killed
| mutation | killed by (examples) |
|---|---|
| default flipped to enforcing | parse test; both DEFAULT PARITY tests |
| `true` accepted as enabling | parse test; DEFAULT PARITY |
| fail-closed behaves as fail-open | invalid file fail-closed; locked; tenant |
| fail-open behaves as fail-closed | invalid file fail-open; locked; tenant |
| missing file treated as invalid | no rules file (first run) |
| removed items re-added | opt-out by id; ISS-T037VETO-002; ISS-T037W1-001 (+6) |
| reason recorded as borrowed old reason (`untrusted-sender`) | invalid file fail-closed; veto-only property |
| log omitted | invalid file (both); path/tenant-name test (+2) |
| other tenant's directory used | 9 tests incl. tenant test |
| `locked` treated as no rules | locked-then-readable |
| off mode still opens the store | DEFAULT PARITY; veto-only property |
| fail-open restores real removals too | fail-open only restores UNEVALUABLE items |
| tick passes a fixed other tenant (schedule-tick.ts) | 9 tests |
| tick ignores the setting (schedule-tick.ts) | 13 tests |
(first run: 13/14; the survivor "fail-open restores real removals too" led to the added test, then killed.)

## Open for the checker / Approver
- W3 policy choice (fail-closed vs fail-open) and turning enforcement on are the Approver's. 
- ISS-T037WIRE-001 (tenant coupling) must be settled before enabling.
- The `describeSkip` text for `rules-unevaluable` says "could not be read or evaluated" for both the store failure and a throwing evaluator.
