# t037-wiring-enable-preconditions

Status: checked-PASS (Checked: qa/verdicts/t037-wiring-enable-preconditions.md, cycle 0, fc3aae5; enforcement remains DISABLED; tenant condition only partly closed)
Fix cycle: 0
Priority tier: 2 (closes before-enable conditions (B)2 and (B)3 of `qa/verdicts/t037-scheduler-wiring-behind-flag.md`; ISS-T037WIRE-001 is high at enablement, security class).
Security class: decides which meetings the bot records - FULL ceremony, never round-capped.
Lane: `lane/wirepre` (worktree `KnowledgeBase-lanes/wirepre`, from 1b94bd8), ledger shard `qa/issues.wirepre.jsonl` (ISS-WIREPRE-001).
Reserved files: none touched (no store/lock files, no apps/web, no qa/contracts, no enforcement paths; `.env.example` untouched and still empty/off).

## Scope
NOTHING IS ENABLED. The default stays off and byte-for-byte unchanged. This unit makes enabling safer to do later; it does not recommend or perform it.

### A. ISS-T037WIRE-002 - an unrecognised value is loud (strict parsing kept)
- Rule: when `LKB_JOIN_RULES_ENFORCE` is a non-empty STRING that is not exactly `off`, `fail-closed` or `fail-open`, `enforceJoinRules` logs ONE warning through the tick's existing `deps.log`, then returns the selection untouched (off). Absent, empty and `off` are silent.
- Frequency: once per process per distinct (sanitised) value, via a module-level set. The tick has one log path and per-tick lines are used only for per-tick facts; repeating a constant misconfiguration on every poll would be spam, and the process-start report is what an operator reads. Test seam `resetJoinRulesEnforceWarnings()`.
- Text: `schedule-tick: JOIN RULES WARNING: LKB_JOIN_RULES_ENFORCE has an unrecognised value "<echo>" - enforcement is OFF, join-rule opt-outs and deny rules are NOT being applied. Accepted values: off, fail-closed, fail-open (exact, case-sensitive; empty = off)`.
- Echo: first 40 characters only, C0/C1 control characters and U+2028/2029 replaced by a space, JSON-quoted, with `(+N more characters)` for the rest. A 10,000-character or line-injecting value is inert.
- Why parsing stays strict: lenient parsing would let `true`/`1`/`yes` or a case variant switch on a setting that changes what is recorded. Strict + loud is the safe direction. `parseJoinRulesEnforce` is unchanged.
- Non-string values (never produced by `process.env`) stay silent, as before.

### B. ISS-T037WIRE-001 - tenant attribution: PARTLY closed
How the key's tenant could be learned - searched; answer: it cannot, without a new API field or route.
- `GET /meeting-candidates` returns `{candidates:[...]}`, rows carry no tenant id. `GET /calendar/upcoming?discovery=1` returns `{meetings:[...]}`, no tenant id. The native shape (`?sync=1`) echoes `tenantId`, but the real tick does not use it.
- `GET /keys` (the only key-related read) returns `_id,label,scopes,createdAt,revokedAt` and needs the `keys` scope; no tenant id. No whoami/self route exists (grep of apps/api/src).

What was done instead (no faking):
1. `tenant-unset`: when enforcement is on and `LKB_TENANT_ID` is absent, empty or rejected by the store's own tenant validator (`bad-tenant`, reused, not duplicated), the rule set is unevaluable with the distinct, path-free, value-free reason `tenant-unset` (fail-closed: all items skipped `rules-unevaluable`; fail-open: selection unchanged + the warning). No default tenant exists.
2. `tenant-mismatch` is implemented and tested end to end behind a new optional input `keyTenantId` (`deps.joinRulesKeyTenantId`): when given and not equal to the configured tenant, NO rules are read and the rule set is unevaluable with reason `tenant-mismatch` (fail-closed: every item skipped `rules-unevaluable`; fail-open: selection unchanged with the warning). Production passes none today, because there is no source. This is a ready socket, not a claim of detection.
3. Follow-up filed: ISS-WIREPRE-001 (high at enablement): add `GET /whoami -> {tenantId}` (or `tenantId` in the /meeting-candidates body) in apps/api, fetch once per tick and pass as `joinRulesKeyTenantId`; unreachable/invalid answer = mismatch when enforcing.

