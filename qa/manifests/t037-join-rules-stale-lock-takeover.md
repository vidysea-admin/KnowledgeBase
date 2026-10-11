# t037-join-rules-stale-lock-takeover

Status: ready-for-check
Fix cycle: 1
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

---

# Fix cycle 1

Verdict being answered: `qa/verdicts/t037-join-rules-stale-lock-takeover.md` (FAIL, cycle 0, ISS-LOCKTAKE-004 high). The cycle-0 sections above describe the SUPERSEDED hard-link design; their "Deviation (no age)" paragraph is withdrawn (the checker did not accept it and was right: see the age rule below).

## What failed and why the hard-link claim was wrong
The claim was `link(lock, lock.stale.<token>)`. A hard link shares the inode, so `stat(tomb).mtimeMs` is the DEAD lock's mtime: a claim made a moment ago looked an hour old. Every other contender therefore "reclaimed" (unlinked) a live taker's claim, the "only one taker can make that name" guarantee was void, a slow taker then renamed a LIVE new lock to `.gone`, and the link-back step left an instant with no lock file in which a third contender `wx`-created one: two holders and writes made without the lock (35 / 27 of 12,000 orderings in the checker's harness). The design also MOVED a lock that might be live before checking it, which must never happen.

## New design (`join-rules-store-lock.ts` 76 non-blank lines; new `join-rules-store-lock-steps.ts` 149: the protocol as generators over an injectable `LockFs`)
Takeover of dead lock D (token `dt`) by contender X:
1. **judge** (read only): D parses strictly (token `[A-Za-z0-9-]{1,64}`, pid > 0, non-empty host, <= 4096 bytes), `D.host === hostname` EXACTLY, recorded `at` older than `staleMs`, `isAlive(D.pid) === "dead"` (ESRCH). Otherwise `locked`, nothing touched.
2. **claim**: `wx`-create `<lock>.claim.<dt>` holding X's OWN body `{token,pid,host,at:now}` (a separate file with its own mtime and its own timestamp). EEXIST -> `locked` (message names the claim). Exactly one contender per dead token can create it.
3. **reread**: the lock bytes must equal the judged bytes; the pid is re-probed (still ESRCH); age re-checked on a fresh clock read; host re-compared. Any failure: drop our own claim, touch nothing else.
4. **replace**: `rename(claim, lock)`. The claim file already is a complete new lock body, so one atomic rename replaces D. No link, no temp file, no link-back, no instant without a lock file.
5. **verify**: re-read the lock; our token present -> we hold it; otherwise we are not the holder and touch nothing.
Release: read the lock, unlink only if it carries our token; a foreign lock is never renamed, moved or linked (the release gap of ISS-LOCKTAKE-003 is removed, not narrowed).

### Safety argument for step 4 (replace)
- We hold the claim `<lock>.claim.<dt>` (step 2). Nothing but its creator ever removes a claim (policy below), so no other taker for `dt` can sit between its own steps 2 and 4.
- Step 3 established, a few syscalls before step 4, that the lock still holds D's exact bytes and D's pid is dead. What can change the lock between 3 and 4: (i) D's holder: dead (P1: one PID namespace); (ii) a plain acquirer: its `wx` cannot succeed while the file exists; (iii) another taker: excluded by the claim (a taker with a stale view that creates the claim name AFTER we consumed it fails step 3, because the lock no longer holds D's bytes, and never reaches step 4). So under P1-P3 the file replaced in step 4 is still D.
- Rename-over is atomic on POSIX and NTFS (MoveFileEx REPLACE_EXISTING): a reader or plain acquirer sees D or our lock, never nothing. The link-back gap is closed by having no link-back.
- Holes found and NOT papered over: (a) D's holder is actually alive (probe lies: shared lock dir across PID namespaces, ISS-LOCKTAKE-005): needs a lock older than `staleMs` (30 s), i.e. a stalled holder; `owns()` narrows it; not closed. (b) An OPERATOR deleting the dead lock by hand inside the one-syscall gap between step 3 and step 4 while a third process `wx`-creates a new lock there: step 4 then renames over that live lock. A plain rename-over cannot be made conditional on identity, and the alternatives (unlink then create; rename away and check) reintroduce a gap or move a live lock. Filed as **ISS-LOCKTAKE-007** (medium, open). Preconditions: P1 plus, in practice, P4: do not delete a lock file by hand while a takeover claim for it is present.

