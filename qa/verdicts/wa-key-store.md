# Verdict — wa-key-store (C3B), coordinator A, fix cycle 0
Cycle checked: 0
Policy-Version: proportional-verification/2026-11-22.19
Head: 350df1670df8592b411c0f0a833895a79252caef (base c4bb66b3; worktree D:/KnowledgeBase/.worktrees/wa-c3b, branch wave/c3b-key-store). Blobs: authState.ts bcabe1d4, authState.test.ts 56d7e785 (both equal `git rev-parse HEAD:<file>` in the exported copy).
Date: 2026-11-25. Bound to D:\KnowledgeBase. Dual check, coordinator A (blind: never read the other coordinator's verdict, checkpoint or scratch). Contract as amended in 34c987a0 and e6fa7d87. C3AB-J1 is not part of this verdict.

## Check plan
Tier L (security class: credential handling, tenancy; `dual-trigger: security src/wa/authState.ts:218` read by me: `ownerOf` :217-222, `seal`/`unseal` :236/:245). `tick.mjs --route c4bb66b3..350df167` printed `floor:null dual:false` (the route tool does not see the contract label); no tier gap, the dual check stands on the cited trigger. No UI, no browser, no persona walk. Checks: scoped run of the whole `authState.test.ts` on my own loopback mongod, typecheck, readOnlySocket test, I3/I5 greps, diff-scope read (4c), the coordinator's six facts plus three review findings (probes in my copy), falsification in a copy. SERIAL: one test process at a time (shared laptop).

## Evidence (my own runs, copy = `git archive 350df167` + real copy of the worktree node_modules, scratch `.../scratchpad/c3b-check-a`)
- `C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:47123 npx tsx --test --test-force-exit src/wa/authState.test.ts` -> tests 93, pass 93, fail 0, skipped 0 (37.5 s; mongod 7.0.28, own PID 13472, own dbpath). Seeds printed: C3B-C1a [fake] and [mongo] seed=12446. The no-database run was not repeated (the mongod run includes every case, C8c/C8d too).
- `npm run typecheck` exit 0. `readOnlySocket.test.ts` 4 pass. `git diff --name-only c4bb66b3 350df167` = the two owned files. Diff of readOnlySocket.ts, sessionManager.ts, config.ts, mongo.ts, types.ts empty. `grep -nE 'withTransaction|startSession\(|\.watch\(' authState.ts` empty (exit 1). Worktree `git status` clean. Test-file removed lines (diff): imports, `test(` openers, fs read/readdir setup; no `assert` line removed.

| Item | Result | Evidence |
|---|---|---|
| C3B-C1 | met | C1z, C1a (1000 ops, file/db/Map, both rigs), C1b, 7 existing cases on 3 rigs green; M1 red |
| C3B-C2 | met | C2 all 10 types incl. AppStateSyncKeyData green on fake+mongo; M2 red |
| C3B-C3 | met | raw rows, ALLOWED field set incl. `archivedAt`/`_id`, nonces fresh, owners differ; M3 red |
| C3B-C4 | met | C4a-f green; M4 (AAD empty) red on C4c; C4d/e/f and the `after()` secret sweep green |
| C3B-C5 | met | C5a-d green on both rigs; M5 red on mongo (survives on fake, see P4); M5c red on fake |
| C3B-C6 (a-e) | met | C6a-e green; tie N9, N10 red; duplicate N6 red |
| C3B-C6f | met | 6 cases (3 bodies x fake/mongo) green; N2 red (4 failures) |
| C3B-C7 (security class) | met | C7a-d green; M7 red (C7a, C7d); my probe A1: all restore and repeat-unlink queries, incl. the row-by-row fallback, carry owner A's ObjectId; B and C raw rows byte-identical. Code read: only `mongoLinkedUserIds` :486 is ownerless (creds, `{archiveId:null}`, projection ownerUserId); C7d asserts exactly 2 for 2 calls |
| C3B-C8 | met | C8a, C8b, C8e green; C8c (index read back) and C8d (server TTL, 10 s here) green on my mongod; M8 red |
| I1 | holds | typecheck 0, sessionManager.ts unedited, file branch untouched, I1 test green |
| I2 | holds | no assert removed (diff above) |
| I3 | holds | ALLOWED unchanged (empty diff), 4/4 pass, two-file diff |
| I4 | holds | `after()` sweep over every captured log line and thrown message found no key hex, nonce, ct or canary on 93 tests |
| I5 | holds | grep empty, I5/I6 test green |
| I6 | holds | loopback guard table test green; every mongo case asserts host first; only my 127.0.0.1:47123 used |

## Falsification (copy, per-mutation byte backup, restore in finally and on SIGINT/SIGTERM, 150 s timeout, `git hash-object` == `bcabe1d4` after every mutant; `--test-name-pattern`, both rigs, seed 12345)
| Mutant | Edit (authState.ts) | Green before | Red after, killed by |
|---|---|---|---|
| M1 C1 | missing id `continue` instead of `null` | 2/2 | C3B-C1a fake+mongo |
| M2 C2 | `AppStateSyncKeyData.fromObject` removed | 3/3 | C3B-C2 fake+mongo |
| M3 C3 | nonce `Buffer.alloc(12)` | 2/2 | C3B-C3 fake+mongo |
| M4 C4 | `aad` = empty buffer | 2/2 | C3B-C4c fake+mongo |
| M5 C5 | `void Promise.all(tasks)` (write-behind) | 2/2 | C3B-C5a [mongo] only |
| N2 C6f | `matchedCount === 0` -> `< 0` | 6/6 | C6f cases, 4 failures |
| N6 C6e dup | repeat unlink rethrows any error | 4/4 | C6e duplicate (unlink) fake+mongo |
| N9 C6e tie | `$lte` -> `$lt` (:444) | 4/4 | C6e tie unlink fake+mongo |
| N10 C6e tie | `$gt` -> `$gte` (:477) | 4/4 | C6e tie restore fake+mongo |
| M7 C7 | key read not owner-scoped | 8/8 | C7a, C7d fake+mongo |
| M8 C8 | age cutoff = epoch | 2/2 | C3B-C8b fake+mongo |
| M5c C5c2 | per-row lock removed | 2/2 | C3B-C5c2 [fake] |
12 mutants, none survived on at least one rig. mutant-cap-raise: authState.ts:444 and :477 (fact 2 asked for the tie tests to be falsified), authState.ts:265 (fact 5 asked whether C5c2 is discriminating). Hash check passed after each; the copy ended at the HEAD blobs. Log: scratchpad `c3b-check-a/mutants.log`.

## Rulings on the six facts
1. Red-first on the fake rig only: not a criterion; my mutants run on both rigs (N2, N6, N9, N10 are red on mongod too). Accepted.
2. Tie tests green before repair: N9 and N10 each turn the matching tie test red. They pin the rule.
3. Clash rule keeps the live row, drops the archived twin (:384/:393/:414). Probe A1 (fake and mongod, a second and third owner present, frozen clock): restore and repeat unlink each leave exactly one row per (type, id), the survivor decrypts and is the live straggler, the archive is consumed or complete, B and C raw rows are byte-identical, every query is scoped to A. Probe A2 (failure injected after the twin `deleteOne` and before the `updateOne`): the repeat completes with one row, nothing lost. Holds.
4. The four filed items: none breaks a criterion as now written. The late key `set` then restore returns true (C6f test, green). I did not measure a relink reading leftover live key rows.
5. Evidence is enough. C5b proves invisibility on the issuing handle and the database as the contract now binds it (weak by design: the handle has no cache). C5c2 asserts the row equals the in-memory creds after the last awaited call (counter 99) as written; M5c shows it discriminates. C6e now has a partial-progress injection (my A2) besides the whole-statement one.
6. Confirmed (C7 row above).

## Review findings from the coordinator's message (reproduced, judged against the contract as written)
1. Medium, stale handle clobber: reproduced (probe A3, fake and mongod): after unlink and a fresh pairing, a straggler handle's `saveCreds` resolves and overwrites the new link's creds; owner B untouched. Same for a handle opened before `restoreAuthState` (`held=false` upserts). It conforms to C3B-C6f as worded ("no live creds row of the owner matches") and the file store behaves the same; one owner only, so not C3B-C7. Not a failure; filed P1.
2. Low, fallback `updateOne` (:402) filters `archiveId: null` only: confirmed by reading; one owner, creds never touched, inside the contract's accepted bounded misclassification. P2.
3. Low, test gaps: confirmed by reading (fallback queries not recorded, no second owner, no injection at :407-408, :1023 never reaches the clash, :1057 does not assert the clash first). My probes A1 and A2 cover the first three and pass; N6/N7-style mutants show the unlink duplicate test does exercise the clash. P3.

## Findings (none blocking)
PROPOSED-ISSUE: {"severity":"medium","feature":"wa-key-store","title":"saveCreds after a relink or restore by a stale handle overwrites the live creds (held is a boolean, update filter is the owner's live row, not the row the handle loaded)","evidence":"src/wa/authState.ts:306,355; probe A3 reproduced on fake and loopback mongod; also a handle opened before restoreAuthState","fix_direction":"remember the loaded or created row _id and filter updateOne on it; same-owner credential handling, conforms to C3B-C6f as worded, lease is the intended guard","type":"credential-handling"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-key-store","title":"row-by-row fallback move filters on archiveId null only, so a write landing after the find can be moved into the archive","evidence":"src/wa/authState.ts:401-409","fix_direction":"add updatedAt <= archivedAt to the fallback row filter; same owner only","type":"correctness"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-key-store","title":"tests do not record the clash fallback's queries, have no second owner at a clash, no interruption between twin deleteOne and updateOne, no non-11000 error through the fallback, and :1057 does not assert the clash existed","evidence":"src/wa/authState.test.ts:1041,1057,1023; checker probes A1/A2 pass","fix_direction":"add the recording, second-owner and interruption cases","type":"test-gap"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-key-store","title":"the in-memory fake does not catch a write-behind mutant (C5a survives on the fake rig, dies only on loopback mongod)","evidence":"mutant M5 `void Promise.all(tasks)`: fake 2/2 stays green on the fake rig, red on mongo","fix_direction":"make the fake's operations settle later than the caller's await, or keep C5a mongod-backed","type":"test-gap"}

## NOT-MEASURED
Replica set, hosted Mongo, step-down, write concerns; the production key and key rotation; a real Baileys socket or WhatsApp link; C3AB-J1 (checker's joint check, not run here); a relink reading leftover live key rows (filed); the no-database (41 skipped) run, not repeated; the `.env` files and `sessions/` folders were never opened.

VERDICT: PASS
SCOREBOARD: 8/8 criteria met, 6/6 invariants hold
TIER: L (credential handling and tenancy, `src/wa/authState.ts:217-245`; dual check required by the cited trigger)
FAILURES: none
CAPABILITY-COVERAGE: 12/12 mutants reproduced red on at least one rig, one per criterion at least (M5 only on mongo)
LIVE-BROWSER: not-applicable (library module, no UI path changed)
ISSUES-WRITTEN: none (dual coordinator: four PROPOSED-ISSUE lines above, P1 to P4 in order)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent; no ANTHROPIC_BASE_URL override)
EXPLANATION: Every criterion and invariant is evidenced by my own 93/93 run on a loopback mongod and by 12 killed mutants; the repair (LINK_GONE, duplicate rule, tie rule) behaves as the contract now reads, and my probes show the clash step leaves exactly one decryptable row with no other owner touched. The medium finding (a stale handle can overwrite a relinked owner's creds) is real and reproduced, but it conforms to C6f as worded and stays within one owner; the maintainer or Approver may want it closed (suggested: filter on the loaded row _id). The route tool printed dual:false; the dual requirement rests on the cited security trigger and the contract's security-class label.
Metrics: start=2026-11-25T12:08:49Z end=2026-11-25T12:25:00Z wall_min=16 agent_min=unavailable blocked_min=0 suite_runs=1 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=970 mutants=12 defects_unit=0 defects_6c=0
