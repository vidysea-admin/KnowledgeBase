# Verdict (coordinator B): wa-key-store (C3B), fix cycle 0

Cycle checked: 0
Policy-Version: proportional-verification/2026-11-22.19
Head: 350df1670df8592b411c0f0a833895a79252caef (branch wave/c3b-key-store, base c4bb66b3; diff = src/wa/authState.ts + src/wa/authState.test.ts only)
Contract: qa/contracts/wa-key-store.md (34c987a0, e6fa7d87). Manifest: qa/manifests/wa-key-store.md (c221ae18), Dual check: required, dual-trigger src/wa/authState.ts:218.
Evidence dir (not committed): qa/evidence/wa-key-store-b/

## Check plan (step 0)
1. Blind copy of the head archive in my scratch folder, real node_modules copy, no install, no network, one test process at a time.
2. Independent full run, own seed 777, with my own loopback mongod 127.0.0.1:27931 (PID 45624, stopped, dbpath removed): 93/93. Same file with no database: 52 pass, 41 skipped as NOT-MEASURED. Typecheck clean.
3. Scratch probes (not in repo): P1 duplicate/tie with two other owners, P2 stale handle, P3 partial updateMany, P4 straggler after restore, P5 projection. 8/8 on fake+mongo, P5 green on fake.
4. Falsification: one mutant per changed criterion (C1..C8, C6e, C6f), cap 10 (tier L), each in its own copy, byte backup per mutation, restore on exit/interrupt/error, `git hash-object` = HEAD blob after each.
5. Recompute of the floor under .19-2: `tick.mjs --route c4bb66b3..350df167` returned `{"floor":null,"dual":false,"rules_fired":[]}`. I do not lower the tier; the manifest's cited security trigger stands and C3B-C7 is security class, so the dual check stands.

## Evidence per criterion and invariant
| ID | Result | Evidence |
|---|---|---|
| C1 (parity, cache, missing = null) | MET | C1a/C1b/C1z green on file/fake/mongo; X1 killed |
| C2 (byte-for-byte, null deletes) | MET | C2 green x3 rigs; X2 killed (9 tests red) |
| C3 (ciphertext only, fresh nonces) | MET | C3 fake+mongo; X3 killed |
| C4 a-f (typed errors, AAD, no fallback, no leak) | MET | C4a-f fake+mongo; X4 killed on C4c |
| C5 a-d (visibility, rejected write, E11000 retry, storm, reader) | MET | green fake+mongo; X5 killed on C5c2 |
| C6 a-d (archive, prune 5, restore, listing) | MET | green fake+mongo; P1, P3 |
| C6e (failed halves repeat; duplicate; tie) | MET | duplicate/tie green fake+mongo; P1 both directions, P3; X7 killed (4 tests) |
| C6f (no revival of a link) | MET | 3 tests fake+mongo; P4; X6 killed |
| C7 a-d (owner isolation, security class) | MET | green fake+mongo; P1 (every query owner-scoped, other owners byte-identical), P5 (projection). Builder suite does not pin two clauses, see P4 below |
| C8 a-e (age limit, TTL index) | MET | green; C8c/C8d on real mongod; X10 killed on C8a |
| I1 file store shape, I5 no transaction/change stream, I6 loopback guard | HOLD | green; I5 grep empty; readOnlySocket 4/4 |
| I2 scope, I3, I4 | HOLD | diff scope exact (2 files); typecheck clean |

## Falsification
| Mutant | Criterion | Change | Result | Hash after restore |
|---|---|---|---|---|
| X1 | C1 | drop `data[id] = null` for a missing row | red: C1a | = HEAD blob |
| X2 | C2 | parse without BufferJSON reviver | red: 9 tests | = HEAD blob |
| X3 | C3 | fixed zero nonce | red: C3 | = HEAD blob |
| X4 | C4 | owner removed from AAD | red: C4c | = HEAD blob |
| X5 | C5 | creds lock bypassed | red: C5c2 | = HEAD blob |
| X6 | C6f | saveCreds filter loses archiveId:null | red: C6f | = HEAD blob |
| X7 | C6e | orphan filter `$lte` to `$lt` (tie) | red: C6a, C6e, C6e duplicate, tie | = HEAD blob |
| X8 | C7 | ownerless find loses projection | SURVIVES builder suite; killed by my P5 | = HEAD blob |
| X9 | C7 | fallback `deleteOne` loses owner id | SURVIVES builder suite; killed by my P1 | = HEAD blob |
| X10 | C8 | `$unset archivedAt` dropped on restore | red: C8a | = HEAD blob |
Floor met for every changed criterion: each of C1..C8, C6e, C6f has a mutant that is green before and red after. For C7 the red result comes from my probes (P5 for X8, P1 for X9); against the builder suite alone X8 and X9 survive, because its C7d recording asserts filters only, never the find options and never the duplicate-fallback path. Details: qa/evidence/wa-key-store-b/mutants-result.json, mutants-probe-result.json.

