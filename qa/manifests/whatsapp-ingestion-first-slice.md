# Manifest — whatsapp-ingestion-first-slice

Status: checked-PASS (see qa/verdicts/whatsapp-ingestion-first-slice.md)
Contract: `qa/contracts/whatsapp-ingestion-first-slice.md`
Fix cycle: 1

## What changed

1. **`packages/ingest/src/sources/whatsapp.ts`** (new) — the `whatsapp` `Source` adapter.
2. **`packages/ingest/src/sources/whatsapp.test.ts`** (new, 6 tests).
3. **`packages/ingest/src/index.ts`** — export added.
4. **`apps/api/src/whatsapp-store.ts`** (new) — real read-only connection to `whatsapp_msg`'s own
   Mongo, `fetchWhatsAppMessages`, `listTrackableGroups`, `createMongoWhatsAppDeps`.
5. **`apps/api/src/routes/whatsapp.ts`, `.test.ts`** (new, 6 tests).
6. **`apps/api/src/store.ts`** — not touched (whatsapp deps live in their own file, matching
   `ingest-store.ts`'s precedent).
7. **`apps/api/src/server.ts`, `production.ts`, `fixtures.ts`** — `whatsapp` wired into
   `ServerDeps`.
8. **`apps/api/src/routes/pages.ts`** — 2 new `REAL_ROUTES` entries.
9. **`apps/api/package.json`** — added `mongodb` as a direct dependency (was only transitive via
   `@lkb/db`; this file imports `MongoClient` directly for the second, separate database).
10. **`scripts/seed-demo-server.mjs`** — added `"whatsapp"` scope.

## Why (this closes T-007's blocking precondition)

Umesh, verbatim: "hnn tho TOC and all wala sabb ho gyaa hai and whatsapp msg and all wale saare
featues ho gyee hai" — confirming `sources/whatsapp_msg` (a separate, independently governed
submodule) is feature-complete. Verified live this unit: real Mongo running, 1 real tracked
group, 50 real captured messages, real people resolved. T-007 was blocked only on this submodule
actually having real data to pull from; it does. This unit is T-007's first slice — the
ingestion step only, not the claims-review layer (see contract's scope note).

## Real evidence

### Typecheck
```
$ cd packages/ingest && npx tsc --noEmit -p tsconfig.json    # exit 0
$ cd apps/api && npx tsc --noEmit -p tsconfig.json            # exit 0
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass
packages/ai:          56/56 pass
packages/ingest:      40/40 pass   (was 34, +6)
packages/ask:         32/32 pass
packages/meeting-bot: 40/40 pass
apps/api:             65/65 pass   (was 59, +6)
apps/web:             34/34 pass
Total: 299 tests, 299 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (200 file(s) within budget)
lint-dirsize: OK (73 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (233 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (974 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (115 lines, budget 200)
✔ no dependency violations found (231 modules, 668 dependencies cruised)
```

### Real, live, end-to-end run against the real `whatsapp_msg` database (no mocks, real shipped code)
```
$ npx tsx wa-verify-module.mjs
listTrackableGroups(): [ { groupJid: '120363405936621456@g.us', ownerUserId:
  '6a8d0c692fcc75f0e911b878', subject: 'Millionaires', trackedPersonCount: 3 } ]
fetchWhatsAppMessages() returned 50 messages
first 3 (with resolved displayName): [
  { personId: '...2360', displayName: 'Navnit Chaubey Vidysea', text: 'Harshita jeb kaato',
    ts: '2026-08-25T09:43:21.000Z' }, ... ]

$ npx tsx wa-verify-adapter.mjs
source: { _id: 'b610fd...', kind: 'whatsapp-batch', captureMode: 'provided',
  path: '120363405936621456@g.us', ownerUserId: '6a8d0c69...', ... }
toTurns() produced 50 real turns
first 3 turns: [
  { speakerRef: '...2360', tStart: 0, tEnd: 0, text: 'Harshita jeb kaato' },
  { speakerRef: '...2361', tStart: 22, tEnd: 22, text: 'helooe' },
  { speakerRef: '...2361', tStart: 24, tEnd: 24, text: 'eheloww' } ]
```
`tStart` offsets (0, 22, 24s) exactly match the real message timestamps' elapsed seconds.

## Real, disclosed limitation (not hidden)

Main Mongo host (`13.202.206.101:27017`) remained unreachable this session (same outage as
`ask-web-fallback-tavily`, re-confirmed):
```
$ ping -n 2 13.202.206.101
Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)
```
So the full `apps/api` server couldn't be started; a live `POST /whatsapp/ingest` HTTP
round-trip (needs main Mongo for auth + writing sources/sessions/turns) is unverified pending
that host recovering. Everything up to persistence — the real data pipeline itself — IS verified
live against the real `whatsapp_msg` database, no mocks (see above). The persistence step is
covered by real unit tests with a fake and is byte-identical to the already-shipped,
checker-PASSed `ingest-store.ts` write pattern.

## How to verify (for the checker)
1. `pnpm --filter @lkb/ingest typecheck` and `pnpm --filter @lkb/api typecheck` — expect exit 0.
2. `pnpm -r test` — expect exit 0, 299/299.
3. `pnpm lint:structure` — expect exit 0.
4. Read the 3 new source files — confirm no fabricated data, confirm `captureMode` is always
   `"provided"`, confirm the seconds-elapsed offset math.
5. If `whatsapp_msg`'s Mongo is reachable, independently re-run the real-data verification
   yourself (import `whatsapp-store.ts`, call `listTrackableGroups`/`fetchWhatsAppMessages`) —
   strongest possible check, real data, no mocks.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
