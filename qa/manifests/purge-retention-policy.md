# Manifest — purge-retention-policy (T-026)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/purge-retention-policy.md` — PASS, commit `950a804`
Contract: `qa/contracts/purge-retention-policy.md`

## What changed

1. **`packages/core/src/domain/purge-policy.ts`** (new) — `isPurgeEligible(media, claimsForTenant)`:
   evidence-clip media never eligible; no linked turns → not eligible; no citing claim → not
   eligible (conservative, not vacuous); any unverified citing claim → not eligible, count named
   in reason; all citing claims verified → eligible. `deriveEvidenceClipWindows(claims, turns,
   paddingSeconds=15)`: per verified-claim evidence entry, resolves the cited turn, emits a padded
   `{sessionId, turnId, tStart, tEnd}` window (`tStart` clamped at 0), skips unresolvable turns
   without throwing, de-duplicates a turn cited by multiple verified claims into one window.
2. **`packages/core/src/index.ts`** — now re-exports `./domain/purge-policy.js`.
3. **`scripts/gen-types.mjs`** — one necessary fix: `indexFile()` previously regenerated
   `index.ts` from ONLY `schema/*.schema.json` names, so my hand-added domain export line was
   flagged as DRIFT by `gen:types --check` (the generator would have silently deleted it on the
   next `pnpm gen:types` run). Fixed by having `indexFile()` also scan `packages/core/src/
   domain/*.ts` (excluding `.test.ts`) and append deterministic re-export lines — `index.ts` stays
   100% generated (both halves), and any FUTURE domain module gets picked up automatically with
   no further script changes needed. This directly fulfills the header comment gen-types.mjs
   already wrote for itself ("Pure domain functions... go in src/domain/<concept>.ts (D-003)") —
   the mechanism just didn't exist until this unit needed it.
4. **`packages/core/package.json`** — added a `test` script (`node --test --import tsx
   "src/**/*.test.ts"`) and `tsx` devDependency, matching every other tested package's exact
   pattern (`packages/index/package.json`) — `packages/core` had no test runner configured before
   this unit's first-ever `*.test.ts` file.
5. **`packages/core/src/domain/purge-policy.test.ts`** (new, 7 tests).
6. **`docs/adr/0003-purge-retention-policy.md`** (new, 53 lines, under the 60-line budget) —
   the human-facing process doc, matching ADR-0001/0002's format and length.
7. **`docs/SNAPSHOT.md`** — regenerated to reflect the new files.

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/core test
tests 7 / pass 7 / fail 0

$ pnpm -r test
core 7 / index 19 / ai 23 / ingest 26 / ask 21 / meeting-bot 20 / apps/api 18 — all green

$ pnpm gen:types --check
OK: 21 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 21 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (124 file(s) within budget)
lint-dirsize: OK (58 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (179 unique export(s), 21 unique schema $id(s))
lint-migrations: OK (683 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (110 lines, budget 200)
✔ no dependency violations found (135 modules, 375 dependencies cruised)
```

## Files touched
- `packages/core/src/domain/purge-policy.ts` (new)
- `packages/core/src/domain/purge-policy.test.ts` (new)
- `packages/core/src/index.ts` (regenerated — domain export added)
- `packages/core/package.json` (test script + tsx dep, matching existing pattern)
- `scripts/gen-types.mjs` (domain-module auto-export fix, disclosed above)
- `docs/adr/0003-purge-retention-policy.md` (new)
- `docs/SNAPSHOT.md` (regenerated)
- `qa/contracts/purge-retention-policy.md` (new contract, maker-drafted)

## Follow-up (not this unit, disclosed in contract Non-goals)
A future worker unit wires `isPurgeEligible`/`deriveEvidenceClipWindows` to a real Mongo read +
actual file delete + `media.retention` field update. Not built here.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
