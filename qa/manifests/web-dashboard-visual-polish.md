# Manifest — web-dashboard-visual-polish

Status: checked-PASS (see qa/verdicts/web-dashboard-visual-polish.md)
Contract: `qa/contracts/web-dashboard-visual-polish.md`
Fix cycle: 1

## What changed

1. **`apps/web/src/components/icons.tsx`** (new) — hand-written SVG icon set, no new dependency.
2. **`apps/web/src/components/StatCard.tsx`** (new) — reusable stat card component.
3. **`apps/web/src/pages/DashboardPage.tsx`** (rewritten) — real stat cards (sessions/sources/
   active-keys/open-gaps counts via `Promise.all` over already-real routes), recent-sessions list
   (top 5 newest-first), retained gaps section.
4. **`apps/web/src/layout/NavSidebar.tsx`** — every nav item + external link now renders an icon.
5. **`apps/web/src/styles.css`** — `.stat-grid`/`.stat-card*` classes, nav-icon flex layout,
   `.nav-divider`.
6. **`apps/web/src/pages/DashboardPage.test.tsx`** (new, 3 tests) — this page had zero coverage
   before.

## Why (user feedback this responds to)

Umesh (verbatim): "ui abhi bhi dashboard jaise nhi lgg rha hai sike alawa dahsboard and all mai
kuch nhi aa rhaa, and check the functionality and all of other beatues. they all really look very
basic." This unit addresses both halves: the Dashboard now shows real, live stats instead of just
an empty gaps list, and the nav/stat-card UI gets real icon-based visual hierarchy instead of
plain text.

## Real evidence

### Typecheck
```
$ cd apps/web && npx tsc --noEmit -p tsconfig.json
(no output — exit 0)
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass
packages/ai:          56/56 pass
packages/ingest:      34/34 pass
packages/ask:         30/30 pass
packages/meeting-bot: 40/40 pass
apps/api:             48/48 pass
apps/web:             28/28 pass   (+3: DashboardPage stat cards, empty-gaps state, error state)
Total: 268 tests, 268 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (183 file(s) within budget)
lint-dirsize: OK (71 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (218 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (913 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (113 lines, budget 200)
✔ no dependency violations found (212 modules, 600 dependencies cruised)
```

### Real browser screenshots (Playwright, against already-running dev servers :5173/:3300)
- `qa/evidence/dashboard-redesign.png` — real stat cards: 25 Sessions, 25 Sources, 1 Active API
  key, 0 Open gaps; real recent-sessions list (2 freshly ingested URLs + real TOC sessions,
  newest-first); nav icons visible; gaps section retained with an honest empty state.
- `qa/evidence/brain-page-recheck.png` — Brain graph still renders correctly post-CSS-change
  (force-directed graph, real clusters), nav icons visible, no regression.
- `qa/evidence/calendar-page-recheck.png` — Calendar still renders correctly post-CSS-change
  (past sessions grouped by month, honest upcoming-empty-state), nav icons visible, no regression.

## How to verify (for the checker)
1. `pnpm --filter @lkb/web typecheck` — expect exit 0.
2. `pnpm -r test` — expect exit 0, 268/268.
3. `pnpm lint:structure` — expect exit 0.
4. Read the 5 changed/new files listed above — confirm no new npm dependency for icons
   (`apps/web/package.json` unchanged in dependencies), confirm `DashboardPage` never fabricates
   a stat number (all four come from real API calls).
5. Real browser: `/` shows real stat cards; `/brain` and `/calendar` still work with the new nav.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
