# Manifest — golden-set-recall (T-021)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/golden-set-recall.md` — PASS, commit `03fcf8d`
Contract: `qa/contracts/golden-set-recall.md`

## Disclosed scope-down (read this first)
The real end-to-end retrieval pipeline (`packages/ask`'s `selectNodes`, LLM-backed) cannot run —
`GEMINI_API_KEY` in `.env` is invalid, same blocker as T-003 (ISS-015, still open). This unit
builds the harness + a real golden set and reports recall@5 using a heuristic (non-LLM) keyword
retriever as an explicitly-labeled proxy, per the contract's own Scope section. **recall@5 = 1.000
(46/46) is NOT evidence the real system hits the 0.85 target** — it mainly reflects that the
golden questions are literal excerpts of the same text the heuristic retriever searches, so this
result was expected and is disclosed as such, not oversold.

## What changed

1. **`scripts/gen-golden-set.mjs`** (new) — reads all 23 real `data/toc-migrated/*/
   session_page.json` files, takes up to 2 `keyInsights` per session verbatim, writes
   `data/eval/golden-set.json`: 46 questions spanning all 23 sessions (contract required ≥30
   spanning ≥15 — exceeded on both counts). Idempotent (deterministic slice + sort).
2. **`packages/index/src/eval/recall.ts`** (new) — pure `computeRecallAtK(questions, retrieveFn,
   k)`, no I/O. Truncates `retrieveFn`'s result to `k` itself (never trusts the retriever to have
   already done so — proven by a dedicated test). Names every miss.
3. **`packages/index/src/eval/heuristic-retriever.ts`** (new) — `createHeuristicRetriever(tree)`:
   keyword-overlap ranking of session nodes' `summary` text (same bag-of-words technique as
   `apps/api/src/score.ts`'s `heuristicScore`); filters out zero-overlap candidates entirely
   rather than fabricating a ranked list when there's no signal.
4. **`scripts/eval-recall.mjs`** (new) — same `tsx/esm/api` `register()` pattern as
   `scripts/seed-toc.mjs`; builds the real tree from `data/toc-migrated/*`, runs the eval at k=5,
   prints the result, writes `data/eval/recall-report.json`.
5. **`packages/index/src/index.ts`** — exports the new `eval/` module (recall + retriever).
6. **`docs/SNAPSHOT.md`** — regenerated (`node scripts/snapshot.mjs`) to reflect the new
   `data/eval/` directory in the tree — required for `pnpm lint:structure`'s snapshot-check to
   stay green; no manual edit.

## How to verify (all commands run, real output below)

```
$ node scripts/gen-golden-set.mjs
wrote 46 golden questions spanning 23 sessions -> D:\KnowledgeBase\data\eval\golden-set.json

$ node scripts/eval-recall.mjs
recall@5 = 1.000 (46/46 hits)
wrote D:\KnowledgeBase\data\eval\recall-report.json

$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/index test
tests 19 / pass 19 / fail 0   (11 pre-existing + 8 new: 5 recall.test.ts + 3 heuristic-retriever.test.ts)

$ pnpm -r test
index 19 / ai 23 / ingest 26 / ask 21 / meeting-bot 20 / apps/api 18 — all green, 0 regressions

$ pnpm gen:types --check
OK: 21 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 21 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (122 file(s) within budget)
lint-dirsize: OK (57 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (175 unique export(s), 21 unique schema $id(s))
lint-migrations: OK (677 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (110 lines, budget 200)
✔ no dependency violations found (133 modules, 365 dependencies cruised)
```

## Files touched
- `scripts/gen-golden-set.mjs` (new)
- `scripts/eval-recall.mjs` (new)
- `packages/index/src/eval/recall.ts` (new)
- `packages/index/src/eval/recall.test.ts` (new)
- `packages/index/src/eval/heuristic-retriever.ts` (new)
- `packages/index/src/eval/heuristic-retriever.test.ts` (new)
- `packages/index/src/index.ts` (eval/ exports)
- `data/eval/golden-set.json` (generated, real content)
- `data/eval/recall-report.json` (generated)
- `docs/SNAPSHOT.md` (regenerated)
- `qa/contracts/golden-set-recall.md` (new contract, maker-drafted)

## Follow-up (not this unit, disclosed in contract Non-goals)
Once ISS-015 (invalid Gemini key) is resolved, this exact golden set + harness should be re-run
against `packages/ask`'s real `selectNodes` (an LLM-backed `RetrieveFn` implementation) to get an
honest recall@5 number against the actual production pipeline — the 0.85 target belongs to that
run, not this one.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
