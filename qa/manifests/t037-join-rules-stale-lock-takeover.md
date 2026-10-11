# t037-join-rules-stale-lock-takeover

Status: ready-for-check
Fix cycle: 0
Priority tier: dispatched by the orchestrator for ISS-T037LOCK-001 (severity **medium**, so tier 4 by the ledger; pulled early because the row is a stated precondition for wiring the store into the unattended host)
Security class: **data-write class** (a lock on a data-write path: a wrong takeover of a live lock can interleave read-modify-write and lose a tenant's rules/opt-outs). FULL ceremony, never round-capped.
Round cap: PASSed verdicts naming the join-rules store-lock seam = 2 (`t037-join-rules-store-lock`, `t037-join-rules-busy-status`; `t037-join-rules-api-host` has its own pid lock, not this seam). Irrelevant to the cap because security class is uncapped.
Lane: `lane/locktake`, ledger shard `qa/issues.locktake.jsonl` (ISS-LOCKTAKE-001..003, all low, filed not fixed)

## Scope

Files: `join-rules-store-lock.ts` (79 -> 168 non-blank lines), `join-rules-store.ts` (ownership re-check + options passthrough), `join-rules-store-lock.test.ts` (172 -> 271; appended, no new file in `calendar/`, count stays 29). Not touched: join-rules.ts, join-rules-optout*.ts, scripts/webinar/*, qa/contracts, verdicts, enforcement paths, ledger statuses (ISS-T037LOCK-001 stays `open` for the checker).

Deviation from the row's `fix_direction` (b): the row says "pid not alive AND age exceeds staleMs". I do NOT require age. Age is wall-clock evidence, adds no safety beyond proof of death, and requiring it would leave the row's own recorded reproduction 1 (default staleMs 30 s) locked for 30 s. Death proof alone decides; `at` is only reported (takeover `ageMs`, stale message). If the checker wants age as an extra gate it is a one-line `&&` that can only delay recovery.

## Staleness rule

A lock is taken over only if ALL hold: (1) content parses strictly (`{token: [A-Za-z0-9-]{1,64}, pid: positive safe int, host: non-empty string <=255}`, file <= 4096 bytes); (2) `host` equals this machine's hostname; (3) `process.kill(pid, 0)` throws `ESRCH`.

Why it cannot fire on a live holder: no clock is read in the decision (a step of any size is irrelevant: tested +-3 h and +-40 days, with staleMs 1 and 30000). A live holder on this host always has its pid present, so the probe returns success or `EPERM`, both "alive"; any other error is "unknown" = keep the lock. pid 0 / negative / fractional (which would signal a process group or be nonsense) never reach the probe as "dead". Another host, a legacy lock with no host field, garbage, oversized, wrong shape: never taken over.

## Takeover sequence (acquireLock, after `wx` fails with EEXIST and the holder is judged dead)

1. `link(lock, lock.stale.<deadToken>)`. Defends against a competing taker: the tombstone name is derived from the dead lock's token, so only ONE taker can create it (the other gets EEXIST -> busy/locked). It is a hard link, so the lock itself is not yet disturbed. Missing lock -> retry. A leftover tombstone older than max(staleMs, 1 s) by mtime is deleted (a crashed taker must not wedge the tenant forever).
2. Tombstone bytes must equal the bytes judged dead. Defends against ABA: another taker already replaced the lock with a live one; we drop only our link, the live lock was never touched (test asserts steps `judged, linked` only).
3. `rename(lock, lock.gone.<uuid>)`. Atomic removal; absent lock -> someone else won.
4. `gone` bytes must still equal the judged bytes; else (a live lock slipped in between 2 and 3) it is put back with a no-replace `link`. Defence in depth for the 2->3 gap.
5. Remove `gone` and tombstone, loop back to the ordinary `wx` create. Two acquirers racing the freed path still yield exactly one holder because creation is `wx`. `onTakeover({pid, ageMs})` fires only after the new lock was created; it carries no path and no message ever reaches HTTP.

Release is token-checked and rename-then-verify (a lock that is not ours is linked back untouched). Save/record now call `owns()` (token still in the lock) immediately before the data-file rename and throw `locked` (nothing written, temp file removed) if not. Before this unit save did NOT re-validate ownership.

## Windows notes

`process.kill(pid, 0)` on Windows (libuv): nonexistent pid -> ESRCH, exited process (GetExitCodeProcess != STILL_ACTIVE) -> ESRCH, access denied -> EPERM; no shell-out, one syscall. Verified by killing a real child with SIGKILL (TerminateProcess) and probing. Hard links work on NTFS; a volume without them makes step 1 fail with a non-EEXIST error, which keeps the lock (fail safe). Rename over / of an open file (EPERM/EACCES/EBUSY): release retries up to 50 x ~6 ms; the data rename keeps the existing `renameReplacing` helper; takeover step 3 failing that way returns busy and the loop retries within the deadline.

## Limits left open (all fail toward `locked`)

- ISS-LOCKTAKE-001 (low): pid reused by an unrelated live process => dead holder looks alive. No start identifier is obtainable without shelling out on Windows, so pid-existence only. Safe direction.
- ISS-LOCKTAKE-002 (low): other host, legacy lock without `host`, unparseable lock: never automatic.
- ISS-LOCKTAKE-003 (low): microsecond check-then-act gaps (ownership check -> rename; release restore) matter only if the probe lies about a live holder.
- Same hostname in different pid namespaces sharing one state dir would mis-read liveness; not a configuration this service uses.

## Evidence

```
cd packages/meeting-bot; node --test --import tsx src/calendar/join-rules-store-lock.test.ts
ℹ tests 21  ℹ pass 21  ℹ fail 0     (10 original tests unchanged + 11 new)
node --test --import tsx src/calendar/join-rules-store.test.ts            -> tests 12 pass 12 fail 0
cd apps/api; node --test --import tsx src/join-rules/router.test.ts src/join-rules/busy-status.test.ts -> tests 29 pass 29 fail 0
  (apps/api resolves @lkb/meeting-bot to the MAIN tree through the junction, so this run does not exercise the lane's change; it shows the API tests still green)
node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json (packages/meeting-bot) -> exit 0
node scripts/lint-dirsize.mjs -> lint-dirsize: OK (112 dir(s) within budget)
```
No existing assertion was changed. (One existing test, "stale lock is reported ...", initially failed because I parsed the legacy lock strictly and lost its `at` age; fixed in code by a lenient `at` read for the report, test text untouched.)

D-015: `ISS-T037LOCK-001: 2/2` recorded reproductions pass (repro 1: child killed inside recordTenantOptOut, then `recordTenantOptOut(dir,"ta","e2",{lockWaitMs:1000})` succeeds instead of `locked`; repro 2: same with `lockStaleMs:200`, which used to give the stale message). Both use a real child process killed with SIGKILL and the real OS liveness probe.

Race test: for each of 4 interleavings (taker B runs the whole acquire inside A's hook at judged / linked / verified / renamed) exactly 1 winner, 1 `locked`, winner's token is in the file, no tombstone left.

## Mutations (harness in scratchpad, not committed: per-mutation byte backup, restore in `finally`, 150 s timeout, `git hash-object` equal to the pre-mutation hash after each; targeted tests only)

| mutation | result | killed by |
|---|---|---|
| M1 delete-then-create | fail 2 | "two takers racing a dead lock...", "an abandoned takeover tombstone expires..." |
| M2a skip tombstone content check | fail 1 | "two takers racing..." (judged interleaving asserts no restore/rename step) |
| M2b skip tombstone AND gone checks | fail 1 | "two takers racing..." |
| M3 age-only staleness | fail 5 | repro 1, "live / undeterminable holder...", "clock stepped...", "wrongly judged dead..." |
| M4 other host treated dead | fail 1 | "live / undeterminable holder, pid reuse, another host..." |
| M5 skip ownership re-check before data rename | fail 1 | "a holder wrongly judged dead wakes..." |
| M6 release without token check | fail 1 | "a holder wrongly judged dead wakes..." |
| M7 liveness inverted | fail 9 | repros 1+2, "dead holder on this host...", "live / undeterminable..." |
| M8 takeover on unparseable content | fail 2 | "garbage lock content...", "live / undeterminable..." |
| M9 EPERM treated as dead | first run SURVIVED; EPERM/ESRCH/EACCES stub case added to the defaultIsAlive test; re-run fail 1 | "defaultIsAlive: ..." |

Note: the ownership-check budget: lock source 168, store 189, tests 271 non-blank lines.
