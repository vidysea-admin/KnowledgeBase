# T-056 persistent answer policies, conflict detector, review queue

**Handshake status:** ready-for-check
**Status:** ready-for-check
**Fix cycle:** 0
**Task:** T-056 (scoped slice; task remains open)
**Priority tier:** 3 (roadmap); full ceremony because it is a tenancy and data-write area.
**Lane:** lane/t056-conflicts, branched from lane/codexwave1 (cd843b26).
**Builds on:** qa/manifests/parallel-answer-policy.md (transient simulator, checked-PASS). Contract: qa/contracts/t056-answer-policy-simulator.md (not edited; it does not yet cover this slice, so the checker needs to extend or adopt criteria).

## Scope (apps/api/src/answer-policy/** only)
- `types.ts`, `rules.ts`: policy shape (questionClass, mode, style, onInsufficient, citations fixed to "required"), strict input validation.
- `store.ts`: `AnswerPolicyStore` seam plus in-memory implementation (test double only).
- `mongo-store.ts`: Mongo-backed store (collections `answer_policy_revisions` append-only, `answer_policy_review_items`). Append atomicity: revision `_id` = tenant|policy|version, so racing writers of one version collide on E11000 and exactly one wins, with or without indexes; items use a deterministic hash `_id`; closing an item is a filtered update on `status: open`. `ensureAnswerPolicyIndexes` adds tenant-leading unique indexes. Refuses protected work-DB names (db-name.ts `isRefusedWorkDb`: lkb, global_university_db, lkb_staging) unless `production: true`. `latest()` reads a tenant's full revision list (fine at policy scale; an aggregate is a later optimisation). Every method takes the tenant; revisions are append-only with an atomic expected-version check.
- `service.ts`: versioned save and retire, history (who/what/when/note/previousVersion), conflict reconciliation, review queue and resolution.
- `conflicts.ts`: detector for live policies of one tenant with the same normalized question class that differ in `mode` (high), `onInsufficient` or `style` (medium); each finding carries a plain-language explanation. No wildcard or precedence rule exists, so only exact class matches overlap.
- `evaluate.ts`: applies a persisted policy through the existing `simulateAnswerPolicy`; a policy may only tighten (review to refuse), never loosen.
- `admin-router.ts`: HTTP API plus `mountAnswerPolicyAdmin(app, service)`. server.ts is NOT edited. Wiring: call it after `requireAuth`, rate limits and `express.json()`, e.g. `mountAnswerPolicyAdmin(app, createAnswerPolicyService(store))`.
- Tests: `mongo-store.test.ts` (8, in-memory fake Db in the speaker-suggestions.testdb.ts style; no real MongoDB), `service.test.ts` (10), `admin-router.test.ts` (3); existing `routes.test.ts` untouched.

## Evidence-override rule
Citations stay mandatory: `citations` can only be "required"; any other value or any field matching cit/evidence/ground/source/provenance/uncited is refused with `policy_cannot_override_evidence` (tested with 7 variants). Evaluation of a result with no sources or missing provenance is refused/reviewed under every policy (tested).

## Design choices the checker should weigh (not covered by an existing contract)
- Scopes `answer-policy:read` and `answer-policy:write` are new names; nothing issues them yet.
- `changedBy.actor` is `api-key:<tenantId>` because keys carry no per-person id; `claimedBy` is stored but labelled unverified. True per-person attribution needs a key id in `VerifiedKey` (outside this directory).
- Policies take effect on save; the change review item is an audit queue, not an approval gate. A rejected change does not auto-revert (a new version is saved instead).
- Conflict items for resolved keys are not re-opened; items whose conflict disappeared are marked `superseded` by `system`.

## Commands and results (lane worktree C:\Users\product\Desktop\KnowledgeBase-lanes\t056-conflicts)
- `cd apps/api; node --test --import tsx src/answer-policy/*.test.ts`: ℹ pass 19 / ℹ fail 0 (5+ existing simulator tests, 13 new).
- Full suite `cd apps/api; D2_FIXTURE_PYTHON=...\.venv\Scripts\python.exe; node --test --import tsx "src/**/*.test.ts"`: ℹ tests 947, pass 947, fail 0, cancelled 0, skipped 0.
- `node C:\Users\product\Desktop\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` (apps/api): exit 2, 11 errors, 0 in answer-policy; all in src/whatsapp/review/{detection,detection.test,store}.ts (`@lkb/core` has no `WhatsappCandidates` export), present at the branch base and unrelated.
- `node scripts/lint-loc.mjs`: 1 violation, `packages/meeting-bot/py/test_sb_join_ownership.py:408 (budget 400)`, pre-existing and unrelated; no answer-policy file is flagged (all under 300 LOC).
- Cross-tenant tests: service level (history, list, conflicts, queue, resolve, retire, store tenant-mismatch) and HTTP level (read, resolve, retire, version collision with another tenant's same policy id).
- Not done: mutation run, concurrency stress repetition beyond the single `Promise.allSettled` race test, `contracts/verify_contracts.py`.

## Mongo update (same Fix cycle 0)
- answer-policy tests: pass 27 / fail 0; mongo-store.test.ts repeated 15/15 pass (4-way same-version race x15 rounds: exactly one winner each).
- Full apps/api suite: one run showed tests 955 / pass 954 / fail 1 (failing test not captured), the immediate rerun showed pass 955 / fail 0; the flake is not attributed.
- tsc: with a temporary tsconfig mapping @lkb/* to lane sources, 0 errors; default tsconfig still 11 errors in src/whatsapp/review/*, 0 in answer-policy. Cause is junctions resolving @lkb/core to the main tree (ISS-CODEXWAVE1-007). Temp tsconfig deleted.
- The Mongo store is tested only against the fake Db; no real MongoDB run, no index build against a real server.

## Remaining for full T-056 (not claimed)
Dependencies U3.2, T-007, T-008, T-022 are all still `in_progress` in TASKS.md, so full acceptance is blocked. Open: wiring the Mongo store with the real Db and `ensureAnswerPolicyIndexes` at startup, a real-Mongo run, schema files for the two collections, server.ts mount and key-scope issuance, applying a stored policy inside `/ask`, YAML authoring, web UI for the review queue, per-person actor identity, interactive browser evidence.
