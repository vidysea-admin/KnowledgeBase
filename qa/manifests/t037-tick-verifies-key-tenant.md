# t037-tick-verifies-key-tenant

Status: ready-for-check
Fix cycle: 0
Priority tier: 2 (closes ISS-T037WIRE-001 / ISS-WIREPRE-002, HIGH at enablement, security class: decides which meetings the bot records). FULL ceremony, never round-capped.
Lane: `lane/tenantsig` (worktree `KnowledgeBase-lanes/tenantsig`, from 3055de9); new issues in `qa/issues.tenantsig.jsonl` (ISS-TENANTSIG-NNN).
Reserved files: none edited. `scripts/webinar/run-pipeline-deps.mjs` was READ only (its `validateTenant` is the pattern copied). Not touched: auto-join.ts, packages/core, join-rules-store*.ts, calendar-client.ts (no edit needed), apps/api, apps/web, qa/contracts, qa/verdicts, `.env.example`, ledger statuses.

## Scope
NOTHING IS ENABLED. `LKB_JOIN_RULES_ENFORCE` still defaults to off; with off nothing in this unit runs. This unit makes the already-built `tenant-mismatch` handling reachable in production and adds `tenant-unverified`. It does not recommend or perform enabling (W3 stays the Approver's decision).

## Where the tenant signal comes from
- Route: `GET /webinar-operations` (apps/api/src/routes/brain.ts:174-177), `requireScope("sessions")`, sets `X-LKB-Tenant` = `req.auth!.tenantId` (the authenticated key's tenant). It is the ONLY route that sets the header (grep of apps/api, scripts, packages). The sibling pipeline (`run-pipeline-deps.mjs` validateTenant) uses it the same way (`redirect:'error'`, 30 s timeout, body cancelled, header compared exactly).
- Do the tick's existing requests carry it? NO. The tick already calls `GET /meeting-candidates` (scope `gmail`) and `GET /calendar/upcoming?discovery=1` (scope `calendar`); neither sets the header. So the signal costs ONE extra request per ENFORCING tick (zero when off).
- Scope question: the tick's key is described only as "the key the scheduler uses" (`.env.example`); a least-privilege tick key needs `gmail` + `calendar`; `scripts/mint-key.mjs` mints all scopes including `sessions`. I did NOT silently add a request that 403s every cycle: when the key lacks `sessions` (or on any other failure) the tenant is "unknown" and handled as `tenant-unverified` (below), loudly. **Full closure for a tick key without `sessions` needs either (a) `sessions` granted to that key, or (b) an API change: `res.setHeader("X-LKB-Tenant", req.auth!.tenantId)` added to the `GET /meeting-candidates` handler (apps/api/src/routes/meeting-candidates.ts, one line, a route the tick already calls under its own key; then point `KEY_TENANT_PATH` there and the extra request disappears). Neither is done here.** Filed as ISS-TENANTSIG-001.

## Behaviour (only when the setting is exactly `fail-closed` / `fail-open`)
Per tick, after the selection and before the veto: `deps.loadKeyTenant()` (built by `buildRealScheduleTickDeps` from `createKeyTenantLoader(apiUrl, LKB_API_KEY, log)` in `join-rules-wiring/key-tenant.ts`) does `GET ${LKB_API_URL}/webinar-operations` with the SAME base URL and key as the candidate/calendar fetches (`redirect:"error"`, 15 s timeout, body cancelled; the key goes nowhere else; no key means no request). The header is read with `Headers.get` (name case-insensitive) and validated with the store's own validator (`joinRulesFilePath`, reused; no second regex). Result: a valid tenant id or `null` (unknown). A throwing loader is also `null`.

| key tenant vs LKB_TENANT_ID | reason | fail-closed | fail-open |
|---|---|---|---|
| known, equal | none | rules of that tenant applied exactly as at 3055de9 | same |
| known, different | `tenant-mismatch` | no rules read; every item skipped `rules-unevaluable`; nothing scheduled or recorded | selection unchanged, one loud warning |
| unknown (header absent/empty/multi-valued/invalid/uppercase, 401/403/5xx, network error, timeout, redirect, no key, loader threw) | NEW `tenant-unverified` | same as mismatch | same as mismatch |

Why `tenant-unverified` is distinct and not "no check": "could not verify" must never read as "verified". Under fail-closed nothing is recorded that tick (safe, loud); under fail-open the selection is today's, with the warning. A header differing from the configured tenant only by case (`TEN-A` vs `ten-a`) fails the store validator (lowercase-only), so it is `tenant-unverified`, not `tenant-mismatch`; the effect is identical (no rules applied under either policy), only the warning text differs.
Logs carry only fixed tokens: the raw header is never logged, no tenant ids or paths in the warning, the key is never logged.

## Per-tick verification, no cache
Verified every enforcing tick; nothing is cached. A key rotation changes the tenant and ticks are minutes apart, so one small request per tick is simpler and safer than reasoning about staleness. Pinned by a test (key tenant changes between ticks; the second tick sees it; request count 2).

## Files
- `packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts` (35 non-blank lines, NEW, in a NEW subfolder): loader.
- `packages/meeting-bot/src/calendar/join-rules-enforce.ts` (127): `keyTenantId === null` => `tenant-unverified`.
- `packages/meeting-bot/src/calendar/schedule-tick.ts` (297): `loadKeyTenant` dep, wired in `buildRealScheduleTickDeps`, called only when enforcing and no key tenant was injected.
- `packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts` (186, NEW).
- Directory budget: `packages/meeting-bot/src/calendar` still holds 28 loose files (limit 30); new files are in the subfolder `join-rules-wiring/`. `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (120 dir(s) within budget)`.
- Note for the checker: `join-rules-enforce-preconditions.test.ts` "production shape ... OPEN residual" still passes because it builds deps without `loadKeyTenant`; it no longer describes `buildRealScheduleTickDeps`. Not edited (existing test); the production-shape case is now covered by key-tenant.test.ts.
- Merge condition (checker): the stale "OPEN residual" test in join-rules-enforce-preconditions.test.ts was retitled/commented as a test-seam case (no key tenant supplied, not production); assertions unchanged.

## Evidence
node = `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`, run from `packages/meeting-bot`:
- `node --test --import tsx src/calendar/join-rules-wiring/key-tenant.test.ts`: tests 8, pass 8, fail 0.
- join-rules-enforce.test.ts 18/18, join-rules-enforce-preconditions.test.ts 12/12, schedule-tick.test.ts 14/14, auto-join.test.ts 33/33, send-now.test.ts 28/28: all pass, 0 fail.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: no output, exit 0.

### D-015 (ledger reproductions, verbatim, production shape: `buildRealScheduleTickDeps` + fake fetch returning `X-LKB-Tenant`)
- `ISS-T037WIRE-001: 2/2`. Recorded case: tenant A's rules opt out g1; run configured as B; the API reports the key's tenant as A. fail-closed: nothing scheduled, nothing recorded, g1 skipped `rules-unevaluable`, one `tenant-mismatch` warning. fail-open: g1 scheduled (selection unchanged, loud `tenant-mismatch` warning), B's rules never applied. Exactly one verification request in each.
- `ISS-WIREPRE-002: 2/2`. The signal exists and is now consumed: header read from `GET /webinar-operations`; the 20-case header/status table (key-tenant.test.ts "header table": missing, empty, whitespace, two values, comma list, invalid chars, path-like, device name, 10,000 chars, header name in another case (accepted), `TEN-A` (unknown), 401, 403, 403 with header, 500, network error, timeout, redirect) gives the specified result 20/20; the unverified cases pass through the full tick under both policies.
- No recorded reproduction of these two ids is left unmeasured. ISS-TENANTSIG-001 (scope) is a deployment condition, not a recorded reproduction.

### Default parity (one-off harness, not committed; old modules extracted with `git archive 3055de9 packages/meeting-bot/src`, deleted afterwards)
Old (3055de9) vs new tick, same fake loaders; compared result, log lines, scheduler calls, persisted state files and request list, dry and real:
- `PARITY off: 2400/2400 identical (result, logs, scheduler calls, state files, request list); loader calls=0` (300 seeded selections x {absent, "", "off", "Fail-Closed"} x {dry, real}).
- `PARITY match-enforcing: 1200/1200 identical` (300 seeds x {fail-closed, fail-open} x {dry, real}; key tenant == configured vs the old enforcing tick; loader called exactly once).
- Permanent test "enforcement off ...": zero `/webinar-operations` requests, output and request list identical with and without the loader over absent/""/off/FAIL-CLOSED/yes.
- Veto-only: 500 seeds x both enabling values x random key-tenant outcome (match/mismatch/no header/403): nothing scheduled that the un-enforced tick did not schedule. Pass.

### Mutations (harness `.mut-tenantsig.mjs`, untracked, deleted; per-mutation byte backup, restore in `finally`, 300 s hard timeout; after each, `git hash-object` equals `git rev-parse HEAD:<file>`: true for all)
Killed 14/14 by key-tenant.test.ts: M1 header ignored; M2 unknown treated as verified; M3 mismatch applies the configured tenant's rules; M4 mismatch silently "no rules"; M5a different key; M5b different URL; M6 loose validation (trim/case-fold); M7 verification runs when off; M8 cached across a key change; M9 fail-closed degrades to fail-open on `tenant-unverified`; M10 throwing loader treated as verified; M11 key tenant not passed to the enforcer; M12 redirects followed; M13 HTTP error status ignored.

## NOT done
- Nothing enabled; `.env.example` unchanged; W3 (policy choice), W6, the web flag untouched; no live tick, no network, no real API.
- No API change and no scope grant. For a tick key without `sessions`, enabling either value makes every tick `tenant-unverified` (fail-closed: nothing scheduled) until the key gets `sessions` or the one-line header addition above is made (ISS-TENANTSIG-001).
- The header comes from the configured base URL; a hostile or misconfigured base URL could assert any tenant (same trust as the candidate fetch itself). Out of scope.
