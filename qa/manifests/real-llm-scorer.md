# Manifest — real-llm-scorer (T-009b)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/real-llm-scorer.md` — PASS, commit `089d2b6`
Contract: `qa/contracts/real-llm-scorer.md`

## What changed

1. **`packages/ask/src/evaluator.ts`** — `ScoreFn` widened to
   `(query, node) => ScoreResult | Promise<ScoreResult>`. `evaluate()` split into TWO overloads: a
   sync-only signature (used when `scoreFn`'s static type never returns a Promise — returns a plain
   `Evaluation`, no `await` needed) and a general signature (`Evaluation | Promise<Evaluation>`).
   Runtime: `evaluate()` calls every `scoreFn(query, node)`, checks via a new exported
   `isPromiseLike()` helper whether ANY result is a thenable; if none are, it finishes synchronously
   (same code path as before T-009b, byte-identical output); if any is, it awaits all via
   `Promise.all` and returns a `Promise<Evaluation>`.
2. **`packages/ask/src/router.ts`** — `ask()` gets the identical overload split, mirroring
   `evaluate()`'s sync/async duality (`isPromiseLike` check on `evaluate()`'s return).
3. **`packages/ask/src/ask-v2.ts`** — line 77: `const askResult = ask(...)` → `await ask(...)`
   (criterion 2 — askV2 was already `async`, this is the only call site needing the `await`).
4. **`apps/api/src/score.ts`** — added `createLlmScorer(complete)`, a real LLM-backed judge:
   prompts for a 0-1 relevance score + reason (system prompt cites the CRAG "be conservative with
   high scores" rule), parses the JSON response, clamps into [0,1], and on ANY failure (unparseable
   response OR `complete` rejecting/`AllProvidersFailedError`) falls back to the existing
   `heuristicScore` — appending "(...fell back)" to the reason so the audit trail shows degrade
   path was used. `heuristicScore` unchanged in behavior, only its declared return type narrowed
   from `ScoreFn` to `[number, string]` (it never actually returned a bare number, so this is a
   type-only tightening, not a behavior change) — needed so `createLlmScorer`'s fallback
   destructuring typechecks.
5. **`apps/api/src/production.ts`** — `ask.askDeps.scoreFn` now `createLlmScorer(evaluator-routed
   complete)` instead of `heuristicScore` directly. `evaluator` jobKind already existed in
   `config/ai-routing.yaml` (line 9, from T-019) — no yaml change needed. `/compete/start` (T-012)
   automatically inherits this since `compete.ts` spreads `deps.askDeps` from the same
   `AskRouteDeps` object `production.ts` builds — no separate wiring needed there (criterion 4).

## Deviation from the contract (disclosed, not hidden)

- **Criterion 1's literal wording** ("`evaluate()` awaits the result regardless of shape") is not
  what was built — a single always-`async` `evaluate()` would return `Promise<Evaluation>`
  unconditionally, which BREAKS the actual backward-compat bar the same criterion states in its
  next sentence ("existing tests must pass unmodified") — TypeScript's overload resolution can't
  narrow a union return type at call sites, so `router.test.ts`'s existing `.verdict` reads with no
  `await` would fail to typecheck. Built instead: a function-overload split (sync scoreFn → sync
  return; scoreFn typed/used as possibly-async → `Evaluation | Promise<Evaluation>`) that satisfies
  the actual bar (existing tests behaviorally AND type-check unmodified) while still allowing a real
  async judge. Two NEW three-line test additions in `router.test.ts` needed a type-annotation change
  (removing an explicit `: ScoreFn` on two helper closures so TS's overload resolution picks the
  sync overload) — this is a type-annotation-only edit, zero assertions/behavior changed, and every
  original assertion still runs and passes unmodified (see command output below).
- **Criterion 5** says extend `packages/ask/src/evaluator.test.ts` — no such file exists (the
  T-005/T-005b evaluate() tests live in `router.test.ts`); extended that file instead (3 new tests,
  clearly labeled `T-009b:`), consistent with the contract's actual intent ("extend, don't fork").

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... (all 7 packages + apps/api) ... Done   [see full output in this session's tool log]

$ pnpm -r test
packages/ask test: ℹ tests 21 / pass 21 / fail 0   (18 pre-existing + 3 new T-009b)
apps/api test:     ℹ tests 18 / pass 18 / fail 0   (14 pre-existing + 4 new score.test.ts)
packages/ai, index, ingest, meeting-bot: unchanged, all green (23, 8, 18, 20 respectively)

$ pnpm gen:types --check
OK: 21 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 21 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (114 file(s) within budget)
lint-dirsize: OK (56 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (163 unique export(s), 21 unique schema $id(s))
lint-migrations: OK (660 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (109 lines, budget 200)
✔ no dependency violations found (127 modules, 345 dependencies cruised)
```

## Files touched
- `packages/ask/src/evaluator.ts` (widened, overloaded)
- `packages/ask/src/router.ts` (overloaded, mirrors evaluator)
- `packages/ask/src/ask-v2.ts` (one-line `await` add)
- `packages/ask/src/router.test.ts` (3 new tests; 2 helper-closure type annotations relaxed)
- `apps/api/src/score.ts` (new `createLlmScorer`, `heuristicScore` return type narrowed)
- `apps/api/src/score.test.ts` (new file, 4 tests)
- `apps/api/src/production.ts` (wired `createLlmScorer` as the default scorer)
- `qa/contracts/real-llm-scorer.md` (new contract, maker-drafted)

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
