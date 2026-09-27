# Manifest — T-019 ai-provider-seam

**Contract:** `qa/contracts/ai-provider-seam.md`
**Goal task:** T-019
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3

## What changed

Filled in the `packages/ai` placeholder (T-016) end to end:

- `src/provider.ts` — the one `Provider` interface, `Message`/`Job`/`CompleteResult`/`ModelInfo`
  types, and the shared `Transport`/`TransportRequest`/`TransportResponse` seam (one HTTP-or-CLI
  shape reused by every adapter, not re-declared per file).
- `src/providers/{gemini,openai,anthropic,ollama,claude-code}.ts` — five `Provider`
  implementations, each behind the injected `transport`. `anthropic.ts` supports `mode:
  "api-key"` (Messages API) and `mode: "oauth"` (delegates to `claude-code.ts`'s
  `runClaudeCodePrompt`, exported once and imported — not reimplemented).
- `src/router.ts` — `route(jobKind, config)` resolves an ordered chain to `Provider` instances;
  `complete(jobKind, job, config)` tries them in order, first success wins, records one `jobs`
  entry per attempt via injected `write`, throws `AllProvidersFailedError` (exported, typed) if
  every provider fails.
- `src/routing-config.ts` — a 30-line hand-rolled parser for the flat `key: [a, b, c]` YAML shape
  (confirmed no `yaml`/`js-yaml` dependency exists anywhere in this workspace before adding this;
  see "How to verify" below).
- `config/ai-routing.yaml` — seeded with `transcribe`, `namemap`, `summarize`, `claims`,
  `tree-summary`, `evaluator`, `answer`, each Gemini-first (D-005/D-008).
- `src/jobs.ts` — `recordJob(entry, write)`, `JobEntry` shaped from `schema/jobs.schema.json`
  (T-018) via the generated `Jobs` type, injectable `write`.
- `src/stt/{transcribe,whisper,gemini}.ts` — the shared `Turn`/`Transcribe`/`SttAdapter`
  interface plus the two adapters (H9), both behind the same injectable `Transport`.
- `src/testUtils.ts` — one shared `fakeTransport`/`failingTransport` helper used by every test
  file (no duplicated fake-transport logic).
- Tests: `provider.test.ts` (parity, gemini vs claude-code — different transport kinds),
  `router.test.ts` (order/first-success/AllProvidersFailedError/recordJob-once-per-attempt),
  `jobs.test.ts`, `routing-config.test.ts` (incl. parsing the real `config/ai-routing.yaml`),
  `providers.test.ts` (openai, ollama incl. real listModels() transport call, anthropic both
  modes, claude-code), `stt.test.ts`.
- `package.json` — added the `test` script (`node --test --import tsx`) + `tsx` devDependency,
  matching `packages/ask`'s config.
- Regenerated `docs/SNAPSHOT.md` (the new `config/` root directory made the committed snapshot
  stale; `pnpm lint:structure`'s snapshot-staleness gate caught it, fixed by re-running
  `node scripts/snapshot.mjs`).

No other package's files were touched; `docs/DECISIONS.md`, `ARCHITECTURE.md`, and
`qa/contracts/*` were read only, not edited (H10/D-005/D-008 already cover this unit's scope —
no new decision was needed).

## How to verify

```
pnpm --filter @lkb/ai typecheck
pnpm --filter @lkb/ai test
pnpm -r typecheck
pnpm -r test
pnpm gen:types --check
python schema/validate.py
pnpm lint:structure
```

## Actual outputs

### `pnpm --filter @lkb/ai typecheck`
```
> @lkb/ai@0.0.0 typecheck D:\KnowledgeBase\packages\ai
> tsc --noEmit -p tsconfig.json
```
(no output = clean)

### `pnpm --filter @lkb/ai test`
```
> @lkb/ai@0.0.0 test D:\KnowledgeBase\packages\ai
> node --test --import tsx "src/**/*.test.ts"

✔ recordJob calls the injected write with the entry, filling in createdAt if absent (1.2613ms)
✔ recordJob preserves a caller-supplied createdAt (0.214ms)
✔ parity: gemini and claude-code adapters produce the same CompleteResult shape (1.7335ms)
✔ openai adapter completes via its injected transport (0.8126ms)
✔ openai adapter throws on a non-2xx transport response, never swallows it (0.2634ms)
✔ ollama adapter completes via its local /api/chat transport (0.177ms)
✔ ollama listModels() is a real call to a /api/tags-shaped transport (C3) (0.5598ms)
✔ anthropic adapter (api-key mode) completes via the Messages API shape (0.4218ms)
✔ anthropic adapter (api-key mode) requires an apiKey (0.2337ms)
✔ anthropic adapter (oauth mode) delegates to the claude-code CLI transport shape — one implementation, not two (0.2604ms)
✔ claude-code adapter returns its static model-alias manifest (0.1597ms)
✔ claude-code adapter throws on a non-zero CLI exit code (0.16ms)
✔ route() resolves the ordered chain to Provider instances (1.7903ms)
✔ route() throws on an unknown jobKind or unknown provider name (0.3853ms)
✔ complete() tries providers in order and stops at first success (1.0125ms)
✔ complete() throws AllProvidersFailedError when every provider fails, never a silent empty result (0.8362ms)
✔ complete() records exactly one jobs entry for a single-provider chain success (0.2786ms)
✔ parses a flat key: [a, b, c] document, skipping comments and blank lines (1.6296ms)
✔ handles an empty array and ignores malformed lines (0.2247ms)
✔ parses the real config/ai-routing.yaml with every jobKind an ordered array of length >= 1 (0.7975ms)
✔ whisper adapter transcribes via its injected transport (1.2225ms)
✔ gemini STT adapter transcribes via its injected transport (0.3007ms)
✔ both STT adapters throw (never silently return []) on a transport error status (0.3962ms)
ℹ tests 23
ℹ pass 23
ℹ fail 0
ℹ duration_ms 317.5488
```

