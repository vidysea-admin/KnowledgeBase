# Verdict — t037-join-rules-store-lock

VERDICT: PASS
Cycle checked: 0
Scope: maker commits e5039fb (code) and 6be3337 (manifest) on lane/t037lock, base 7f352eb. Contract `qa/contracts/t037-join-rules-store-lock.md`. Security class, full ceremony, uncapped. Checker ran on Windows, portable node 24.19, node_modules junctions recreated and removed afterwards; all probes in scratchpad/temp dirs.

## 1. Not a mutant
- `git status --short` at start: empty. HEAD 6be3337. Committed `join-rules-store.ts` hash 9477d987c8e524452dc3e66223d08103b1f985de, `join-rules-store-lock.ts` 5e0958b9245cc186b470770e424526311a0d6acc.
- `git diff 7f352eb 6be3337 -- join-rules-store.ts` read line by line: only the lock wrapper (`withTenantLock`, released in `finally`), `StoreOptions`, `renameReplacing` (EPERM/EACCES/EBUSY retry, 3 s, otherwise rethrows), `writeAtomic`, load-first in `saveJoinRules`, and `mutateState`. No disabled check, early return, flipped constant. The only `unlinkSync` is of the temp file (`created && existsSync(temporary)`), never of the target.
- Hooks: `afterRead` and `rename` are per-call option fields; no `process.env`, no default, no global. Unreachable unless the caller passes them (low note: a production caller could, which is the caller's code). The maker's mutant-on-disk incident did not reach the commit: the hashes above equal HEAD blobs and every suite passes.

## 2. Contention (real processes, no hook, default 5 s lock wait, 2 reader processes x 2000 reads, scratch temp dirs)
Each writer: 25 approvals + 25 opt-outs, distinct values. "lost" = acknowledged but absent. "failed-but-present" = call threw yet entry in file.

| Run | Writers | expected | acked | locked | other errors (EPERM/ENOENT/lock-failed) | lost | failed-but-present | doc valid | .lock/.tmp left |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 12 | 600 | 586 | 14 | 0 | 0 | 0 | yes | none |
| 2 | 12 | 600 | 573 | 27 | 0 | 0 | 0 | yes | none |
| 3 | 12 | 600 | 597 | 3 | 0 | 0 | 0 | yes | none |
| 4 | 12 | 600 | 589 | 11 | 0 | 0 | 0 | yes | none |
| 5 | 12 | 600 | 589 | 11 | 0 | 0 | 0 | yes | none |
| two tenants ta | 6 | 300 | 300 | 0 | 0 | 0 | 0 | yes | none |
| two tenants tb | 6 | 300 | 299 | 1 | 0 | 0 | 0 | yes | none |

Entries in file == acked in every run. `locked` refusals (66 of 3000 in the 12-writer runs) came back as a thrown `JoinRulesStoreError` code `locked` to the writer and nothing was written ("Nothing was changed."). They are the unfair busy-wait with 12 writers at 5 s: acceptable, callers must retry. Zero spurious EPERM/ENOENT/`lock-failed`: ISS-ALLOC-005 did not reappear. Two tenants did not block each other (6 writers each: 0 and 1 refusals, 600 calls, wall time 16 s against 21-32 s for 12 writers on one tenant).

## 3. Unlocked code without the hook
Mutation M1 (lock acquisition replaced by `token = "nolock"`), harness 12 writers x 25 x 2, no hook, no readers: **acked 599, entries present 89, lost 510** (85%), plus one `corrupt` error (EPERM on open of the target mid-rename). So the lock does real work under plain contention; protection is not only shown under the widened window. Restore hash equals HEAD (below).

## 4. Rename retry
- (a) Exhaustion: target held open by a second process (PowerShell `FileShare.Read`, 9 s) after a first opt-out. `recordTenantOptOut` -> `JoinRulesStoreError write-failed` after 3011 ms; directory during the hold: `['ta.json']` (temp removed, lock released); original bytes identical; a second write failed the same way in 3029 ms; after release a write succeeded and both entries are present.
- (b) No window with the target absent: no unlink/rm of the target in the code. Mutation M6 (unlink target before rename) fails 4 suite tests.
- (c) Reader holding the file open makes every write fail after 3 s, loudly, state intact (shown above).
- (d) Readers: in runs 1-5 and the two-tenant run, 12 reader processes x 2000 loads: **24,000 reads, 24,000 valid, 0 clean errors, 0 empty-after-non-empty, 0 invalid documents.** No read returned "no rules" for a tenant with rules.

## 5. Stale locks
Probe results (path/age/steps all present and accurate): fresh garbage, fresh empty -> `locked` at the wait deadline; old empty, old JSON with dead pid, array JSON, `null` JSON -> `locked` with "stale ... NOT stealing it ... delete the file <path> by hand"; no non-store error. Manual delete -> next write OK. Real `taskkill /F` of a holder: lock stays; writes fail `locked`; with stale 200 ms the stale message appears (age 3 s, content has token/pid/at).
Ruling: acceptable for this unit (loud, nothing lost, accurate message, runbook is one file delete) but NOT acceptable for unattended production: a crash, OOM or power loss silently stops opt-outs from being recorded and the service would join a meeting the user refused. Filed ISS-T037LOCK-001 (medium): not a merge blocker, a **precondition for wiring the host into production** (alert plus runbook, or pid-liveness takeover with token re-check).

## 6. Overwrite protection and callers
Suite test covers unreadable/corrupt/wrong-tenant/invalid; default refuses with the load error and writes nothing; `{overwriteInvalid:true}` repairs; a non-regular file is refused either way (M5 skip of load-first fails the suite). Callers: only `scripts/qa/join-rules-edit-api.test.ts` (main/this lane) and `lane/t037host` (`scripts/webinar/join-rules-host.ts` and the same test) bind via `(dir, t, v)`, `(dir, t, a)`, `(dir, t, id)`: unaffected by the new trailing optional parameter; none passes a 4th positional `io`. Old `io` was `{rename?}`; the new type is a superset, so the unit's own rename-injection test shape still type-checks. API still synchronous; existing codes unchanged; behavioural change: PUT of rules over a corrupt existing file now returns the load error instead of overwriting (intended). `lane/t037api` has the old store; not affected.

## 7. Lock path
Lock path = `file.slice(0, -5) + ".lock"` where `file` comes from `joinRulesFilePath` after `assertTenant` (closed `[a-z0-9][a-z0-9_-]{0,63}` charset, device names refused, dirname check). No dot allowed in the id, so no lock can collide with a `.json`/`.tmp` name or escape the directory.

## 8. Commands (each under `timeout`, from `packages/meeting-bot` unless noted)
- `node --test --import tsx src/calendar/join-rules-store.test.ts` -> tests 12 pass 12 fail 0
- `... join-rules.test.ts` -> tests 24 pass 24 fail 0
- `... join-rules-store-lock.test.ts` x3 -> tests 10 pass 10 fail 0 each (37.5 s, 39.5 s, 38.6 s)
- repo root: `node --test --import tsx scripts/qa/join-rules-edit-api.test.ts` -> tests 4 pass 4 fail 0 (needed an `apps/api/node_modules` junction; first attempt failed with `Cannot find package 'express'` only for want of it)
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0
- `node scripts/lint-dirsize.mjs` -> `OK (111 dir(s) within budget)`. `node scripts/lint-loc.mjs` -> 3 violations, none in this unit (speakers-llm.ts, sb_join.py, run-watch.mjs). Unit files: store 198, lock 79, lock test 172 lines.

## Mutations (6 in total; per-mutation in-memory backup, restore in `finally`, SIGKILL timeout; hash check after each)
| # | Mutation | Result | Restore hash == HEAD blob |
|---|---|---|---|
| M1 | no lock acquisition (point 3, no hook) | KILLED by measurement: 510/599 acked entries lost | 9477d987... OK |
| M2 | lock opened with `"w"` not `"wx"` | KILLED (5 tests fail) | 5e0958b9... OK |
| M3 | steal stale lock | KILLED (stale test) | 5e0958b9... OK |
| M4 | swallow rename failure, report success | KILLED (2 tests) | 9477d987... OK |
| M5 | skip load-first in save | KILLED (1 test) | 9477d987... OK |
| M6 | unlink target before rename | KILLED (4 tests; my hold-open probe cannot catch it since an unshared file also refuses unlink) | 9477d987... OK |
All survivors: none. Note: during my first mutation harness I wrote a backup file inside the tree; it was removed and the harness changed to in-memory backup before M2.

ISSUES-WRITTEN: ISS-T037LOCK-001 (medium, in qa/issues.t037lock.jsonl)

EXPLANATION: No acknowledged write was lost in 3,600 contended calls across 6 runs; failed writes were all reported (66 `locked`), none half-written; the rules file was never missing or partial, even with a reader holding it open past the retry budget; readers never saw an invalid or empty state. The unlocked mutant loses 85% under the same load, so the lock is demonstrably load-bearing. The one open concern is operational, not a defect in the unit's stated contract: killed-holder recovery needs a human, so it must be solved before unattended wiring. Low notes: `locked` refusals at 12 writers/5 s suggest callers (e.g. the API host) should map `locked` to a retryable response; `afterRead`/`rename` are public option fields.
