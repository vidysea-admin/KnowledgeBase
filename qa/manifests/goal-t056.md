# T-056 full cited-answer policies, conflicts and answer review

**Handshake status:** checked-PASS (API slice only; parent T-056 stays in_progress) — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/goal-t056-api-slice.md (cycle-1 PASS, API slice ONLY; parent T-056 stays in_progress)
**Status:** checked-PASS (API slice only; parent T-056 stays in_progress) — synced to canonical handshake 2026-10-26
**Fix cycle:** 1
**Task:** T-056 — full parent; remains in_progress
**Priority tier:** 3 — D-170 remaining-roadmap authorization
**Contract:** qa/contracts/goal-t056.md (checker-owned, not edited by maker)
**Packet:** qa/packets/goal-t056.md
**Central schema/runtime proposal:** qa/packets/goal-t056-schema.md
**Checker verdict:** qa/verdicts/goal-t056.md (checker-only; not yet requested on frozen bytes)

## Authorized owned work

API/web `answer-policy/**`: stored policy selection/application; bounded safe flat YAML; actual Ask-run history, feedback, candidate review and cited-evidence conflicts; persisted policy manager, Ask controls/answer UX and review UI. Existing simulator remains explicitly transient. Shared server/Ask/composition/App/nav/scopes/schema/generated/migrations/package/lock/trackers/DECISIONS/Git belong to root/docker_runtime and are not edited by this maker. Maker never edits qa/contracts.

## Source candidate

- New API application.ts, yaml.ts, yaml-simulation.ts, answer-records.ts, answer-record-store.ts, answer-mongo-store.ts, answer-evidence.ts, answer-workflow.ts, answer-router.ts, answer-testdb.ts, answer-workflow.test.ts, answer-router.test.ts, answer-persistence.test.ts.
- Edited API admin-router.ts adds validated YAML read/save endpoints; routes.ts adds fresh unsaved YAML simulation through the actual bounded Ask pipeline.
- New web PolicyManager.tsx, PolicyAskPage.tsx, AnswerReviewPage.tsx, AnswerSources.tsx, PolicyAskPage.test.tsx and question.ts.
- Edited web client.ts adds real policy/history/feedback/review/conflict clients; AnswerPolicySimulator.tsx invalidates replies on auth sessions, including same-key changes.
- New owned QA manifest/packet/schema proposal. Root aggregate tracked-base diff/hashes and final candidate hashes are pending until integration freezes.
- Owned API pretest source snapshot: qa/evidence/goal-t056/source-api-pretest.json, SHA256 91D6423D86F7954F449E80CC83C162CFA4E97C993AAD410AF1D4D39E8F2AB319. It records source readiness only, not a test result or full-parent byte freeze.

## Current implementation facts

- Policy selection is tenant-derived, active/current-version checked and conflict-blocking. Internal-only disables both synchronous and asynchronous web fallbacks before Ask; style reaches only the final-answer provider while grounding/output format remains intact.
- Source/session filters prune the tree before selection and extra-arm membership resolution. Every workflow requires bounded tenant sourceContext, uses real askV2 and persists the immutable candidate and exact policy/evidence digests before returning success.
- Held/refused/rejected candidates are blank in public results. Candidate approval/rejection requires review scope, exact digests, current evidence/policy and an atomic open-state update. Rejection never publishes. Feedback is append-only and capped at 100 per run.
- Human-reported evidence conflicts bind two actual server-derived cited source snapshots. Their original run stays withheld; all current reported conflicts must be resolved consistently before generating a new answer excluding every rejected canonical session across all node/vector aliases, or the losing web URL. Source/policy freshness and the full sorted conflict-set snapshot are rechecked after generation before saving; changed ancestor conflicts also withhold descendants and block approval. Original provenance is retained. Changed evidence/policies cannot inherit a resolution.
- Publication/history, review queue and conflict output redact stale/withdrawn original evidence. Current Mongo verifier reads the actual committed T-054 effective transcript before checking tenant session/source/turn, full text and quote hashes, char/byte boundaries, speaker/time tuple and origin. WhatsApp requires a current trusted approval/eligibility callback; web requires a trusted freshness verifier. Missing proof refuses publication/review.
- PolicyAskPage now consumes actual U32 useAskHandoff rather than a duplicate lifecycle; root adopted the generic executor/context/restore hook and the actual /ask route. The guarded static error-message extension is also adopted. Final route must preserve existing U32 guards and pass its tests.
- Stored policy/run/evidence/conflict DTOs now alias actual canonical generated types; schema enums drive validation. Candidates normalize to exact JSON before storage and use order-independent digests to avoid BSON restart drift. Public Ask policy metadata omits protected administrator notes and actor history.

## Evidence and remaining gates

