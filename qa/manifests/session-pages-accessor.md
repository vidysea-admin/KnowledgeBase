# Manifest — session-pages-accessor (T-002 follow-up)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/session-pages-accessor.md`
Contract: `qa/contracts/session-pages-accessor.md`

## Adjustment to criterion 3 (disclosed, not hidden)
The contract's criterion 3 assumed a full `node scripts/seed-toc.mjs` re-run would show
`session_pages: 23` inserted. In practice this doesn't work: `seed-toc.mjs` uses bare
`insertOne` (no try/catch, no upsert) for every collection in order
(sources→sessions→turns→session_pages→claims), and `sources`/`sessions`/`turns`/`claims` are
ALREADY populated in the real `lkb` database from the first live run — a straight re-run throws a
duplicate-key error on the very first `sources.insertOne` call and never reaches
`session_pages` at all. Consistent with the contract's own Non-goals (making the whole script
idempotent/upsert-based is explicitly out of scope for this gap-fill), I instead ran a small
one-off inline script (via `node --input-type=module -e "..."`, not committed to the repo) that
imports the new `sessionPages()` accessor directly and inserts only the 23 real
`session_page.json` documents — the exact same data `seed-toc.mjs` would have inserted, using
the exact same accessor this unit adds, just invoked directly rather than through the
non-idempotent full-script re-run the contract assumed.

## What changed

1. **`packages/db/src/collections/session-pages.ts`** (new) — `sessionPages(tenantId)`,
   identical shape to `sources.ts`. Exported from `packages/db/src/index.ts`.
2. **`scripts/seed-toc.mjs`** — imports `sessionPages`, inserts `docs.session_pages` the same
   way as the other four collections; `counts.session_pages` now reflects the real count instead
   of a hardcoded `0`. Future FIRST-TIME seeds (a fresh, empty database) will now correctly
   include `session_pages` — only THIS particular already-partially-seeded database needed the
   one-off insert described above.
3. **Real data written**: the live `lkb` Mongo database now has 23 real `session_pages`
   documents (previously 0), independently verified below.

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (146 file(s) within budget)
lint-dirsize: OK (63 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (207 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (730 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (155 modules, 437 dependencies cruised)
```

Real one-off insert run:
```
inserted 23 session_pages documents into db lkb
```

Independent real-count verification (fresh pymongo connection, not trusting the insert script's
own printed count):
```
final counts:
  sources 23
  sessions 23
  turns 2907
  claims 72
  session_pages 23
```

Sample document spot-check (`2026-04-21-visa-blueprint-part2-italy-france-nz-page`): real
`summary` + `keyInsights` content present and on-topic (NZ/France/Italy visa mechanics, matching
the real session), same content this unit's context already confirmed earlier this session when
inspecting the local JSON files directly.

## Files touched
- `packages/db/src/collections/session-pages.ts` (new)
- `packages/db/src/index.ts` (export)
- `scripts/seed-toc.mjs` (uses the new accessor, no more hardcoded `0`)
- `qa/contracts/session-pages-accessor.md` (new contract, maker-drafted)
- Real Mongo write to the live `lkb` database's `session_pages` collection (not a file in this
  repo — the data lives in MongoDB, verified via independent count query above)

## Milestone
The `lkb` database now has all 5 core collections fully populated for the first time:
23 sources, 23 sessions, 2,907 turns, 72 claims, 23 session_pages. This is the first real,
complete knowledge-base data in the actual production-reachable MongoDB instance.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
