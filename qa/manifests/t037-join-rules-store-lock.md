# t037-join-rules-store-lock

Status: checked-PASS
Checked: qa/verdicts/t037-join-rules-store-lock.md (cycle 0, b9f88ab)
Fix cycle: 0
Priority tier: 2/3 - follow-up to verdict note of `t037-join-rules-persistence` (lost opt-out = unwanted unattended join)
Security class: data writes + auto-join trust data - FULL checker ceremony (security class is never round-capped)
Lane: `lane/t037lock`, ledger shard `qa/issues.t037lock.jsonl` (no issues filed this cycle)

## Scope

Delivered: (1) a per-tenant cross-process exclusive lock around every mutation of a tenant's rules file; (2) `saveJoinRules` refuses by default to replace an unreadable / corrupt / wrong-tenant existing file.
NOT delivered: no change to file format, validation, tenant-id rules, existing error codes, or any caller. Contract `qa/contracts/t037-join-rules-persistence.md` NOT edited: the checker should extend it with the two behavioural additions below.

## Files

- `packages/meeting-bot/src/calendar/join-rules-store.ts` (130 -> 179 non-blank lines; budget 300)
- `packages/meeting-bot/src/calendar/join-rules-store-lock.ts` (new, 73 lines)
- `packages/meeting-bot/src/calendar/join-rules-store-lock.test.ts` (new, 158 lines, 10 tests; budget 400)
- `join-rules-store.test.ts` untouched (118 non-blank lines, 12 tests, still green). Folder file count 18 -> 20 (budget 30; two other lanes add 4).

## Behavioural additions (for the contract)

