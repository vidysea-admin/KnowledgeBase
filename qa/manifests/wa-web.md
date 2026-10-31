# Manifest — wa-web
**Contract:** none specific; `docs/features/whatsapp-multiuser/plan.md` unit W10 `wa-links-web` (acceptance 1-6) and `spec.md` R-3, R-12, R-14, R-22. Gates: `qa/gates/wa-qr-library.md` (H-9, answered: pinned client-side QR library), `wa-self-approval.md` (H-4: requester and approver both recorded; the server does this, the page only shows the refusal), `wa-revoked-link-read-access.md` (active only; server-side, the page shows what the API returns). Ledger: ISS-WALINKS-009, ISS-WASEL-002.
**Goal task:** whatsapp-multiuser W10 `wa-links-web` (manifest slug `wa-web`)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS (dual: qa/verdicts/wa-web.md PASS 1cef3dd9, qa/verdicts/wa-web.b.md PASS f6999773; cycle 0)
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/web/src/pages/whatsapp-links/QrCode.tsx:31
**Persona walk:** deferred: acceptance 1's real-browser walk needs the links and selection routers mounted in production composition and a fake archiver behind them (ISS-WASEL-001, a later wiring unit); every interaction is asserted by state change against a fake fetch now (open point 1)
**Issues addressed:** ISS-WALINKS-009, ISS-WASEL-002 (client side of both)
**Executor:** claude-sonnet (build unit, worktree `.worktrees/wa-web`, branch `wave/wa-web`, base 80073a37 = W6 close-out)
**Round:** one round, est 150 min, tier L (brief) with Dual check required: the unit renders the QR capture credential and gates owner-only controls in the client.

## Criteria
- W10-1 Persona walks T1, T2, T3, T5 in a real browser against the fake archiver: T1 requests, sees `requested`; T2 approves; T1 opens connect, QR renders and refreshes, then `connected` flips the link to `active`; T1 marks a group and a person; T1 sees health; T1 unlinks; every interaction is asserted by state change, not by rendering; console error count 0 per page.
- W10-2 T1 sees only their own link; T2 sees all; a viewer/T5 sees a read-only page or the empty state, never QR or marking controls; an admin never sees the connect page for another person's link.
- W10-3 The page works under a non-root base path (decision 1b): no absolute `/whatsapp` hrefs (`noRootAbsoluteHrefs.test.ts` still passes).
- W10-4 The QR is held in memory only, never in storage, URL, or logs; polling stops on unmount and on `connected`; leaving the page discards it.
- W10-5 Tracking screens show no message text (R-22); the short notice and its version are displayed.
- W10-6 Failure states render: 503 `archiver_api_unavailable`, `needs-relink`, `liveness unknown`, expired approval (14 days).
- W10-7 Gate H-9: the QR is drawn client-side by a library pinned to an exact version (no `^`/`~`), lockfile updated, no network or CDN, payload never logged or persisted; package, version and licence named in the manifest.
- W10-8 Ledger: ISS-WALINKS-009 the QR is polled no faster than every 3 s and polling stops on a terminal state; ISS-WASEL-002 picking people on a group whose capture is "all" first sends `trackAllSenders:false`, then `setPeople`, then reads capture back.

## What changed (base 80073a37, head 0427085f)
- `apps/web/src/api/whatsapp-links.ts` (NEW): typed wrappers for the W5 links routes and W6 selection routes; `QR_POLL_MIN_MS = 3000`; `restrictToPeople` (the ISS-WASEL-002 ordering, line 63); `describeLinkError` (one plain sentence per code, never server text).
- `apps/web/src/pages/whatsapp-links/` (NEW): `LinksPage` (list, request entry, `StateBadge`), `NewLinkPage` (notice text + version, label, posts `{label, noticeVersion}` only), `LinkDetailPage` (status/health, owner controls incl. two-step unlink, admin controls incl. student-data class on approve, revoke), `ConnectPage` (owner-gated poll, QR in state only), `QrCode.tsx` (SVG drawn from the module matrix, no innerHTML), `ChoosePage` (mark group, choose people, read-only admin view), plus `QrCode.test.tsx` and `WhatsAppLinksPages.test.tsx`.
- `apps/web/src/App.tsx` (in place): five routes under `/whatsapp/links` next to `/whatsapp`; `apps/web/src/layout/NavSidebar.tsx` (in place): one nav entry.
- `apps/web/package.json`, `pnpm-lock.yaml`: one dependency, `qrcode-generator` **2.0.4**, licence **MIT**, zero dependencies of its own, ESM build with bundled types, published 2025-08-07; lockfile adds only its importer entry, the package entry (integrity `sha512-mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==`) and its snapshot line, produced with `pnpm install --lockfile-only --ignore-scripts`. Not touched: `apps/api/**`, `docker-compose.yml`, `.env.example`, `packages/db`.

