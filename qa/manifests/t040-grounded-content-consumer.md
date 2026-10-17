# T-040 grounded content consumer

**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 0
**Tier:** 3, next unblocked roadmap slice T-040; independent consumer seam. Auth/tenancy class requires full ceremony.

## Authorization and boundaries

Umesh approved implementing the remaining-work plan with maximum useful parallel agents. Parent assigns exclusive new API `src/grounded-content/` and web `pages/sessions/grounded/` subtrees. Existing t040wire PASS is reused. No AI/index producer, schema, DB-write, contracts, enforcement, decisions or central tracker edits. New read route uses existing `sessions` scope. Integration of mounts belongs to the integrator, after independent scoped check.

## Behavior and interface

- `createGroundedContentRouter(deps)` serves `GET /sessions/:id/grounded-content`, mounted after requireAuth. Tenant comes exclusively from `req.auth`; missing session returns 404, lacking sessions scope returns 403.
- `createGroundedContentDeps(read: GroundedReadDeps)` adapts the existing `BrainReadDeps.getSessionDetail`. `createMongoGroundedContentDeps(db?: Db)` is an optional standalone tenant-scoped reader.
- Projection exposes only notes, Q&A and claims, preserving review states; exact nonempty quotes resolve against the current same-tenant/same-session turn. Missing/mismatched evidence is explicit and has no resolved time/speaker. Unanswered Q&A cannot expose stale answer fields.
- `GroundedContentPanel({apiKey,sessionId})` fetches authenticated content, renders separate question/answer evidence and literal transcript anchor links. Origins distinguish screen text, visual observation and speech. Generated notes/Q&A remain unverified. Key/session changes hide old results and ignore late completions.
- Integrator: mount `createGroundedContentRouter(createGroundedContentDeps(deps.brain))` after requireAuth; render panel in SessionDetailPage with current apiKey/sessionId.

## Existing ground truth

- `qa/contracts/tenant-id-validity.md` clauses 1, 3, 4, 5, 9: tenant validation before reads and tenant-bound filters.
- `schema/session_pages.schema.json`: CitedItem/QuotedEvidence/QaEntry semantics. Existing generated core types reused; maker edits no schema/contracts.
- `qa/contracts/citations-route.md` evidence visibility principle, not a claim of changing or passing that route's full acceptance.
- New feature contract, if required, belongs to checker. No root qa/contracts/t040*.md exists during survey.

## Files and security

All feature files are new/untracked (no original base existed); base HEAD at initial candidate `4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd`.

- apps/api/src/grounded-content/{reader.ts,router.ts,reader.test.ts}
- apps/web/src/pages/sessions/grounded/{client.ts,GroundedContentPanel.tsx,GroundedContentPanel.test.tsx}
- qa/evidence/t040-grounded-content/ui-smoke.test.mjs
- This manifest and matching packet.

Auth: yes; tenancy/cross-tenant read: yes; data writes: none; credentials: existing API Bearer key through existing client, never rendered or logged. Existing auth middleware, scopedCollection and session anchor behavior are unchanged consumers. No filed issue is being fixed, so no ledger reproduction corpus applies.

## Evidence and environment

Focused evidence passed in the allocated slot: API Node tests 7/7, actual production UI/client React probe 1/1, frozen-contract validator exit 0 (no frozen contracts, vacuity disclosed). Exact commands/outputs and final hashes in `qa/packets/t040-grounded-content-consumer.md`. API tests exercise real Express auth/router on loopback, injected read and real scopedCollection over a hermetic fake Db; UI exercises real component/client through mocked HTTP transport and actual React DOM.

Vitest's esbuild subprocess is already known to fail sandbox EPERM in this wave; do not repeat the predictable failed invocation. Root authorized shared same-process TypeScript/React harness under `.cache/coordination/safe-test-runtime/`; no guards, production sources or sandbox settings altered to run it. Standing Vitest suite remains for the normal supported CI environment. Global API typecheck passed exit 0 after one HTTP-test type-only correction. Web typecheck and real server/page mounting verification remain integration checks; prior API test receipt is qualified by its earlier test-file hash in the packet.

No browser, live provider, live DB, live Ask or seven-day observation claimed. T-040 parent remains open. Required checker verdict `qa/verdicts/t040-grounded-content-consumer.md`, Cycle checked 0, must match final unchanged file hashes before close-out.

## Independent close-out

Independent `qa/verdicts/t040-grounded-content-consumer.md` PASS, Cycle checked 0, matched current seven candidate hashes on maker reread. Checker-authored `qa/contracts/t040-grounded-content-consumer.md` adopted this scoped consumer contract. Independent 9/9 behavioral checks passed: current API tests 7/7, actual UI/client probe 1/1, actual production BrainReadDeps through tenant-evaluating fake driver and real p2 quote to actual React probe 1/1. No issues filed. Checker current API rerun supersedes the earlier pre-type-correction maker test receipt.

Scoped source/consumer unit closed; parent T-040 remains open. Shared router/component mounting, integrated web typecheck, normal Vitest CI, D-024 browser evidence and live grounded extraction/work-DB/index/Ask acceptance remain separate integration/release gates.
