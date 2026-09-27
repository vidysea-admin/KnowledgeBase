# Manifest — T-020 ingestion-source-seam

**Contract:** `qa/contracts/ingestion-source-seam.md`
**Goal task:** T-020
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3

## What changed

Filled in the `packages/ingest` placeholder (T-016) with the `Source` adapter seam:

- `src/source.ts` — the one `Source` interface (`detect`/`fetch`/`toTurns`), `ConsentContext`
  (required `captureMode`, `given`, `recordedBy`, optional `note`/`confirmedNoAlternative`), and
  `assertProvidedFirst(context)` (D-008 soft gate: warns, never throws, for
  `captureMode === "silent"` without `confirmedNoAlternative`). `SourceDoc`/`MediaDoc`/`TurnDoc`
  are re-exports of the generated `Sources`/`Media`/`Turns` types from `@lkb/core` — not
  redeclared. `Turn` (the pre-persistence, no-`_id` shape `toTurns()` actually produces) is
  re-exported from `@lkb/ai`'s `packages/ai/src/stt/transcribe.ts`, which was already built in
  T-019 for exactly this "schema minus the ids the caller fills in" shape — reusing it here
  avoids declaring a second near-identical turn type. This is a maker judgment call on the
  contract's C1 wording ("Turn ... imported from core/generated") — flagged for checker
  amendment if a stricter reading of C1 is wanted.
- `src/sources/recording.ts` (122 LOC) — `createRecordingSource({hasher, reader, transcribe,
  now?})`. `detect` matches audio/video extensions or a `{kind: "recording"}` hint. `fetch`
  reads bytes via the injected `reader`, hashes via the injected `hasher`, and sets
  `source.captureMode` directly from `consent.captureMode` (no adapter-side guessing — D-008:
  the caller always supplies it explicitly). `toTurns` re-reads the source's bytes and delegates
  to the injected `transcribe: Transcribe` (imported as a type from `@lkb/ai`) — no concrete STT
  adapter (`whisper.ts`/`gemini.ts`) imported.
- `src/sources/document.ts` (115 LOC) — `createDocumentSource({hasher, reader, now?})`. `detect`
  matches `.pdf/.docx/.txt/.md` or a `{kind: "document"}` hint. `fetch` reads extracted text via
  the injected `reader` (no `fs`), hashes it. `toTurns` re-reads via `reader` and calls the
  exported `splitIntoParagraphTurns(text)` helper, which splits on blank lines and sets
  `tStart`/`tEnd` to character offsets in the original text — the convention T-023's `url`
  adapter is meant to reuse.
- `src/registry.ts` — `detectSource(input, adapters)` returns the first adapter whose `detect()`
  is true; `NoMatchingSourceError` (typed, exported) thrown otherwise — a loop over a list, not
  an if/else chain.
- `src/testUtils.ts` — one shared fixture module (`baseConsent`, `fakeBytesReader`,
  `fakeTextReader`, `fakeHasher`) used by every test file, mirroring `packages/ai/src/testUtils.ts`.
- Tests (15, `node --test`, no real file I/O — every reader/hasher/transcribe is an in-memory
  fake): `source.test.ts` (C5: silent-without-confirmation warns, silent-with-confirmation and
  provided/public/notes don't), `registry.test.ts` (C4/C6: picks recording vs document adapter,
  throws `NoMatchingSourceError` for neither, picks first match in order),
  `sources/recording.test.ts` (C2/C6: detect, hash + captureMode on fetch, tenantId required,
  `toTurns` delegates to injected `transcribe`), `sources/document.test.ts` (C3/C6: detect,
  hash + captureMode on fetch, `splitIntoParagraphTurns` offsets, `toTurns` end to end).
- `package.json` — added `test` script (`node --test --import tsx`, matching `@lkb/ai`/`@lkb/ask`)
  and `@lkb/ai` as a dependency (`ingest -> ai` is an allowed edge per ARCHITECTURE §5); ran
  `pnpm install` once to link the new workspace dependency (updates `pnpm-lock.yaml`).
- `src/index.ts` — now re-exports `source.js`, `registry.js`, `sources/recording.js`,
  `sources/document.js` (was an empty placeholder).

No other package's files were touched; `qa/contracts/*`, `ARCHITECTURE.md`, `docs/DECISIONS.md`
were read only, not edited.

## How to verify

```
pnpm --filter @lkb/ingest typecheck
pnpm --filter @lkb/ingest test
pnpm -r typecheck
pnpm -r test
pnpm gen:types --check
python schema/validate.py
pnpm lint:structure
```

## Actual outputs

