# Verdict — t037-join-rules-stale-lock-takeover
VERDICT: FAIL
Cycle checked: 0
Commit checked: fc59845 (lane/locktake, from f016d4c)

## EXPLANATION
Safety property G1 (never two holders) is violated by a reachable interleaving that needs neither a lying liveness probe nor an unusual deployment: ISS-LOCKTAKE-004 (high).
- The takeover tombstone is a HARD LINK of the lock, so `statSync(tomb).mtimeMs` is the dead lock's own mtime (real NTFS: lock backdated 1 h, fresh link reads age 3600.017 s). The "abandoned tombstone" test is therefore true for every dead lock older than staleMs, so a contender unlinks another taker's live claim and the "only one taker can create that name" guarantee is void.
- A slow taker B (verified, about to rename) then renames the NEW LIVE lock that A already created; the "grab, verify, link back" step leaves no lock file in the gap; a third contender C wx-creates. A and C both hold; A writes data without the lock; B's link-back fails. Harness (real module code, every fs call a scheduling point, worker-thread actors over a virtual fs): directed plan reproduces V1 two-believers + V2 write-without-lock; random bursty scheduling, 3 takers, lock aged 100 s, 12000 orderings: 35 two-believers, 27 writes without the lock, 124 orphaned locks; the same scenario with a lock younger than staleMs, 25000 orderings: none. An operator deleting the dead lock during a takeover (4 actors, 12000): 62 writes without the lock. ISS-LOCKTAKE-003 ("microsecond gaps, low") is re-rated high.
- Orderings run: 3 takers x 20000 random + 25000 + 12000 bursty (none with a fresh lock; violations only when aged), 2/3/4-actor variants, live holder + 2 takers x 20000 (no takeover, none), 4 takers x 10000 (none). Sampling, not exhaustive.
Other verdicts on the brief:
1a pid namespaces: nothing in the repo shares a lock dir across namespaces (docker-compose sets no hostname/network_mode/pid; default hostnames differ so rule (ii) refuses, safe but unrecoverable; a container recreate gets a new hostname so its dead lock is never auto-recovered). WSL2 and `--hostname`/`--uts host` would give equal hostnames with separate pid spaces: live lock taken over. Harness with a lying probe, 1 taker: 868/20000 lost writes through the owns()-to-rename gap. Rated MEDIUM (ISS-LOCKTAKE-005), not low; contract precondition P1 added.
1b pid reuse: only reads as alive; never causes a takeover. Confirmed (low).
1c Windows kill(pid,0), this machine: own pid alive; pid 0 alive (guarded: pid<=0 -> unknown); pid 4 and every service/protected process EPERM (kept); other-session explorer.exe etc alive; negative -> ESRCH (guarded); 1.5, 2^31, 2^40, NaN, strings throw ERR_INVALID_ARG_TYPE (unknown, kept); unused pid ESRCH; exited process whose handle another process (PowerShell Process object) still holds -> ESRCH (dead, correct). No live process produced ESRCH.
1d partial write: single writeSync after wx; a truncated JSON object never parses, so no truncated pid; empty lock = never taken over (fails safe, ISS-LOCKTAKE-006 low).
1e writers: the API host is the only writer; each records its own pid.
3 owns() gap: reachable only when (ii)+(iii) wrongly say dead (1a/1c lying probe) or via ISS-004; residual = the owns()-to-rename microsecond, quantified above.
4 link failure (EPERM/ENOTSUP/EXDEV injected): every contender ends `locked`, lock bytes untouched, no delete-and-create. Good. (But a failed link-back inside release/step 4 loses a foreign lock; only reachable after ISS-004.)
5 hostile content: token regex `^[A-Za-z0-9-]{1,64}$` (no `$`-before-newline quirk in JS) rejects `../x`, `a/b`, `a\n`, `a\b`, NUL, 65 chars: no path escape. Extra keys accepted, float/negative/huge/string pid and empty host rejected, host compared exactly. BUT mutation M10 (regex widened to anything) SURVIVES: that sole path-traversal guard has no test.
6 D-015: ISS-T037LOCK-001 replay (child holds lock, taskkill /F, recordTenantOptOut): 3/3 recovered (lockWaitMs 1000; lockStaleMs 200; lockStaleMs 60000), write succeeded, no leftovers. Left open: not verified, because the unit fails. Deviation (no age): NOT accepted. Age is a strictly additional conjunct (it can only remove takeovers); critical sections last milliseconds, so age > staleMs removes the pid-namespace/probe-lie takeovers (ISS-005) and costs only up to 30 s recovery delay; it does not fix ISS-004 (the lock is old there), which needs the claim redesign.
7 Existing behaviour: test diff is additions only plus one widened import line; lock tests 21/21, store tests 12/12 pass; uncontended save adds only owns() (stat+read) before the same rename.
8 Mutations (10, per-mutation byte backup, restore in finally, hash == HEAD after each): killed 5/10 (any-error=dead, host check skipped, tombstone compare skipped, owns() removed, release without verify). SURVIVED: host case-insensitive (no test; harmless), link replaced by copy (no test), link-back skipped (no test of the restore), post-rename verify skipped (no test), token regex widened (no test). Four survivors are on the exact paths ISS-004 exercises.
9 tsc --noEmit meeting-bot exit 0; lint-dirsize OK; budgets: lock 168, lock test 271, store 189 non-blank. merge-tree vs codex/machine-migration-2026-10-09: CONFLICT in packages/meeting-bot/src/calendar/join-rules-store.ts (changed on both sides); nothing else.
(Harness note: scratchpad scripts were all mine; none touched the worktree. Mutation runner lived in the worktree, untracked, deleted.)

## ISSUES-WRITTEN: ISS-LOCKTAKE-004 (high), ISS-LOCKTAKE-005 (medium), ISS-LOCKTAKE-006 (low); ISS-LOCKTAKE-003 re-rated low -> high; 001, 002 stay low.

## Merge conditions (cycle 1)
1. Fix ISS-LOCKTAKE-004: claim as a separate wx file with its own timestamp (not a hard link), never move a possibly-live lock, plus N>=3 interleaving regression test over a lock aged beyond staleMs.
2. Add the age > staleMs conjunct (ISS-005) and tests for: age gate, link-back, post-rename verify, token regex (M3 optional).
3. Contract preconditions P1-P3 (added to qa/contracts/t037-join-rules-store-lock.md) must be stated by the host wiring.
4. Resolve the join-rules-store.ts conflict with main when merging.
Manifest status not flipped.
