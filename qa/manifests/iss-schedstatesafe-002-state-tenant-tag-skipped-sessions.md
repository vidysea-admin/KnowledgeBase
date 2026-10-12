# iss-schedstatesafe-002-state-tenant-tag-skipped-sessions

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2-adjacent (medium ISS-SCHEDSTATESAFE-002, red test on main). Class: test-only change over tenant tagging of a state file (not a new write path); verified-by-mutation.
Lane: lane/tenanttagfix, branched from lane/schedstatesafe 4ec51c83. Ledger row ISS-SCHEDSTATESAFE-002 status NOT changed here (checker closes).

## What was wrong
`packages/meeting-bot/src/calendar/state-tenant-tag.test.ts` failed 1 of 9 on main since f9287b07. Diagnosis: TEST OUTDATED, CODE CORRECT. A completed tick now writes `skipped-sessions.json`, and `skipped-state.ts` tags it (file `tenantId`, per-entry `tenantId`, reader/writer refuse untagged/other-tenant). The untagged-job case compared the whole dir tree before/after, so the new (correctly tagged) file failed it, and the failure aborted the test body so the bad-tenant loop never ran.

## Change (test only; no assertion weakened, no production code touched)
- untagged-job case: the tree minus `skipped-sessions.json` must be byte-identical, AND `skipped-sessions.json` must exist tagged with the tick's tenant. Refusing cases still compare the whole tree.
- Bad-tenant loop (undefined, "", "../b") is now one `test()` per case, so one failure cannot hide the others.
- New: skipped-sessions.json written tagged (file + entry); untagged / bare-map / other-tenant files refused by `readSkippedRecords` and `recordSkipped` and left byte-identical; bad tenants refused with nothing created; a tick over an untagged/other-tenant skipped file logs the refusal and leaves it byte-identical; a normal tick's skipped file is tagged for both tenants.

## Evidence
```
state-tenant-tag.test.ts: ℹ tests 15 ℹ pass 15 ℹ fail 0   (was 9 tests, 8 pass, 1 fail); "ISS-ALERTID-006: 61/61 reproductions refused or tagged as required"
alert-who-{command,production,skipped-state,skipped}.test.ts + calendar/schedule-{state,state-safety,tick}.test.ts: ℹ tests 77 ℹ pass 77 ℹ fail 0
tsc --noEmit -p packages/meeting-bot: no errors mentioning state-tenant-tag
```
Mutations on skipped-state.ts (byte backup per mutation, restored in finally; hash-object == HEAD blob 9d39dde8 afterwards):
- file `tenantId` dropped from the written body: 3 tests fail
- reader's `assertTenantTag` removed: 3 tests fail
- per-entry `tenantId` dropped: 1 test fails
Reproductions: ISS-SCHEDSTATESAFE-002 recorded one (the failing assertion): 1/1 now passes; none left open.
