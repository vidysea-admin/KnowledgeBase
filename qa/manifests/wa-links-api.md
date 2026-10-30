# Manifest — wa-links-api
**Contract:** none specific; `docs/features/whatsapp-multiuser/plan.md` W5 (acceptance 1-7) and `spec.md` R-1..R-6, R-9..R-14, R-24 (bind), R-44. Gates: H-4 (`qa/gates/wa-self-approval.md`, self-approval allowed for the sole active admin), `wa-revoked-link-read-access` (only `active` links grant owner access).
**Goal task:** whatsapp-multiuser W5 `wa-links-api`
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth|tenancy apps/api/src/whatsapp/links/router.ts:61
**Persona walk:** skip (API only; the screens are W10)
**Issues addressed:** none
**Executor:** claude-sonnet (build unit, worktree `.worktrees/wa-links-api`, branch `wave/wa-links-api`)
**Round:** one round, est 150 min, tier H by the auth and tenancy triggers.

## Criteria
- W5-1 Request: only a member/admin session holding `whatsapp-link` succeeds; a viewer, a pending user and a Bearer key (any scopes) get 403; a tenant or owner field in the body is refused (400, strict body); a second live link for the same user is 409; the notice version must be the current one (409 `notice_changed`); creation is rate-limited (429 with Retry-After).
- W5-2 Admin actions: only `whatsapp-admin` approves, rejects, suspends, resumes, revokes and binds; a member cannot act on any link including their own; a key or session from tenant B gets 404 on tenant A ids; the owner's view never carries admin-only fields; unlink is owner-or-admin and idempotent.
- W5-3 Self-approval (H-4): an admin approving their own request is allowed only when they are the only active admin; the approval event and response record requester and approver ids and flag the self-approval.
- W5-4 Provisioning: `connect` on an `approved` link calls `ensureOwner(linkId)` once even under concurrent calls and stores the owner id; a link in any other state is refused.
- W5-5 QR (R-13): only the owner's session can connect (admin, other member, any key: 403/404); `Cache-Control: no-store`; a canary QR never appears in logs, events or rows; the per-link QR budget returns 429; after `connected` the link becomes `active` exactly once and emits one event.
- W5-6 Adversarial: id guessing, a swapped tenant header, a key holding every scope, a tenant-B key, CSRF on every unsafe method for cookie principals, and mass assignment of `archiverOwnerId` from the body all fail closed.
- W5-7 The account-coupling hook `suspendForAccount(tenantId, userId, reason)` exists for W8 and suspends ACTIVE links only, by a system actor, with a code-form reason.
- W5-8 Mounting: the router is mounted through `mountIntegratedWorkflows` behind the shared `requireAuth` (503 placeholder when unwired), the empty `selection/router.ts` stub is mounted for W6; `lint:structure` (LOC, dirsize, dependencies) and `tsc --noEmit` are green.

## What changed (base aacb9213, head 4facc1bf)
- NEW `apps/api/src/whatsapp/links/service.ts` (289 lines): link lifecycle over a `LinksStore` port plus the W3 archiver port; allowlist `toLinkView`; fixed-window limiter; CAS transitions; `createMongoLinksStore` over the W1 accessors.
- NEW `apps/api/src/whatsapp/links/router.ts` (121): scope gates (`READ`/`OWNER`/`ADMIN`, line 61), strict bodies, no-store headers, `principalOf`, generic 503 on store failure, `buildWhatsAppLinks` production factory.
- NEW `apps/api/src/whatsapp/links/notice.ts` (45) and `docs/whatsapp/notice.md`: the R-3 notice, its version = SHA-256 of the LF-normalised text.
- NEW `apps/api/src/whatsapp/selection/router.ts`: empty router stub for W6.
- EDIT `apps/api/src/composition/integrations/routes.ts`: `whatsappLinks?` dep, mount of the links router (503 placeholder otherwise) and of the selection stub. `server.ts` needed no edit.
- NEW tests: `service.test.ts` (15), `router.test.ts` (9), `notice.test.ts` (3), `links.mongo.test.ts` (1, gated), plus `links.testsupport.ts` and `links.rig.testsupport.ts`.