Focused API seven-file broker run is recorded at qa/evidence/goal-t051checker-broker-t056-api-current.json: exit 1, 7034.6374 ms, 47/48 cases passed, before/after source hashes unchanged. The only failure was protected-database guard assertion grammar; the guard correctly refused the database. The assertion now checks the exact database-specific refusal message; only the affected persistence file awaits replay. No successful typecheck, real provider, Mongo restart, browser or live write is claimed. Central API typecheck at qa/goal-2026-10-14/api-types-attempt-1.json exited 2 in 14.694 seconds; its two T-056 diagnostics were corrected. Latest global API39/web5 failed runs have no owned diagnostics; qa/evidence/goal-t056/compiler-scope-observation.json records that limited observation, not a passing compiler result. Root authored/generated the canonical collection types, which the maker reads; codegen validation receipts remain central. API focused stage is queued with root/docker_governance_review; UI current snapshot F3433CB78F297A814F78832F1B5D358C064F801B1FD650D494BEF32BEA3F7B0E pins the actual adopted hook/App and static full-question normalizer. Explicit drafts/history support 4000 UTF-16 characters; URL/Search/default Ask handoffs retain 512 code points. UI focused execution awaits fresh broker scheduling after the active source/compiler freeze. Full parent requires completed central migration/runtime/scopes integration, focused independent tests, real Mongo/restart/source/provider/browser evidence and dependencies U3.1/U3.2/T-007/T-008/T-022. Thirty human semantic reviews/live calibration remain a real human gate; agent labels cannot replace them. Production writes/promotion are not authorized by this manifest.

This manifest cannot become ready-for-check or checked-PASS merely from source presence, mocks, historical scoped PASSes or elapsed time.










## API slice ready-for-check (lane lane/w16-t056pol, base a9fac545, Fix cycle 1)
Scope: apps/api/src/answer-policy/** only. The parent is NOT claimed; UI/integration/live/human gates remain open (see below).

Changes
- answer-persistence.test.ts assertion repair was already in the base source (exact database-specific refusal message `answer records refuse database "<name>"`); no further edit needed. Replay: 6/6 pass.
- New `stale-citation-refusal.test.ts` (3 tests): withdrawn/deleted turn, session, source, cross-tenant session, re-edited turn text; empty bindings, forged fingerprint, blank excerpt, no quotes, no evidence, foreign session; one stale binding refuses a mixed set; web proof withdrawn; WhatsApp eligibility missing/withdrawn.
- `answer-workflow.test.ts`: appended 1 test: stored candidate or evidence bytes altered after storage give state `stale`, blank answer/sources, and approval refused (digest recheck).
- Mutation harness `qa/evidence/t056-answer-policy-mutation/run-mutations.mjs` (outside answer-policy; evidence only, not product source). Per-mutation byte backup, restore in `finally` plus SIGINT/SIGTERM handlers, 300 s spawn timeout with SIGKILL, HEAD-fidelity check via git hash-object vs HEAD blob. Result: qa/evidence/t056-answer-policy-mutation/mutation-result.json.
- No product source (answer-evidence.ts, answer-workflow.ts etc.) was changed; sources hash-equal to HEAD after the run.

Evidence (lane apps/api, node from codex runtime, `node --test --import tsx`)
- Nine answer-policy files (workflow, router, persistence, service, admin-router, mongo-store, routes, native-answer-evidence, native-evidence) at base: tests 74, pass 74, fail 0 (1025 s wall under shared load, --test-concurrency=1). Supersedes the 47/48 receipt (qa/evidence/goal-t051checker-broker-t056-api-current.json).
- After additions: answer-workflow + stale-citation-refusal + answer-persistence: tests 27, pass 27, fail 0 (34 s).
- Mutations: 13 applied, 13 killed (M1 fingerprint, M2 empty bindings, M3 web verifier, M4 session missing, M5 session tenant filter, M6 WhatsApp eligibility, M7 per-turn eligibility, M8 turn hash, M9 turn missing, M10 empty quotes, M11 workflow verifier, M12 evidence digest, M13 candidate digest). Fidelity: both touched sources equal HEAD.
- Not run: typecheck (central API compile still owned by root), real Mongo, browser, real provider.

Checks a checker should run: the three-file command above; re-run the mutation script (`cd apps/api; node ../../qa/evidence/t056-answer-policy-mutation/run-mutations.mjs`) and confirm 13/13 killed and fidelity equal; probe a contract-derived stale citation (withdraw turn after storing, expect refusal).

## Root-owned UI/integration still needed (not done here)
- apps/web App.tsx/nav: route/nav entries for PolicyManager, PolicyAskPage (/ask), AnswerReviewPage; existing U32 guards must be preserved.
- apps/api composition/server.ts: mount the answer router/answer workflow with trusted human-authority, evidence verifier (createMongoEvidenceVerifier with web verifier and WhatsApp eligibility callback), and policy/answer Mongo store index setup; scopes issuance.
- schema/ collections for answer runs/conflicts, UI focused vitest, real Mongo restart, provider and browser evidence, thirty human reviews.
