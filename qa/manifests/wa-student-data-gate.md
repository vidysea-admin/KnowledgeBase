# Manifest — wa-student-data-gate
**Contract:** none specific; scope `docs/features/whatsapp-multiuser/plan.md` W11 part B, call sites in `docs/whatsapp/student-data-call-sites.md`. Policy: gate H-10 (`qa/gates/wa-student-data-default.md`, Umesh 2026-10-30): the default `studentData` stays `"no"` (D-206).
**Goal task:** whatsapp-multiuser W11 part B (`wa-student-data-gate`)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS (dual: qa/verdicts/wa-student-data-gate.md PASS 3a657d49, qa/verdicts/wa-student-data-gate.b.md PASS 9c00df05; cycle 0)
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: security apps/api/src/visibility/knowledge.ts:119
**Persona walk:** skip (no screen; server-side egress gate)
**Issues addressed:** none
**Executor:** claude (maker subagent, worktree `.worktrees/wa-student-data-gate`, branch `wave/wa-student-data-gate`, base ba7d5249)
**Round:** one round, Round est 90 min, tier H by the security trigger (WhatsApp text reaching external models).

## Criteria
- W-1 One predicate `externalModelEligible(tenantId, sourceId)` (plus the session form `externalModelEligibleSession`) in `apps/api/src/visibility/knowledge.ts`: resolves the link live, is memoised per capability instance (one per request), fails closed (read error, unknown id, non-string id, invalid tenant) and is tenant-scoped. A WhatsApp source is eligible only when its link row (found through `sourceMeta.whatsappLinkId`, same tenant) has `studentData: "no"`. `yes`, `unknown`, a missing link row, a foreign-tenant link and an unstamped legacy source are all excluded.
- W-2 G1: the tree that Ask and Route read never carries a node whose evidence names an ineligible WhatsApp source or session (`native-` levels by `evidence.sourceId`; any node by `evidence.sessionRef` / `sessionRefs`). Both production consumers (`route` and `ask.tree`) are wrapped.
- W-3 G2: `createSourceHydrator` (transcript) and `createNativeSourceHydrator` (native) refuse an admitted ineligible WhatsApp session or source before any quote is built, with a refusal that carries no content. The native hydrator's gate dependency is required, and the production `nativeSources` factory supplies it.
- W-4 G3: `createMongoOutputReader` refuses a requested ineligible WhatsApp session (404 not_found), so nothing reaches the generator or verifier model.
- W-5 G4: `indexSession` refuses a WhatsApp session for every link state before any model call, and the latent indexer binding `createMongoWhatsAppDeps(boundIndexer, ...)` is removed from `composition/production.ts`.
- W-6 Non-WhatsApp sources and sessions are unaffected whatever the links say; tenant scoping holds (another tenant, empty tenant, foreign link).
- W-7 No regression in the neighbouring suites; `tsc --noEmit` on `apps/api` clean; `lint-loc` and `dirsize` stages green. Consent code untouched (D-210).

## What changed (base ba7d5249, head db37c712)
- `apps/api/src/visibility/knowledge.ts:119` `extEligible` (predicate plus per-instance `extMemo`, wrapped in `guarded(false, ...)`); interface members `externalModelEligible` and `externalModelEligibleSession`. `wa = /^whatsapp/.test(kind)` covers `whatsapp-batch` and `whatsapp`. Some existing statements elsewhere in the file were compacted (joined lines, no semantic change) to stay within the 300-line budget.
- `apps/api/src/store.ts:63-69` new `createExternalModelTreeStore(inner, database)` wrapping `load` and `loadWithExclusions` (G1).
- `apps/api/src/composition/production.ts:177` (route) and `:212` (ask) wrap `createMongoTreeStore(native.resolver)`; `:183` passes `undefined` instead of `boundIndexer` to `createMongoWhatsAppDeps` (G4 latent wiring).
- `apps/api/src/ask/source-context.ts:114` (G2 transcript): after the scoped raw-row read and scope assertion, refuses when any session that has rows is ineligible.
- `apps/api/src/ask/native-source-context.ts:12-13,26` (G2 native): required `externalEligible` dependency, checked per admitted node before `listLocators`.
- `apps/api/src/composition/integrations/native.ts:70`: `nativeSources(tenantId)` builds one `createKnowledgeVisibility` per request and passes `externalEligible`.
- `apps/api/src/knowledge-outputs/reader.ts:18` (G3): ineligible requested session -> `OutputError("not_found", 404)`.
- Tests added: `visibility/external-model-gate.test.ts` (19), `visibility/external-model-tree.test.ts` (9), `visibility/external-model.testsupport.ts`, `ask/external-model-hydrators.test.ts` (16), `knowledge-outputs/external-model-reader.test.ts` (6).
- Existing tests and fixtures adjusted for the new rule (WhatsApp text now needs a `studentData: "no"` link): `ask/native-source-context.test.ts` and `ask/source-context.test.ts` (`externalEligible: async () => true`), `ask/source-context-quarantine.test.ts`, `knowledge-outputs/workbench.test.ts`, `native-evidence/message-publication-fixture.ts`, `native-evidence/message-vertical.test.ts` (each stamps `sourceMeta.whatsappLinkId` and adds a `no` link).
- Not touched: `apps/api/src/whatsapp/links/*`, `review/quarantine.ts`, `review/store.ts`, `selection/*`, `composition/integrations/routes.ts`, `docker-compose.yml`, `.env.example`, `packages/ai/src/router.ts`, `packages/db/src/collections/whatsapp-links.ts`, `indexing/session.ts`, any consent code.

