# Verdict (coordinator A) — wa-events-without-archiver

VERDICT: PASS
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (dual; auth trigger `apps/api/src/composition/integrations/knowledge.ts:98`)
Date: 2026-10-31
Bound root: D:/KnowledgeBase (main tree, base cf244ceb + uncommitted `apps/api` diff). Never mutated; falsification ran in a detached git worktree under the scratchpad.
Contract: none specific; plan W12 / spec R-40; gate `qa/gates/wa-events-archiver-gate.md` answered (a) by Umesh 2026-10-31 ("serve the events feed independently of the archiver gate. Mongo-only; scope and tenant checks unchanged"). Consent (D-210) not touched.

## Check plan (step 0)
(1) Re-run the manifest verify commands in the bound tree (read-only). (2) Source read of `routes.ts:90-95`, `events-router.ts` and the knowledge.ts diff to confirm the events router enforces auth and tenant by itself. (3) Judge the C2 row removal and the new C4 against the gate. (4) One falsification for C1/C2 in a copy. I did not read any `.b.md` verdict.

## Results
- `node --test --import tsx src/composition/integrations/whatsapp-wiring.test.ts src/whatsapp/events.test.ts src/whatsapp/links/router.test.ts src/whatsapp/selection/router.test.ts` (apps/api): tests 39, pass 39, fail 0.
- `npx tsc --noEmit -p .` (apps/api): exit 0.
- Diff scope (`git diff --stat -- apps/api`): 2 files, `knowledge.ts` and `whatsapp-wiring.test.ts`. No `routes.ts` edit, no consent code, no secret.

### C1 / C2 — the events router is self-sufficient (source)
- `knowledge.ts:99` now composes `whatsappEvents: buildWhatsAppEvents(input.db)` unconditionally. `buildWhatsAppEvents(db)` (`events-router.ts` last function) takes only `db`: no env, no archiver config, no archiver client. `whatsappLinks`/`whatsappSelection` stay behind `multiUser` (`knowledge.ts:100`).
- `routes.ts:93` mounts `createWhatsAppEventsRouter` when the dep is present; `:94` keeps the 503 fallback behind `requireScope('whatsapp-admin')` for compositions that omit the dep. So the fallback is now only unreachable from the production composition, not removed.
- The router carries its own gates: `router.get("/whatsapp/events", requireScope("whatsapp-admin"), ...)`; tenant is read only from `req.auth?.tenantId` and validated with `isValidTenantId` (401 otherwise); `deps.feed.list(tenantId, ...)` goes to the W1 accessor `whatsAppLinkStores(db).events(tenantId)` which is tenant-scoped (`packages/db/src/collections/whatsapp-links.ts:82`, "every query takes a tenantId"). Cursor and limit are validated (400); output is an allowlist projection; `Cache-Control: no-store`. Nothing in this path references the archiver gate, so removing the archiver dependency does not remove any check.
- Shared perimeter (requireAuth/CSRF) still runs before the mount, as for every other route; C4 exercises it through the real `createServer`.

### C3 — links and selection stay fail-closed
- Source: both remain inside the `multiUser` spread. Test: the retained C2 rows (links/selection 401/403/503 after the scope check, both env shapes `{}` and invalid pair) pass; C1/C3 configured test passes unchanged.

### Judgement: removing the C2 `/whatsapp/events` 503 rows and adding C4
Legitimate behaviour change, not a weakening.
- The five removed rows asserted 401 (anon), 503 (admin session), 503 (admin key), 403 (member), 403 (viewer) on the unconfigured composition. The 503 pair encoded the exact behaviour the gate answer (a) replaces; keeping them would contradict the approved decision.
- C4, run for both env shapes, keeps the 401/403/403 assertions verbatim, and replaces the two 503s with stronger ones: 200 for an admin session and for a `whatsapp-admin` key with the exact tenant-1 event ids, and a tenant-2 admin sees only tenant-2 ids (cross-tenant isolation, which the old rows never asserted). Net assertion count on the events surface goes up and every auth denial row survives.
- Header comment and test name updated consistently; the invalid-config warning text now says "links and selection", matching reality.

### Falsification (C1 and C2, one mutation)
- Copy: `git worktree add --detach <scratchpad>/wt-a cf244ceb`, applied the bound `git diff -- apps/api`, junctioned `node_modules` dirs (junctions unlinked with `rmdir` before `git worktree remove`; bound-tree `node_modules` verified intact afterwards).
- Green before: `whatsapp-wiring.test.ts` 3 pass / 0 fail.
- Mutation: `knowledge.ts` re-gated `whatsappEvents` back inside the `multiUser` spread (the pre-fix shape).
- Red after: 2 pass / 1 fail; C4 failed `503 !== 200` (the real composition answered 503 without the archiver). C1/C3 configured and C2 links/selection stayed green, so the mutation is caught precisely by the new test and not masked.
- Restored: file copied back from a per-mutation byte backup (no EXIT trap); rerun 3 pass / 0 fail; `git hash-object` of the worktree file `e0449164de2cdc7ebcc00e8cf97142b25ed48f7a` equals the bound-tree file. The bound tree was never written. Worktree removed.

## EXPLANATION
All three criteria hold. The only behavioural change is that `GET /whatsapp/events` is reachable without the archiver; the route stays admin-scope-gated, tenant-scoped by the accessor and tenant-from-auth only, and read-only, matching the gate answer. The fallback in `routes.ts:94` is dead for the production composition but harmless. Low notes (not filed): the manifest's process note about a relative-path trap restore is consistent with the 2026-09-28 amendment in project CLAUDE.md (per-mutation backup, HEAD-fidelity hash); no residue found in the tree (`git diff --stat` shows only the two intended files).

ISSUES-WRITTEN: none
PROPOSED-ISSUE: none
check_min=14
