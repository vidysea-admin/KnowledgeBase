# Manifest — wa-review-wire

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Task: T-007 (parent stays open; this is a scoped wiring unit)
Lane: lane/wa-review-wire, branched from lane/codexwave1 (Codex foundation, pending merge)
Priority tier: 3 — dependency-ready roadmap feature, assigned by orchestrator.
Contract: qa/contracts/whatsapp-ingestion-first-slice.md criteria 8, 9 (write-side only), 10, 11, 12 (partial), 14 (partial).
Foundation: qa/manifests/whatsapp-review-foundation-20261014.md (checked-PASS cycle 2), whose "Remaining whole-task gates" this unit works down.
Security flags: tenancy, data writes, publication, source evidence. Full ceremony.

## Policy note (read first)
D-166 and D-167 are about T-037 join-rules (`last-valid`, one-hour bound). They say nothing about WhatsApp review or consent, so they authorise no WhatsApp policy. This unit invents none: it implements contract criteria 7–14 as adopted. One mapping choice is flagged for the checker, not a consent policy: an approved candidate becomes a `claims` row with `status: "verified"`, `origin: "speaker-statement"` (see Assumptions).

## What changed (apps/api/src/whatsapp/review/ only; no server.ts / production.ts / schema edit)
- `ingest.ts` — `createReviewedWhatsAppDeps`: wraps the existing `createMongoWhatsAppDeps` built WITHOUT an indexer, so no `indexSession` write (claims, chunks, session_pages, tree_index, entities) ever happens for WhatsApp. After the raw upsert it invalidates stale candidates, loads tenant claims as `knownContent` (same-tenant duplicate flags), runs detection, and inserts via the transactional repository. A failure surfaces (route 502); re-ingest is idempotent.
- `materializer.ts` — candidate-only materialiser: one approved candidate -> exactly one `claims` row `wa-claim:<id>` with exact quoted evidence, run inside the decision transaction. Refuses non-approved and personal-excluded input.
- `invalidate.ts` — source-edit invalidation in one transaction: any candidate whose exact turn evidence no longer matches loses trust. Pending stale candidates are deleted; decided stale candidates keep their audit row and have their claim revoked.
- `quarantine.ts` — `auditWhatsAppQuarantine(db, tenantId)`: reports every claims/chunks/session_pages/tree_index row derived from a WhatsApp session that is not an approved candidate's own claim.
- `compose.ts` — `createWhatsAppReviewWiring({resolveOwner, ...})` returns `{whatsapp, reviewRouter, repository}`.
- `store.ts` — one-word change: `checkEvidence` is now exported.
- Tests: `wire.test.ts` (8), `wire-mongo.test.ts` (1, gated), `wire-fixtures.ts` (in-memory transactional Mongo double).

## One-line mount for the integrator (not done here)
1. `apps/api/src/composition/production.ts` ~line 232: replace `whatsapp: createMongoWhatsAppDeps(boundIndexer, {...})` with `whatsapp: createWhatsAppReviewWiring({ resolveOwner: createConfiguredWhatsAppOwnerResolver(process.env.WHATSAPP_TENANT_OWNER_MAP) }).whatsapp` (keep the wiring object to also expose `reviewRouter`).
2. `apps/api/src/server.ts`, after `app.use(createWhatsAppRouter(deps.whatsapp));` and after auth middleware: `app.use(wiring.reviewRouter);`.
Do NOT mount until the read-side gap below is closed.

## Evidence
- `cd apps/api; node --test --import tsx src/whatsapp/**/*.test.ts src/whatsapp/*.test.ts`: tests 45, pass 44, fail 0, skipped 1 (the gated real-Mongo test). Of these 8 are new in-memory wiring tests.
- Scoped type check (temporary tsconfig with `paths` into the lane's packages, deleted afterwards): exit 0, no diagnostics. The default `tsc -p tsconfig.json` in this lane resolves `@lkb/core` to the MAIN tree, which lacks the generated `WhatsappCandidates` type, so it errors on the foundation files too: environment gap, not a regression.
- Criterion-8 mutation probes, `qa/evidence/wa-review-wire-mutate.mjs` (run from apps/api). Shape chosen after the in-place variant was denied by the auto-mode classifier: the tracked `detection.ts` is never modified; each mutant is a throwaway copy exercised by a copy of `detection.test.ts`; copies are removed in `finally`. Control (unmutated) exit 0. Result 6/6 KILLED: topic detection removed, decision detection removed, sensitive flag removed, personal/excluded flag removed, duplicate flag removed, evidence corrupted. First run showed 5/6: my "sensitive" mutation was ineffective (the `||` alternatives still fired), corrected to remove the `flags.push`, then killed.
- lint-loc (`node scripts/lint-loc.mjs --all`): all new files within budget. Two stages fail on the lane base, not on this unit: `packages/meeting-bot/py/test_sb_join_ownership.py:408 (budget 400)` and `docs/SNAPSHOT.md is stale`.
- Full apps/api suite: see Full suite line below.

## Full suite
`cd apps/api; node --test --import tsx $(find src -name "*.test.ts")` (D2_FIXTURE_PYTHON set, TSX_TSCONFIG_PATH unset): tests 942, pass 941, fail 0, skipped 1 (gated real-Mongo test).

## Assumptions the checker should challenge
1. Approved -> `claims` row `status: "verified"`. The `claims` enum has no "approved"; "needs-review" would not be trusted, "verified" is the only reviewed value.
2. Source-edit invalidation cannot mark a decided candidate `invalidated` without a schema enum change plus regenerated `packages/core` types, both outside this lane's paths. It revokes the claim and keeps the decision row; `get` on it then reports evidence unavailable (honest error) rather than silently succeeding.

## Live gaps (T-007 is NOT done by this unit)
1. Read-side quarantine is NOT enforced. This unit prevents unreviewed content reaching `claims`/`chunks`/`session_pages`/`tree_index`/entities on the write side and provides the audit. But raw WhatsApp `turns` still exist and `/ask` lexical, `/search`, semantic-search, grounded-content, graph and store readers in `apps/api/src/ask`, `search-store.ts`, `semantic-search`, `grounded-content`, `store.ts` and `packages/ask` have no WhatsApp-session predicate. They are outside this lane's allowed paths. Criterion 9's tests (tree/vector/lexical arm would select the planted text without the guard) are not written.
2. WhatsApp content ALREADY indexed by the old production wiring (claims/chunks/tree) is not purged; the audit will report it. No deletion of existing data was attempted.
3. Real Mongo proof not run: no Mongo or Docker on this machine and the repo has no test-Mongo pattern. `wire-mongo.test.ts` is written, skipped without `WA_REVIEW_TEST_MONGO_URL` (replica set; db name forced to `lkb_test_wa_review_*`, `lkb` structurally refused), never executed here.
4. Not mounted; no UI (criterion 13); approved knowledge is a claim only, not yet chunked/embedded/in the tree, so approved `/ask` citation (criterion 9/12 positive path) is unproven.
5. Edit-then-revert of a source turn leaves an approved candidate without its claim (no automatic re-materialisation).
6. Full-suite status and the two pre-existing lint failures are listed above; no tracker (TASKS.md, goal.json) edited.