## Evidence
Pre-check[W-1]: db37c712 node --test --import tsx apps/api/src/visibility/external-model-gate.test.ts -> 19 passed, 0 failed
Pre-check[W-2]: db37c712 node --test --import tsx apps/api/src/visibility/external-model-tree.test.ts -> 9 passed, 0 failed
Pre-check[W-3]: db37c712 node --test --import tsx apps/api/src/ask/external-model-hydrators.test.ts apps/api/src/ask/native-source-context.test.ts apps/api/src/ask/source-context.test.ts apps/api/src/ask/source-context-quarantine.test.ts apps/api/src/ask/ask-tenant-isolation.test.ts -> 68 passed, 0 failed
Pre-check[W-4]: db37c712 node --test --import tsx apps/api/src/knowledge-outputs/external-model-reader.test.ts apps/api/src/knowledge-outputs/workbench.test.ts -> 29 passed, 0 failed
Pre-check[W-5]: db37c712 node --test --import tsx apps/api/src/visibility/external-model-gate.test.ts -> 19 passed, 0 failed (the G4 cases and the production-wiring check are among them)
Pre-check[W-6]: db37c712 node --test --import tsx apps/api/src/visibility/external-model-gate.test.ts apps/api/src/visibility/external-model-tree.test.ts -> 28 passed, 0 failed
Pre-check[W-7]: db37c712 node --test --import tsx apps/api/src/answer-policy\admin-router.test.ts apps/api/src/answer-policy\answer-persistence.test.ts apps/api/src/answer-policy\answer-router.test.ts apps/api/src/answer-policy\answer-workflow.test.ts apps/api/src/answer-policy\mongo-store.test.ts apps/api/src/answer-policy\native-answer-evidence.test.ts apps/api/src/answer-policy\native-evidence.test.ts apps/api/src/answer-policy\routes.test.ts apps/api/src/answer-policy\service.test.ts apps/api/src/answer-policy\stale-citation-refusal.test.ts apps/api/src/composition/integrations/native.test.ts apps/api/src/native-evidence\head-store.test.ts apps/api/src/native-evidence\message-publication.test.ts apps/api/src/native-evidence\message-vertical.test.ts apps/api/src/native-evidence\publication.test.ts apps/api/src/native-evidence\resolver.test.ts apps/api/src/native-evidence\router.test.ts apps/api/src/native-evidence\vertical.test.ts apps/api/src/native-evidence\whatsapp-authority.test.ts apps/api/src/visibility\external-model-gate.test.ts apps/api/src/visibility\external-model-tree.test.ts apps/api/src/visibility\knowledge-batch.test.ts apps/api/src/visibility\knowledge.test.ts apps/api/src/visibility\native-tree-admission.test.ts apps/api/src/visibility\read-side-quarantine-trusted.test.ts apps/api/src/visibility\read-side-quarantine.test.ts apps/api/src/visibility\standalone-mongo.test.ts apps/api/src/visibility\standalone-publication.test.ts apps/api/src/whatsapp/review\consent-cas.test.ts apps/api/src/whatsapp/review\consent-race-mongo.test.ts apps/api/src/whatsapp/review\consent-race.test.ts apps/api/src/whatsapp/review\detection.test.ts apps/api/src/whatsapp/review\quarantine-native.test.ts apps/api/src/whatsapp/review\router.test.ts apps/api/src/whatsapp/review\store.test.ts apps/api/src/whatsapp/review\validation.test.ts apps/api/src/whatsapp/review\wire-fix1.test.ts apps/api/src/whatsapp/review\wire-mongo.test.ts apps/api/src/whatsapp/review\wire.test.ts -> 332 passed, 0 failed (335 tests, 3 skipped); tsc --noEmit (apps/api) exit 0; node scripts/lint-loc.mjs --all stages loc, dirsize, root, dupes, migrations, codex-hooks, lint-tests, dependencies exit 0
Tests[W-1]: apps/api/src/visibility/external-model-gate.test.ts — predicate matrix (no/yes/unknown/legacy/missing/foreign link), non-WhatsApp, unknown/empty/non-string ids, tenant scoping, read-error fail-closed, live resolve and memo
Tests[W-2]: apps/api/src/visibility/external-model-tree.test.ts — stubbed inner `TreeStore` with native, session and mixed nodes; `load` and `loadWithExclusions`; production wiring of both consumers
Tests[W-3]: apps/api/src/ask/external-model-hydrators.test.ts — both hydrators per link state, refusal carries no content, nothing read before refusal, the production `nativeSources` factory with a live link flip
Tests[W-4]: apps/api/src/knowledge-outputs/external-model-reader.test.ts — the real `createMongoOutputReader` over the shared WhatsApp fixture, per link state
Tests[W-5]: apps/api/src/visibility/external-model-gate.test.ts — G4 cases against the real `indexSession` (refused for every link state, public control not refused) plus the production-source wiring assertion
Tests[W-6]: apps/api/src/visibility/external-model-gate.test.ts apps/api/src/visibility/external-model-tree.test.ts — public source, session and nodes kept under every link state; foreign and invalid tenants
Tests[W-7]: the regression suites above and the four adjusted fixtures — they exercise the real approval, publication, native search/citation and Ask paths with a `no` link
Falsification[W-1]: `studentData === "no"` -> `!== "yes"` in knowledge.ts -> 4 red (unknown-link cases in the gate and hydrator suites); `guarded(false` -> `guarded(true` -> 2 red (read-error fail-closed); link read made tenant-unscoped -> 1 red (foreign link); memo disabled -> 1 red. Each restored from a per-mutation byte backup, cmp equal, `git hash-object` equal to `HEAD:` blob.
Falsification[W-2]: store.ts prune disabled -> 6 red; ask-tree wrapper removed in production.ts -> red (G1 wiring); route-tree wrapper removed -> red (G1 wiring). Restored, hashes equal.
Falsification[W-3]: source-context.ts gate disabled -> 5 red; native-source-context.ts gate disabled -> 7 red; native.ts `externalEligible` replaced with `async () => true` -> 2 red (production factory wiring). Restored, hashes equal.
Falsification[W-4]: reader.ts gate disabled -> 5 red (every excluded link state). Restored, hash equal.
Falsification[W-5]: session.ts `sessionVisible` guard replaced with `if (false)` -> 6 red (G4); production.ts `createMongoWhatsAppDeps(undefined` -> `boundIndexer` -> 1 red (wiring). Restored, hashes equal.
Falsification[W-6]: knowledge.ts `!wa ||` -> `false ||` (non-WhatsApp source now needs a link) -> 7 red. Restored, hash equal.
Falsification[W-7]: not applicable as a mutation. Before the four fixture adjustments the regression run showed 10 failing tests (3 isolation, 1 quarantine, 1 workbench, 5 native message), each a real WhatsApp text path the new rule is meant to change; after them 0 fail.

