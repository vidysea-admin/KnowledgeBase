# t037-join-rules-edit-api

Status: ready-for-check
Fix cycle: 0
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

## Route table (all require a valid key AND scope `calendar`; tenant = `req.auth!.tenantId`)

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
- Scope reuse: one `calendar` scope guards both read and write (no separate write scope exists in the key scheme); any `calendar` key can change what auto-joins.
- No audit trail of who changed rules; no per-rule PATCH/DELETE; no endpoint to revoke an approval or opt-out (the engine has no such helper).
- GET is not under the lock (the store's atomic rename keeps reads whole).
- Body-size cap is express.json's default 100 kB, below the store's 1 MiB cap; oversize is 413 either way.
- Rate limiting is only the server-wide per-key limiter.
- Not run: depcruise on the whole repo, the full apps/api suite, other lint:structure checks, mutation testing beyond the lock mutation (checker's job).
