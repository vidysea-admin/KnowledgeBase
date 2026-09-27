# Manifest — gmail-meeting-candidates-approval

Status: checked-PASS (see qa/verdicts/gmail-meeting-candidates-approval.md)
Contract: `qa/contracts/gmail-meeting-candidates-approval.md`
Fix cycle: 1

## What changed

1. **`schema/meeting_candidates.schema.json`, `schema/trusted_senders.schema.json`** (new) +
   fixtures.
2. **`schema/index.json`** — indexes for both new collections.
3. **`migrations/20260904120000-meeting-candidates.cjs`** (new).
4. **`migrations/20260903100000-baseline.js` → `.cjs`, `migrate-mongo-config.cjs`** — real infra
   bug fix (see below), unblocking this unit's own migration.
5. **`packages/core/src/generated/meeting_candidates.ts`, `trusted_senders.ts`** (generated).
6. **`packages/db/src/collections/meeting-candidates.ts`, `trusted-senders.ts`** (new) +
   `index.ts` exports.
7. **`apps/api/src/gws-gmail.ts`** (new) — real Gmail scan adapter.
8. **`apps/api/src/routes/meeting-candidates.ts`, `.test.ts`** (new, 5 tests).
9. **`apps/api/src/store.ts`, `server.ts`, `production.ts`, `fixtures.ts`** — `meetingCandidates`
   wired into `ServerDeps`.
10. **`apps/api/src/routes/pages.ts`** — 4 new `REAL_ROUTES` entries.
11. **`scripts/seed-demo-server.mjs`** — added `"gmail"` scope.
12. **`apps/web/src/api/meeting-candidates.ts`** (new), **`api/types.ts`** — `MeetingCandidate`.
13. **`apps/web/src/pages/CalendarPage.tsx`, `.test.tsx`** — "Needs review (from Gmail)" section,
    2 new tests.
14. **`docs/SNAPSHOT.md`** — regenerated (schema table grew by 2 rows).

## Why (user feedback this responds to)

Umesh's own scoping answer, verbatim: "gmail meeting but i will approve first and also like those
i will approve like these meeting is realted to knowlegebase from next time related to it will be
auto confirmed or after 2-3 times." This unit builds exactly that: scan → pending review →
approve/reject → after 3 approvals from a sender, future candidates from it auto-confirm.

## Real infra bug found and fixed while building this unit (disclosed, not hidden)

Neither existing migration file could actually run: `migrate-mongo`'s CLI resolves `.js`
migration files with Node's `require()`, but the repo root's `package.json` declares `"type":
"module"`, so Node loaded them as ES modules instead and `require` inside threw
`ReferenceError: require is not defined in ES module scope`. Confirmed live —
`npx migrate-mongo status` showed BOTH the baseline and this unit's own new migration stuck at
`PENDING` forever, meaning the 18 baseline collections' indexes had never actually been applied
via the migration tool (they exist today only because Mongo auto-creates collections on first
write from the seed script). Fixed by renaming both migration files to `.cjs` and updating
`migrate-mongo-config.cjs`'s `migrationFileExtension` to match — the config already declared
`moduleSystem: "commonjs"`, so this aligns the file extension with what the config already said,
not a new decision. Verified: `npx migrate-mongo up` then applied both real migrations
successfully against the real database.

## Real evidence

### Schema validation (fresh run)
```
$ python schema/validate.py
PASS: 24 collection schema(s) validated correctly.
```

### Migration applied for real
```
$ npx migrate-mongo up -f migrate-mongo-config.cjs
MIGRATED UP: 20260903100000-baseline.cjs
MIGRATED UP: 20260904120000-meeting-candidates.cjs
```

### Typecheck
```
$ cd packages/db && npx tsc --noEmit -p tsconfig.json    # exit 0
$ cd apps/api && npx tsc --noEmit -p tsconfig.json        # exit 0
$ cd apps/web && npx tsc --noEmit -p tsconfig.json        # exit 0
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
apps/api:             56/56 pass   (was 51, +5 meeting-candidates route tests)
apps/web:             34/34 pass   (was 32, +2 CalendarPage Gmail-review tests)
Total: 282 tests, 282 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (193 file(s) within budget)
lint-dirsize: OK (73 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (227 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (962 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (115 lines, budget 200)
✔ no dependency violations found (224 modules, 643 dependencies cruised)
```

### Real end-to-end Gmail scan (live, real `gws` shell-out, real inbox)
```
$ curl -X POST http://localhost:3300/gmail/scan -H "Authorization: Bearer <demo key>"
{"created":13,"autoApproved":0}
```
Real subjects/senders returned — see contract for the full list.

### Real threshold proof (independent Mongo read, bypassing the API)
```
$ python -c "... db.trusted_senders.find_one(...) ..."
{'senderDomain': 'vidysea.com', 'approvalCount': 3, 'autoApprove': True, ...}
```

### Real browser screenshots
- `qa/evidence/calendar-gmail-review.png`
- `qa/evidence/calendar-gmail-review-after-approve.png` (real Approve click, pending count drops
  from 10 to 9, approved count rises from 3 to 4)

## How to verify (for the checker)
1. `python schema/validate.py` — expect PASS, 24 collections.
2. `npx migrate-mongo status -f migrate-mongo-config.cjs` — expect both migrations show `UP`.
3. Typecheck `packages/db`, `apps/api`, `apps/web` — expect exit 0 each.
4. `pnpm -r test` — expect exit 0, 282/282.
5. `pnpm lint:structure` — expect exit 0.
6. Read `gws-gmail.ts`, `trusted-senders.ts`, `meeting-candidates.ts` (route + db) — confirm no
   fabricated data, confirm the threshold logic matches `AUTO_APPROVE_THRESHOLD = 3`.
7. Real browser: `/calendar`'s "Needs review (from Gmail)" section renders and Approve/Reject
   work (or verify via the maker's real evidence above if `gws` isn't reachable in the checker's
   environment — same disclosed limitation as the calendar unit).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
