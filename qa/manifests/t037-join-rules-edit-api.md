# t037-join-rules-edit-api

Status: ready-for-check
Fix cycle: 1
Priority tier: 3 - next unblocked roadmap task (T-037)
Security class: auth + tenancy + data writes (edits the data that decides a no-click join) - FULL checker ceremony
Exit criterion advanced (docs/meeting-bot-roadmap.md:60): "rules are editable, and a trusted sender's next webinar is scheduled with no click" - the API half of "rules are editable" only.

## Scope

Delivered: an injected-dependency Express router (`createJoinRulesRouter(deps: JoinRulesDeps)`) mounted in `createServer`, plus the structural `JoinRulesDeps` interface. NOT delivered: no web UI, no scheduler switch-over, **no production wiring** (below), no sender-trust change (`isTrustedSender`, `auto-join.ts`, `gws-gmail.ts`, `store.ts`, `sender-authentication.ts`, engine and store untouched). **T-037 stays in progress.**

## Files

- `apps/api/src/join-rules/deps.ts` (35) - structural `JoinRulesDeps` + value types (no meeting-bot import)
- `apps/api/src/join-rules/router.ts` (135) - router, per-tenant lock, `unavailableJoinRulesRouter`
- `apps/api/src/join-rules/router.test.ts` (273, 13 tests) - HTTP over real `createServer`, faithful in-memory store fake
- `scripts/qa/join-rules-edit-api.test.ts` (~120, 4 tests) - real store + real engine validator round trip through the real router
- `apps/api/src/server.ts` (+5 lines, now 114): optional `ServerDeps.joinRules`; absent -> 503 router (fail closed)
- A new sub-directory was used because `apps/api/src/routes` (30 files) and `apps/api/src` (31) are at their budgets.

## Route table (cycle 0 table; the scope per route CHANGED in fix cycle 1, see below)

| Verb path | Body | Result |
|---|---|---|
| GET /calendar/join-rules | none | 200 `{ruleSet, state}` (missing file gives empty) |
| PUT /calendar/join-rules | a rule set `{version, ownDomains, rules}` | 200 `{ruleSet, state}`; rules replaced, stored state preserved |
| POST /calendar/join-rules/approvals | `{kind: "sender" or "domain", value}` | 200 `{state}` |
| POST /calendar/join-rules/opt-outs | `{eventId}` | 200 `{state}` |

Statuses: 401 no/invalid key; 403 missing scope; 400 invalid/unknown-field/non-object body (incl. any `tenantId` or `state` field); 413 body over the express.json limit (100 kB) or store size cap on save; 500 `join_rules_unavailable` (generic message, no path/store text) for corrupt / wrong-tenant / non-regular / write-failed store; 503 when no store is wired.

## Design

