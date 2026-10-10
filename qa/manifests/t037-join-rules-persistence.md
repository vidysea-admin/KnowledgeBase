# t037-join-rules-persistence

Status: checked-PASS
Checked: qa/verdicts/t037-join-rules-persistence.md (cycle 0, a8a698d)
Fix cycle: 0
Priority tier: 3 - next unblocked roadmap task (T-037)
Security class: data writes + auto-join trust data (decides a no-click join) - FULL checker ceremony
Exit criterion advanced (docs/meeting-bot-roadmap.md:60): "rules are editable, and a trusted sender's next webinar is scheduled with no click" - persistence layer only.

## Scope

Delivered: a tenant-scoped, atomic, file-backed store for the `JoinRuleSet` + `JoinRuleState` of `join-rules.ts`.
NOT delivered: no edit API or UI, no scheduler switch-over, no change to `selectEventsToAutoJoin`/`evaluateJoinRules`/any caller, no sender-trust change (ISS-322 / ISS-333 untouched: `isTrustedSender`, `gws-gmail.ts`, `auto-join.ts` not edited), `schedule-state.ts` not edited. Nothing calls the store. **T-037 stays in progress.** No barrel export added.

## Files added

- `packages/meeting-bot/src/calendar/join-rules-store.ts` (130 lines)
- `packages/meeting-bot/src/calendar/join-rules-store.test.ts` (131 lines, 12 tests)
- `qa/manifests/t037-join-rules-persistence.md`

## API

- `joinRulesFilePath(stateDir, tenantId): string` -> `<stateDir>/join-rules/<tenant>.json`
- `loadJoinRules(stateDir, tenantId): StoredJoinRules` (`{ruleSet, state}`)
- `saveJoinRules(stateDir, tenantId, value, io?: {rename?}): void` (io hook is for failure-injection tests only)
- `recordTenantApproval(stateDir, tenantId, {kind: "sender"|"domain", value}): JoinRuleState`
- `recordTenantOptOut(stateDir, tenantId, eventId): JoinRuleState`
- `JoinRulesStoreError` with `code`: bad-tenant | corrupt | too-large | invalid | tenant-mismatch | not-a-file | write-failed
- `emptyStoredJoinRules()`, `JOIN_RULES_MAX_BYTES` (1 MiB)

Helpers are named `recordTenant*` because lint-dupes already flags the engine's `recordApproval` duplicating `packages/db` (pre-existing); reusing the name would add a violation. They wrap the engine's `recordApproval`/`recordOptOut`.

## Fail-closed behaviour

- Missing file: empty rule set + empty state (nothing joins; tested through `evaluateJoinRules`).
- Corrupt JSON, schema-invalid (via the engine's `validateJoinRuleSet`/`validateJoinRuleState`, plus envelope version/unknown-field check), oversized (lstat size checked before read; also on write), embedded tenant != requested, non-regular file (dir/symlink): all THROW. Mutate helpers load first, so a bad file is never overwritten (tested byte-for-byte).
- Tenant id: `^[a-z0-9][a-z0-9_-]{0,63}$` plus Windows device names (con prn aux nul com0-9 lpt0-9) refused. Lowercase-only prevents case aliasing. 35 shapes tested (.., separators, absolute, drive, `\?\`, `\.\`, UNC, NUL byte, spaces, trailing dot, ADS colon, uppercase, percent-encoding, non-ASCII, non-string, over-length).
- Write: validate -> serialise -> temp file (`wx`, 0600) -> fsync -> rename; temp removed on failure; failed rename and invalid input leave the prior file intact.

## Structure budgets (structure.config.json: loc 300 src / 400 test; dirsize 30 files)

- `packages/meeting-bot/src/calendar`: 14 -> 16 files (cap 30). New files 130 / 131 lines.
- `lint-dirsize`: OK (112 dirs) before and after. `lint-loc --all`: same 5 failing stages before and after (pre-existing: join-rules.ts 309 lines, recordApproval dupe, root loose files, snapshot stale, tracker); diff of before/after shows only timings and file counts. No new violation.

## Evidence

From `packages/meeting-bot`, portable node on PATH, each under `timeout`:
- `node --test --import tsx src/calendar/join-rules-store.test.ts` -> tests 12, pass 12, fail 0
- `node --test --import tsx src/calendar/join-rules.test.ts` -> tests 24, pass 24, fail 0
- `node --test --import tsx src/calendar/schedule-state.test.ts` -> tests 18, pass 18, fail 0
- from root: `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`

## NOT verified / left open

No tsc typecheck run (CPU constraint; tsx does not typecheck). No mutation testing (checker's job). Symlinked parent directories of `stateDir` are not rejected (only the file itself; schedule-state's webinarCompletionState walks parents, not replicated). Mutate helpers are unlocked read-modify-write (single process assumed). Windows reserved names with trailing characters are excluded by the charset, not separately tested beyond the listed shapes. No `fix_direction` corpus applies (no filed issue targeted).