### Abandoned-claim policy (the simple one)
A claim is NEVER removed automatically. It blocks takeover of THAT dead token only; a later dead lock has a new token and so a new claim name, so a stale claim cannot block a future takeover (test "an abandoned claim ... blocks only that dead token"). The `locked` message names the claim file for manual recovery. Why not auto-expire via a second-level claim: it adds a recursive protocol on a data-write path to recover from a claimant dying inside a window of a few syscalls (the claim body IS the new lock, so there is no long-lived claim phase); property (1) beats (2). Cost: that rare case needs a human.

### Age rule
Takeover needs proof of death AND `age > staleMs`, age from the lock's own recorded `at` against the injected clock: exactly `staleMs` is not old, `staleMs + 1` is. `ageOf` returns "unknown = not old" for a missing / unparseable `at` or one more than 5 s in the future, and never goes negative, so a clock stepped back or a hostile future stamp can only DELAY a takeover; a clock stepped forward still needs proof of death. The wait deadline has a floor of the napped time, so a clock stepped back cannot stretch `waitMs` (found while testing; cycle 0 had the same flaw).
Also: empty / truncated / oversized / non-JSON locks are never taken over (ISS-LOCKTAKE-006 stays open, low: manual recovery; telling a crash-between-create-and-write from a slow writer needs more than the age rule). `save` still calls `owns()` immediately before its data rename; release still verifies the token. No `link` call remains anywhere (contract P2 "hard links required" is moot: takeover works on a volume without link support).

## Explorer (`join-rules-store-lock-explore.test.ts`; the real generators, injected clock and probe, in-memory fs; directed plan and a seeded subset on a real temp dir)
Invariants after every step: at most one believer; a believer's token is in the lock file; the lock file exists from the start until the last release (no gap); data written only by the believer while the lock still carries its token; no live lock unlinked or renamed over, no foreign claim unlinked or renamed; at the end nothing left over and (dead-holder runs) someone recovered.

| scope | orderings | violating |
|---|---|---|
| EXHAUSTIVE, 2 takers, aged dead lock | 27,412 complete orderings (187 distinct states) | 0 |
| EXHAUSTIVE, 3 takers, aged dead lock (ISS-004 shape) | 1,638,018,372 (2,876 states) | 0 |
| EXHAUSTIVE, 2 takers + original holder alive and slow (late save + release), lock older than staleMs | 91,230 (264 states) | 0 |
| SEEDED, 4 takers + 1 normal acquirer, retries, seed 20261011 | 60,000 | 0 |
| SEEDED, ISS-004 scenario, 3 takers, lock aged 100 s, seed 20261012 | 25,000 (checker saw 35 + 27 in 12,000 on the old code) | 0 |
| SEEDED, live holder + 3 takers, seed 20261013 | 25,000 | 0 |
| SEEDED, a taker dies at a random point before it holds, seed 20261014 | 20,000 | 0 |
| REAL FILES, one taker paused at each of 13 steps x 3 roles, others run to the end | 39 directed plans + 400 seeded (seed 20261018) | 0 |

Exhaustive method: depth-first over reachable states with replay (generators cannot be cloned); a state = file contents + each actor's observation history and step position + holders; complete-ordering counts are summed over the state DAG. Self-check test: the memoised count equals a plain un-memoised enumeration (27,412 = 27,412). The first state key omitted each actor's step position and this self-check caught it (68,766 vs 27,412); fixed. The checker's literal plan `0x4,1x4,...` counts the OLD fs-call granularity and cannot be replayed on the new protocol; the directed plan above is the same scenario (one taker paused at every point while two others run to completion).
Residuals MEASURED, not asserted (printed by tests): probe lies about a live holder: lock YOUNGER than staleMs 0/20,000 violating (asserted), lock older 10,791/20,000 violating (ISS-LOCKTAKE-005/003, owns()->rename; unsupported P1); operator deletes the lock mid-takeover: 1,938/12,000 violating (ISS-LOCKTAKE-007; the explorer schedules the delete at a step boundary, in reality it must land in one syscall gap).

