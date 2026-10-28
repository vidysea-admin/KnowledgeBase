# Manifest — lint-score-split

**Contract:** qa/contracts/catalogue-progress-score.md, and `qa/contracts/structure-lint.md`
(criterion 7, the `lint:structure` entry point).
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-058

## Why

`catalogue-score --check` was bundled into `pnpm lint:structure`, so the everyday structure lint
was red during any in-flight unit — the last three units in a row hit this exact refusal on their
own uncommitted files, and it is only ever cleared by the author committing the very next step, so
it trained toward not reading the chain rather than toward committing sooner.

The checker ruled on this directly (`qa/contracts/catalogue-progress-score.md` amendment log,
2026-09-07, "routine — nothing changed"): **I13/I14 stay exactly as strong — a composition change
only.** `catalogue-score --check` is only meaningful about *committed* state, so it belongs on the
commit/CI path, not inside a chain meant to be runnable at any moment mid-unit.

## What changed

1. **`package.json`** — removed `node scripts/catalogue-score.mjs --check` from the `lint:structure`
   chain; added a new `lint:score` script that runs it alone.
2. **`.github/workflows/ci.yml`** — added `pnpm lint:score` as its own CI step, right after
   `Structure budgets + dependency rules` (`lint:structure`), with a comment recording why it's
   split rather than folded back in.
3. No changes to `catalogue-score.mjs` itself, no criterion softened, no evidence-trust check
   weakened — verified below.

## Real evidence

### The split does exactly what it was built to do

```
$ echo "// touch" >> apps/api/src/routes/graph.ts     # simulate an in-flight unit's dirty scraped source

$ pnpm lint:structure
lint-loc / lint-dirsize / lint-root / lint-dupes / lint-migrations / snapshot --check: all OK
depcruise: no violations
EXIT 0                                                  <- stays green through the in-flight file

$ pnpm lint:score
REFUSED: apps/api/src/routes/graph.ts is not what the repository holds (modified). Commit it, or
restore it, so the score is reproducible by someone else.
EXIT non-zero                                           <- I13/I14 refusal is untouched, still fires

$ git checkout -- apps/api/src/routes/graph.ts         # revert the probe
```

Before this unit, the first command alone would have exited non-zero on that same dirty file —
the exact failure mode ISS-058 documents (this manifest's own working tree hit it three units
running: `apps/api/src/indexing.ts`/`indexing.test.ts` twice, `packages/db/src/lib/tenantScope.test.ts`
once).

### Full regression

```
pnpm test:lint       45/45
pnpm -r typecheck    all 9 projects Done
CI YAML parses (python yaml.safe_load) — no syntax break from the added step
```

`docs/PROGRESS.md` unchanged at 20.2%/28.9% — this unit touches packaging only, never the score
itself.

## A contract-text tension I found and did NOT resolve myself

`qa/contracts/catalogue-progress-score.md` **[I7]**'s literal criterion text still reads:
*"Staleness is caught... and must be wired into `pnpm lint:structure`."* That sentence is now
false on purpose — the whole point of this unit is that it is **not** wired there anymore. The
amendment-log entry that authorized this ("What moves is where the refusal runs... belongs in the
commit/CI path, not bundled into the everyday `pnpm lint:structure` chain") states the intent
clearly, but I7's own criterion text was never updated to match it. That is a checker-owned
contract; I have not touched it. Please reconcile I7's wording with the amendment log's own
ruling — e.g. "must be wired into the commit/CI path (`lint:score`, run in `.github/workflows/
ci.yml`)" — so a future reader of I7 alone doesn't read this unit as a violation.

## How to verify (for the checker)

1. Reproduce the two runs above yourself (dirty a scraped-source file, `lint:structure` green,
   `lint:score` refuses), on a probe you plant, not mine.
2. Confirm `catalogue-score.mjs` itself has zero diff from HEAD — this should be a pure packaging
   move, no logic touched.
3. Confirm CI still runs the check somewhere reachable — `.github/workflows/ci.yml` has the new
   step, positioned after `lint:structure` and before `test:lint`.
4. Rule on the I7 wording tension above.
5. `pnpm test:lint` 45/45, `pnpm -r typecheck` clean.

## Status: checked-PASS

**Verdict:** `qa/verdicts/lint-score-split.md` — **PASS**, `Cycle checked: 1`, commit `1d32382`.
2/2 criteria met · 6/6 invariants hold (I9–I14 re-verified live).

### What the checker ruled

1. **Reproduced independently with its own probe** (`apps/web/src/App.tsx`, not the file I used):
   `lint:structure` stays green through it, `lint:score` refuses. Confirmed
   `catalogue-score.mjs`/`scripts/lib/catalogue.mjs` have zero diff from HEAD — pure packaging.
2. **CI step confirmed unconditionally reachable** between `lint:structure` and `test:lint`, valid
   YAML.
3. **`structure-lint.md` criterion 7 confirmed unaffected** — `catalogue-score` was never one of
   its numbered 1–6 checks.
4. **Resolved the I7 wording tension itself** — rewrote the stale "must be wired into
   `pnpm lint:structure`" text to match its own prior amendment-log ruling, with a new
   amendment-log entry. Wording only, no invariant weakened.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