## Evidence
Pre-check[W5-1]: 4facc1bf node --test --import tsx src/whatsapp/links/service.test.ts src/whatsapp/links/router.test.ts src/whatsapp/links/notice.test.ts -> 27 passed, 0 failed
Pre-check[W5-2]: 4facc1bf node --test --import tsx src/whatsapp/links/service.test.ts src/whatsapp/links/router.test.ts src/whatsapp/links/notice.test.ts -> 27 passed, 0 failed
Pre-check[W5-3]: 4facc1bf node --test --import tsx src/whatsapp/links/service.test.ts src/whatsapp/links/router.test.ts src/whatsapp/links/notice.test.ts -> 27 passed, 0 failed
Pre-check[W5-4]: 4facc1bf node --test --import tsx src/whatsapp/links/service.test.ts src/whatsapp/links/router.test.ts src/whatsapp/links/notice.test.ts -> 27 passed, 0 failed
Pre-check[W5-5]: 4facc1bf node --test --import tsx src/whatsapp/links/service.test.ts src/whatsapp/links/router.test.ts src/whatsapp/links/notice.test.ts -> 27 passed, 0 failed
Pre-check[W5-6]: 4facc1bf node --test --import tsx src/whatsapp/links/service.test.ts src/whatsapp/links/router.test.ts src/whatsapp/links/notice.test.ts -> 27 passed, 0 failed
Pre-check[W5-7]: 4facc1bf node --test --import tsx src/whatsapp/links/service.test.ts -> 15 passed, 0 failed
Pre-check[W5-8]: 4facc1bf node scripts/lint-loc.mjs --all and npx tsc --noEmit -p apps/api/tsconfig.json and node --test --import tsx src/composition/integrations/mounted-routes.test.ts src/server.test.ts src/user-accounts/admin-router.test.ts -> 37 passed, 0 failed (lint:structure OK 10 stages, tsc exit 0)
Tests[W5-1]: apps/api/src/whatsapp/links/service.test.ts apps/api/src/whatsapp/links/router.test.ts apps/api/src/whatsapp/links/notice.test.ts — request rules, strict body, rate limit, notice version stability
Tests[W5-2]: apps/api/src/whatsapp/links/service.test.ts apps/api/src/whatsapp/links/router.test.ts — admin gates, CAS moves, tenant 404s, owner view projection, unlink
Tests[W5-3]: apps/api/src/whatsapp/links/service.test.ts apps/api/src/whatsapp/links/router.test.ts — sole admin allowed and flagged, second admin refused, event ids
Tests[W5-4]: apps/api/src/whatsapp/links/service.test.ts — single flight under 6 concurrent connects (in-memory, stub archiver); the real-Mongo race test (links.mongo.test.ts) is gated and skipped here, see the Real-Mongo note
Tests[W5-5]: apps/api/src/whatsapp/links/router.test.ts apps/api/src/whatsapp/links/service.test.ts — owner-only connect through the REAL fake archiver over HTTP, no-store, canary QR scan of rows/events/logs, 429, exactly one connected event
Tests[W5-6]: apps/api/src/whatsapp/links/router.test.ts — adversarial test plus the CSRF matrix over every mutating route (no token, forged token, foreign origin, no origin)
Tests[W5-7]: apps/api/src/whatsapp/links/service.test.ts — hook suspends active only, system actor, refuses free-text reason
Tests[W5-8]: scripts/lint-loc.mjs apps/api/src/composition/integrations/mounted-routes.test.ts apps/api/src/server.test.ts — budgets and the unchanged mounted surface
Falsification[W5-1]: dropped the `link` scope check in `service.request` (`!p.userId || !p.link` -> `!p.userId`) -> `A1 request` red; made the router strict-body filter accept any field (`some(...)` -> `false`) -> `A1 create` and `A2/A3/A4` red; restored, HEAD-fidelity equal.
Falsification[W5-2]: removed the `p.admin` test in `service.approve` -> `A2 approve` red; restored, HEAD-fidelity equal.
Falsification[W5-3]: changed the sole-admin test `!== 1` to `!== 99` -> `H-4 self-approval` and `H-4 over HTTP` red; dropped the `reason: "self_approved"` event field -> `H-4 self-approval` red; restored, HEAD-fidelity equal.
Falsification[W5-4]: disabled the in-flight map (`inflight.get` replaced by null) -> `A5 connect ... ensureOwner once under concurrency` red; removed the state gate `l.state !== "approved" && !relink` -> `A5 connect: states that grant no connect` red; restored, HEAD-fidelity equal.
Falsification[W5-5]: removed the `owns()` check in `connect` -> `A5 connect through the REAL fake archiver` and the stranger-budget test red; changed `Cache-Control: no-store` to `private` -> `A1 create` and the fake-archiver connect test red; emitted `link.connected` without the CAS winner check -> `activation is a CAS` red; made the limiter never trip (`> max` -> `> max + 100000`) -> request and QR rate-limit tests red; restored, HEAD-fidelity equal.
Falsification[W5-6]: let a header override the tenant in `principalOf` -> `adversarial (plan 6)` red; disabled the session CSRF check in `user-accounts/csrf.ts` (shared file, mutated in place and restored) -> the CSRF matrix red; mass assignment is covered by the strict-body mutant above; restored, HEAD-fidelity equal.
Falsification[W5-7]: removed only the `state !== "active"` test in `suspendForAccount` -> survived (equivalent: the CAS `from: ["active"]` still refuses non-active links, defence in depth); removed both the test and the CAS `from` -> `R-10 suspendForAccount` red; restored, HEAD-fidelity equal.
Falsification[W5-8]: not applicable by mutation; the mount is proven by the router tests running through the real `createServer`, and by the `mount: without the dep` test (503, never a raw 404). Also pinned: the R-3 version stability mutant (CRLF normalisation removed) -> `R-3 the version is the SHA-256` red.

