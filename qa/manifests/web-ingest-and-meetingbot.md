# Manifest — web-ingest-and-meetingbot

Status: checked-PASS (see qa/verdicts/web-ingest-and-meetingbot.md)
Contract: `qa/contracts/web-ingest-and-meetingbot.md`
Fix cycle: 1

## What changed

1. **`apps/api/src/routes/ingest.ts`** (new) — `POST /ingest`.
2. **`apps/api/src/ingest-store.ts`** (new) — real `createMongoIngestDeps()`, real Jina Reader
   fetch, real `@lkb/ingest` `createUrlSource` usage.
3. **`apps/api/package.json`** — added `@lkb/ingest` dependency.
4. **`apps/api/src/server.ts`**, **`production.ts`**, **`fixtures.ts`** — `ingest` wired into
   `ServerDeps`; `fakeIngestDeps()`.
5. **`apps/api/src/routes/ingest.test.ts`** (new) — 4 tests.
6. **`scripts/seed-demo-server.mjs`** — added `"ingest"` scope.
7. **`apps/web/src/api/ingest.ts`** (new).
8. **`apps/web/src/pages/IngestPage.tsx`**, **`IngestPage.test.tsx`** (new).
9. **`apps/web/src/pages/MeetingBotPage.tsx`**, **`MeetingBotPage.test.tsx`** (new).
10. **`apps/web/src/layout/NavSidebar.tsx`**, **`App.tsx`** — `/ingest`, `/meeting-bot` routes.
11. **`apps/web/src/pages/sessions/SessionDetailPage.tsx`** — real unit-label fix (see below).
12. **`apps/web/src/pages/sessions/SessionDetailPage.test.tsx`** (new, this page had no test
    file before) — 2 tests.

## Real bug found and fixed while testing this unit live (disclosed, not hidden)

While verifying `IngestPage` end-to-end in a real browser, the session-detail view (already-
shipped, already checker-PASSed page, reused here) showed a real ingested Wikipedia page's turns
labeled "0s-28s", "30s-84s", etc. — but `tStart`/`tEnd` for a `url`/`document`-sourced turn are
CHARACTER OFFSETS into the extracted text, not seconds (confirmed directly in
`packages/ingest/src/sources/document.ts`'s own `splitIntoParagraphTurns` doc comment, which
predates this unit). The "s" suffix was simply wrong for this content type. Fixed with a
`speakerRef`-based label switch (`timeUnitLabel`): `"url"`/`"document"` → "chars", everything
else (real audio speakerRefs like `"spk:0"`) → "s". Verified live: the same real ingested session
now reads "0chars-28chars".

## Real evidence

### Real end-to-end URL ingestion (live browser, real Jina Reader fetch, real Mongo write)
```
Ingested https://en.wikipedia.org/wiki/Study_abroad
-> 201, sessionId=428d130a-f41e-40c9-b52e-14664e307301, turnCount=112
```
`qa/evidence/spa-ingest-result.png` — the real result banner with a working link.
`qa/evidence/spa-ingested-session-fixed.png` — the created session viewed through the existing
`GET /sessions/:id` page (reused, not rebuilt), showing 112 real turns extracted from the real
Wikipedia page, with the corrected "chars" unit label.

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass
packages/ai:          56/56 pass
packages/ingest:      34/34 pass
packages/ask:         30/30 pass
packages/meeting-bot: 40/40 pass
apps/api:             48/48 pass   (+4 ingest tests, was 44)
apps/web:             25/25 pass   (+6: IngestPage 4, MeetingBotPage 2 — SessionDetailPage's 2
                                     new tests replace what had been zero coverage on that page)
Total: 265 tests, 265 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (183 file(s) within budget)
lint-dirsize: OK (70 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (218 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (900 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration
✔ no dependency violations found (209 modules, 587 dependencies cruised)
```

## How to verify (for the checker)
1. `pnpm -r test` — expect exit 0, 265/265.
2. `pnpm lint:structure` — expect exit 0; confirm `apps/api → @lkb/ingest` shows no violation.
3. Start the real server, mint a key with the `ingest` scope, real-`curl POST /ingest` with a
   real URL — confirm a real session/source/turns set is created (verify via a fresh pymongo
   query or `GET /sessions/:id`), and a bad/unreachable URL returns 502 with a real message.
4. Real browser: visit `/ingest`, submit a real URL, confirm real content appears, click through
   to the session detail, confirm the character-offset labels read "chars" not "s".
5. Visit `/meeting-bot` — confirm it reads as an honest disclosure, not a fake "connected" state.
6. Read `packages/ingest/src/sources/document.ts`'s `splitIntoParagraphTurns` — confirm `tStart`/
   `tEnd` are indeed documented as character offsets, validating the manifest's bug explanation.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
