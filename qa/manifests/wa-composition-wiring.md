# Manifest — wa-composition-wiring
**Contract:** none specific; scope `docs/features/whatsapp-multiuser/plan.md` rows W5/W6/W12, spec R-1..R-21 and R-40. Fixes ISS-WASEL-001 (`qa/issues.wasel.jsonl`), ISS-WAEF-002 (`qa/issues.wa-events-feed.jsonl`) and the wiring part of ISS-WALINKS-004 (`qa/issues.walinks.jsonl`).
**Goal task:** whatsapp-multiuser composition wiring (before W10/W14)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS (qa/verdicts/wa-composition-wiring.md ea501a13 + .b.md ce222d15, dual)
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/composition/integrations/routes.ts:91
**Persona walk:** skip (no screen; server composition and mount order)
**Issues addressed:** ISS-WASEL-001, ISS-WAEF-002, ISS-WALINKS-004 (wiring part only)
**Executor:** claude (maker subagent, worktree `.worktrees/wa-composition-wiring`, branch `wave/wa-composition-wiring`, base d0416a8e)
**Round:** one round, Round est 60 min, tier H by the auth trigger (auth-scoped WhatsApp routers go live in the production composition).

## Criteria
- C1 In the production composition with WhatsApp configured, GET /whatsapp/events, the /whatsapp/links routes and the /whatsapp/selection routes are served by their real routers (no 503), each behind its existing scope.
- C2 With WhatsApp not configured, each of those surfaces answers 503 after its scope check, and no route is reachable without auth.
- C3 Tenant and scope behaviour of the three routers is unchanged (existing router tests stay green; member/viewer refused on admin routes through the real composition).

## What changed (base d0416a8e, head 90096ea5)
- `apps/api/src/composition/integrations/knowledge.ts` edited in place (where the existing `whatsappReview` dep is composed): `KnowledgeIntegrations` gains `whatsappLinks`, `whatsappSelection`, `whatsappEvents` (`:35-37`); new exported `whatsAppMultiUserConfigured(env, log)` (`:41-43`) is the gate: true only when `loadArchiverConfig(env)` returns a config (`WHATSAPP_ARCHIVER_API_URL` + `_TOKEN` valid), false when neither is set or the pair is invalid (a warning is logged by setting name, no value). `buildKnowledgeIntegrations` calls `buildWhatsAppLinks`, `buildWhatsAppSelection`, `buildWhatsAppEvents` only when the gate is true (`:91-98`); an optional `log` input defaults to the process logger. `production.ts` is untouched (at its LOC budget): it already spreads the result of `buildKnowledgeIntegrations` into `ServerDeps`.
- `apps/api/src/composition/integrations/routes.ts` edited in place: `whatsappSelection?: SelectionRouterDeps` on `IntegratedWorkflows` (`:49`); the old fallback `app.use('/whatsapp/links', requireScope('whatsapp-link'), unavailable)` (which preceded the no-deps selection mount and shadowed `/whatsapp/links/:id/groups`) is replaced by `mountWhatsAppUnavailable` (`:52-67`, called at `:92`). Unconfigured, each route keeps its real scope then answers 503 `workflow_unavailable`: owner-only routes (notice, POST request, connect, selection PUT/people) need `whatsapp-link`; approve/reject/suspend/revoke/resume/bind need `whatsapp-admin`; the catch-all (list, get, unlink, groups list) needs either scope, as the real routers. The events fallback is unchanged (`whatsapp-admin`). The selection mount (`:95`) now takes the composed deps and exists only when wired; the empty `createWhatsAppSelectionRouter()` mount is gone. Mount order: links router, events, selection; when configured the links router has no `/groups` route, so selection is reached.
- Test support `apps/api/src/whatsapp/links/links.rig.testsupport.ts` (`linksRig` options `deps?: Partial<ServerDeps>` spread last) so a test can mount the composed deps.
- W5 pin updated: `apps/api/src/whatsapp/links/router.test.ts:154` now asserts the unwired surface answers 503 after the scope check for links AND selection (member 503, viewer 403), and keeps the factory-without-deps-is-empty assertion.
- NEW `apps/api/src/composition/integrations/whatsapp-wiring.test.ts` (2 tests): composes with the real `buildKnowledgeIntegrations` over the in-memory Mongo double and mounts through the real `createServer` perimeter with cookie sessions (real roles and scopes) and one admin-only key.
- Notice text path (H-11): `buildWhatsAppLinks` already reads `docs/whatsapp/notice.md` (resolved from the module location) or `WHATSAPP_NOTICE_PATH`; the composed test shows the repo notice is served (`GET /whatsapp/links/notice` 200) from a checkout. No `qa/gates` file answers H-11 beyond plan.md:308 (compose and `.env.example` forwards are enforcement-adjacent, `Approved-by` where required). The Dockerfile has no COPY for `docs/`, so in the image the notice is unreadable and link requests answer 503 `notice_unavailable` (fails closed). Dockerfile and `docker-compose.yml` were NOT edited; recorded as open point 1 for DevOps.
- Not touched: `production.ts`, `server.ts`, any router/service file, `packages/db`, `schema/`, `.env*`, `Dockerfile`, `docker-compose.yml`, any consent code (D-210). Out of scope and untouched: the admin clear endpoint for `blocksNewRequests` (ISS-WALINKS-004), ISS-WAEF-001 cursor ordering.

