# iss-unoptlock-002-join-rules-compare-and-set

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 2/3 (open ledger issue ISS-UNOPTLOCK-002, medium; step 1 of 3 toward ISS-T037UI-001, medium). Class: data write deciding whether the bot joins a meeting: full ceremony. Verdict by the checker only.
Lane: lane/rulescas. Lane ledger `qa/issues.rulescas.jsonl`: no findings filed (file not created). Existing ledger rows untouched.

## Scope
Only `packages/meeting-bot/src/calendar/`: `join-rules-store.ts` (edited), `join-rules-cas.test.ts` (new, 8 tests). Not touched: apps/api, apps/web, scripts/, the lock protocol.

## Exported API (what the next unit, apps/api, calls)
- `JOIN_RULES_ABSENT = "absent"`: the `expected` / validator value meaning no rule set stored yet (cannot collide with a 64-hex digest).
- `joinRulesValidator(ruleSet: JoinRuleSet): string`: sha256 hex over the recursively key-sorted, whitespace-free JSON of the VALIDATED rule set only (state excluded; array/rule order significant). Throws `JoinRulesStoreError("invalid")` on an invalid rule set.
- `loadJoinRulesWithValidator(stateDir, tenantId): StoredJoinRules & { validator: string }`: unlocked single read of one atomically replaced file (rule set, state, validator mutually consistent); missing file -> empty value with `validator === JOIN_RULES_ABSENT`; same fail-closed throws as `loadJoinRules`.
- `saveJoinRulesIf(stateDir, tenantId, expected: string, ruleSet: JoinRuleSet, io?: Omit<StoreOptions,"overwriteInvalid">): StoredJoinRules & { validator: string }`: inside the per-tenant lock (same `withTenantLock`/`writeAtomic`/`owns()` as `recordTenantUnOptOut`): load, compute stored validator, compare to `expected`; on match write `ruleSet` with the approval/opt-out state AS LOADED UNDER THE LOCK; returns the new validator. Mismatch -> throws `JoinRulesStoreError` with `code === "precondition-failed"` and `.currentValidator` (the stored validator, or `"absent"`), nothing written. Other errors: `locked`, `lock-failed`, `corrupt`, `invalid`, `tenant-mismatch`, `not-a-file`, `too-large`, `write-failed`, `bad-tenant`; empty/non-string `expected` -> `invalid`. A corrupt file is never treated as absent.
- `JoinRulesStoreError` gains the code `"precondition-failed"` and the optional `currentValidator` property.

## Legacy `saveJoinRules`: NOT hardened (decision)
Behaviour and signature unchanged; only a doc comment marking it LEGACY / UNCONDITIONAL with the hazard. Reason: every caller passes full state and relies on replacing it: the tests seed state with it (join-rules-enforce, -enforce-preconditions, -optout-identity, -unopt-lock, key-tenant, store, store-lock), `scripts/webinar/join-rules-host.ts` and `scripts/qa/join-rules-edit-api.test.ts` forward the caller's value, and the repair path (`overwriteInvalid`) is a deliberate replace. Preserving loaded state would break the seeding use. So until apps/api switches to `saveJoinRulesIf` (next unit), ISS-UNOPTLOCK-002 is STILL REACHABLE through the API PUT -> `saveJoinRules`, and ISS-T037UI-001 (no ETag in API/web) is open.

## Evidence (packages/meeting-bot; node off PATH; `timeout` around each; temp dirs; no browser/network)
- `node --test --import tsx src/calendar/join-rules-cas.test.ts` -> `tests 8, pass 8, fail 0`. Real-process tests (the replay with a real second process, and the 2-process concurrent CAS, seeded and absent), repeated 15 times: `15/15` runs green.
- `join-rules-store.test.ts` -> `tests 21, pass 21, fail 0`; `join-rules-store-lock.test.ts` -> `tests 22, pass 22, fail 0`; `join-rules-unopt-lock.test.ts` -> `tests 5, pass 5, fail 0`.
- Typecheck `tsc --noEmit -p tsconfig.json` in packages/meeting-bot -> exit 0 (run once, at the end).
- Not run: apps/api and scripts tests (outside this unit's scope; they import `saveJoinRules`, unchanged).

### Count against the ledger's recorded reproduction
`ISS-UNOPTLOCK-002: 4/4`. The test reads the row from `qa/issues.unoptlock.jsonl`, asserts its evidence text is still there, then replays it verbatim with a REAL second node process calling `recordTenantOptOut(cal1)` between the load and the save: (1) control, legacy `saveJoinRules(ruleSet, existing.state)`: file goes `['cal1']` -> `[]` and the decision is `join` (bug reproduces); (2) with `saveJoinRulesIf(existing.validator, ...)` the file still lists `['cal1']`; (3) decision is not `join`; (4) the new rule set was written and state kept. Reproduction left open: the legacy `saveJoinRules` path itself (control 1) is unchanged by design; it closes only when apps/api switches.
`ISS-T037UI-001: store half only — API and web not done` (validator, CAS, `precondition-failed` with current validator exist and are tested; no ETag/If-Match in API, no web editor handling).

Other tests: stale validator writes nothing and returns the current validator; absent succeeds only on empty store; opt-out and approval between an editor's load and save keep its validator valid and survive; key-order/format changes do not change the validator (also a hand-reformatted file on disk), content/rule order do; tenant A's validator is useless for B and cannot create C; `locked`, failed rename, lock replaced before the rename, corrupt file (also with `absent`) -> nothing written, opt-out still vetoes, no lock/temp debris.

## Mutations (5 tried; harness `.mut-harness-rulescas.mjs`, untracked, deleted; per-mutation byte backup restored in `finally`; SIGKILL timeout 150 s; afterwards `git hash-object join-rules-store.ts` = 6b446092c29d413063563693a6dc10316bf1fc7f, the committed blob)
KILLED: compare skipped (fail 4); validator includes non-rule data (fail 8); caller/empty state written instead of loaded state (fail 2). SURVIVED: removing the explicit key `.sort()` in `canonicalJson`: equivalent mutant, because `validateJoinRuleSet` already rebuilds objects in a fixed key order, so the sort is defence in depth. NOT RUN: "absent always matches" (my replace pattern did not match, the harness reported it); absent semantics are covered by tests only.

## NOT covered
- apps/api and the web editor still use the legacy path (see above).
- Same machine/local filesystem only; readers take no lock; a frozen lock holder beyond the takeover rule (ISS-LOCKTAKE-005, ISS-UNOPTLOCK-001) is guarded only by the pre-rename `owns()` check.
- The validator is per file content: two tenants with identical rule sets share a hash by design; the CAS is always evaluated against the requested tenant's own stored file.
