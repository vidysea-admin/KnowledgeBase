# t037next

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Tier: 3 (roadmap T-037; the single-writer half of the scheduler switch-over, `qa/contracts/t037-join-rules-api-host.md` criterion 9).
Security class: decides which meetings the bot records and guards the tenant join-rules document (data write) - FULL ceremony, never round-capped.
Lane: `lane/t037next` (worktree `KnowledgeBase-lanes/t037next`, from 99f4fed9). No new ledger shard (no new issue found).

## Scope
NOTHING IS ENABLED. `LKB_JOIN_RULES_ENFORCE` default (`off`) unchanged; no flag, `.env.example`, `apps/web` constant (`JOIN_RULES_ENFORCED`) or enforcement path touched. No production source file was edited at all.

### Survey (what had already merged, so nothing was rebuilt)
Engine, persistence, edit API, host, store lock, stale-lock takeover, compare-and-set (saveJoinRulesIf), un-opt, opt-out identity, veto/select, scheduler wiring behind the flag, key-tenant header check, the web editor with ETag and non-ASCII refusal (UI and API) are all merged and checked-PASS. `qa/manifests/t037-join-rules-enable-preconditions.md` already classified the BEFORE-ENABLE list and concluded "No pure-code item is left on the list": the open items are Approver/operator decisions (W3 policy ISS-T037VETO-003, W6 series ids ISS-JRENABLE-002, ISS-376, W7 residual acceptance, `sessions` scope or API header ISS-TENANTSIG-001/-002, flipping the web flag together with enablement, one live dry-run). None of those was touched here.

### What was missing and is decision-free
Contract criterion 9 of `t037-join-rules-api-host` ("Single writer: no other code writes the rule files") and the roadmap's "single writer" switch-over condition had no test. The host manifest only records a grep done by hand once. Added `scripts/qa/join-rules-single-writer.test.ts` (6 tests, fakes and temp dirs only; lives under `scripts/qa` because it must see both `apps/*` and `packages/*`, like `join-rules-edit-api.test.ts`) and registered it in the root `test:lint` list (`package.json`).
1. Static: across every non-test `.ts/.tsx/.mjs/.js` under apps, packages, scripts (comments stripped, scan asserted non-vacuous), only `join-rules-store.ts` and `scripts/webinar/join-rules-host.ts` name a store mutator (`saveJoinRules`, `saveJoinRulesIf`, `recordTenantApproval`, `recordTenantOptOut`, `recordTenantUnOptOut`).
2. Static: the scheduler path (`join-rules-enforce.ts`, `schedule-tick.ts`, `join-rules-wiring/key-tenant.ts`) names no mutator, no lock module, no fs write API, and `join-rules-enforce.ts` imports exactly `loadJoinRules, JoinRulesStoreError, type StoredJoinRules`.
3. Static: no file except the store, its lock modules and the host both mentions the `join-rules` directory and a write API.
4. Behaviour, both policies (`fail-closed`, `fail-open`): `enforceJoinRules` against the real store over an absent file (creates no directory), a valid file with an opt-out (opt-out applied, directory sha1+mtime snapshot identical, no lock/tmp file) and a corrupt file (left byte- and mtime-identical, never repaired).
5. Multi-process: two worker processes each do 15 locked `recordTenantOptOut` while the enforcing tick reads in a loop: both exit 0, the tick logs no corrupt/invalid/too-large (never sees a partial file), all 30 opt-outs are present (no lost update), no lock/tmp file left.

## Needs the Approver (stopped, not decided here)
Nothing new. The items in `t037-join-rules-enable-preconditions.md` remain as listed there; the contract C1/criterion-11 amendment mentioned in the brief was not needed by this slice. The scheduler process still has no lock of its own because it never writes (that is what this unit now pins).

## Evidence (node on PATH, lane worktree, no browser/OBS/Mongo/network)
- `node --test --import tsx scripts/qa/join-rules-single-writer.test.ts` -> tests 6, pass 6, fail 0; run 20 times: 20/20 runs with fail 0.
- Mutations (own harness, byte backup restored in `finally`, 240 s timeout, deleted before commit) on `join-rules-enforce.ts`: names `saveJoinRules` -> KILLED; writes a file into the join-rules dir on read -> KILLED. A third (a no-op by construction, `globalThis.__w` undefined) SURVIVED and is an equivalent mutant, not counted. After the run `git hash-object join-rules-enforce.ts` equalled the HEAD blob (`restored: true`).
- `packages/meeting-bot`: `node --test --import tsx "src/**/*.test.ts"` -> tests 814, pass 810, fail 3, skipped 1. The 3 failures are all in `src/capture/` (`controller-state.test.ts` "getProcessStartTime returns platform identity for this process's own (real, live) pid"; `record-backend.test.ts` two tests on interrupted recovery/owned status); that package area is not touched by this lane, they probe live process start time on a machine loaded by another run. Re-running just those two files: 27 tests, 26 pass, 1 fail (the same getProcessStartTime test). Not caused by this change; checker may confirm on the base commit.
- `node <repo>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot) -> exit 0.
- `node scripts/lint-loc.mjs --all` -> `lint:structure: OK (10 stages, 0 failed)`.
- Recorded reproductions: no issue is closed by this lane, none replayed.

## Files
- `scripts/qa/join-rules-single-writer.test.ts` (new)
- `package.json` (the test added to `test:lint`)
- `qa/manifests/iss-t037ui-002-sender-approval-nonascii.md` (separate commit 1c021276: legacy `Status:` line aligned to the canonical `Handshake status: checked-PASS`, D-042)
- this manifest

## For the checker
Verify the static scan really would catch a new writer (try adding a mutator import to another file), that the allowed list (store + host) is right, that the multi-process test is not timing-fragile (run it more than 20 times), and that nothing in the diff enables enforcement. Open note: the 3 `src/capture` failures above.