### `pnpm -r typecheck`
```
Scope: 9 of 10 workspace projects
packages/core typecheck: Done
apps/api typecheck: Done
packages/ai typecheck: Done
packages/ask typecheck: Done
packages/db typecheck: Done
packages/index typecheck: Done
packages/ingest typecheck: Done
packages/meeting-bot typecheck: Done
```
All clean, no errors (10th project = whatsapp_msg submodule, out of scope).

### `pnpm -r test`
```
packages/ask test: 6 pass, 0 fail
packages/index test: 4 pass, 0 fail
packages/ai test: 23 pass, 0 fail
```
No regression in existing suites; all new `packages/ai` tests green.

### `pnpm gen:types --check`
```
> node scripts/gen-types.mjs "--check"
OK: 19 generated type file(s) + index.ts match schema/
```

### `python schema/validate.py`
```
PASS: 19 collection schema(s) validated correctly.
```

### `pnpm lint:structure`
```
lint-loc: OK (56 file(s) within budget)
lint-dirsize: OK (50 dir(s) within budget)
lint-root: OK (13 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (73 unique export(s), 19 unique schema $id(s))
lint-migrations: OK (456 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (105 lines, budget 200)
✔ no dependency violations found (65 modules, 123 dependencies cruised)
```
(Initial run failed on snapshot staleness caused by the new `config/` root dir; fixed by running
`node scripts/snapshot.mjs` once, then the gate passed — output above is post-fix.)

### LOC check (all files, incl. tests, under budget: 300 non-test / 400 test)
```
 83 src/provider.ts        87 src/router.ts          23 src/jobs.ts
 30 src/routing-config.ts  43 src/testUtils.ts        15 src/index.ts
 96 src/providers/anthropic.ts   83 src/providers/claude-code.ts
 81 src/providers/gemini.ts      81 src/providers/ollama.ts
 72 src/providers/openai.ts
 48 src/stt/gemini.ts      30 src/stt/transcribe.ts   38 src/stt/whisper.ts
 36 jobs.test.ts  64 provider.test.ts  102 providers.test.ts
122 router.test.ts  43 routing-config.test.ts  38 stt.test.ts
```

## Criteria coverage (self-check against contract)

1. C1 — met: one `Provider` interface + shared `Message`/`Job`/`CompleteResult` in `provider.ts`,
   imported by every adapter.
2. C2 — met: 5 adapters, each ≤300 LOC, each behind injected `transport`; `anthropic.ts` supports
   both modes, oauth mode delegates to `claude-code.ts`.
3. C3 — met: gemini/openai/anthropic/claude-code static labeled manifests; ollama's
   `listModels()` is a real (fake-tested) call to a `/api/tags`-shaped transport.
4. C4 — met: `config/ai-routing.yaml` (7 jobKinds, Gemini-first, user-editable arrays);
   `route()`/`complete()` in `router.ts`; `AllProvidersFailedError` typed and thrown, never a
   silent empty result.
5. C5 — met: `recordJob(entry, write)` in `jobs.ts`, shape from `Jobs` (generated from
   `schema/jobs.schema.json`), injectable write, no live Mongo needed.
6. C6 — met: `stt/transcribe.ts` shared interface, `whisper.ts` (default/local) and `gemini.ts`,
   both behind injectable transport.
7. C7 — met: `provider.test.ts` runs the fixture job through 2 adapters (gemini http, claude-code
   cli) and asserts identical result shape; `router.test.ts` covers order/first-success,
   `AllProvidersFailedError` on total failure, and exactly-once `recordJob` per attempt.
8. C8 (no regression) — met: all six verify commands above are clean.

Non-goal note: no CRAG web-search provider was added — out of scope per contract, folds into a
separate `ask-router` v2 unit.

## Status: checked-PASS
Verdict: qa/verdicts/T-019-ai-provider-seam.md (Cycle checked: 1, commit 424bb38) — 8/8 criteria met.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