### `pnpm --filter @lkb/ingest typecheck`
```
> @lkb/ingest@0.0.0 typecheck D:\KnowledgeBase\packages\ingest
> tsc --noEmit -p tsconfig.json
```
(no output = clean)

### `pnpm --filter @lkb/ingest test`
```
> @lkb/ingest@0.0.0 test D:\KnowledgeBase\packages\ingest
> node --test --import tsx "src/**/*.test.ts"

✔ detectSource picks the recording adapter for an audio path (0.7236ms)
✔ detectSource picks the document adapter for a document path (0.2309ms)
✔ detectSource throws NoMatchingSourceError when no adapter matches (0.3351ms)
✔ detectSource picks the first matching adapter in order (0.0992ms)
✔ warns when captureMode is 'silent' without confirmedNoAlternative (0.6328ms)
✔ does not warn when captureMode is 'silent' and confirmedNoAlternative is true (0.0917ms)
✔ does not warn for provided/public/notes capture modes (0.088ms)
✔ detect matches document extensions and the document hint (0.9809ms)
✔ fetch reads via the injected reader and sets captureMode from context (0.9533ms)
✔ splitIntoParagraphTurns produces paragraph turns with correct tStart offsets (0.316ms)
✔ document.toTurns() reads the source path and splits into paragraph turns (0.537ms)
✔ detect matches audio/video extensions and the recording hint (0.625ms)
✔ fetch computes a hash via the injected hasher and sets captureMode from context (0.2808ms)
✔ fetch throws when tenantId is missing (never silently defaults tenancy) (0.2388ms)
✔ toTurns delegates to the injected transcribe function (0.5792ms)
ℹ tests 15
ℹ pass 15
ℹ fail 0
ℹ duration_ms 310.8325
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
packages/ai test: 23 pass, 0 fail
packages/ask test: 6 pass, 0 fail
packages/index test: 4 pass, 0 fail
packages/ingest test: 15 pass, 0 fail
```
No regression in existing suites; all new `packages/ingest` tests green.

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
lint-loc: OK (65 file(s) within budget)
lint-dirsize: OK (51 dir(s) within budget)
lint-root: OK (13 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (98 unique export(s), 19 unique schema $id(s))
lint-migrations: OK (464 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (105 lines, budget 200)
✔ no dependency violations found (74 modules, 153 dependencies cruised)
```

### LOC check (all files, incl. tests, under budget: 300 non-test / 400 test)
```
 64 src/source.ts          30 src/registry.ts         7 src/index.ts
 43 src/testUtils.ts
122 src/sources/recording.ts     115 src/sources/document.ts
 29 src/source.test.ts      40 src/registry.test.ts
 81 src/sources/recording.test.ts   68 src/sources/document.test.ts
```

## Criteria coverage (self-check against contract)

1. C1 — met: one `Source` interface in `source.ts`; `SourceDoc`/`MediaDoc`/`TurnDoc` are
   re-exports of `@lkb/core`'s generated `Sources`/`Media`/`Turns`. `Turn` (the pre-id shape
   `toTurns()` returns) is a re-export of `@lkb/ai`'s `stt/transcribe.ts` `Turn` rather than a
   third redeclaration of that shape — see "What changed" note; checker may amend if a stricter
   literal reading of C1 is preferred.
2. C2 — met: `sources/recording.ts` (122 LOC, under 300), `detect` matches extensions/hint,
   `fetch` hashes via injected hasher and sets `captureMode` from `ConsentContext`, `toTurns`
   delegates to the injected `Transcribe` from `@lkb/ai` — no concrete adapter import.
3. C3 — met: `sources/document.ts` (115 LOC, under 300), `detect` matches
   `.pdf/.docx/.txt/.md`, `fetch` reads via injected `reader` (no `fs`), `toTurns` splits into
   paragraph turns with character-offset `tStart`.
4. C4 — met: `registry.ts`'s `detectSource` loops over `adapters`, first match wins, typed
   `NoMatchingSourceError` thrown otherwise.
5. C5 — met: `assertProvidedFirst` in `source.ts` warns (returns a string) only for
   `captureMode === "silent"` without `confirmedNoAlternative`; test proves both the warning and
   its absence.
6. C6 — met: 15 tests across 4 files, `node --test`, all fakes/fixtures, no real file I/O.
7. C7 (no regression) — met: all six verify commands above are clean.

## Status: checked-PASS
Verdict: qa/verdicts/T-020-ingestion-source-seam.md (Cycle checked: 1, commit 3d2bb6f) — 7/7 criteria met; C1 amended (Turn reuse ruled correct).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