## Rulings on the six facts
1. Acceptable: the mutants (builder's 32 and mine) are the stronger evidence, so the count of tests is not the claim.
2. Tie tests pin existing behaviour; N9, N10 and my X7 falsify them.
3. Confirmed by P1 in both directions: other owners untouched, every query carries the owner id.
4. None of the four items breaks a criterion as written.
5. The evidence for C5b, C5c2 and C6e is adequate now.
6. Confirmed: `linkedUserIds` is the single ownerless query (creds only, `{archiveId: null}`, projecting `ownerUserId`; P5).

## Rulings on the three review findings
1. Stale handle after an unlink and a fresh pairing overwrites the fresh creds (reproduced, P2). It conforms to C6f as worded (held handle, LINK_GONE only when no live row matches), is the same kind as the file store's pre-existing behaviour, and the C3A lease is the guard. PROPOSED-ISSUE P1, medium.
2. Fallback filter lacks `updatedAt <= archivedAt` (same owner, key rows only; debris/orphan boundary not applied row by row). Low, P2.
3. Test gaps. Low, P3.

## Findings
PROPOSED-ISSUE: {"id":"P1","sev":"medium","criterion":"C3B-C6f","title":"saveCreds on a stale held handle overwrites a fresh pairing's creds row after unlink and relink","evidence":"qa/evidence/wa-key-store-b/authState.probe.test.ts.txt PROBE-P2","fix_direction":"record the creds row _id on the handle and filter updateOne on _id, not on the live predicate"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","criterion":"C3B-C6e","title":"row-by-row fallback in moveKeysOutOfArchive/moveKeysIntoArchive lacks the updatedAt <= archivedAt tie rule that the bulk path applies","fix_direction":"apply the same predicate in the fallback"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","criterion":"C3B-C6","title":"review finding 3 test gaps (see manifest Filed-not-built)","fix_direction":"add the missing assertions"}
PROPOSED-ISSUE: {"id":"P4","sev":"medium","criterion":"C3B-C7","title":"C7d recording test does not pin the projection of the one ownerless find, nor the owner id on the duplicate-fallback deleteOne; both mutants survive the builder suite (code is correct, my probes P5 and P1 are green on the head)","fix_direction":"record find options in Probe and assert {projection:{ownerUserId:1}}; run the clash path under the C7d recording","security_class":true}

## NOT-MEASURED
- Mutants ran without a database, so their kills are on the [fake] rig; the [mongo] rig was measured only in my full run (93/93).
- Joint check C3AB-J1 (not part of this verdict). No live-browser, no production server, no load or soak run.

VERDICT: PASS
SCOREBOARD: 8/8 criteria met, 6/6 invariants hold
TIER: L (security class credential handling and tenancy; writes to the auth store)
FAILURES: none (P1 to P4 are proposed rows, none breaks a criterion as worded)
CAPABILITY-COVERAGE: not-applicable (no capability rows)
LIVE-BROWSER: not-applicable (src/wa/authState.ts, src/wa/authState.test.ts)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only)
EXECUTOR: claude-sonnet-subagent
EXPLANATION: The head passes 93/93 on my own seed and loopback database, typecheck is clean, the diff scope is exact, and ten mutants plus five probes confirm each changed criterion. The `tick.mjs --route` floor was null while the manifest cites a security trigger, and I kept L. Two C7 clauses (find projection, fallback owner id) are correct in the code but unpinned by the builder suite, filed as P4.
Metrics: start=2026-11-25T12:27:42Z end=2026-11-25T12:50:00Z wall_min=22 agent_min=22 blocked_min=0 suite_runs=16 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable builder_min=unavailable check_min=22 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=1320 mutants=10 defects_unit=0 defects_6c=0