## Evidence
Pre-check[C1]: 90096ea5 node --test --import tsx apps/api/src/composition/integrations/whatsapp-wiring.test.ts -> 2 passed, 0 failed
Pre-check[C2]: 90096ea5 node --test --import tsx apps/api/src/composition/integrations/whatsapp-wiring.test.ts -> 2 passed, 0 failed (the unconfigured test runs twice: no env, and an invalid URL/token pair)
Pre-check[C3]: 90096ea5 node --test --import tsx apps/api/src/whatsapp/links/router.test.ts apps/api/src/whatsapp/links/events-router.test.ts apps/api/src/whatsapp/selection/router.test.ts apps/api/src/composition/integrations/mounted-routes.test.ts apps/api/src/production.test.ts apps/api/src/whatsapp/events.test.ts apps/api/src/whatsapp/links/service.test.ts apps/api/src/composition/integrations/whatsapp-wiring.test.ts -> 74 passed, 0 failed, 0 skipped
Tests[C1]: whatsapp-wiring.test.ts "C1/C3 configured" — no credential 401; admin session GET /whatsapp/events 200 with only tenant-1 events; member and viewer 403; member reads the notice (200), creates a link (201) and lists (200); the selection route answers from the selection SERVICE (409 `link_not_active` for a requested link), not the 503 fallback; a tenant-2 admin gets 404 on a tenant-1 link.
Tests[C2]: whatsapp-wiring.test.ts "C2 unconfigured" — a request matrix per environment across events, links (notice, request, list, connect, approve/revoke) and selection (groups list, PUT group, people GET/PUT): anonymous 401, wrong scope 403, right scope 503 `workflow_unavailable`.
Tests[C3]: the existing router, service, events and mount suites above pass unchanged except the one updated W5 pin; whatsapp-wiring.test.ts adds member and viewer 403 on approve/reject/suspend/revoke/resume and on the events feed, owner-only 403 for an admin-scoped key on group marking, and tenant isolation, all through the real composition.
Falsification[C1]: (M1) `...(multiUser ? {` -> `...(false ? {` in knowledge.ts -> configured test red; (M2) selection mounted without deps (`createWhatsAppSelectionRouter()`) in routes.ts -> configured test red. Each restored from a per-mutation byte backup, `cmp` equal.
Falsification[C2]: (M3) the gate `return loadArchiverConfig(env) !== null;` -> `return true;` -> unconfigured test red; (M4) catch-all `heldAny(...)` removed from `app.use(L, ..., unavailable)` -> unconfigured test red. Restored, `cmp` equal.
Falsification[C3]: (M5) the `admin` scope removed from the approve/reject/... fallback route -> unconfigured test red (member no longer refused with 403). Restored, `cmp` equal; final `git hash-object` of knowledge.ts and routes.ts equals the committed blobs (D-020, no EXIT trap used).

Also run: `tsc --noEmit` on apps/api exit 0; `lint-loc`, `lint-dirsize`, `lint-root`, `lint-dupes`, `lint-migrations`, snapshot stages OK. `lint:structure` stage `dependencies` fails on `apps/web/src/pages/whatsapp-links/QrCode.tsx -> qrcode-generator` (the W10 dependency missing from the main tree's node_modules; pre-existing, unrelated).

## Open points (declared, not defects)
1. **H-11, DevOps (not edited here):** (a) the Dockerfile copies no `docs/`, so `docs/whatsapp/notice.md` is absent in the image and link requests answer 503 `notice_unavailable` until a COPY line is added or a file is mounted with `WHATSAPP_NOTICE_PATH`; (b) `docker-compose.yml` forwards none of `WHATSAPP_ARCHIVER_API_URL`, `WHATSAPP_ARCHIVER_API_TOKEN`, `WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP`, `WHATSAPP_NOTICE_PATH`; without the first two forwards the container is "not configured" and all three surfaces answer 503 (fails closed). Both are enforcement-adjacent paths: `Approved-by` where required.
2. **The gate is the archiver service API config,** chosen as the one prerequisite of the whole multi-user surface (R-42); the events feed itself needs only Mongo, so with the archiver env unset an admin cannot read events even though writers fill the collection. Say if events should be served without the archiver.
3. **Fallback route table is a mirror** of the real routers' paths in `mountWhatsAppUnavailable`; a new route added to a router needs a line there (otherwise it falls into the any-of-link/admin catch-all, still 503, never open).
4. **Admin session holds `whatsapp-link`** (roles.ts ADMIN includes MEMBER), so admin sessions pass owner-only scope checks and meet the service's own owner rule; owner-only 403 is therefore shown with an admin-scoped key.
5. **Still open from ISS-WALINKS-004:** the admin endpoint that clears `blocksNewRequests` after a revoke (out of scope here). ISS-WAEF-001 (cursor ordering) untouched.
6. **Consent (D-210):** no consent code modified, extended or called; no consent event added.
7. **Commit trailer:** the code commit ends with the Opus 5.5 line named in the brief.
