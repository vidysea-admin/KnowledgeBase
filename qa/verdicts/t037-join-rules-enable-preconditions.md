# Verdict: t037-join-rules-enable-preconditions

VERDICT: PASS
Cycle checked: 0
Commit checked: f134de6 (lane/jrenable)
Scope: source scope. Enforcement is NOT enabled by this unit and nothing here validates it; no live tick, no network.

## EXPLANATION

The unit builds one thing (a log-text change in `key-tenant.ts`) and classifies the before-enable list. I re-read the list in `qa/contracts/t037-join-rules-veto-select.md` ("BEFORE-ENABLE LIST (updated)") and D-125 ("must not be enabled until the before-enable list ... holds") and agree with the maker's classification of every item. No decision-free code item was left unbuilt; nothing "done already" is incomplete.

### Corrected classification table (no corrections needed; evidence is mine)
| # | Item | Class | Check |
|---|---|---|---|
| 1 | W3 fail-closed vs fail-open | OWNER DECISION | contract: "Approver records fail-closed vs fail-open in DECISIONS ... OPEN". Both policies already exist; tests "invalid rules file ... ONE loud log", "DEFAULT PARITY" (join-rules-enforce 18/18). Alert hook is a separate unwired formatter. |
| 2 | Unrecognised value loud | DONE | contract "MET"; join-rules-enforce-preconditions 12/12 green. |
| 3a | Tick verifies key tenant | DONE in code | contract "MET IN CODE"; key-tenant 8/8 green. |
| 3b | `sessions` scope or `X-LKB-Tenant` on `/meeting-candidates` | OWNER/OPERATOR DECISION (+ apps/api change) | contract: "the tick's key must hold `sessions`, OR the API must set `X-LKB-Tenant` ... the second is preferable"; a choice between two, outside this package. |
| 4 | W6 series ids | OWNER DECISION, not buildable here | `AutoRecordItem` (core webinar-types.ts) has no series id; `normalizeCalendarEvent` sets `sourceId: e.id`. `CalendarEvent.recurringEventId` exists in core, so the data is reachable, but adding the field is a core type change plus the product choice "an opt-out for a series id does not remove an instance id". ISS-JRENABLE-002 is accurate. |
| 5 | W7 gate (b) / id-only gap | DONE for recorded scenario (source scope); residual OWNER ACCEPTANCE | contract "gate (b) is MET for the recorded scenario"; "Or the Approver accepts the id-only gap in writing"; "the live-browser check is still owed". |
| 6 | Web flag `JOIN_RULES_ENFORCED` | OWNER switch, same change as enabling; apps/web | contract: "flip ... in the SAME change that makes the scheduler enforce". |
| 7 | Live tick, non-production tenant | LIVE RUN | The `--dry-run` claim is TRUE: `schedule-tick.ts` runs `enforceJoinRules` (line 253) before the `if (dryRun)` return (line 262); `join-rules-enforce.ts` has no write/mkdir/save/rename. Note: a dry run still makes the read-only network calls (candidate fetch, `GET /webinar-operations`). |
| 8 | ISS-376 | OWNER DECISION | contract "(8) ISS-376 (Approver's). OPEN." |

Owner decisions blocking enforcement: item 1 (W3), 3b (scope or header), 4 (W6), 5 residual (Approver acceptance in writing), 6 (flag flip, same change), 8 (ISS-376), plus the live run (7).

### Code change
- Diff read: only the `!res.ok` branch changed. Outcome is `unknown(...)` -> `null` for every status exactly as before; the new `status` is only used in the message; the 2xx path and header read are untouched. Error statuses with a tenant header stay null (test 3).
- Interpolated into the log: `KEY_TENANT_PATH`, the numeric status, and a fixed `STATUS_HINT` string. The key, body and header value are never interpolated (test 4 asserts this; my mutation C, which logs the key, turns it red).
- `LKB_JOIN_RULES_ENFORCE`: diff touches no `.env.example`, apps/ or enforce file; default unchanged (`.env.example` line 63 still empty).

### Runs (packages/meeting-bot, each under timeout, no browser/network)
key-tenant-hints 5/5; key-tenant 8/8; join-rules-enforce 18/18; join-rules-enforce-preconditions 12/12; schedule-tick 14/14; auto-join 39/39; join-rules-select 11/11; `tsc --noEmit` exit 0.

### Mutations (own harness `.mut-jrenable-chk-harness.mjs`, per-mutation byte backup restored in `finally`, application verified by byte compare, deleted afterwards)
- A swap the 401 and 403 hint texts: KILLED (hints 1 fail).
- B change an outcome (403 falls through to the 2xx path): KILLED (hints 3, key-tenant 1 fail).
- C log the API key: KILLED (hints 2, key-tenant 1 fail).
- D drop the 503 hint: KILLED (hints 1 fail).
(A first attempt at A only reordered the entries, an equivalent mutant; redone as a real swap.) 4/4 killed.

### After
`git hash-object key-tenant.ts` = `git rev-parse HEAD:<file>` = a3fcfa94; harness deleted; `git status --porcelain` clean in the worktree and the main tree before the commit.

ISSUES-WRITTEN: none
Notes: ISS-JRENABLE-001 (low, lint-dirsize calendar 31 vs 30, identical at b9e6f80) and ISS-JRENABLE-002 (medium) are the maker's and are accurate; neither is a defect of this unit.