## Evidence
Pre-check[W10-1]: 0427085f vitest run src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx (cwd apps/web) -> 22 passed, 0 failed
Pre-check[W10-2]: 0427085f vitest run src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx (cwd apps/web) -> 22 passed, 0 failed
Pre-check[W10-3]: 0427085f vitest run src/config/noRootAbsoluteHrefs.test.ts src/App.routes.test.tsx src/App.wiring.test.tsx src/layout/responsive.test.tsx (cwd apps/web) -> 34 passed (2/4/21/7), 0 failed
Pre-check[W10-4]: 0427085f vitest run src/pages/whatsapp-links/QrCode.test.tsx src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx (cwd apps/web) -> 27 passed (5/22), 0 failed
Pre-check[W10-5]: 0427085f vitest run src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx (cwd apps/web) -> 22 passed, 0 failed
Pre-check[W10-6]: 0427085f vitest run src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx (cwd apps/web) -> 22 passed, 0 failed
Pre-check[W10-7]: 0427085f vitest run src/pages/whatsapp-links/QrCode.test.tsx (cwd apps/web) -> 5 passed, 0 failed
Pre-check[W10-8]: 0427085f vitest run src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx (cwd apps/web) -> 22 passed, 0 failed
Typecheck: 0427085f tsc --noEmit -p apps/web/tsconfig.json -> exit 0
Tests[W10-1]: apps/web/src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx — request (POST body is label + noticeVersion only), approve (POST body carries the chosen class), connect, mark, unlink (two-step, one POST), each asserted on recorded calls and resulting UI state
Tests[W10-2]: apps/web/src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx — member list, admin list with owners and the waiting count, viewer makes no request, admin on another's link has no connect/choose control and `/connect` is never fetched
Tests[W10-3]: apps/web/src/config/noRootAbsoluteHrefs.test.ts — source scan over all of apps/web/src (includes the new files); apps/web/src/App.routes.test.tsx apps/web/src/App.wiring.test.tsx apps/web/src/layout/responsive.test.tsx — the edited App.tsx and NavSidebar.tsx still route and render; all new links are router `<Link>`s
Tests[W10-4]: apps/web/src/pages/whatsapp-links/QrCode.test.tsx — canary QR text absent from DOM, storage, URL, console and network; apps/web/src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx — poll stops on unmount and on connected, the QR element is gone and storage holds no canary
Tests[W10-5]: apps/web/src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx — notice text and the first 12 characters of its version shown; the choose screen calls only the groups, mark and people routes
Tests[W10-6]: apps/web/src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx — 503 `archiver_api_unavailable` on connect and choose, `needs-relink` offers Re-link, `liveness unknown`, approval expired, 429 and not-found sentences, none echoing server text
Tests[W10-7]: apps/web/src/pages/whatsapp-links/QrCode.test.tsx — package.json exact `2.0.4`, lockfile specifier/version/integrity, no source loads from the network, matrix is deterministic and the oversized payload is an error not a blank
Tests[W10-8]: apps/web/src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx — polls at 0, 3000, 6000 ms (2999 ms later still one call), 429 Retry-After honoured, failures back off, terminal answers stop; the PUT order for an "all" group is [trackAllSenders:false, people] and the read-back capture is displayed, including the "still captures everyone" case
Falsification[W10-1]: approve body `{ studentData }` -> `{}` (M10) -> approve test red; restored, bytes equal and `git hash-object` = `HEAD:` blob.
Falsification[W10-2]: `{isOwner && (` -> `{(isOwner || isAdmin) && (` in LinkDetailPage (M7) -> "admin never gets the connect or choose controls" red; and `if (userId === null || l.userId !== userId)` -> `if (false)` in ConnectPage (M3) -> "admin on someone else's link never requests the QR" red; and the viewer early-return removed in LinksPage (M8) -> "viewer makes no request" red. All restored, HEAD-equal.
Falsification[W10-3]: no mutation applies: the criterion is a standing guard (`noRootAbsoluteHrefs.test.ts`) that scans every source file, and a root-absolute `href` in a new file is exactly what it rejects; it passed on the final tree.
Falsification[W10-4]: `aria-label="WhatsApp pairing QR code"` -> `aria-label={value}` in QrCode (M6) -> canary test red; and `clearTimeout(timer)` removed from the effect cleanup (M4) -> "poll stops when the page is left" red. Restored, HEAD-equal.
Falsification[W10-5]: no mutation applies beyond the route-set assertion in the choose test (the screens call only list/mark/people routes); recorded as a by-construction criterion, named in open point 4.
Falsification[W10-6]: covered by the same plain-sentence tests; mutation not run for the sentences themselves (open point 4).
Falsification[W10-7]: `"2.0.4"` -> `"^2.0.4"` in apps/web/package.json (M9) -> pin test red. Restored, HEAD-equal.
Falsification[W10-8]: `let wait = QR_POLL_MIN_MS;` -> `let wait = 1000;` in ConnectPage (M1) -> 3 s floor test red; `if (v.state === "connected") {` -> `if (false) {` (M5) -> terminal-stop test red; `if (group.trackAllSenders) await setGroup` -> `if (false) await setGroup` in whatsapp-links.ts (M2) -> ISS-WASEL-002 ordering test red. Restored, HEAD-equal.
Mutation method: per-mutation byte backup, `timeout` on every run, explicit restore after each mutation (no EXIT trap), then `cmp` and `git hash-object <file>` = `git rev-parse HEAD:<file>` for every touched file; ten mutations, ten red, ten restored HEAD-equal.
Junctions (for the test runner; removed link-only before finishing): `.worktrees/wa-web/node_modules` -> `D:\KnowledgeBase\node_modules`; `.worktrees/wa-web/apps/web/node_modules/{.bin,@testing-library,@types,@vitejs,jsdom,react,react-dom,react-force-graph-2d,react-router-dom,typescript,vite,vitest}` -> the same names under `D:\KnowledgeBase\apps\web\node_modules`; plus one real directory `apps/web/node_modules/qrcode-generator` (a copy of the registry tarball, since the main tree has not installed the new dependency).

