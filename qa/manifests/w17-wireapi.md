# w17-wireapi: central apps/api wiring (championship verifier, T-052 caller, T-042 tile-suggest, T-056/T-054/T-008 routes)
Status: checked-PASS
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-wireapi (lane/w17-wireapi)
Base: a0391420 (tip of codex/kb-wave2-2026-10-17, PR #4), then merge --no-ff lane/w17-champproof (3912e5e3; code ec78833c) = dcc5e565
Candidate: lane HEAD (item commits e37aa28e, 20704a97, 6c5cfd92; this manifest is the following commit)
Authority: Approver in chat 2026-10-17, verbatim per the orchestrator brief: "Umesh approves the central wiring lane in composition/server/App: championship composed verifier, T-052 caller, T-042 tile-suggest, T-056/T-054/T-008 routes." composition/** and apps/api/src/server.ts in scope for this unit only. server.ts was not edited.

## Item 1: championship composed verifier (DONE, e37aa28e). Closes F1/F2 of qa/verdicts/w17-champproof.md (3912e5e3).
- New apps/api/src/composition/integrations/evidence-verifier.ts: `createComposedEvidenceVerifier(db, native?)` = createMongoEvidenceVerifier(db, undefined, createKnowledgeVisibility(db).eligibleTurn, native). Web stays refused.
- composition/integrations/answers.ts now builds the answer-workflow verifier through it (was inline at :58-62).
- championship/mongo-store.ts: `createMongoChampionshipStore(db, { verifyEvidence })` is required; a missing or non-function verifier throws (no bare default).
- composition/integrations/evaluation.ts: `nativeEvidence?` added to the input; the store gets `createComposedEvidenceVerifier(db, input.nativeEvidence)`. production.ts:282 already supplies nativeEvidence in the shared input.
- Tests: championship/composed-verifier.test.ts builds the store through buildEvaluationIntegrations (LKB_CHAMPIONSHIP=1, work DB): consent-withdrawn transcript trial stripped + stale, valid transcript trial kept, valid native (document-page) trial kept via the composed resolver, cross-tenant 404. mongo-store.test.ts: refuses construction without a verifier. F3: championship-proof.test.ts close() calls closeAllConnections; the libuv teardown assert under `--test-force-exit` still occurs on Windows and also occurs on the untouched championship.test.ts, so it is environmental. Run without --test-force-exit (the package `test` script form).

## Item 2: T-052 caller (STOPPED, no code). Constants stay false.
Ruling 4 precondition (checker PASS 3f8b1ceb cycle 2) is met, but no trusted durable approval store exists:
- `ResolverOptions.authorize(input) => ResolutionAuthorization` (registration-link-resolver.ts:22) must return {tenantId, sourceId, messageId, sourceHash, policyHash, linkHash, scopeHash, decisionId}. `ZoomProofOptions.authorize(attempt) => ProofAuthorization` (zoom-registration-proof.ts:31) must return {bindingHash, policyHash, policyRevision, hostScopeHash, decisionId}. Both are synchronous.
- Repo-wide grep (apps, packages, scripts, schema) finds no producer, store, collection or schema of such records; the only references are the two modules and their test. meeting_candidates has status approved/auto_approved but no decisionId, link/scope hash or policy hash binding (schema/meeting_candidates.schema.json).
- The zoom proof also needs a trusted `readNativeEvent` provider adapter; none exists.
- Missing, exactly: (1) a durable, tenant-scoped registration-approval record keyed by decisionId binding sourceHash, policyHash(+revision), linkHash and scopeHash/hostScopeHash, written only by a human approval action; (2) a synchronous trusted lookup over it (or an async-preload contract); (3) a trusted Zoom native-event/ICS adapter; (4) a caller in the source pipeline. Each needs a policy/schema decision, so nothing was invented.
- Mutation m2 shows the inactive default is guarded: flipping REGISTRATION_LINK_RESOLUTION_ENABLED to true is KILLED by "both candidates default inactive".

## Item 3: T-042 tile-suggest (DONE, 20704a97)
- composition/tile-suggest.ts `resolveTileSuggest(env)`: undefined unless LKB_TILE_SUGGEST === "1"; else `{ enabled: true, publication: createIndexGenerationSuggestionPublication }`. production.ts buildIndexer passes it as `tileSuggest`.
- composition/tile-suggest.ts `createIndexGenerationSuggestionPublication`: TileSuggestionPublication fence (verdict a58fbc0b note A). assertCurrent re-reads the committed generation via verifyIndexGeneration (read-only) and throws if it is not still current/complete; write() re-asserts before work. The producer also calls assertCurrent inside insert. Residual: not transactional; a reindex between the last check and the idempotent insert can still land inert `suggested` rows (never final speakers).
- indexing/types.ts: context/readCapture optional; `publication` factory added. session-tile-suggest-hook.ts: no context, no readCapture or no publication = no-op (no read, no write, no result key); passes the committed generation to the fence.
- REPORT: the tile registry's `readCommitted` / `measureDecodedClock` (packages/meeting-bot/src/capture/tiles/registry.ts:22-24) have no production implementation, so context is left absent and the hook is a no-op even with LKB_TILE_SUGGEST=1. Note B of a58fbc0b (transactional handle) remains unverified (no real Mongo).

## Item 4: T-056 / T-054 / T-008 routes (DONE as verification, 6c5cfd92; no mount change needed)
At a0391420 all three are already mounted after requireAuth + rate limiter: server.ts:124-127 mountIntegratedWorkflows (answer-policy admin, answer history, transcript review) and server.ts:149 /search. Transcript review already gets the real authorizeSession (composition/integrations/transcripts.ts:48, knowledge-visibility sessionVisible; wire006b e9a0cd20). New composition/integrations/mounted-routes.test.ts drives the real createServer with the real builders: 401 without key, 403 wrong scope, cross-tenant 404 / empty, consent-withdrawn session 404, 200 happy path.

## Changed paths
apps/api/src/composition/integrations/evidence-verifier.ts (new); apps/api/src/championship/{mongo-store.ts, mongo-store.test.ts, composed-verifier.test.ts (new)}; apps/api/src/routes/championship/championship-proof.test.ts; apps/api/src/composition/integrations/{answers.ts, evaluation.ts, mounted-routes.test.ts (new)}; apps/api/src/composition/{production.ts, tile-suggest.ts (new)}; apps/api/src/indexing/{types.ts, session-tile-suggest-hook.ts, session-tile-suggest.test.ts}; qa/manifests/w17-wireapi.md. Plus the merged champproof files.

## Checks for a checker (from apps/api unless noted; `timeout 600`, one process at a time, no --test-force-exit for fetch-based files)
- node --test --import tsx src/championship/composed-verifier.test.ts src/championship/mongo-store.test.ts src/routes/championship/championship-proof.test.ts src/routes/championship/championship.test.ts src/championship/runtime.test.ts
- node --test --import tsx src/answer-policy/native-answer-evidence.test.ts src/answer-policy/stale-citation-refusal.test.ts
- node --test --import tsx src/indexing/session-tile-suggest.test.ts src/indexing/tile-speaker-suggest.test.ts src/production.test.ts src/grounded-postprocessing/composition.test.ts
- node --test --import tsx src/composition/integrations/mounted-routes.test.ts src/server.test.ts
- packages/meeting-bot: node --test --import tsx src/calendar/registration-provider-candidates.test.ts
- tsc --noEmit -p tsconfig.json (apps/api); node scripts/lint-loc.mjs --all; node scripts/tracker-audit.mjs --gate g1,g4,g5 (lane root)
- Lane junctions: node_modules/@lkb/* in apps/api and packages/* point at THIS lane's packages/<pkg>; others point at main.

## Evidence (node v24 bundled runtime; outputs in qa/evidence/w17-wireapi/, not committed)
- composed-verifier 4/4; mongo-store 4/4; championship-proof 5/5; championship 1/1; runtime 5/5; native-answer-evidence 7/7; stale-citation-refusal 3/3
- session-tile-suggest 10/10; tile-speaker-suggest 14/14; production 4/4; grounded composition 5/5
- mounted-routes 3/3; server.test 10/10; registration-provider-candidates 23/23
- tsc apps/api: exit 0, no output
- D-020 mutations (qa/evidence/w17-wireapi/mutate.sh: per-mutation mktemp backup, trap EXIT INT TERM ERR, timeout 600, cmp, then `git -c core.autocrlf=true hash-object` == HEAD blob), all KILLED, all restored, HEAD fidelity ok:
  - m1 composed verifier without eligibleTurn: consent-withdrawn test fails (3/4)
  - m2 REGISTRATION_LINK_RESOLUTION_ENABLED=true: "both candidates default inactive" fails (22/23)
  - m3 fence never throws: 2 fence tests fail (8/10)
  - m4 transcripts authorizeSession allow-all: T-054 mounted test fails (2/3)
- lint: `node scripts/lint-loc.mjs --all` exit 0, lint:structure OK (10 stages, 0 failed), lint-loc 1709 files within budget, dirsize 270 dirs within budget. A first run failed dirsize (answer-policy 31/30, indexing 31/30) because of the two new files; both were moved into composition/ (no budget raised). The dependencies stage needs the lane's apps/web/node_modules junction (to main); without it 450 unresolvable-import errors are environmental.
- tracker-audit --gate g1,g4,g5: OK (advisories only, pre-existing).
- Commits were rebuilt once on dcc5e565 for that move (lane-only, never pushed); all four mutations were re-run on the rebuilt commits.