## D-015: the ledger's own reproductions, re-run
- **ISS-LOCKTAKE-004: 4/5, one left open and named.** (1) mtime of the claim: the claim's mtime is its own while the lock is backdated 1 h, and its body carries the claimant's time (guard "claimant's own"): pass. (2) Directed 3-contender plan: pass (real files, plus exhaustive). (3) Random bursty, 3 takers, lock aged 100 s: 25,000 seeded and 1.6e9 exhaustive: 0 violating (old code: 35/12,000). (4) Control, lock not older than staleMs: never taken (age tests): pass. (5) Operator deleting the dead lock mid-takeover: NOT closed (ISS-LOCKTAKE-007).
- **ISS-LOCKTAKE-003: 2/2.** (a) ownership check -> data rename with a takeover in between: write refused, nothing written ("a holder wrongly judged dead wakes ..."). (b) release restore gap: releasing a foreign lock performs one read and nothing else; no live lock is destroyed in any ordering of the live-holder runs. (The row's residual, owns()->rename with a lying probe, is ISS-005.)
- **ISS-T037LOCK-001: 2/2.** Repro 1 (lockWaitMs 1000) and repro 2 (lockStaleMs 200): real child, real SIGKILL, real OS probe: recovered. CHANGED by the age requirement: the recorded repro 1 expects recovery right after the kill, which now needs the lock older than staleMs, so the test sets `lockTest.now = Date.now() + 31000`; a third test pins the delay (a young lock stays `locked`, byte-identical, then recovers once older).

## Existing assertions changed (old -> new, why)
1. Both ISS-T037LOCK-001 repros: add the injected clock +31 s (age rule).
2. "clock stepped hours forward and back": was recovered for skew +3 h AND -3 h; now +3 h recovered, -3 h and -40 days refused (a lock from the future is not old; delay only).
3. "two takers racing": steps `judged/linked/verified/renamed` -> `claim/reread/replace/verify`; the `seen` assertion pinning the tombstone sequence removed; added "the loser is told a claim exists"; same one-winner / nothing-left checks.
4. "an abandoned takeover tombstone expires": replaced by "an abandoned claim is never removed automatically and blocks only that dead token" (policy change).
5. "a holder wrongly judged dead wakes": setup only (taker's clock +31 s so the lock is old enough); assertions unchanged.
The other original tests are unchanged and pass; store tests 12/12.

## Tests added
Guards file, 16 tests: host case; token pattern (separators, `..`, NUL, newline, 65 and 300 chars, empty); age boundary (staleMs, +1, -1, clock back / forward, future, garbage, missing); recorded time not mtime; claim body and mtime are the claimant's own; claim `wx`; re-read; re-probe; age re-check; post-replace verification; failed replace; claim-holder death and manual recovery; empty / truncated lock (006); release moves nothing (003); no `link` in source ("link replaced by copy" and link-back are moot: there is no link); public-API takeover report. Explorer file, 11 tests (table above).

## Mutations (lane-unique harness in this worktree, untracked, deleted before commit; byte backup per mutation, restore in `finally` plus an exit handler, 150 s hard timeout per run, `git hash-object` equal before and after every mutation; targeted test files only)

| mutation | result | killed by |
|---|---|---|
| M1 claim not exclusive (EEXIST ignored) | killed (4) | guard "claim is created exclusively"; "claim-holder death"; "two takers racing" |
| M2 claim age taken from the dead lock | killed (1) | guard "claim carries the CLAIMANT's own ..." |
| M3 re-read-and-compare skipped | killed (2) | guard "re-read after the claim"; "two takers racing" |
| M4 re-probe skipped | killed (1) | guard "re-probe after the claim" |
| M5 age condition removed | killed (4) | guards "age boundary", "recorded time", "age re-check" |
| M6 age from mtime instead of recorded time | killed (15) | guard "age comes from the RECORDED time" and every takeover test |
| M7 host compared case-insensitively (judge and re-check) | killed (1) | guard "host is compared EXACTLY" |
| M7a host case-insensitive at the judge only | SURVIVES: equivalent mutant, the step-3 re-check still compares exactly (redundant by design) | |
| M8 token pattern widened | killed (1) | guard "token pattern" |
| M9 ownership check before data rename removed | killed (1) | "a holder wrongly judged dead wakes ..." |
| M10 release without token check | killed (2) | guard "release gap"; "a holder wrongly judged dead wakes" |
| M11 post-replace verification skipped | killed (1) | guard "post-replace verification" |
| M12 replace = unlink dead lock then rename (gap) | killed (1) | guard "a failed replace (EPERM) ..." |
| M13 claim name not derived from the dead token | killed (4) | guards "claimant's own", "created exclusively", "claim-holder death" |
| M14 future recorded time treated as old | killed (3) | guards "age boundary", "age re-check"; "clock stepped" |
| M15 own claim not dropped after a failed re-read | killed (2) | guard "re-read after the claim"; "two takers racing" |

No mutation was killed by a hang. Honest note: my first M8 run was invalid (a backslash was lost when the harness was written, the mutated regex became `[sS]` and broke everything; the "18 killed" was bogus); the re-run with `[^]` gives the single correct kill above.

## Limits left open
ISS-LOCKTAKE-005 (medium: pid namespaces / lying probe; the age rule makes it a >30 s stalled-holder case), ISS-LOCKTAKE-001 (pid reuse, safe), ISS-LOCKTAKE-002 (other host / legacy lock, safe), ISS-LOCKTAKE-006 (empty lock: manual), **ISS-LOCKTAKE-007** (new, medium: operator deletion inside the replace gap; rename-over is unconditional). Abandoned claim: manual. Contract P2 (hard links) is obsolete; P1 and P3 still apply. Not made safe: 005 and 007 as described above.

## Merge with main (no merge, no rebase performed)
`join-rules-store.ts` differs from the cycle-0 commit only by two comment lines and a SECOND import line placed after the lock import, so it does not touch main's inserted `join-rules-optout` import line or main's `recordTenantOptOut` change. Copying main's whole file into the lane was not possible: it needs main's `join-rules-optout.ts` / `join-rules.ts` changes, which this unit must not edit. The store test file is not modified by this lane (main's +140 lines apply untouched).

## Evidence
Environment: node v24.19.0 off PATH (prepended), from `packages/meeting-bot`; machine CPU shared with a production worker.
```
node --test --import tsx src/calendar/join-rules-store-lock.test.ts
  stress: 3 round(s) x 8 processes x 24 locked writes, 0 errors
  ℹ tests 22  ℹ pass 22  ℹ fail 0
node --test --import tsx src/calendar/join-rules-store-lock-guards.test.ts   -> ℹ tests 16  ℹ pass 16  ℹ fail 0
node --test --import tsx src/calendar/join-rules-store-lock-explore.test.ts  -> ℹ tests 11  ℹ pass 11  ℹ fail 0   (2m41s)
  exhaustive [2 takers over an aged dead lock]: 27412 complete orderings over 187 distinct states, longest 19 steps, 0 violating
  exhaustive [3 takers over an aged dead lock (ISS-LOCKTAKE-004 shape)]: 1638018372 complete orderings over 2876 distinct states, longest 26 steps, 0 violating
  exhaustive [2 takers + the original holder alive and slow ...]: 91230 complete orderings over 264 distinct states, longest 17 steps, 0 violating
  self-check: memoised 27412 vs plain 27412 complete orderings
  seeded [5 contenders, waitMs 40] seed=20261011: 60000 orderings, 2676519 steps, 0 violating
  seeded [ISS-004: 3 takers aged lock] seed=20261012: 25000 orderings, 0 violating
  seeded [live holder + 3 takers] seed=20261013: 25000 orderings, 0 violating
  seeded [claimant death] seed=20261014: 20000 orderings, 0 violating
  lying probe: young lock 0/20000 violating (must be 0); old lock 10791/20000 violating (residual 005/003)
  operator delete mid-takeover, 3 takers + operator, seed=20261017: 12000 orderings, 1938 violating
  real files: 39 directed plans + 400 seeded orderings (seed 20261018), 0 violating
node --test --import tsx src/calendar/join-rules-store.test.ts -> ℹ tests 12  ℹ pass 12  ℹ fail 0
node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json   (packages/meeting-bot) -> exit 0
git merge-tree --write-tree --name-only HEAD codex/machine-migration-2026-10-09 -> tree 01d4b7b3c2ba78372a005e4bbf116c1fda11caea, exit 0, no CONFLICT lines
  (HEAD = 5a764db, the code commit; the merged tree's calendar/ holds 30 files; merged store.ts has main's OptOutMeeting import and both lock imports)
node scripts/lint-dirsize.mjs (in the lane, whose base predates main's alerts/ move): calendar/ 32 files > 30. The MERGED tree has 30 (limit 30), so the budget holds once merged.
Budgets (non-blank): lock 76, steps 149, store 190, lock test 287, guards test 126, explore test 227 (limits 300 / 400).
```

## Relocation (after the cycle-1 PASS, ISS-LOCKTAKE-009)
`join-rules-store-lock-explore.test.ts` and `join-rules-store-lock-guards.test.ts` moved (git mv) to `packages/meeting-bot/src/calendar/join-rules-lock/` so the calendar directory stays within its loose-file budget (main has 28; this lane's remaining loose addition is `join-rules-store-lock-steps.ts` = 29 <= 30). Only import lines changed (`./` -> `../`) plus the guards test's source-scan path (`path.join(here, "..", f)`). Counts unchanged: explorer 11, guards 16.
