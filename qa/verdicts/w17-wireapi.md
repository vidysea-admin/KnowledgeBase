# Checker verdict: w17-wireapi

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: 3bf5cdb5b39ca64fc0f4b67e3ce9636fcbb74aba
Base SHA: a0391420 + merge dcc5e565 (lane/w17-champproof ec78833c)
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-wireapi (lane/w17-wireapi)
Checked at: 2026-10-17
Authority: the Approver's verbatim approval of the central wiring lane in composition/server/App, as relayed in the orchestrator brief.
ISSUES-WRITTEN: none

## Identity
- HEAD is 3bf5cdb5. The first-parent chain is dcc5e565, then e37aa28e, 20704a97, 6c5cfd92, and 3bf5cdb5 (the manifest). The tracked tree is clean, and the only untracked paths are evidence directories.
- The manifest says `Fix cycle: 0`, and no earlier verdict exists for this slug.
- The diff a0391420..3bf5cdb5 was reviewed in full. server.ts is not touched.
- The lane junctions in apps/api/node_modules/@lkb/{core,db,index,ai} resolve to this lane's packages/.

## Clauses verified
1. **answers.ts semantics are unchanged.** At base, answers.ts:60-62 built `createMongoEvidenceVerifier(db, undefined, createKnowledgeVisibility(db).eligibleTurn, input.nativeEvidence)`. `visibility` had no other use. The new evidence-verifier.ts:11-13 builds exactly the same call. createKnowledgeVisibility is a pure closure factory, created without native in both versions. Every path that uses answerWorkflow (history, get, queue, conflicts) gets the same verifier. The tests below are green.
2. **The championship store fails closed.** `git grep createMongoChampionshipStore` over the whole tree finds exactly one production construction site, evaluation.ts:45, which passes `createComposedEvidenceVerifier(db, input.nativeEvidence)`. The other sites are in mongo-store.test.ts: line 26 passes a verifier, and lines 53-54 assert that construction throws without one. No script constructs the store. production.ts:284 supplies `nativeEvidence: native.resolver` to the shared input. mongo-store.ts:14 throws when no function is supplied. As a second layer, championship.ts strips cited trials when `verifyEvidence` is absent.
3. **Item 2 is STOPPED, and the stop is accurate.** REGISTRATION_LINK_RESOLUTION_ENABLED (registration-link-resolver.ts:7) and ZOOM_PROVIDER_CORRELATION_ENABLED (zoom-registration-proof.ts:5) are both `false`. My grep across apps, packages, scripts, schema and contracts finds no store, schema or producer of per-link approval records with decisionId, messageId, sourceHash, linkHash or scopeHash. The only references are the two modules and their test. The `decisionId` hits in session-decisions/ and scripts/training are unrelated. A tenant-level registration *policy* store does exist (packages/ingest/src/join-policy/registration-policy-store.ts, holding `approvedPolicyRevision`). It approves a whole profile and does not bind per-link decision records, so it does not satisfy `ResolutionAuthorization`. The manifest does not mention it (see note N1).
4. **Item 3 (tile-suggest) is off by default.** resolveTileSuggest returns undefined unless `LKB_TILE_SUGGEST === "1"`, and a test covers "", "0", "true" and " 1". `git grep LKB_TILE_SUGGEST` finds the variable set only in tests; no production code, script or config sets it. The hook additionally requires `tileSpeakerSuggestEnabled()`, a context, readCapture and a publication. Composition supplies no context, so production is a no-op even when the flag is set. In the fence's non-transactional gap, the only possible write is `insertSuggestionsIfAbsent` in packages/db speaker-suggestions/index.ts:49-59. That function rejects any row whose status is not `suggested` and uses `$setOnInsert` on `speaker_suggestions`, so it never writes final `speakers`. The fence refuses an empty generation before it calls verifyIndexGeneration, which covers the case where `generation &&` would be skipped.
5. **Item 4 (mounted routes) uses the real perimeter.** mounted-routes.test.ts calls startTestServer (testUtils.ts:17), which calls the real `createServer(deps)`. In createServer, the real `requireAuth(deps.keyStore)` and `createRateLimiter` run before `mountIntegratedWorkflows` (server.ts:124-127) and before `/search`. Only the key store is a fake (`verify` lookup), and the routers come from the real builders (buildAnswerIntegrations, buildTranscriptIntegrations, createMongoSearchDeps).

