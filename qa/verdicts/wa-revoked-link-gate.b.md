# Verdict B (blind dual coordinator) -- wa-revoked-link-gate
Cycle checked: 0
Checked: base 15de5c76 .. code 056056b4, manifest commit a4c969a2 (bound worktree clean before and after; all runs in a `git archive` copy of a4c969a2 under the scratchpad, node_modules junctions removed afterwards via `cmd /c rmdir`).
Policy-Version: proportional-verification/2026-10-19.17 (judged under the manifest pin)

## Check plan (step 0)
Tier L (dual-trigger security knowledge.ts:119). Steps: diff identity vs manifest; read the predicate and every external-model call site (G1 tree, G2 transcript, G2 native, G3 reader, G4 indexer) plus the /route index path; re-run the C1/C2/C3 pre-check files myself; one distinct falsification per criterion plus one per call site; confirm the base reds on 15de5c76; leak hunt beyond the call sites. I did not read any other coordinator's evidence.

VERDICT: PASS (criteria C1-C3); one security-class PROPOSED-ISSUE (F1) says gate H-14 is not yet effective end to end on /route
SCOREBOARD: 3/3 criteria met, floor met (own pre-check runs green, 9 of 9 own mutants red in the intended suite, base reds identical on base and head)
TIER: L

## Criteria evidence (own runs)
| Id | Evidence | Result |
|---|---|---|
| C1 | `node --test --import tsx apps/api/src/visibility/external-model-gate.test.ts` -> 34 pass / 0 fail. knowledge.ts:127 is now `source !== null && (!wa \|\| (link !== null && link._id === linkId && link.live === true && link.state !== "suspended" && link.studentData === "no"))`, inside `guarded(false, ...)`, so any read error is closed. | met |
| C2 | gate + knowledge.test + knowledge-batch.test -> 86 pass / 0 fail. Live requested/approved/active with studentData "no" stay eligible; the non-WhatsApp source and session stay eligible under every link case. | met |
| C3 | tree + hydrators + native-source-context + source-context + quarantine + external-model-reader + workbench -> 109 tests; 107 pass on the first run. The 2 fails were my copy missing `data/toc-migrated` (ENOENT in source-context.test.ts and workbench.test.ts, a harness gap, not a defect); after adding that folder those two files ran 48/48, so 109/109. Non-test code: the `studentData` field is read only at knowledge.ts:127; the four call sites are store.ts:69-70 (G1), ask/source-context.ts:114 (G2 transcript), composition/integrations/native.ts:70 -> ask/native-source-context.ts:26 (G2 native), knowledge-outputs/reader.ts:18 (G3). G4: `sessionVisible` is false for every `whatsapp-batch` session, so indexSession refuses it (gate suite G4 cases green, including the new non-live cases). | met |

Identity: diff 15de5c76..a4c969a2 touches only knowledge.ts (1 line), external-model-gate.test.ts, external-model.testsupport.ts and the manifest; matches the manifest. Test counts equal the manifest's Pre-check lines.

## Suspended-clause judgement (the question put to me)
Gate H-14 (answered "No, fail closed") names revoked, unlinked, rejected and suspended. `isLiveLinkState` keeps `suspended` in LIVE_LINK_STATES, and router.ts:153 sets `live: isLiveLinkState(tr.to)` in the same `$set` as `state`, so a suspended link really carries `live: true`. Without `state !== "suspended"` it would stay eligible, against the gate text. The clause is required by the gate wording, not gold-plating, and it matches the brief: only a resolvable in-tenant link that is live, not suspended and studentData "no" stays eligible. `requested` and `approved` remain eligible (live, not suspended); they hold no captured text before activation. Judged correct.

## Falsification (own mutants, in a copy; per-mutation byte backup, `timeout`, no EXIT trap; after each restore `git hash-object` equalled `git rev-parse a4c969a2:<file>`, 9 of 9 EQUAL)
Mutants ran strictly one at a time (a first parallel M1/M2 pair was discarded as confounded and M2 re-run alone).
| Crit | Mutant | Observed |
|---|---|---|
| C1 | knowledge.ts remove `link.live === true && ` | gate suite 5 fail / 29 pass |
| C1 | knowledge.ts `link.live === true` -> `link.live !== false` | 1 fail / 33 pass (live-missing) |
| C1 | knowledge.ts remove ` && link.state !== "suspended"` | 1 fail / 33 pass (suspended) |
| C2 | knowledge.ts `link.studentData === "no"` -> `false` (nothing eligible) | 6 fail / 28 pass (live controls red) |
| C2 | knowledge.ts `!wa \|\|` -> `false \|\|` (non-WhatsApp no longer exempt) | 1 fail / 33 pass |
| C3 G3 | reader.ts delete the externalModelEligibleSession line | external-model-reader 10 fail / 1 pass |
| C3 G2 | source-context.ts delete the session eligibility line | hydrators 10 fail / 16 pass |
| C3 G2n | native-source-context.ts delete the `externalEligible` line | hydrators 12 fail / 14 pass |
| C3 G1 | store.ts delete the prune `every(Boolean)` line | tree 11 fail / 3 pass |

