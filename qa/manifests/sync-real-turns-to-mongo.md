# Manifest — sync-real-turns-to-mongo (T-003 phase 3)

Status: checked-PASS
Contract: `qa/contracts/sync-real-turns-to-mongo.md`
Cycle checked: 1 — verdict `qa/verdicts/sync-real-turns-to-mongo.md`

## What changed

1. **`scripts/sync-real-turns.mjs`** (new) — `--dry-run` classifies every local session as
   real/placeholder, no Mongo call. Live run: for each real session, deletes its existing Mongo
   turns (`deleteMany({tenantId, sessionId})`), inserts the current local set via `turns()
   .insertOne` (T-018's tenant-scoped accessor — never a raw driver call). Placeholder sessions
   are never touched.

## How to verify (all commands run, real output below)

```
$ node scripts/sync-real-turns.mjs --dry-run
19 real session(s) to sync:
  2026-05-08-funding-dreams-loans-forex: 83 local turns
  ... (all 19, matching the exact set from toc-transcription-scale-up.md)
No Mongo connection attempted (--dry-run).

$ node scripts/sync-real-turns.mjs
19 real session(s) to sync: [same list]

Connecting to Mongo for a live sync (no --dry-run flag given)...
2026-05-08-funding-dreams-loans-forex: before=152 deleted=152 inserted=83
2026-05-20-telling-your-brand-story-better: before=175 deleted=175 inserted=31
2026-05-22-uniaccess-xavier-university: before=67 deleted=67 inserted=64
2026-05-23-uniaccess-atlas-skilltech: before=8 deleted=8 inserted=8
2026-05-28-in-focus-1: before=118 deleted=118 inserted=59
2026-05-29-decoding-ever-expanding-cast: before=205 deleted=205 inserted=15
2026-06-03-dual-enrollment-pathway: before=210 deleted=210 inserted=90
2026-06-19-entrance-exams-pathways-india-part1: before=114 deleted=114 inserted=38
2026-06-25-in-focus-2: before=111 deleted=111 inserted=69
2026-06-30-exploring-identity-success-counseling: before=114 deleted=114 inserted=16
2026-07-03-inside-the-uc-session: before=63 deleted=63 inserted=50
2026-07-08-beyond-black-robes-law-careers: before=171 deleted=171 inserted=134
2026-07-22-uniaccess-cept-university: before=72 deleted=72 inserted=56
2026-07-28-metrics-and-mingling: before=154 deleted=154 inserted=83
2026-08-03-uk-beyond-offer-letters: before=154 deleted=154 inserted=46
2026-08-03-uk-beyond-offer-letters-reupload: before=49 deleted=49 inserted=43
2026-08-10-ucas-what-changed-what-matters: before=229 deleted=229 inserted=230
2026-08-12-uniaccess-ashoka-university: before=136 deleted=136 inserted=26
2026-08-27-in-focus-4: before=108 deleted=108 inserted=51
```

## Independent post-run verification (fresh pymongo connection, not trusting the script's own printed counts)

```
total turns in Mongo now: 1689
expected total (19 real local counts + 4 placeholder original counts): 1689
match: True

2026-04-21-visa-blueprint-part2-italy-france-nz count: 107 expected: 107 all-unknown: True
2026-07-15-creative-futures count: 164 expected: 164 all-unknown: True
2026-07-30-in-focus-3 count: 124 expected: 124 all-unknown: True
2026-08-24-uniaccess-leeds-arts-university count: 102 expected: 102 all-unknown: True

REAL sample (2026-08-12-uniaccess-ashoka-university):
  Vijaya: "Hello, everyone. Welcome to the UniAxis, and this time we have the Ashoka Unive..."
  Anju: "Thanks, Vijaya. Hi, good evening, everyone. Hi, Anu. My god, so many people tha..."
```

Every criterion 3 sub-check (total count matches exactly, all 4 placeholder sessions confirmed
byte-identical to their pre-sync state, real speaker names now present) independently confirmed.

## Full regression

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (148 file(s) within budget)
lint-dirsize: OK (63 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (207 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (742 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (155 modules, 437 dependencies cruised)
```

## Files touched
- `scripts/sync-real-turns.mjs` (new)
- Real Mongo write to the live `lkb` database's `turns` collection (not a repo file — data lives
  in MongoDB, independently verified above)
- `qa/contracts/sync-real-turns-to-mongo.md` (new contract, maker-drafted)

## Milestone
The live `lkb` MongoDB database's `turns` collection now genuinely reflects T-003's real
transcription progress: 19 sessions with real diarized speaker turns, 4 honestly still
placeholder pending the disclosed follow-up work (audio chunking, STOP-empty-text investigation).
`session_pages` (23/23), `sources`/`sessions`/`claims` (23/23 each) remain as previously synced —
this unit only touched `turns`, the one collection T-003's work actually changes.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