Mutation method (D-020 and its amendment): one byte backup per mutation, restore in a `finally` (no `trap EXIT`), a 170 s per-run timeout, and after every mutant `git hash-object <file>` equal to `git rev-parse HEAD:<file>` (all 16 equal; worktree clean after the run). A first harness pass was discarded because `timeout` on Windows resolved to `timeout.exe` and made every mutant look killed; the reported results are from the corrected harness, where the failing test names were captured for each kill.

Real-Mongo: `links.mongo.test.ts` is SKIPPED here (set `WA_REVIEW_TEST_MONGO_URL` to a TEST mongod; it creates and drops `lkb_test_wa_links_<hex>`). No local Mongo exists and the only reachable Mongo is production, which was not touched. The unique-index race, the closed-schema acceptance of every written row and event, the activation CAS and the cross-link `archiverOwnerId` uniqueness are therefore UNPROVEN in this run; the in-memory store emulates them. A flaky test was found and fixed during the run (two clock reads made `approvalExpiresAt` differ from `approvedAt + 14 d` by 1 ms in about 1 run in 10); 30 consecutive runs after the fix are green.

## Open points (declared, not defects)
1. **Schema gaps (W1, H-3).** The closed event schema has no `selfApproved` boolean and no `link.bound` event type. Self-approval is recorded as `reason: "self_approved"` with equal `requesterId`/`approverId`, and the response carries `selfApproved`. Bind writes no audit event. A W1 amendment is needed for either.
2. **No admin way to clear `blocksNewRequests`** after a revoke; a revoked user stays blocked from new requests.
3. **Resume is admin-only** (R-9 against R-10's "owner or admin"), and "show a new notice on resume if the version changed" is not implemented.
4. **Unlink and revoke move KB eligibility only.** Quarantine, the consent CAS and the archiver `unlinkSession` retry belong to W8, which extends `service.ts`.
5. **Event writes are best-effort after the CAS**; a failed write is logged by code and the transition stands (state is authoritative).
6. **Rate limits are in-process** (per instance): requests 10 per hour per user [ASSUMPTION], QR 30 per minute per link.
7. **`ensureOwner` is single-flight within a process only.** Across processes it relies on the archiver's idempotency by `ownerRef` plus the `setOwnerId` CAS.
8. **The notice file is not in the Docker image** (the Dockerfile does not copy `docs/`); without a `WHATSAPP_NOTICE_PATH` mount or a COPY line, requests answer 503 `notice_unavailable` (fails closed). No Dockerfile edit made.
9. **Production wiring is not done.** `buildWhatsAppLinks(env, db, log)` exists in `router.ts`, but `composition/production.ts` is at its LOC budget and is not a W5-named file, so nothing calls it; the surface answers 503 `workflow_unavailable` until a wiring unit passes `whatsappLinks`. The same unit must supply `WHATSAPP_ARCHIVER_API_*`.
10. **A key holding `whatsapp-admin` can perform admin actions** (it needs a key id to be the actor); it can never request, connect or own a link.
11. **Not touched by design:** `routes/whatsapp.ts`, `review/*`, `owner-config.ts`, `routes/brain.ts` (W7) and `scripts/whatsapp/sync-links.mjs` (W9). If W9 needs a change for the scheduler to read these links, it is for W9 to record.
12. **Commit trailer.** Commits end with `Co-Authored-By: Claude Sonnet 5.5`, per the attribution instruction in force for this session (the brief named Opus 5.5).
