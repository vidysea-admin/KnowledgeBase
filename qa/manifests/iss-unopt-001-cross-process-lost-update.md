# iss-unopt-001-cross-process-lost-update

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2 (open ledger issue ISS-UNOPT-001, medium, but class data write deciding whether the bot joins a meeting: full ceremony). Verdict by the checker only.
Lane: lane/unoptlock. Ledger for this lane: qa/issues.unoptlock.jsonl, ids ISS-UNOPTLOCK-NNN (1 filed, low, open). Existing ledger rows untouched (the checker changes ISS-UNOPT-001's status).

## Scope
One package (`packages/meeting-bot`) plus the one-call adapter in `scripts/webinar/join-rules-host.ts` that the issue's `fix_direction` names. Untouched: the lock protocol (`join-rules-store-lock*.ts`, the t037 stale-lock takeover), `join-rules-optout.ts`, `apps/*`, the scheduler / sender-trust path.
- `join-rules-store.ts`: NEW export `recordTenantUnOptOut(stateDir, tenantId, eventId, opts, meeting?)` -> `{state, removedEventId, removedMeetings}`. Same `withTenantLock` as approve / opt-out: the WHOLE locked load -> pure `removeOptOutEntries` -> validate -> `writeAtomic` (with the pre-rename `owns()` re-check) is one critical section. A no-op removal writes nothing. Lock not obtained within `lockWaitMs` -> `JoinRulesStoreError("locked")`, nothing written (the typed busy result the router/API already maps). Corrupt / invalid stored file -> load throws, nothing written.
- `scripts/webinar/join-rules-host.ts`: `removeOptOut` now calls `recordTenantUnOptOut` instead of `loadJoinRules` (unlocked) + `removeOptOutEntries` + `saveJoinRules`; the now-unused `removeOptOutEntries` import is removed.
- Tests: NEW `join-rules-unopt-lock.test.ts` (5 tests); `join-rules-store.test.ts` helper `unOpt` now calls the new store function (the old helper replicated the buggy shape); `scripts/webinar/join-rules-host.test.ts` +1 adapter test.

## Guarantee now given, exactly
Read-modify-write cycles of un-opt, opt-out and approval on one tenant, in any mix of processes on ONE machine and local filesystem with exclusive-create semantics, are serialised by the existing per-tenant lock: an acknowledged change is never overwritten by another writer's stale snapshot. A writer that cannot get the lock within `lockWaitMs` throws the store's typed `locked` error and wrote nothing; on that or any other error (corrupt file, failed rename, lock lost before the rename) the opt-out stays in force, so the meeting is not joined on that account.
NOT guaranteed: other machines / network filesystems; `PUT` (`saveJoinRules`) is a full replace by design and takes the caller's own snapshot (a caller that loads, edits and PUTs can overwrite a concurrent change to state; unchanged, out of scope); a lock holder frozen past the stale/takeover rule (ISS-LOCKTAKE-005, ISS-UNOPTLOCK-001; the pre-rename `owns()` check is the only guard); readers take no lock (they see the old or the new file, never a partial one).

## Evidence (packages/meeting-bot, node off PATH, `timeout` around each, one file at a time; no browser/Selenium/OBS/network in any test run; the host/edit-api tests start a localhost test server only)
- `node --test --import tsx src/calendar/join-rules-unopt-lock.test.ts` -> `tests 5, pass 5, fail 0`; repeated 15 times: `15/15` runs green (includes the 3-real-process x 6-round approve/opt-out/un-opt test; that test alone, 15 runs: `15/15`).
- `... join-rules-store.test.ts` -> `tests 21, pass 21, fail 0` (ISS-T037OPT-001: 4/4, ISS-T037OPT-003: 3/3 still); `... join-rules-store-lock.test.ts` -> `tests 22, pass 22, fail 0`.
- repo root: `... scripts/webinar/join-rules-host.test.ts scripts/qa/join-rules-edit-api.test.ts` -> `tests 17, pass 17, fail 0` (before the adapter test was added; ISS-T037OPT-004: 5/5); host file after the adapter test: `tests 14, pass 14, fail 0`; `apps/api: src/join-rules/un-opt.test.ts` -> `tests 9, pass 9, fail 0`.
- `node .../typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot, own sources) -> exit 0; with a temporary tsconfig also including `scripts/webinar/join-rules-host.ts`: no diagnostics in join-rules-host / join-rules-store / the new test (temp file deleted).

### D-015 count against the ledger's own recorded reproduction
`ISS-UNOPT-001: 4/4`. The test parses the row from `qa/issues.unopt.jsonl`, asserts its `evidence` still contains the recorded text ("a second writer process could lose an approval/opt-out made between the load and the save"), then replays it: an approval, and an opt-out, attempted by a second writer between the un-opt's load and its write (a) get typed `locked` and write nothing, (b) are applied intact when retried after the un-opt commits, with the un-opt kept (2 x 2 = 4 checks). A control replays the OLD adapter shape (unlocked load, locked save, writer landing in the window) and shows the approval IS lost, so the replay is meaningful. The row records one scenario, not a numbered corpus; none omitted. ISS-UNOPT-002 (low) and ISS-UNOPT-003 are other rows, not addressed (003's "no-op writes nothing" pin is incidentally covered by a new test; status is the checker's).
Beyond the ledger: 3 processes x 6 rounds (18 approvals, 18 opt-outs, 9 un-opts, shared tenant, randomised hold inside the critical section): every approval present, every un-opted id absent, every other opt-out present, no lock/temp debris.

## Mutations (4; harness `.mut*-harness-unoptlock.mjs`, untracked and deleted; byte backup per mutation restored in `finally`, SIGKILL timeout 150 s per run; afterwards `git hash-object` of join-rules-store.ts = 83b704bd2e3378262c7b269db8cb524b19123f97 and join-rules-host.ts = 46b53d5c4f2a28462c111cbb5e1c53efb598a632, identical before and after)
4 KILLED, 0 SURVIVED: un-opt without the tenant lock (fail 3); no-op still writes (fail 1); pre-rename ownership re-check skipped (fail 1); adapter reverted to unlocked load + save (fail 1). On the first run the last two SURVIVED, which added the lock-taken-over test and the adapter test.

## NOT covered
- The "NOT guaranteed" list above; no soak, no network drive, no frozen holder, no power loss.
- Open rows ISS-LOCKTAKE-005 and ISS-T037OPT-002 not touched (context only).

## Operational consequence of merging
Un-opt now WAITS for the tenant lock (up to the default `lockWaitMs`) while another writer holds it, and answers the typed `locked` error (already mapped by the API) instead of silently succeeding on a stale snapshot; a no-op un-opt now also needs the lock. No data migration, no file format or lock file change, no new dependency.