Result: ISS-T037WIRE-001 is PARTLY closed. The recorded mismatch (A's file opts out g1, run configured as B) is still NOT detected in production shape; g1 is scheduled under both policies (pinned in a test as the open residual). Enabling remains unsafe until ISS-WIREPRE-001 is done or the Approver signs an operator procedure.

### C. ISS-T037WIRE-003 - NOT changed (conflict noted for the checker)
Contract clause 4 and W5 state in terms that a non-synchronous (Promise) evaluator result is read as KEEP. Making fail-closed treat it as unevaluable would change that documented clause as observed through the wired tick, so per instruction behaviour is unchanged; a test pins today's behaviour (both policies keep). The evaluator is a test seam only; the real one is synchronous. The contract owner/checker should decide whether clause 4 should change before any async evaluator exists.

### Corrected env-read count
`buildRealScheduleTickDeps` reads TWO environment variables for this feature (`LKB_JOIN_RULES_ENFORCE`, `LKB_TENANT_ID`), not one as the earlier manifest said. This unit adds NO new env read (`keyTenantId` has no env source, deliberately: an operator-typed value would verify nothing).

### Files
- `packages/meeting-bot/src/calendar/join-rules-enforce.ts` (124 non-blank lines): warning, reasons, optional `keyTenantId`.
- `packages/meeting-bot/src/calendar/schedule-tick.ts` (290): optional dep `joinRulesKeyTenantId` + pass-through.
- `packages/meeting-bot/src/calendar/join-rules-enforce.test.ts` (327): the two default-parity tests now iterate the SILENT subset (unrecognised strings now warn by design); parse test unchanged.
- `packages/meeting-bot/src/calendar/join-rules-enforce-preconditions.test.ts` (new, 236). Calendar dir: 28 files (limit 30).
- `qa/manifests/t037-wiring-enable-preconditions.md`, `qa/issues.wirepre.jsonl`.

## Default parity
- vs 1b94bd8 (throwaway comparison of the tick extracted from 1b94bd8 into untracked modules against this tick; deleted afterwards): 300 seeded selections x values {absent, "", off, fail-closed, fail-open, Fail-Closed, true} x tenants {ten-a, ten-b, unset}, dry runs, plus real runs with a fake scheduler for 12 seeds: 6,552 comparisons, 2,009 scheduled items. Result, log lines and scheduler calls deep-equal in every non-warning case; for the two unrecognised values (1,872 comparisons) the ONLY difference is exactly one inserted warning line. The only other difference is the wording of the tenant-unset warning when enforcement is ON and tenant unset (intended; normalised in that script).
- Committed test `DEFAULT PARITY` (absent/empty/`off`, 300 seeds x 3 values = 900 cases, key tenant deliberately mismatching): equal to the un-wired reference output and log lines, 0 store calls, 0 evaluator calls, 0 requests (fetch spy), no `join-rules` directory created.

## NOT done
Nothing enabled; `.env.example` still empty. W3 (fail-closed vs fail-open, alert hook) is the Approver's. W6 (series ids), W7 gate (b) residual, the web flag `JOIN_RULES_ENFORCED` (not flipped), a live tick with enforcement on, and ISS-376 are untouched. No key-tenant source exists (ISS-WIREPRE-001).

## Evidence
Commands (from `packages/meeting-bot`; node v24.19.0 from the codex runtime):
- `node --test --import tsx src/calendar/join-rules-enforce-preconditions.test.ts` -> 12 tests, 12 pass (includes VETO-ONLY 500 seeds x 2 modes with random tenants/key states).
- `node --test --import tsx` on join-rules-enforce, join-rules-enforce-preconditions, schedule-tick, auto-join, join-rules, join-rules-select, join-rules-optout-identity, join-rules-store -> `tests 155 / pass 155 / fail 0`.
- `node --test --import tsx src/send-now.test.ts src/send-now-command.test.ts` -> `tests 38 / pass 38 / fail 0`.
- `node <repo>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (117 dir(s) within budget)`.

### D-015 (recorded reproductions verbatim)
- ISS-T037WIRE-002: 8/8 (`Fail-Closed`, `FAIL-CLOSED`, ` fail-closed`, `fail-closed `, `fail-open\n`, `true`, `1`, `yes`): each logs exactly one warning, g1 (opted out in the store) stays scheduled (enforcement off), 0 store calls, rest of the log identical to the un-wired tick.
- ISS-T037WIRE-001: PARTLY. (a) Production shape (key tenant unknowable), A's file opts out g1, configured B: g1 STILL scheduled under both fail-closed and fail-open: 0/2 detected (residual pinned; ISS-WIREPRE-001). (b) Key tenant known (A), configured B: 2/2 policies as specified: fail-closed -> nothing scheduled, g1 and g2 skipped `rules-unevaluable`, one `tenant-mismatch` warning, no store read; fail-open -> selection unchanged (g1, g2 scheduled), one warning; B's opt-out of g2 NOT applied. (c) Matching tenants identical to no-check (100 seeds x 2 modes).
- tenant-unset: 7 bad values (absent, empty, `Ten-A`, `../ten-a`, `a b`, 200 x, `CON`) x 2 modes: all unevaluable per policy, a `default`/`toc`/`tenant` rules file never used, raw value not echoed.

### Mutations (own harness, untracked, inside the worktree, byte backup per mutation, restore in `finally`, 200 s SIGKILL timeout; afterwards `git hash-object` of both files equalled the pre-run blob; harness deleted)
13/13 killed: M1 warning removed (WIRE-002 recorded values, one-line-difference, once-per-process tests); M2 lenient parse (WIRE-002 values, parse test); M3 mismatch check removed, M4 mismatch as "no rules", M5 mismatch applies configured tenant's rules, M11 tick drops the key tenant, M12 fail-closed leaves items scheduled (key-tenant-known test, tenant-unset test, VETO-ONLY); M6 tenant-unset -> default tenant (tenant-unset test, existing tenant test); M7a echo unbounded, M7b echo control characters (echo test); M8 new code runs when off / opens store (DEFAULT PARITY, WIRE-002 test); M9 warning every tick (once-per-process test); M10 warning on empty (DEFAULT PARITY, once-per-process).
(The harness's HEAD-blob comparison differed only because the fix was uncommitted at run time; the pre-run blob equality is the check, and HEAD fidelity is re-checked after commit below.)

## For the checker
Verify: the SILENT-subset edit to the two existing parity tests does not weaken them (absent/empty/off/non-string still compared exactly; unrecognised strings now covered by the new tests); the ISS-T037WIRE-003 decision; whether `keyTenantId` as a socket without a source is acceptable or should wait for ISS-WIREPRE-001; that W3 and the enabling decision remain the Approver's.