## Commands (run independently, one at a time, `timeout 600`, node v24.19.0, without --test-force-exit, from apps/api)
Evidence is in qa/evidence/w17-wireapi-checker/ (not committed).
| # | Command | Exit | Result |
|---|---|---|---|
| c1 | composed-verifier.test.ts | 0 | 4/4 |
| c2 | championship/mongo-store.test.ts | 0 | 4/4 |
| c3 | routes/championship/championship-proof.test.ts | 0 | 5/5 |
| c4 | answer-workflow, answer-router, native-answer-evidence, stale-citation-refusal, native-evidence/vertical, composition/vectorless-routing | 0 | 40/40 |
| c5 | indexing/session-tile-suggest.test.ts | 0 | 10/10 |
| c6 | composition/integrations/mounted-routes.test.ts | 0 | 3/3 |
| c7 | server.test.ts | 0 | 10/10 |
| c8 | tsc --noEmit -p tsconfig.json (apps/api) | 0 | clean |
| c9 | node scripts/lint-loc.mjs --all (lane root) | 0 | lint:structure OK, 10 stages, 0 failed; the G4 lines are advisories only |

## D-020 mutations (checker-owned; harness qa/evidence/w17-wireapi-checker/mut.sh)
The harness runs one mutation per invocation. Before each run it checks that the file matches HEAD. It takes a per-mutation byte backup and sets `trap restore EXIT INT TERM ERR`. It applies the mutant by exact byte replacement and asserts exactly one replacement. Tests run under `timeout 600`. Afterwards it restores the file, runs `cmp`, and checks HEAD fidelity with `git -c core.autocrlf=true hash-object`.
- **mA: the verifier ignores native.** In evidence-verifier.ts, `native)` was changed to `undefined)`. **KILLED** with 3/4 passing: "valid native trial is kept through the composed native resolver" failed. After restore, `cmp` passed and the hash matched HEAD (2ba9b628).
- **mB: the store accepts no verifier.** In mongo-store.ts:14 the guard became `if (false) throw`. **KILLED** with 7/8 passing: "store refuses construction without the composed verifier" failed. After restore, `cmp` passed and the hash matched HEAD (c3fa3a09).

## Notes (low; not backlog items)
- N1: The item-2 stop reason should also name the existing tenant-level registration-policy approval store and say why it is insufficient (no per-link decisionId, linkHash or scopeHash binding). This does not change the conclusion.
- N2: The manifest claims mounted-route coverage of "403 wrong scope". That holds for T-056 and T-008. The T-054 transcript-review test covers 401, 200, cross-tenant 404 and consent-withdrawn 404, but has no wrong-scope case.
- N3: Transactional atomicity of the tile fence (note B of a58fbc0b) is still unverified. No real Mongo was used. The residual risk is limited to inert `suggested` rows.

## Ledger
This unit closes F1/F2 of qa/verdicts/w17-champproof.md (3912e5e3). Ledger rows that track those findings, or F2 of w17-quotehash, may be flipped to verified on the strength of this verdict. Item 2 (T-052 caller) is **not** done, and its row must stay open or blocked.

## Not verified
- Real Mongo and the production runtime composition. These were checked by code reading and through in-memory doubles only.
- The maker's m2-m4 mutations and the registration-provider-candidates test were not re-run. Item 2 has no code change.
- tracker-audit was not run separately; lint-loc --all includes its tracker stage, which exited 0.
- Budget: no maker usage was supplied, so this ran as BOOTSTRAP_REVIEW with the ratio unverified. Checker active time was about 360 s before the verdict was written (1792261484 to about 1792261845), most of it command time. Tokens are null (unknown). review_budget.py assess was not run, which is a recorded process gap.
