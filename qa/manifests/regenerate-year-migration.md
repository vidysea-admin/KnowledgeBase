# Manifest — regenerate-year-migration (T-004c)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/regenerate-year-migration.md` — PASS, commit `8ae94f4`
Contract: `qa/contracts/regenerate-year-migration.md`

## What changed

1. **`packages/index/src/tree/regenerate.ts`** — added `findExistingYear(tree, sessionId)`: scans
   the input tree's year → month → session nodes for an existing node matching the id. For every
   `changedSessionIds` entry, its old year (if found) is added to `touchedYears` in addition to
   the year(s) derived from current `date`s — so a session that moved year gets its OLD year
   rebuilt (and, if it was the only session there, the year vanishes from the result entirely)
   even when no other changed session shares that old year.
2. **`packages/index/src/tree/build.ts`** — `buildTree` gained a 5th optional parameter
   `topicContextSessions: Sessions[] = sessions`. Pass 1 (the cross-session topic-sharing map)
   now iterates `topicContextSessions`; pass 2 (actual node rendering) is untouched, still
   iterates `sessions` only. Default value means every pre-existing call site (T-004/T-004b tests,
   `regenerate.ts`'s own prior call) is byte-identical in behavior — confirmed by all 5
   pre-existing `tree.test.ts`/`tree-real-data.test.ts` assertions passing unmodified.
3. **`regenerate.ts`**'s `buildTree` call now passes `tenantAllSessions` (the full tenant session
   list, not just the touched-year subset) as the 5th arg, so a touched year's topic nodes get
   accurate cross-year `sessionRefs` including sessions in untouched years — without rebuilding
   those untouched years (so their `===`-preservation is unaffected).

## Residual, disclosed non-goal (matches contract's own "Non-goals")
An UNTOUCHED year's own topic nodes still do not refresh when a new cross-year session is added
elsewhere — refreshing them would require rebuilding them, which contradicts the entire point of
`===`-preserving incremental regeneration. This was explicit in the contract's Non-goals section,
not a gap discovered after the fact.

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/index test
✔ regenerate rebuilds the touched year to reflect the session change
✔ regenerate keeps an untouched year's subtree === to the input (different years)
✔ regenerate is a no-op when changedSessionIds don't touch this tenant's tree
✔ T-004c C1: a session that moved year is cleaned up from its old year, present in the new one
✔ T-004c C1: old year survives (rebuilt, not vanished) when it still has other sessions
✔ T-004c C3: a touched year's topic node picks up cross-year sessionRefs from an untouched year
✔ real T-002 data: 23 session leaves, cross-session topic, schema-valid shape
✔ grouping and nesting
✔ evidence on every session node
✔ tree_search known and unknown
✔ summarize injection and fallback
tests 11 / pass 11 / fail 0

$ pnpm -r test
all suites green (packages/ask 21, apps/api 18, ingest 18, ai 23, meeting-bot 20, index 11)

$ pnpm gen:types --check
OK: 21 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 21 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (114 file(s) within budget)
lint-dirsize: OK (56 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (163 unique export(s), 21 unique schema $id(s))
lint-migrations: OK (663 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (109 lines, budget 200)
✔ no dependency violations found (127 modules, 345 dependencies cruised)
```

## Files touched
- `packages/index/src/tree/regenerate.ts` (old-year detection + topicContextSessions wiring)
- `packages/index/src/tree/build.ts` (new optional 5th param, backward-compatible default)
- `packages/index/src/tree/regenerate.test.ts` (4 new T-004c tests, 0 existing tests modified)
- `qa/contracts/regenerate-year-migration.md` (new contract, maker-drafted)

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
