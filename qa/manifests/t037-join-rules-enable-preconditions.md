# t037-join-rules-enable-preconditions

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap T-037; closes what can be closed of the BEFORE-ENABLE LIST in `qa/contracts/t037-join-rules-veto-select.md` without an owner decision).
Security class: decides which meetings the bot records - FULL ceremony, never round-capped.
Lane: `lane/jrenable` (worktree `KnowledgeBase-lanes/jrenable`, from b9e6f80), ledger shard `qa/issues.jrenable.jsonl` (ISS-JRENABLE-001, -002). Existing ledger rows untouched.

## Scope
NOTHING IS ENABLED. `LKB_JOIN_RULES_ENFORCE` default is unchanged (`off`); `.env.example`, `apps/web` (`JOIN_RULES_ENFORCED`) and every enforcement path are untouched.
The honest result is that the before-enable list holds almost no pure-code item that is still open: items 2 and 3 (code) were already built; what remains is owner decisions, a deployment step and a live run. This lane built the one decision-free remainder and classified the rest from the code and the ledger.

### Built
`join-rules-wiring/key-tenant.ts`: when the tenant check cannot verify, the log line `key tenant NOT verified (GET /webinar-operations -> N)` now names the cause for the three statuses whose meaning is known: 401 (key rejected), 403 (key lacks the `sessions` scope, ISS-TENANTSIG-001), 503 (the API's operations state is unavailable: an API-side fault, not a tenant mismatch, ISS-TENANTSIG-002). Other statuses keep the old text. Why: under fail-closed an unverifiable tenant stops ALL recording for the tenant, signalled only by this line; ISS-TENANTSIG-002's own fix_direction says the operator must be able to tell an operations-state fault from a tenant problem. Fixed text only: the key, the response body and the header value are never logged. The OUTCOME for every status is unchanged (null = unverified).

## Before-enable list, item by item (list from the contract's "Tenant verification" section, plus W1-W7)
| # | Item | Class | Evidence / quote |
|---|---|---|---|
| 1 | W3 policy: fail-closed vs fail-open, log vs alert (ISS-T037VETO-003) | NEEDS OWNER DECISION | "W3: Approver records fail-closed vs fail-open in DECISIONS, accepting that fail-closed stops all recording on any unverifiable/mismatched/unreadable condition and fail-open silently drops opt-outs in the same conditions; log line vs alert." Not decided here. The code halves of W3 are already done and tested: both policies exist; a loud log carrying the validation message once per enforcing tick; flag defaults to today's behaviour (`join-rules-enforce.test.ts`: "invalid rules file: fail-closed ... ONE loud log carrying the validation message", "... fail-open ... ONE loud warning", "DEFAULT PARITY"). The alert hook is not in the tick (alerts/ formatter is unwired, ISS-R1ALERTS-009; lane/alerttenant) |
| 2 | Unrecognised value is loud (ISS-T037WIRE-002) | DONE ALREADY | contract: "(2) unrecognised value is loud MET"; `join-rules-enforce-preconditions.test.ts` (12/12), verdict `qa/verdicts/t037-wiring-enable-preconditions.md` |
| 3a | Tenant agreement: the tick verifies the key's tenant (ISS-T037WIRE-001, W4) | DONE ALREADY (in code) | contract: "MET IN CODE"; `join-rules-wiring/key-tenant.test.ts` 8/8, verdict `qa/verdicts/t037-tick-verifies-key-tenant.md`. This lane adds cause text to its log (BUILT, `key-tenant-hints.test.ts` 5/5) |
| 3b | Tenant agreement, deployment: the tick's key holds `sessions`, or the API sets `X-LKB-Tenant` on `GET /meeting-candidates` (ISS-TENANTSIG-001 high at enablement; ISS-TENANTSIG-002 medium) | NEEDS OWNER/OPERATOR DECISION (plus an API change outside this package) | contract: "the tick's key must hold `sessions`, OR the API must set `X-LKB-Tenant` on `GET /meeting-candidates`. From a least-privilege view the second is preferable"; ISS-TENANTSIG-001 fix_direction: "Approver/operator decision". The API one-liner is in apps/api (not editable in this unit); granting the scope is an operator act. Then it must be shown on a live tick (item 7) |
| 4 | W6 recurring series ids | NEEDS OWNER DECISION, and not buildable in this directory | contract W6: "an opt-out for a series id does not remove an instance id. The opt-out UI/API must record the id of the instance (or wiring must expand series)". Whether opting out a series should remove its instances is a product choice; and `AutoRecordItem` has no series id (`recurringEventId` is dropped in `auto-join.ts normalizeCalendarEvent`; core type). Filed as ISS-JRENABLE-002. The Calendar page already records instance ids |
| 5 | W7 gate (b) / Approver acceptance of the id-only gap | DONE ALREADY for the recorded scenario (source scope); residual NEEDS OWNER ACCEPTANCE | contract "W7 gate (b) status": "gate (b) is MET for the recorded scenario once lane/calopt is merged" - merged at 108743a (in this base). Residuals left open by the checker: no derivable identity for a Zoom registration link; a Gmail copy with a different link form; "the live-browser check is still owed". "Or the Approver accepts the id-only gap in writing." |
| 6 | Web flag `JOIN_RULES_ENFORCED` flipped in the same change | NEEDS OWNER (the switch itself); not buildable here | contract: "Wiring unit must flip `JOIN_RULES_ENFORCED` in apps/web/src/pages/join-rules/enforcement.ts to true in the SAME change that makes the scheduler enforce, update the tests that pin it false". apps/web is outside this package, and doing it now would make the UI claim enforcement that is off |
| 7 | A live tick with enforcement on in a non-production tenant: real opt-out, broken file, wrong `LKB_TENANT_ID`, key without scope | NEEDS A LIVE RUN | Not run here (no network/API). The tick's `--dry-run` already applies enforcement and writes nothing (`schedule-tick.ts`: the dry-run return comes after `enforceJoinRules`), so the run needs no code: set `LKB_JOIN_RULES_ENFORCE` for that one process only, against a non-production tenant, and read the log for `JOIN RULES WARNING` / `key tenant NOT verified` lines. The new cause text makes the "key without scope" and "operations state" cases readable |
| 8 | ISS-376 | NEEDS OWNER DECISION | contract: "(8) ISS-376 (Approver's). OPEN." Not touched; the veto only removes on an explicit refusal |
| - | W1, W2, W5 (W1 reasons, W2 collapsed ids, W5 real evaluator) | DONE ALREADY | contract "Wiring status": "W1, W2, W5 met by the wiring" |
| - | ISS-T037WIRE-003 (a Promise evaluator result is read as keep) | NEEDS CONTRACT-OWNER DECISION, not changed | contract clause 4 and W5 say keep; unreachable in production (synchronous evaluator, test seam only) |

Remaining gap to enabling: owner decisions on items 1, 4, 5-residual, 8; the `sessions` scope or the API header (3b); flipping the web flag in the same change (6); one live dry-run (7). No pure-code item is left on the list.

## Open issues named in the task
- ISS-T037VETO-003: item 1; not decided. ISS-TENANTSIG-001/-002: item 3b (log cause text added; issues stay open). ISS-WIREPRE-001/-002 and ISS-T037WIRE-001: superseded by the header check in code (contract), deployment half is 3b; statuses are the checker's. ISS-JRLOCK-002 (api/web busy-contract pins) and ISS-T037OPT-002 (web page sending hints; gate (b) text says met in source scope): both live in apps/api / apps/web, outside this package, not touched.

## Files
- `packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts` (edited, +10/-1)
- `packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts` (new, 5 tests)
- `qa/issues.jrenable.jsonl` (new, 2 rows), this manifest.
Shared with held lanes: NONE of schedule-state.ts, schedule-tick.ts, alert-who-command.ts, send-now-command.ts, tombstone/*, calendar-client.ts, auto-join.ts. Only `key-tenant.ts` (and its subdirectory) is edited; no merge conflict expected. The new test went into the subdirectory because the calendar directory is already over budget (ISS-JRENABLE-001).

## Evidence (packages/meeting-bot, node off PATH, one file at a time; no browser, Chrome, OBS, Google or network)
- `node --test --import tsx src/calendar/join-rules-wiring/key-tenant-hints.test.ts` -> tests 5, pass 5, fail 0.
- `... key-tenant.test.ts` -> tests 8, pass 8, fail 0 (unchanged).
- `... join-rules-enforce.test.ts` 18/18, `join-rules-enforce-preconditions.test.ts` 12/12, `schedule-tick.test.ts` 14/14, `auto-join.test.ts` 39/39, `join-rules-select.test.ts` 11/11.
- `node <repo>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.
- `node scripts/lint-dirsize.mjs` -> FAILS on `packages/meeting-bot/src/calendar: 31 files (budget 30)`, identical on an unmodified b9e6f80 (this lane adds no top-level file); apps/api/src and apps/api/src/routes also over. Filed ISS-JRENABLE-001.
- Recorded reproductions: no issue is closed by this lane, so none replayed. The ISS-TENANTSIG-001/-002 evidence (403 without scope; 503 operations state) is exercised as the 403 and 503 cases of the new test, which assert the log names the cause and the result is still null.

### Mutations (own harness `.mut-jrenable-harness.mjs`, untracked, deleted; per-mutation byte backup restored in `finally`; 120 s timeout; every mutation confirmed applied)
4/4 KILLED: 403 cause text removed; 503 cause text removed; one cause applied to every status; header read on an error status. Afterwards `git hash-object key-tenant.ts` was checked against the committed blob (see commit).

## For the checker
Verify: the classification above against the contract text (especially that item 3a is genuinely complete and 3b is a deployment/owner step, and that nothing in item 4 can be built without a core type change plus a decision); that the log change alters no outcome (the existing key-tenant tests are unchanged and green); that enforcement remains off by default and nothing in the diff sets an enabling value.
