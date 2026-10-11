# t037-join-rules-busy-status

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 (follow-up found by integration check; ISS-JRLOCK-001, medium)
Security class: data-write route (join-rules PUT / approvals / opt-outs) - FULL ceremony
Lane: `lane/jrlock`, ledger shard `qa/issues.jrlock.jsonl` (ISS-JRLOCK-001 filed first, then fixed here)

## Scope

When the store reports `locked` (another writer holds the per-tenant lock; transient) the router returned the same 500 `join_rules_unavailable` as for `lock-failed`. Now one total status table in `apps/api/src/join-rules/router.ts` (`STORE_FAILURE: Record<JoinRulesStoreCode, ...>`; the union is declared structurally in `deps.ts`, so a new store code fails tsc until mapped). Applied by `storeFailure(res, e)` for PUT / approvals / opt-outs (via `guarded`) and GET. Stale comment at router.ts:14 fixed.

## Status table

| store code | status | body error | header |
|---|---|---|---|
| `locked` | 503 | `join_rules_busy` (fixed message) | `Retry-After: 5` (= store lock default wait 5000 ms) |
| `lock-failed`, `bad-tenant`, `corrupt`, `tenant-mismatch`, `not-a-file`, `write-failed`, unknown/non-store errors | 500 | `join_rules_unavailable` (fixed) | none |
| `too-large` | 413 `payload_too_large` on PUT save (call site, unchanged); 500 fixed from a stored file (unchanged) | | |
| `invalid` | 400 on approvals / opt-outs value (call site, unchanged); else 500 (unchanged) | | |
| no store wired | 503 `join_rules_unavailable` (unchanged; distinct by error code from busy) | | |

The store's message (lock path) never reaches body or headers (`fail` takes only table text).
GET: the store's `loadJoinRules` takes NO lock (store-lock manifest section A), so GET cannot normally see `locked`; it still goes through the same table (total mapping, tested with a throwing load).
Note: a STALE lock also reports `locked` (needs a manual delete, ISS-T037LOCK-001): 503 busy is accurate for the code but a retry will not help until a human acts; left as is (store unchanged).

## Web (source-scope, no browser run)

Before: a 503 busy would show "Rule editing is not available on this server yet." Change: `joinRulesClient.ts` classify returns new failure `busy` for 503 whose server message equals the API's fixed busy message (ApiError carries only the message, not the code; avoided touching shared `api/client.ts`); `JoinRulesPage.tsx` shows "Join rules are busy (another change is in progress). Wait a few seconds and try again." for save and load (load keeps its retry button). Coupling: the message string is duplicated in web and api (comment in both).

## NOT changed

Auth, scopes, tenant handling, the store, `api/client.ts`, qa/contracts, verdicts, enforcement paths, other ledger rows. No existing assertion edited (web test appended; router tests untouched). Files: router.ts 142 non-blank lines, busy-status.test.ts 104 (new, in `join-rules/`; `apps/api/src` itself gains no file).

## Evidence

```
cd apps/api; node --test --import tsx src/join-rules/{router,require-scope,scope-write,tenant-source,busy-status}.test.ts src/server.test.ts
ℹ tests 71  ℹ pass 71  ℹ fail 0
node --test --import tsx src/join-rules/busy-status.test.ts   -> tests 16 pass 16 fail 0
cd apps/web; node node_modules/vitest/vitest.mjs run src/pages/join-rules -> Test Files 2 passed, Tests 49 passed (49)
tsc --noEmit -p tsconfig.json: apps/api exit 0; apps/web exit 0
node scripts/lint-dirsize.mjs -> lint-dirsize: OK (112 dir(s) within budget)
```

D-015 `ISS-JRLOCK-001: 4/4` recorded reproductions (PUT, approvals, opt-outs `locked` -> 503 busy + Retry-After; `lock-failed` -> 500) pass; plus GET, unknown codes (`__proto__`, `constructor`, `toString`, `brand-new-code`), every other code, 413/400, no-store 503, table totality.

## Mutations (router.ts; per-mutation byte backup, restore in `finally`, 120 s timeout per run; harness in scratchpad, not committed)

| mutation | result | killed by |
|---|---|---|
| M1 `locked` -> 500 | fail 6 | "<route>: store code locked -> 503 ...", "503 'no store configured' stays distinguishable..." |
| M2 drop Retry-After | killed (the locked test failed) but the run hit the 120 s timeout, so fail count not printed | "GET: store code locked -> 503 join_rules_busy + Retry-After 5, no path leak" |
| M3 pass store message through | fail 13 | all "no path leak" tests, e.g. "GET: store code lock-failed -> 500 ..." |
| M4 `lock-failed` -> 503 | fail 6 | "<route>: store code lock-failed -> 500 ...", "every other store code ... fixed 500" |
| M5 GET ignores the error (no code) | fail 2 | "GET: store code locked ...", "503 'no store configured' ..." |
| M6 busy reuses unavailable code | fail 5 | locked tests, "503 'no store configured' stays distinguishable ..." |

After the run: all mutated tokens absent from router.ts; `git hash-object` identical across runs (file differs from HEAD only by this unit's intended change). Not verified: the web busy test was not mutation-tested; M2's timeout cause not investigated.