## Open points (declared, not defects)
1. **The routers are not mounted in production** (ISS-WASEL-001, later wiring unit), so the real-browser persona walk of acceptance 1 and the W14 live proof cannot run yet. Until then every flow is proven against a fake `fetch` that mimics the router contracts read from `links/router.ts`, `selection/router.ts` and their services; no claim is made about archiver-side behaviour.
2. **`ActivityPage` is not built.** The plan names it, but its data is the W12 events feed (`GET /whatsapp/events`), which does not exist yet; building it now would code against an invented contract. The unlink entry point (W10 scope) is on the detail page.
3. **The `WhatsAppPage.tsx` link filter is not built.** It needs a `linkId` on `GET /whatsapp/groups`, which `routes/whatsapp.ts` does not return on this base (W7 wiring of that field is not in the base). Left unedited rather than guessed.
4. The failure-sentence and "no message text" criteria (W10-5, W10-6) are asserted by example, not mutated individually; a checker may add mutations there.
5. API-key operators (no account) see the list if their key has the scope but get no owner or admin controls: admin controls are shown to role `admin` accounts only. The server remains the authority either way.
6. The pre-existing `src/config/runtime.wiring.test.tsx` "routes /knowledgebase/ask" test times out at the default 5 s on this machine, in the main tree as well (passes with `--testTimeout=60000`: 5 passed). Not caused by this unit; not part of its pre-checks.
7. The H-4 self-approval record (requester and approver) is written by the server; the page shows its refusal sentence (`self_approval_forbidden`) and nothing else.