### A. Lock
- Path: `<stateDir>/join-rules/<tenantId>.lock` (tenant id already validated `[a-z0-9][a-z0-9_-]{0,63}`, no dot, so it cannot alias a rules file or another tenant's lock). Created with `wx`.
- Contents while held: `{"token":<uuid>,"pid":<n>,"at":<ISO>}`. `token` makes release delete only OUR lock; `pid` and `at` are diagnosis only.
- Locked: the whole read-validate-modify-write of `saveJoinRules`, `recordTenantApproval`, `recordTenantOptOut` (internally `mutateState`; save uses `withTenantLock` directly; the inner write is unlocked so there is no self-deadlock). Released in a `finally` (validation error, refused load, failed rename, thrown hook: all tested).
- NOT locked: `loadJoinRules` (no lock), `joinRulesFilePath`, validation that happens before locking (encode/size check run before the lock is taken, so invalid input never touches the directory in `saveJoinRules`; the record helpers do create the tenant dir and lock briefly even for invalid input on a fresh tenant).
- API stays SYNCHRONOUS. Waiting = bounded busy-wait that sleeps with `Atomics.wait` on a SharedArrayBuffer (5-25 ms jitter), hard overall deadline `lockWaitMs` (default 5000), per call via the options parameter (`StoreOptions`: `lockWaitMs`, `lockStaleMs`, plus test-only `rename`, `afterRead`). No global state, no env.
- Timeout: `JoinRulesStoreError` code `locked`, nothing written, the other holder's lock untouched. Hard failures (cannot create dir/lock; any create error other than EEXIST/EACCES/EPERM/EBUSY; EPERM-like failure for the whole deadline with no lock file ever present): code `lock-failed`.
- Stale (age > `lockStaleMs`, default 30 s; age from `at`, else mtime): code `locked`, message names the lock path, age, content, and says "NOT stealing it ... delete the file <path> by hand". NEVER stolen. Tested: report, lock untouched, nothing written, manual delete then works.
- ISS-ALLOC-005 handled (not copied): EPERM/EACCES/EBUSY on create is treated as the mid-delete window; stat afterwards: ENOENT -> retry at once (bounded by deadline, 2 ms sleep when not EEXIST so it cannot spin); present, or stat itself failing -> contention (stale check, sleep, retry).

### B. `saveJoinRules` refuses by default
- If the file exists: non-regular -> `not-a-file` (always, even with the option). Otherwise unless `{ overwriteInvalid: true }`, `loadJoinRules` runs under the lock and its error (`corrupt`, `invalid`, `tenant-mismatch`, `too-large`) propagates; nothing written. Valid existing file, or missing file: unchanged behaviour. Record helpers never take the option.

### C. Reader / rename finding (Windows)
- Readers cannot see a partial file: write is temp + fsync + `renameSync` (MoveFileEx replace, atomic); 2 reader processes in the multi-process tests did a total of thousands of `loadJoinRules` with zero errors.
- BUT the multi-process test exposed that on Windows a rename over a file a reader has open at that instant fails with EPERM (first run: many `write-failed ... EPERM ... rename`, i.e. a dropped opt-out reported as an error, old file intact). Fixed: `renameReplacing` retries EPERM/EACCES/EBUSY for up to 3 s while holding the lock; other errors (including the injected "disk full") propagate at once. Without it the new tests failed.

## `saveJoinRules` callers (`git grep -n saveJoinRules` outside the store)
- `scripts/qa/join-rules-edit-api.test.ts:32`: `save: (t, v) => saveJoinRules(dir, t, v)` bound as `deps.save`; the router calls it after a successful load, so file is valid-or-missing: unaffected (not run here; not mine to edit).
- Manifest text only: `qa/manifests/t037-join-rules-edit-api.md:40` and `...persistence.md`, `qa/verdicts/...persistence.md` (docs).
- No caller relies on overwriting an invalid file. The host module another lane is adding was not present in this worktree: it must pass `{overwriteInvalid:true}` only for an explicit repair action; a load-then-save needs nothing.

## Multi-process results (real `node --import tsx` processes, workers spawned from the test, common start barrier)
Test 1: 8 writers x (6 approvals + 6 opt-outs) on ONE tenant + 1 reader process; test-only `HOLD_MS=6` hook widens read->write. Test 2: same shape, 2 tenants x (8 writers + reader), `HOLD_MS=4`. Test 3 (stress): 8 writers x 12 x 2 ops, no hook. Each asserts: every id present, exact counts, file validates, no worker error, readers 0 errors, directory holds only `<tenant>.json` (no lock/temp).
- Run 1 (full file): 10/10 pass. Run 2: 10/10 pass. Run 3: 10/10 pass.
- Extra run `LOCK_STRESS_ROUNDS=10`: 10 rounds x 8 processes x 24 locked writes, 0 errors.
- Contention total: 9 + 10 = 19 stress rounds (each 192 locked writes) plus 6 hooked rounds across the 3 runs: 0 spurious non-contention lock errors, 0 timeouts.
- Tenant A held lock does not block tenant B (test 4).

## Test fails without the lock
Mutation (one line: `withTenantLock` returns `fn()` before acquiring) applied to `join-rules-store.ts`, tests `8 real processes ...` run with timeout 170 s: BOTH multi-process tests FAILED (`pass 0 / fail 2`, lost updates). The hook `HOLD_MS` (test-only `afterRead`, never set by production) was ON in those tests; I did NOT measure whether the no-hook stress test alone fails on unlocked code. Mutation hygiene: per-mutation byte backup, restore in `finally`. INCIDENT: my restore path was wrong (`/tmp/store.bak` resolved to `C:\tmp`), so the `finally` failed and the mutant stayed on disk; I restored by hand from the backup and verified `git hash-object` == `git rev-parse HEAD:<file>` (`9477d987c8e524452dc3e66223d08103b1f985de` both) and `git status` clean. Committed code was never the mutant.

## Evidence
All from `C:\Users\product\Desktop\KnowledgeBase-lanes\t037lock\packages\meeting-bot`, node on PATH from the codex runtime:
- `node --test --import tsx src/calendar/join-rules-store.test.ts src/calendar/join-rules.test.ts` -> `ℹ tests 36 / ℹ pass 36 / ℹ fail 0` (12 store + 24 rules).
- `node --test --import tsx src/calendar/join-rules-store-lock.test.ts` x3 -> `ℹ pass 10 / ℹ fail 0` each (durations ~93 s, ~90 s; first run 120 s before the reader got a 1 ms sleep).
- `LOCK_STRESS_ROUNDS=10 ... --test-name-pattern="lock stress"` -> `stress: 10 round(s) x 8 processes x 24 locked writes, 0 errors`, `ℹ pass 1`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> no output (clean), ~24 s.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`.
- Final recheck after restore: store + rules tests 36/36 pass; 7 non-multiprocess lock tests pass.

## Not delivered / limits
- Advisory lock only: a process that writes the rules file without the store bypasses it.
- POSIX behaviour untested (Windows machine only); network file systems unsupported (`wx` atomicity not guaranteed there).
- A stale lock needs manual clearing by design; a holder that dies mid-write leaves a lock until a human deletes it (writes then fail `locked`, fail closed).
- `releaseLock` skips (does not throw) when the lock is no longer ours; exclusion for that edge (lock deleted by hand mid-hold) is not guaranteed.
- Rename retry is bounded at 3 s; exhaustion surfaces as `write-failed` with the old file intact.
- The no-hook unlocked failure was not separately measured. `scripts/qa/join-rules-edit-api.test.ts` not re-run. Unit has no contract of its own yet.