## Base reds (confirmed on base 15de5c76 by me, not taken from the manifest)
- ask-tenant-isolation.test.ts and message-vertical.test.ts fail to load on BASE and on HEAD, with the same `createMongoLinksStore` error.
- `tsc --noEmit -p apps/api`, TS2307 lines filtered out (my archive copy lacks scripts/ and qa/ fixtures): exactly one line on base and head, identical: `whatsapp/selection/router.ts(23,10): error TS2305 ... createMongoLinksStore`. Not from this unit.
- lint-loc `dependencies` (qrcode-generator in apps/web): not re-run. The diff touches no apps/web or package.json, so it cannot be introduced here. Taken as pre-existing, unverified by me.

## Leak judgement (can WhatsApp text from a non-eligible link reach an external model?)
Predicate-level cases are all closed by the new tests and my mutants: revoked, unlinked, rejected, suspended, live field missing, studentData yes/unknown, unresolvable link id, unstamped legacy source, foreign-tenant link row. Memo: each of the native hydrator, reader, transcript hydrator and tree store builds a fresh visibility per request, so a revoke is seen on the next request. Call-site coverage is complete for the five listed paths.

One leak survives on the Route path. It is not a predicate defect: see F1.

PROPOSED-ISSUE: {"sev":"high","class":"security","area":"route-index-staleness","title":"/route can feed WhatsApp nodes of a revoked or suspended link to the step B model from a cached route index","detail":"route-store.ts builds RouteIndex from createExternalModelTreeStore (so the tree is correct at build time) but serves it from an in-process cache (INDEX_TTL_MS 60s, and indexFor returns the stale index once more while it refreshes) and from the persisted route_index document (load(); stamp = visibilityFingerprint + tree indexRevision). visibilityFingerprint (search-cache.ts:70-86) reads sources(_id,kind,consent), sessions, transcript_reviews and whatsapp_candidates only; it never reads whatsapp_links. A link transition therefore leaves the stamp equal and the persisted index built while the link was live is a hit. Step B (route-store.ts:164-176) gates sessions with sessionVisible, which ignores link state, so selectNodes sends the WhatsApp session and topic nodes to the external model. Reproduced: scratch test zz-chk-b-stale-route.test.ts (in my copy, not committed) builds a /route index while the link is live, then flips the link to {state revoked, live false} and, separately, {state suspended, live true}, then calls route() on a fresh createRouteDeps (empty in-memory cache) over the same db. Both second step B jobs still contain the WhatsApp session node, while a direct createExternalModelTreeStore.load right after returns the tree without it. For unlink and revoke, the existing consent follow-through (service.ts:170, not examined further per D-210) changes sources.consent and so rotates the fingerprint once it succeeds; adminMove (suspend) touches nothing the fingerprint reads, so a suspended link stays in the persisted index indefinitely, and a revoke is exposed between its CAS and the follow-through plus up to 60s in memory. Pre-existing (same at base for any studentData or link change); H-14 makes it matter.","fix_direction":"make the route index eligibility-aware: either include a whatsapp_links digest (_id,state,live,studentData) in visibilityFingerprint and the route stamp, or re-check externalModelEligibleSession for the index's WhatsApp session ids per request before frontierRoot (as the Ask hydrators do) and bypass the in-memory index for WhatsApp-bearing sessions. Add a falsifying test: link live -> route -> link revoked or suspended -> route on a fresh deps must not put the session node in the step B job."}
PROPOSED-ISSUE: {"sev":"low","area":"visibility-predicate","title":"Predicate trusts the derived live flag; a row with a terminal state but live true would be eligible","detail":"knowledge.ts:127 keys on link.live and the suspended state. state and live are written in one $set (router.ts:153), so inconsistent rows need external corruption.","fix_direction":"optional defense in depth: also require link.state to be in LIVE_LINK_STATES (still excluding suspended)"}
PROPOSED-ISSUE: {"sev":"low","area":"comments","title":"Call-site comments still say not studentData no","detail":"store.ts:62, source-context.ts:113, native-source-context.ts:12, reader.ts:17 describe the gate as studentData only; the predicate also requires a live, non-suspended link. Maker declared this (open point 4). Documentation drift only.","fix_direction":"touch the comments next time those files are edited"}

FAILURES: none against C1-C3. F1 is outside the diff and the manifest criteria; recorded for the lead to weigh as blocking for H-14 goal-level closure.
CAPABILITY-COVERAGE: not-applicable (no capability rows)
LIVE-BROWSER: not-applicable (server-side egress gate, persona walk skipped per manifest)
ISSUES-WRITTEN: none (dual coordinator; PROPOSED-ISSUE lines above, no ledger rows)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The one-line predicate does what gate H-14 says (live, not suspended, studentData "no", resolvable in-tenant, closed on error). Each of the four call sites and the indexer routes through it, and a mutant of each fails only its own suite. The suspended clause is required by the gate text because suspended is a live state. Separately, /route can still reach the external model with WhatsApp nodes of a just-revoked or suspended link through its cached route index, because the cache stamp does not see link state. That predates this unit but defeats the gate's intent on that path, so it is filed as a security-class finding. Consent was not examined (D-210).
Metrics: start=2026-10-30T16:00:00Z end=2026-10-30T16:30:00Z wall_min=30 agent_min=unavailable blocked_min=0 suite_runs=14 repeat_runs=2 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1800 mutants=0 defects_unit=0 defects_6c=1 check_min=30 slow: each node --test file 15-30 s (tsx cold start); times approximate
