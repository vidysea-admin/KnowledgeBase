# t039-takeover-seam verdict

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: ccc78b467c335bc0966dead782d8a4be0f302a8d
Base SHA: a9fac545d0da015668d7dba455031b3a0fe52078
Final blob hashes (git hash-object == HEAD blob): live-recording.ts 900ff0922bafe3168cec6394470672ab073af996; live-recording-takeover-seam.test.ts ed5a1d506f25dfc0d29c82d23c7a4e0782afa227

Scope: ISS-T039DUPES-006 only (D-015: its recorded reproductions are the three mutants below). Independent re-run; maker numbers not trusted.

## 1. Seam inert in production: yes
- Diff is 2 files. Every hook is optional; `hooks` defaults to `{}`. `link = hooks.link ?? linkSync` where `linkSync` is the same `node:fs` import (live-recording.ts:19) used before; both call sites call `link(a,b)` with the same two arguments and the same catch on `e.code === "EEXIST"`. `fs.linkSync` has no `this` dependence, so the unbound alias is equivalent.
- `afterJudgedDead?.()` and `beforeReplace?.()` are optional calls: with no hooks nothing runs and control flow is unchanged. Both sit after the liveness judgement and inside the re-read guard, so they add no branch.
- Production callers: claimed-record.ts:31 and stale-race-worker.ts:8 pass 4 args or fewer. `ClaimHooks` is referenced only by the new test.
- Test 1 ("no hooks (production call shape)") passes.

## 2. Mutants, own harness (.chk/mut.py: per-mutation byte backup, try/finally plus SIGINT/SIGTERM restore, 300 s timeout; git hash-object == HEAD blob after: 900ff092 matches)
Green baseline: 5/5 pass (exit 0). Each mutation was verified applied (bytes differ).
- A1 check-then-plain-write on the takeover claim (existsSync then writeFileSync instead of link): KILLED, 1 fail. Only the link-target test kills it. See N1.
- A2 skip the takeover claim (`got = true`): KILLED, 2 fails (the held-claim contender test and the link test).
- A3 check-then-write on the primary claim: KILLED, 2 fails.
- Extra B1 skip the re-read under the claim (`if (true)`): KILLED, 2 fails.
- Extra B4 never judge the holder live: KILLED, 4 fails.
- Extra B2 plain write instead of rename: SURVIVED. Equivalent for exclusivity (the cycle-2 verdict of iss-t039cmd-001-002 already classed it equivalent); not an ISS-006 mutant.
- Extra B3 `won = true` (skip post-rename verification): SURVIVED; not an ISS-006 mutant, out of scope, not filed.
The three ledger mutants match the issue's evidence text ("check-then-plain-write instead of the linked claim", "skipping the takeover claim", "check-then-write on the primary claim"); the maker's forms and mine agree. 3/3 killed deterministically, without process timing.

## 3. live-recording.test.ts failure "ISS-T039CMD-002 verbatim ... poller": not caused by this unit; maker's claim verified
- Candidate run: 13 pass, 1 fail (exit 1). Base a9fac545 run in a separate worktree: the same 13 pass, 1 fail, same message ("cannot tell whether a bot is already in this meeting (active webinar operation has no verifiable meeting identity)"). The candidate diff does not touch send-now-command.ts.
- Cause: a9fac545 (the "Checkpoint uncommitted lane" commit, which brought in the t039-manual-jobs-operation-authority work) added to readLiveJobs (send-now-command.ts:119-128) `throw new Error("active webinar operation has no verifiable meeting identity")` for an active operations row whose id has no source-reconciliation alias and no scheduled file. That throw is deliberate fail-closed behaviour with its own assertion (send-now-command.test.ts:38). It runs before readLiveRecordings is consulted (readAllLiveJobs, send-now-command.ts:136-138). The old fixture has an operations row with no `source.reconciliation`, so it now takes that path.
- Conclusion: INTENTIONAL BEHAVIOUR CHANGE by a later unit, not a safety regression. The ISS-T039CMD-002 safety property holds at both SHAs: the failing test's own assertions (`runSendNow(...) === 1`, `launched.length === 0`) pass; only the message regex `/already queued/` fails, because the refusal now comes from the "cannot tell" path. No second bot launches.
- FINDING F1 (out of scope of this unit; does not block this PASS): the verbatim regression test for the `verified` issue ISS-T039CMD-002 was left stale by a9fac545 and is red at base. The unit that changed the behaviour (t039-manual-jobs-operation-authority, verdict HOLD, cycle 1) did not reconcile it. Fix for that unit's maker: give the live-recording.test.ts fixture a `source.reconciliation` alias for webinar-1 so the claim is matched and the refusal is "already queued", or assert `/cannot tell whether a bot is already in this meeting/`. Open question for the owner: whether a live-recording claim that already identifies the meeting should win over an unmappable ops row (today the throw hides the more specific refusal). This is fail-closed, not unsafe.

## Evidence (lane, untracked): .chk/out/seam-green.txt and .exit, mutants.txt, A1/A2/A3/B1/B2/B3/B4 *.txt, lr-cand.txt/.exit, lr-base.txt. Harness: .chk/mut.py.

## Not verified
- live-recording-stale-race.test.ts (spawns processes; excluded by instruction).
- Whole send-now-command.test.ts and any full suite; typecheck/lint not run (tsx loads the files).
- Token and active-time accounting not measured by the helper (runtime totals unknown, stays null).

EXPLANATION (notes, not issues): N1 the A1 mutant is behaviourally equivalent for exclusivity (only the claim holder reaches the rename), so its kill rests on test 4 asserting the takeover claim goes through the injected link primitive; implementation-coupled, but it is what the issue's fix_direction asks for. N2 `ClaimHooks.link` is test-only surface on a public export; documented INERT, acceptable.

ISSUES-WRITTEN: none
Ledger: ISS-T039DUPES-006 may be flipped open to fixed/verified at this SHA (mutants 3/3 killed, seam inert). F1 is not part of this flip.