## Open points (declared, not defects)
1. **G5 (per-use approval record) is not built.** Out of scope per the brief. With the default `"no"` no per-use approval is needed; a record is needed only if a `yes` or `unknown` source is ever to be sent by explicit approval.
2. **Unstamped legacy sources are excluded.** A WhatsApp source ingested before links were stamped (env-seeded link, no `sourceMeta.whatsappLinkId`) cannot be resolved and is withheld from Ask, Route and outputs until stamped. This is the fail-closed behaviour gate H-10 kept; it can surprise an operator whose legacy group stops answering.
3. **Memo is per capability instance, not a request-memo parameter.** Each call site builds one visibility per request: the tree wrapper per load, `createSourceHydrator` per hydrate, `nativeSources(tenantId)` per request, the reader per read. A future caller that held one instance for the process lifetime would hold a stale answer.
4. **Pruned tree nodes are not counted in `excluded`.** `ExclusionReason` was not extended, so exclusion counts do not include student-data prunes. Counts only, no safety effect.
5. **Hydrators and the reader refuse the whole request instead of dropping a node.** After G1 the tree no longer carries such nodes, so this fires only if a link flips between tree load and hydration. The refusal text carries no content (asserted).
6. **Router not gated.** `packages/ai/src/router.ts` has no provenance, so egress is gated at the producers (G1-G3). Other `tree.load` consumers (answer-policy, yaml-simulation, evaluation-flywheel) are covered only when wired from production's `ask.tree`. Any new producer of WhatsApp text for a model must call the predicate.
7. **`knowledge.ts` was compacted.** To keep it at 300 non-blank lines, existing statements were joined with no semantic change; review with `git diff -w`.
8. **Pre-existing structure failures, not from this unit.** `lint-loc --all` still fails the `snapshot` stage (`docs/SNAPSHOT.md` stale) and the `tracker` stage (`qa/manifests/wa-isolation-read-side.md` cites bare ISS-011). Neither file is touched here.
9. **`reader.ts` gate is session-level; no claim-level filter.** A WhatsApp claim can only cite its own session through `claimVisible`, so the requested-session check is sufficient. If `claimVisible` is ever loosened, add a claim-level check.
10. **Commit trailer.** The brief named `Claude Opus 5.5`; the commits carry `Claude Sonnet 5.5` per the later attribution instruction.
11. **Consent (D-210):** no consent code was modified, extended or called; no consent issue was filed.