- Tenant and auth: copied from `routes/calendar.ts:39` (`requireScope("calendar")`) and `:53/:55` (`req.auth!.tenantId`); `requireAuth` is mounted before it in `server.ts`. URL path, query and headers are never read for a tenant; body fields outside the allowed list (so `tenantId`) are rejected 400.
- Validation: PUT calls `deps.validateRuleSet` (the engine's `validateJoinRuleSet` when wired); no second validator in apps/api. Approval/opt-out bodies get only structural type/length checks; value validity (email/domain) is the engine's, surfaced as store code `invalid`.
- State preservation: PUT does `existing = await deps.load(tenant)` FIRST, then validates, then `save({ruleSet: validated, state: existing.state})`. The body cannot carry state. A failing load (corrupt, tenant-mismatch) aborts before any write. Approvals/opt-outs also `load` first so a later store `invalid` can only mean a bad value (400), not a corrupt file (500).
- Concurrency: per-tenant promise-chain mutex inside the router (`withTenantLock`) covers PUT, approvals and opt-outs; other tenants are not blocked. **Multi-process writers are still unsupported** (the store's read-modify-write is unlocked; a second API process or the scheduler writing the same file can still lose updates).
- Production wiring: **NOT delivered.** `buildProductionDeps()` (apps/api/src/composition/production.ts) lives in apps/api and `.dependency-cruiser.cjs` rule `apps-only-ask-ingest-index-ai-db-core` forbids apps/* -> packages/meeting-bot; no composition point outside apps/api builds `ServerDeps` (`index.ts` only calls `buildProductionDeps()`). Until a lawful composer (or a rule change by the Approver) supplies `joinRules` = `{load: t => loadJoinRules(dir, t), save: (t, v) => saveJoinRules(dir, t, v), validateRuleSet: validateJoinRuleSet, recordApproval: (t, a) => recordTenantApproval(dir, t, a), recordOptOut: (t, id) => recordTenantOptOut(dir, t, id)}` with the state dir bound, the deployed routes answer 503. `scripts/qa/join-rules-edit-api.test.ts` shows that exact binding type-checks.

## Evidence

Run from `C:\Users\product\Desktop\KnowledgeBase-lanes\t037api` (lane `node_modules` junctions into the main tree), codex Node on PATH.

- `cd apps/api && node --test --import tsx src/join-rules/router.test.ts` -> tests 13, pass 13, fail 0.
- `cd apps/api && node --test --import tsx src/join-rules/router.test.ts src/server.test.ts src/routes/calendar.test.ts` -> tests 33, pass 33, fail 0.
- `node --test --import tsx scripts/qa/join-rules-edit-api.test.ts` -> tests 4, pass 4, fail 0.
- `cd apps/api && node <main>\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.
- One-off tsc of `scripts/qa/join-rules-edit-api.test.ts` (temp tsconfig, since removed) -> exit 0. It first FAILED (`platform: string` vs engine `Platform`); `deps.ts` was corrected to the literal union, so the real store/validator are assignable to `JoinRulesDeps` without a cast.
- `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs --config .dependency-cruiser.cjs apps/api/src/join-rules apps/api/src/server.ts` -> "no dependency violations found (123 modules, 273 dependencies cruised)".
- `node scripts/lint-dirsize.mjs` before and after: `OK (109 dir(s))` then `OK (110 dir(s))`.
- `node scripts/lint-loc.mjs`: FAIL with 8 PRE-EXISTING violations, none in this unit's files (join-rules.ts:309 is the untouched engine). New files are 35/135/273/~120 lines.
- Non-vacuity: replacing the lock (`const run = work();`) made "concurrent approvals ..." fail (12 pass, 1 fail); restored byte-identical (`cmp`), 13/13 again. The fake without the lock loses updates (own test).

No D-015 corpus applies (no filed issue is fixed). No new ledger issue filed (`qa/issues.t037api.jsonl` not created).

## Known limits / not delivered

- Production wiring (above); until then 503.
- Single-process lock only; no cross-process or file lock.
- Scope reuse: RESOLVED in fix cycle 1 (writes now need the dedicated `join-rules` scope, below).
- No audit trail of who changed rules; no per-rule PATCH/DELETE; no endpoint to revoke an approval or opt-out (the engine has no such helper).
- GET is not under the lock (the store's atomic rename keeps reads whole).
- Body-size cap is express.json's default 100 kB, below the store's 1 MiB cap; oversize is 413 either way.
- Rate limiting is only the server-wide per-key limiter.
- Not run: depcruise on the whole repo, the full apps/api suite, other lint:structure checks, mutation testing beyond the lock mutation (checker's job).

## Fix cycle 1 (checker cycle 0 verdict FAIL: ISS-T037API-001, ISS-T037API-002)

What failed: production code held on auth, tenancy and state preservation, but (001) no test pinned the tenant source on the write routes (mutations M1 header-tenant and M8 body-tenant survived), and (002) PUT and both POSTs were guarded by the read scope `calendar`.

### Fix
- Scope (002): new dedicated write scope `join-rules` (`WRITE_SCOPE` in router.ts). Scopes in this repo are free-form strings checked by `requireScope` (`auth.ts`); there is NO central vocabulary, enum, schema list or DB migration, so none was edited (`routes/keys.ts` accepts any non-empty string array; `schema/api_keys.schema.json` is `items: string`). No key issuance, storage, UI or enforcement-path file changed.
- Updated route table:

| Verb path | Scope required |
|---|---|
| GET /calendar/join-rules | `calendar` (read; same sensitivity as `GET /calendar/upcoming`, which already exposes the same meetings) |
| PUT /calendar/join-rules | `join-rules` |
| POST /calendar/join-rules/approvals | `join-rules` |
| POST /calendar/join-rules/opt-outs | `join-rules` |
| (unwired 503 router, any method) | `calendar` |

- GET choice: a `join-rules`-only key may NOT GET (403); least privilege, reading needs `calendar`. A write response still echoes the stored value of its own tenant. A key holding both works.
- Which existing keys hold `join-rules` after this change: NONE. Scopes are stored per key; nothing grants it implicitly and there is no wildcard or "all scopes" key type in the API. Two scripts mint keys with a hard-coded scope list: `scripts/mint-key.mjs` (`ALL_SCOPES`) and `scripts/demo/seed-demo-server.mjs`. They were deliberately NOT edited, so keys they mint also do not hold `join-rules`; adding it there (or issuing a key via `POST /keys` with `scopes:["join-rules"]`) is a deliberate step for the Approver. Production wiring is still not delivered, so no live exposure either way.
- Tests (001): `tenant-source.test.ts` (6 tests) and `scope-write.test.ts` (7 tests), helper `test-store.ts` (a byte-level store that spies the tenant argument of every dep call). Hostile hints: headers x-tenant-id, x-tenant, tenant-id, x-forwarded-tenant, x-tenantid, tenantid, tenant; 5 query variants; path variants; body fields tenantId, tenant, tenant_id, __proto__, constructor, prototype (string / object / array values, raw JSON so `__proto__` stays an own key) plus nested `meta`/`state`. Assertions: every dep call named tenant-a only; tenant-b stored bytes unchanged; tenant-a's change landed; GET returns tenant-a's value. Existing `router.test.ts` and the qa round-trip keys were given the `join-rules` scope (no other change).
- Part C: M6 (a failed save poisoning the queue) had only been killed incidentally by broad tests; added "a failed save does not poison the tenant queue" (scope-write.test.ts). M2/M7 are covered by the per-route 403 tests, M3 by the corrupt-file test, M4 by the concurrency test, M5 by the validation test; those were killed by tests about the property.

### Evidence (from the worktree; codex Node prepended to PATH; each under `timeout`)
- `cd apps/api && node --test --import tsx src/join-rules/router.test.ts src/join-rules/tenant-source.test.ts src/join-rules/scope-write.test.ts` -> tests 26, pass 26, fail 0 (before adding co.uk/verbatim rule to scope-write: 13+6+7); final `scope-write.test.ts` alone -> tests 7, pass 7, fail 0.
- `cd apps/api && node --test --import tsx src/server.test.ts src/routes/calendar.test.ts src/routes/keys.test.ts src/routes/pages.test.ts` -> tests 35, pass 35, fail 0. No test enumerates or snapshots a scope vocabulary (none exists); none needed updating.
- `node --test --import tsx scripts/qa/join-rules-edit-api.test.ts` -> tests 4, pass 4, fail 0.
- `cd apps/api && node <main>\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> exit 0.
- `node scripts/lint-dirsize.mjs` before and after: `OK (110 dir(s) within budget)`. Files: router.ts 139, test-store.ts 53, tenant-source.test.ts 138, scope-write.test.ts 94, router.test.ts 273.
- Mutations (per-mutation byte backup of router.ts held in memory, 100 s timeout per run, restore in `finally`, `git hash-object` compared to `git rev-parse HEAD:` after each; run on commit f608a7f):
  - M1 (tenant from `x-tenant-id` in guarded()): KILLED, failing: "every tenant-naming HEADER is ignored ..."
  - M8 (approvals takes tenant from body `tenant`): KILLED, failing: "a tenant named in the BODY ..." and "a valid approval/opt-out/PUT body carrying `tenant` ...".
  - Extra: GET tenant from header: KILLED (header test and the older client-supplied-tenant test); PUT / approvals / opt-outs each reverted to scope `calendar`: all three KILLED ("a calendar-only (read) key gets 403 ..." and "join-rules-only key ... may NOT GET" style tests); M6 poisoned queue: KILLED, including the new "failed save does not poison" test.
  - After every mutation `git hash-object router.ts` = `git rev-parse HEAD:router.ts` = 0051bd0ffc3d959aa6c87e6b61bcc4f4265e882f; worktree clean.
- D-015 counts against the ledger rows' own recorded reproductions: `ISS-T037API-001: 2/2` (M1 and M8, the two recorded survivors, both now killed; the row's other six mutations stay killed). `ISS-T037API-002: 4/4 refused` (recorded calendar-only key: PUT of `{version:1,ownDomains:[],rules:[{id:"a",effect:"allow",match:{platform:"meet"}}]}` -> 403, POST approvals `gmail.com` -> 403, `co.uk` -> 403, plus opt-outs -> 403; nothing read or written). None left open.

### Still not delivered
Production wiring (`joinRules` is not supplied by `buildProductionDeps`; deployed routes answer 503), cross-process locking, audit trail, revocation endpoints, UI. A key with `join-rules` must be issued deliberately before any write is possible.
