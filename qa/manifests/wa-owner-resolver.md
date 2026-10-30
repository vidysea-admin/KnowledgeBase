# Manifest — wa-owner-resolver
**Contract:** none specific; scope `docs/features/whatsapp-multiuser/plan.md` unit W4 and its per-unit acceptance block, `spec.md` R-24, R-25. Authorization: `qa/gates/plan-approved-whatsapp-multiuser.md`.
**Goal task:** whatsapp-multiuser W4 `wa-owner-resolver` (deps W1 wa-links-schema merged, A3 merged)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: tenancy apps/api/src/whatsapp/owner-config.ts:42
**Persona walk:** skip (no screen; owner resolution for raw-data reads)
**Issues addressed:** none
**Executor:** claude-opus (builder subagent, worktree `.worktrees/wa-owner-resolver`, branch `wave/wa-owner-resolver`, base 00de9d92)
**Round:** one round, est 90 min, tier H by the tenancy trigger.

## Criteria
- W4-1 With two active links in tenant T (owners A, B) an admin-session call lists groups for both owners, each group carrying its owner; a member-session call resolves only its own; no group of owner C (other tenant) ever appears.
- W4-2 `ingestGroup(T, jid)` for a jid marked only by A resolves A; for a jid marked by both, it requires `linkId` (else 409 `ambiguous_link`); for a jid marked only by C, 404 as if absent.
- W4-3 Legacy behaviour: with only the env map set and no link rows, first boot creates one `active` legacy link (`userId` null) per map entry and logs it; the second boot creates nothing; an env map that disagrees with existing links is ignored with a warning. An invalid map still fails boot. A plain `whatsapp` API key resolves legacy links only (R-25).
- W4-4 No link and no map -> `not_configured` exactly as today (existing tests pass unmodified).
- W4-5 Existing `store-isolation.test.ts` and `route-tenant.test.ts` pass; a new cross-owner test shows A's Mongo queries never carry B's `ownerUserId`.

## What changed (base 00de9d92, head a50d2af1)
- `apps/api/src/whatsapp/owner-config.ts` (in place, 33 -> 141 lines): added `WhatsAppCaller` / `whatsAppCallerFromAuth(req.auth)`, `createLinkBackedWhatsAppOwnerResolver` (returns a SET of `{linkId, ownerUserId}` grants from `active` link rows: admin session or `whatsapp-admin` key -> all active links of the tenant; member session -> its own link only; plain key or no caller -> legacy links `userId === null` only; rows of another tenant, non-active, unprovisioned or non-24-hex-lowercase owner ids dropped; empty set throws `WhatsAppNotConfiguredError`, never widened), `parseWhatsAppOwnerMap` (the old validation, extracted; same error text), `seedLegacyWhatsAppLinks` (boot seed: only for a tenant with no link rows at all; a disagreeing map warns and is ignored; duplicate-owner collision warns; owner ids never logged), `createDbBackedWhatsAppOwners` (production factory: invalid map throws at composition; seed is lazy, memoised, idempotent; a DB failure becomes `WhatsAppUnavailableError` with no cause text), `WhatsAppAmbiguousLinkError` (`status` 409, `code` `ambiguous_link`). `createConfiguredWhatsAppOwnerResolver` kept with identical behaviour (now on top of `parseWhatsAppOwnerMap`).
- `apps/api/src/whatsapp/store.ts` (in place): `ownerFor` -> `ownersFor(tenantId, scope)` returning the permitted grant set (new option `resolveOwners`; the old `resolveOwner` option still works as a one-grant set; malformed owner ids dropped; empty refused). `listGroups(tenantId, scope?)` lists per permitted owner and keeps only rows whose `ownerUserId` equals the owner queried. `ingestGroup(tenantId, groupJid, scope?)` still finds `groupJid && ownerUserId` per grant, now across the set: 0 matches -> the existing "no tracked WhatsApp group" error, >1 -> `WhatsAppAmbiguousLinkError`, `scope.linkId` narrows to one grant (a linkId outside the permitted set, a non-string or null is treated as absent). Return type is `ScopedWhatsAppRouteDeps` (extends `WhatsAppRouteDeps` with the optional `scope`).
- `apps/api/src/composition/production.ts:183` and `apps/api/src/composition/integrations/knowledge.ts:68`: `resolveOwners: createDbBackedWhatsAppOwners({ rawMap: WHATSAPP_TENANT_OWNER_MAP, db })`. `production.ts` stays 277 lines (<= 300).
- Tests (in place): `owner-config.test.ts` (+11), `store-isolation.test.ts` (+7), `route-tenant.test.ts` (+1). The original tests in all three files are unchanged; only import lines grew.
- Not touched: `routes/whatsapp.ts`, `whatsapp/review/*`, `docker-compose.yml`, any schema, any archiver code.

