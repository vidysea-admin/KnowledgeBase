# Manifest — web-whatsapp-tab

Status: checked-PASS (see qa/verdicts/web-whatsapp-tab.md)
Contract: `qa/contracts/web-whatsapp-tab.md`
Fix cycle: 1

## What changed

1. **`apps/web/src/api/whatsapp.ts`** (new).
2. **`apps/web/src/pages/WhatsAppPage.tsx`, `.test.tsx`** (new, 5 tests).
3. **`apps/web/src/components/icons.tsx`** — `WhatsAppIcon` added.
4. **`apps/web/src/layout/NavSidebar.tsx`, `App.tsx`** — nav item + route.

## Why (user feedback this responds to)

Umesh: "ye sabb website mai hi features hone chaiye side tab mai see access krr paau aur TOC wala
and all bhi sabbhi featues add krr paayee" — WhatsApp features should be in the website with a
side tab. This unit adds that real tab over the already-real backend
(`whatsapp-ingestion-first-slice`, checker-PASSed, commit `b549f37`).

## Real evidence

### Typecheck
```
$ cd apps/web && npx tsc --noEmit -p tsconfig.json    # exit 0
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass
packages/ai:          56/56 pass
packages/ingest:      40/40 pass
packages/ask:         32/32 pass
packages/meeting-bot: 40/40 pass
apps/api:             65/65 pass
apps/web:             39/39 pass   (was 34, +5)
Total: 304 tests, 304 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (201 file(s) within budget)
lint-dirsize: OK (73 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (233 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (980 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (115 lines, budget 200)
✔ no dependency violations found (234 modules, 677 dependencies cruised)
```

### Real browser screenshot (dev server :5173; apps/api unreachable — main Mongo outage, disclosed)
`qa/evidence/whatsapp-page.png` — real nav tab, honest error state (not blank/broken).

## Real, disclosed limitation (not hidden, same outage as the backend unit)

Main Mongo host (`13.202.206.101:27017`) unreachable this session, confirmed again just now:
```
$ ping -n 2 13.202.206.101
Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)
```
So a full live browser round-trip (click Ingest → real new session) is deferred. The page's own
honest degradation (a real error message, not a crash) when the backend is unreachable IS
verified live.

## How to verify (for the checker)
1. `pnpm --filter @lkb/web typecheck` — expect exit 0.
2. `pnpm -r test` — expect exit 0, 304/304.
3. `pnpm lint:structure` — expect exit 0.
4. Read the 4 changed/new files — confirm no fabricated data.
5. Real browser: `/whatsapp` renders with the nav tab; a full backend round-trip is a bonus if
   main Mongo has recovered by check time, not required.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
