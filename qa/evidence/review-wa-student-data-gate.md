# Review Findings - wa-student-data-gate (W11 part B)

Reviewer: senior-software-engineer (fresh context, read-only toward code). Range `ba7d5249..db37c712` (HEAD `70d8ac64`).
Gate: H-10 (`qa/gates/wa-student-data-default.md`), D-206 default `studentData: "no"`. Consent out of scope (D-210): not examined.

Current vs desired: before, Ask, Route and Outputs could send approved WhatsApp text to external models regardless of the owning link's `studentData`. After, a WhatsApp source or session reaches those paths only when its in-tenant link (via `sourceMeta.whatsappLinkId`) resolves to `"no"`; everything else, including legacy unstamped sources and read errors, is excluded.

## Checks I ran (worktree had no node_modules; I temporarily junctioned the main tree's, removed with `rmdir`, main tree intact)
- `node --test --import tsx` on external-model-gate, external-model-tree, external-model-hydrators, external-model-reader, native-source-context, source-context -> 82 passed, 0 failed.
- `tsc --noEmit` in `apps/api` -> exit 0.
- `git diff -w` read of every hunk in `knowledge.ts`: the compaction hunks are semantically identical (joined statements and comments only).
- Not re-run: the 332-test regression set, `lint-loc`, and the maker's mutation runs (relied on the manifest; no contrary evidence found).

## What I verified correct
- Predicate `knowledge.ts:119-129`: tenant asserted and every read tenant-scoped through `one()` (`withTenant` plus row.tenantId check). Only `studentData === "no"` passes. `yes`, `unknown`, missing/foreign link, unstamped source, non-string/empty id, unknown session, read error (`guarded(false,...)`, cached as false) all fail closed. Non-WhatsApp sources pass only if the `sources` row exists (document-kind native sources do have one: `head-store.ts:79`).
- Memo: keyed `[tenant, kind, id]`, one per visibility instance. Instances are per request/call at every site: tree wrapper per `prune` (`store.ts:66`), transcript hydrator per `hydrate` call (`source-context.ts:109`), `nativeSources(tenantId)` per request (`source-context.ts:272`, `requestDepsFor` called per request in `answer-policy/routes.ts:43`), reader per read (`reader.ts:12`). A cached rejection cannot occur (`guarded`).
- G1 prune (`store.ts:63-78`): native levels by `evidence.sourceId`, any node by `sessionRef`/`sessionRefs`; a non-string ref yields `[null]` -> excluded. trustedTree's detached "reviewed" nodes carry `evidence.sessionRef` (`knowledge.ts:~296`) so they are covered. Parent summaries are not a leak: trustedTree already blanks tenant/year/month summaries when WhatsApp exists and drops whole native-source nodes. Ask arms (`ask-arms.ts`) return nodes from the pruned tree, so they cannot re-introduce excluded sessions.
- Wiring (`production.ts:177,212`): both consumers wrapped; the only two `createMongoTreeStore(` calls in the file are wrapped. `createMongoWhatsAppDeps(undefined, ...)` at `:183` is safe (`store.ts:239` guards `if (indexSession)`), and `indexing/session.ts:72` already refuses `whatsapp-batch` before any model call.
- G2/G3 refuse before content is built; the refusal strings carry no content; G3 returns the same 404 as an unavailable session (no oracle). Approved WhatsApp claims are 1 turn : 1 session (`detection.ts:83`), so open point 9 holds.
- Default `"no"` for new links already exists (`links/service.ts:153`, `packages/db/.../whatsapp-links.ts:55`); not changed here.
- Native hydrator dependency is required by type; only production caller is `native.ts:70` and it supplies the gate.

## Findings (>80 % confidence)
- [sev: medium] apps/api/src/store.ts:67-72 and apps/api/src/visibility/knowledge.ts:119-128 - G1 prune recurses with an unbounded `Promise.all(node.children.map(keep))`, and the predicate memo is keyed per session id only, so every session node costs 2-3 fresh `findOne`s (session, source, link) even when many sessions share one source or the source is public. This runs on every `/ask` and `/route` over a tree capped only at 10 000 nodes by trustedTree, and `trustedTree` already does a comparable per-session pass, so the new work roughly doubles per-request Mongo round trips and can saturate the pool. Correctness is unaffected. D-206 K1 exists precisely because per-request full-tenant passes were too slow. -> Smallest fix: inside `extEligible` memoise the session->source and source->link lookups by `[tenant, id]` (a second small Map), and bound the child fan-out (sequential per level or a small concurrency limit). Evidence: code read; not load-measured (see Open Questions).
- [sev: low] qa/manifests/wa-student-data-gate.md (open points) - the survey `docs/whatsapp/student-data-call-sites.md` section 4 "Cache and replay hazards to include in deliverable B" (stored answers `answer-policy/answer-mongo-store.ts`, `answer-record-store.ts`, `knowledge-outputs/repository.ts`, `/search` cache) is neither implemented nor listed as a declared gap. These replay stored text to the user rather than sending it to a model, so this is not new egress, but the omission should be written down. -> Add as open point 12, or file-don't-fix.
- [sev: low] apps/api/src/visibility/knowledge.ts:119-128 - the predicate does not apply the owner-binding and link-state rules that the existing raw-access resolver uses (`whatsapp/owner-config.ts:196-205`: a stamp that disagrees with the source's `archiverOwnerId` is a broken binding; read access needs an active link). A revoked or suspended link with `studentData: "no"` stays eligible. Not a gate H-10 requirement and fails nothing it specifies; record as a decision rather than an accident. -> Open Questions.
- [sev: low] apps/api/src/visibility/knowledge.ts (several existing statements) - unrelated lines were joined to stay under the 300-line budget. Semantically identical (verified), but it makes the diff noisy and the next editor's merges harder. -> Prefer moving the new predicate into its own module in a later change; no action needed now.

## Open Questions
- Is the extra per-request read load of the G1 prune acceptable on the largest tenant tree? Settle with one timed `/ask` and `/route` load on a seeded tenant with ~2000 session nodes, before and after.
- Should a non-active link (revoked/suspended/unlinked) with `studentData: "no"` keep feeding external models? Umesh decision; today it does.
- Memo is per instance, so a `no` -> `yes` flip mid-request is not seen until the next request. Accepted and declared (open point 3); requests are short.

## Test Gaps
- The two production-wiring checks are regex assertions on `production.ts` source text (`external-model-tree.test.ts:52-57`, and the G4 wiring check). They catch removal of the wrapper but not a behaviour change inside it. A behavioural test would call `buildProductionDeps` against a fake db; acceptable as-is, noted.
- No test for a tree with many sessions sharing one source (would pin the memo/fan-out fix above), nor for a revoked-link case (would pin the decision above).
- The tree tests use a stubbed inner `TreeStore`; no test pipes real `trustedTree` output (including detached "reviewed" nodes) through the wrapper. The node shape was confirmed by reading `knowledge.ts`, not by a test.

VERDICT: Warning
