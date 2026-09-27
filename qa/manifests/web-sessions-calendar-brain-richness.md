# Manifest — web-sessions-calendar-brain-richness

Status: checked-PASS (see qa/verdicts/web-sessions-calendar-brain-richness.md)
Contract: `qa/contracts/web-sessions-calendar-brain-richness.md`
Fix cycle: 2

## Cycle 2 fix (ISS-001 from cycle 1's FAIL)

Cycle 1's checker caught a real evidence-accuracy error: the manifest claimed apps/api went
"51/51, +3, was 51" (self-contradictory) and a workspace total of 278. The correct, freshly
re-run numbers are apps/api **51/51 (was 48 before this unit, +3 new calendar tests included in
that 51)** and workspace total **275**, not 278. No code changed for this cycle — this is a
documentation-only fix, the underlying tests were always real and passing. Corrected below and in
the contract.

## What changed

1. **`apps/api/src/gws-calendar.ts`** (new) — real Google Calendar adapter via the already-
   authenticated `gws` CLI.
2. **`apps/api/src/routes/calendar.ts`** (new) — `GET /calendar/upcoming`.
3. **`apps/api/src/routes/calendar.test.ts`** (new, 3 tests).
4. **`apps/api/src/store.ts`, `server.ts`, `production.ts`, `fixtures.ts`** — `calendar` wired
   into `ServerDeps`; `createGwsCalendarReadDeps`/`fakeCalendarReadDeps`.
5. **`apps/api/src/routes/pages.ts`** — `REAL_ROUTES` gets `GET /graph` (was missing, unrelated
   gap) and `GET /calendar/upcoming`.
6. **`scripts/seed-demo-server.mjs`** — added `"calendar"` scope.
7. **`apps/web/src/api/calendar.ts`, `api/types.ts`** — `listUpcomingMeetings`, `UpcomingMeeting`.
8. **`apps/web/src/pages/CalendarPage.tsx`, `.test.tsx`** — real upcoming meetings, rewritten
   tests.
9. **`apps/web/src/pages/sessions/SessionsListPage.tsx`, `.test.tsx`** — card-grid redesign with
   icons + real status badges.
10. **`apps/web/src/pages/BrainPage.tsx`, `.test.tsx`** — Obsidian-style always-visible content
    panel, clickable linked sessions, real claim text (not just counts).
11. **`apps/web/src/styles.css`** — `.session-grid`/`.session-card*` classes.
12. **`apps/web/src/setupTests.ts`** — `ResizeObserver` polyfill for jsdom.

## Why (user feedback this responds to)

Umesh, verbatim (Hinglish): "session wala bhut rough hai non informative and like thoda image and
all, konsa meeting and all aana chahiye and alteast give it access to my mail" — then mid-turn:
"brain ko bhi obsedion ki tarah dikho taaki vhi se content access krr paaye ki ye data hai kis
chizz se related /brain like vectorless rag". Three concrete asks addressed: Sessions richness,
real upcoming-meeting integration, Obsidian-style Brain drill-down. The Gmail approval/auto-trust
workflow (Umesh's follow-up answer to a scoping question) is explicitly OUT of this unit — see the
contract's scope note — it needs its own contract given its size (new collections, an approval
endpoint, a trust-threshold rule).

## Real bug found and fixed while building this unit (disclosed, not hidden)

Making the Brain page's side panel always-visible (criterion 5) surfaced a real layout bug: the
graph's flex item has a default `min-width: auto`, which blocked it from shrinking below its
rendered canvas's width once a sibling panel needed space, crushing that sibling to ~33px
(confirmed live via `getBoundingClientRect`: panel width 32.8px against an intended 320px, graph
1536px against an available ~965px). Fixed by measuring the graph container with a
`ResizeObserver` and passing explicit `width`/`height` to `ForceGraph2D` rather than trusting its
own internal auto-sizing, which raced the same layout change. Verified with a live before/after
screenshot pair.

## Real evidence

### Typecheck
```
$ cd apps/web && npx tsc --noEmit -p tsconfig.json    # exit 0
$ cd apps/api && npx tsc --noEmit -p tsconfig.json    # exit 0
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
apps/api:             51/51 pass   (was 48 before this unit, includes 3 new calendar tests)
apps/web:             32/32 pass   (was 25 before this unit)
Total: 275 tests, 275 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (187 file(s) within budget)
lint-dirsize: OK (71 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (218 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (940 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (113 lines, budget 200)
✔ no dependency violations found (216 modules, 618 dependencies cruised)
```

### Real end-to-end Calendar integration (live, real `gws` shell-out, real Google Calendar)
```
$ curl http://localhost:3300/calendar/upcoming -H "Authorization: Bearer <demo key>"
{"meetings":[{"id":"velco24c97ka3to9j3fmmctiu7_20260907T113000Z", "title":"Tech Team - Weekly
Review Meeting", "startTime":"2026-09-07T17:00:00+05:30", "meetingUrl":
"https://meet.google.com/umn-cwkx-opy", "organizer":"manish.k@vidysea.com"}, ...8 real events]}
```

### Real browser screenshots (Playwright, dev servers :5173/:3300)
- `qa/evidence/sessions-redesign.png`
- `qa/evidence/calendar-real-meetings.png`
- `qa/evidence/brain-obsidian-before-fix.png` / `brain-obsidian-after-fix.png`

## How to verify (for the checker)
1. `pnpm --filter @lkb/web typecheck` and `pnpm --filter @lkb/api typecheck` — expect exit 0.
2. `pnpm -r test` — expect exit 0, 275/275.
3. `pnpm lint:structure` — expect exit 0.
4. Read the changed files listed above — confirm `gws-calendar.ts` never throws, confirm no
   fabricated data anywhere in the Sessions/Calendar/Brain rewrites.
5. Real browser: `/sessions`, `/calendar`, `/brain` all render correctly; the Brain panel is
   visible before any click.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