## Evidence
Pre-check[W4-1]: a50d2af1 node --test --import tsx apps/api/src/whatsapp/owner-config.test.ts apps/api/src/whatsapp/store-isolation.test.ts -> 23 passed (13/10), 0 failed
Pre-check[W4-2]: a50d2af1 node --test --import tsx apps/api/src/whatsapp/store-isolation.test.ts -> 10 passed, 0 failed
Pre-check[W4-3]: a50d2af1 node --test --import tsx apps/api/src/whatsapp/owner-config.test.ts apps/api/src/whatsapp/route-tenant.test.ts -> 15 passed (13/2), 0 failed
Pre-check[W4-4]: a50d2af1 node --test --import tsx apps/api/src/routes/whatsapp.test.ts apps/api/src/whatsapp/store-source-id.test.ts apps/api/src/whatsapp/store-snapshot.test.ts apps/api/src/whatsapp/store-mongo-snapshot.test.ts -> 23 passed (13/10), 0 failed
Pre-check[W4-5]: a50d2af1 node --test --import tsx apps/api/src/whatsapp/store-isolation.test.ts apps/api/src/whatsapp/route-tenant.test.ts -> 12 passed (10/2), 0 failed
Regression: a50d2af1 node --test --import tsx apps/api/src/whatsapp/review/*.test.ts -> 63 passed, 0 failed, 3 skipped (the opt-in real-Mongo files, `WA_REVIEW_TEST_MONGO_URL` unset); the wider affected run (whatsapp/*, review/*, routes/whatsapp, tenant-guards scoped-write/store-guards, production.test, composition/*) was 256 tests, 253 passed, 0 failed, 3 skipped. `tsc --noEmit` on apps/api exit 0; `pnpm -s lint:structure` OK (10 stages).
Tests[W4-1]: apps/api/src/whatsapp/owner-config.test.ts apps/api/src/whatsapp/store-isolation.test.ts — resolver set per caller (admin / member / key), cross-tenant and unprovisioned rows dropped, store lists per permitted owner and never queries owner C
Tests[W4-2]: apps/api/src/whatsapp/store-isolation.test.ts — ingest by jid: single owner, unpermitted owner absent with zero fetch/write/index, two links need linkId (error carries status 409 / code `ambiguous_link`), linkId outside the set absent
Tests[W4-3]: apps/api/src/whatsapp/owner-config.test.ts apps/api/src/whatsapp/route-tenant.test.ts — seed once / not twice / disagreeing map warns, invalid map throws, key resolves legacy only (unit and over HTTP)
Tests[W4-4]: apps/api/src/routes/whatsapp.test.ts apps/api/src/whatsapp/store-source-id.test.ts apps/api/src/whatsapp/store-snapshot.test.ts apps/api/src/whatsapp/store-mongo-snapshot.test.ts — the pre-existing not_configured and store suites, unmodified
Tests[W4-5]: apps/api/src/whatsapp/store-isolation.test.ts apps/api/src/whatsapp/route-tenant.test.ts — the original three plus the new "member's archive queries never carry another owner's id" and the HTTP legacy-only test
Falsification[W4-1]: (a) member sees every active link (`permitted = true`) -> 6 tests red; (b) admin gets only the first link -> 3 red; each restored.
Falsification[W4-2]: (a) ambiguity guess instead of refusing (drop `WhatsAppAmbiguousLinkError` throw) -> 1 red; (b) linkId outside the permitted set ignored -> 1 red; (c) ingest ignores the group's owner binding (`groupJid` only) -> 2 red; each restored.
Falsification[W4-3]: (a) a plain key / no caller also sees member links -> 4 red; (b) seed ignores existing link rows -> 1 red; each restored.
Falsification[W4-4]: (a) empty permitted set not refused in the resolver -> 4 red; (b) empty owner set not refused in the store (`byOwner.size === 0` throw removed) -> 1 red; each restored.
Falsification[W4-5]: (a) poisoned archive rows kept (owner row filter removed in `listGroups`) -> 1 red; (b) row tenant check dropped in the resolver -> 1 red; (c) non-active links accepted -> 4 red; each restored.
Mutation harness: `scratchpad/mutate_w4.py`, 12 mutations, byte backup PER MUTATION, 150 s timeout, explicit restore (no EXIT trap), `cmp`-equal and `git hash-object == git rev-parse HEAD:<file>` verified after every mutation (12/12 True); `git status` clean after the run. All 12 mutants were killed by assertion failures, none survived.
Junctions: created link-only `node_modules` junctions in the worktree (root, apps/api, apps/web, packages/{ai,ask,core,db,index,ingest,meeting-bot}); removed with `rmdir` (link-only) before finishing. Note that `@lkb/*` workspace links inside them resolve to the main tree's `packages/*`, so these tests exercised the main tree's `@lkb/db` (`whatsAppLinkStores` from W1, identical to this base).

## Open points (declared, not defects)
1. **The route does not pass the caller yet.** `routes/whatsapp.ts` (owned by W7) still calls `deps.listGroups(tenantId)` / `deps.ingestGroup(tenantId, jid)`, so `scope.caller` is undefined and the resolver treats the call as a plain key: legacy links only. That is exactly today's behaviour (one tenant owner), so there is no regression, but until W7 calls `whatsAppCallerFromAuth(req.auth)` a logged-in member session with the `whatsapp` scope also resolves legacy links only (not its own link, and never another person's). W7 must thread `caller` and `linkId` through the route and the reviewed wrapper in `whatsapp/review/ingest.ts`, which currently calls `base.ingestGroup(tenantId, groupJid)` without a scope. A checker should treat "member session reaches the legacy owner's groups" as the interim state, not a W4 defect, and verify W7 closes it.
2. **409 is a store-level contract here.** `WhatsAppAmbiguousLinkError` carries `status` 409 and `code` `ambiguous_link`; the HTTP mapping (and 404 for an absent group, today a generic 502 `whatsapp_ingest_failed`) is W7's edit to `routes/whatsapp.ts`. Ambiguity is unreachable over HTTP until W7 passes a caller (a tenant has at most one legacy link).
3. **Seed collision with the unique index is proven with a fake** that throws Mongo code 11000; the real unique partial indexes are W1's real-Mongo proof (opt-in env). No real-Mongo run in this unit; no transaction or CAS is claimed here.
4. **Two resolvers, two lazy seeds in one process** (`production.ts` store and `knowledge.ts` review wiring each build one). Both are idempotent: the second sees the first's rows, or hits the owner-unique index and warns. Not collapsed here because the two compositions do not share a handle.
5. The stale comment in `whatsapp/review/compose.ts:5` still shows the old `createConfiguredWhatsAppOwnerResolver` wiring example; left untouched (not mounted, doc-only).
6. A suspended or unlinked link stops resolving immediately (only `active` rows grant), which is the intended "stop within one cycle" ingress side of R-10/W8; the sync-side stop is W8/W9.
