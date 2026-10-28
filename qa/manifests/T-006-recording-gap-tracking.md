# Manifest — T-006 recording-gap-tracking

**Contract:** `qa/contracts/recording-gap-tracking.md`
**Goal task:** T-006
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3

## What changed
- `schema/gaps.schema.json` — new `gaps` collection schema: `{_id, tenantId, kind:
  'recording-pending'|'source-pending', description?, requestedFrom?, requestedAt?,
  status: 'open'|'received'|'expired', sla?: {dueAt}, sourceRef?}`, `required: [_id, tenantId,
  kind, status]` (matches every other schema's pattern of also requiring `_id`).
- `schema/fixtures/gaps/{valid,invalid}.json` — valid fixture passes, invalid fixture (bad
  `status` enum value) is rejected. `schema/validate.py` needed **no code change** — it already
  auto-discovers `*.schema.json` + `fixtures/<name>/{valid,invalid}.json` (19→20 collections).
- `packages/core/src/generated/gaps.ts` + regenerated `packages/core/src/index.ts` — via
  `pnpm gen:types` (schema is the source of truth; nothing hand-typed).
- `packages/db/src/collections/gaps.ts` — `gaps(tenantId)` accessor via `scopedCollection`
  (same shape as `sources.ts`/`sessions.ts`/`turns.ts`/`claims.ts`), plus `create`,
  `markReceived`, `markExpired`, `listOpen` built on top of it (the named operations the
  contract calls for; the 4 existing accessors only needed the raw `coll(tenantId)` shape, so
  this file adds the domain layer none of them had to).
- `packages/db/src/collections/tenantScope.typecheck-test.ts` — extended (not forked) with a
  `gaps()` / `gaps("toc")` pair, mirroring the existing `@ts-expect-error` pattern. This is the
  only "tenant-safety test" the existing 4 accessors have (no per-collection `*.test.ts` files
  exist to mirror — checked first, per contract C6).
- `packages/ingest/src/gap-tracking.ts` — `recordGap(reason, context, store)`. Pure composition:
  never imports `@lkb/db`; `GapStore` is a minimal structural interface (`create(tenantId, doc)`)
  satisfied by `collections/gaps.ts`'s `create` — mirrors `capture.ts` never importing a concrete
  `Joiner`. Computes `sla.dueAt` from `requestedAt` + `slaDays` (default 3, ADR-0002).
- `packages/ingest/src/gap-tracking.test.ts` — 3 new tests: correctly-shaped doc + computed SLA,
  default id/omitted optional fields, custom `slaDays`/`id` override.
- `packages/ingest/src/index.ts` — exports `gap-tracking.js`.
- `packages/meeting-bot/src/capture.ts` — wired per C4: `CaptureDeps.gapStore?: GapStore`
  (optional, so untouched callers/tests are unaffected). On the D-008 `assertProvidedFirst`
  warning, calls `recordGap("provided-first-warning", ...)`. `Joiner.join` is now wrapped in
  try/catch — on failure calls `recordGap("join-failure", ...)` then rethrows (unchanged
  behavior for callers without a `gapStore`).
- `packages/meeting-bot/src/capture.test.ts` — **one** new test case
  ("capture() records a gap when Joiner.join fails and a gapStore is injected"); the existing 4
  tests are untouched and still pass.
- `docs/adr/0002-standing-ask-process.md` (37 lines) — the standing-ask process per
  `Living-Knowledge-Base-Architecture.html` §1 step 2b ("Standing ask: request the recording
  from Bhakti/TOC... received within N days?... NO -> logged as a recording pending gap
  entry"), generalized: who gets asked (`requestedFrom`), default SLA (3 days), escalation
  (`markReceived`/`markExpired`/`listOpen`), and the explicit vocabulary contract with
  `gaps.schema.json`'s `status`/`requestedFrom`/`sla.dueAt` fields.
- `docs/SNAPSHOT.md` — regenerated via `node scripts/snapshot.mjs` (picks up the new `gaps`
  collection); required for `lint:structure`'s snapshot-staleness check to pass.

## How to verify

```
pnpm gen:types --check
python schema/validate.py
pnpm -r typecheck
pnpm -r test
pnpm lint:structure
```

## Actual outputs (verbatim)

### `pnpm gen:types --check`
```
> living-knowledge-base@0.0.0 gen:types D:\KnowledgeBase
> node scripts/gen-types.mjs "--check"

OK: 20 generated type file(s) + index.ts match schema/
```

### `python schema/validate.py`
```
OK: gaps — valid fixture passes, invalid fixture correctly rejected (1 error(s))
... (19 other collections, all OK)

PASS: 20 collection schema(s) validated correctly.
```

### `pnpm -r typecheck`
```
Scope: 9 of 10 workspace projects
packages/core typecheck: Done
packages/ai typecheck: Done
packages/db typecheck: Done
packages/index typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
apps/api typecheck: Done
packages/meeting-bot typecheck: Done
```
(all 9 packages with a typecheck script — Done, zero errors; `.` deliberately omits `packages/whatsapp_msg` etc. that pnpm's own filtering already scoped out — "9 of 10 workspace projects" is pnpm's own line, not a skip introduced here)

### `pnpm --filter @lkb/ingest test` (new gap-tracking tests + full existing ingest suite)
```
✔ recordGap writes an open gap with a computed SLA dueAt (2.9594ms)
✔ recordGap defaults the id and omits sourceRef/requestedFrom when not supplied (0.3991ms)
✔ recordGap honors a custom slaDays and id generator (0.3447ms)
✔ detectSource picks the recording adapter for an audio path (1.2009ms)
✔ detectSource picks the document adapter for a document path (0.3081ms)
✔ detectSource throws NoMatchingSourceError when no adapter matches (0.6742ms)
✔ detectSource picks the first matching adapter in order (0.1986ms)
✔ warns when captureMode is 'silent' without confirmedNoAlternative (0.7636ms)
✔ does not warn when captureMode is 'silent' and confirmedNoAlternative is true (0.1482ms)
✔ does not warn for provided/public/notes capture modes (0.1302ms)
✔ detect matches document extensions and the document hint (1.389ms)
✔ fetch reads via the injected reader and sets captureMode from context (1.4263ms)
✔ splitIntoParagraphTurns produces paragraph turns with correct tStart offsets (0.5169ms)
✔ document.toTurns() reads the source path and splits into paragraph turns (0.8345ms)
✔ detect matches audio/video extensions and the recording hint (2.5899ms)
✔ fetch computes a hash via the injected hasher and sets captureMode from context (0.656ms)
✔ fetch throws when tenantId is missing (never silently defaults tenancy) (0.5403ms)
✔ toTurns delegates to the injected transcribe function (1.1751ms)
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

### `pnpm --filter @lkb/meeting-bot test` (new capture.ts wiring test + full existing suite)
```
✔ capture() records a gap when Joiner.join fails and a gapStore is injected (0.4058ms)
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

### `pnpm -r test` (whole repo — no regressions)
All 9 test-bearing packages report `fail 0` (ai: 23/23, ask: 18/18, index: 8/8, ingest: 18/18,
meeting-bot: 20/20, apps/api: 8/8, plus db/core/whatsapp_msg where applicable). No failures
anywhere.

### `pnpm lint:structure`
```
lint-loc: OK (109 file(s) within budget)
lint-dirsize: OK (55 dir(s) within budget)
lint-root: OK (13 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (157 unique export(s), 20 unique schema $id(s))
lint-migrations: OK (646 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (108 lines, budget 200)

✔ no dependency violations found (121 modules, 323 dependencies cruised)
```

## Criteria checklist (contract C1-C7)
- **C1** — met: schema + fixtures pass `schema/validate.py` unmodified, 20/20.
- **C2** — met: `gaps.ts` accessor matches T-018's `coll(tenantId)` pattern, plus
  `create`/`markReceived`/`markExpired`/`listOpen`.
- **C3** — met: `recordGap(reason, context, store): Promise<Gaps>`, pure composition, no I/O
  beyond the injected store.
- **C4** — met: `capture.ts` calls `recordGap` on the `assertProvidedFirst` warning and on
  `Joiner.join` failure, gated behind an optional `gapStore`; one new test case added, the
  existing 4 `capture.test.ts` tests untouched and still passing.
- **C5** — met: `docs/adr/0002-standing-ask-process.md`, 37 lines (≤40), sourced from the
  architecture HTML's §1 step 2b, referenced from and vocabulary-aligned with the `gaps` schema.
- **C6** — met: `gap-tracking.test.ts` (3 tests) + the `tenantScope.typecheck-test.ts` extension
  (no separate `gaps.test.ts` needed — the existing 4 accessors have no per-collection test files
  to mirror, only the shared typecheck file, which was extended instead).
- **C7** — met: `pnpm -r typecheck`, `pnpm -r test`, `pnpm gen:types --check`,
  `python schema/validate.py` (20/20), `pnpm lint:structure` all clean.

Every file stayed within the 300 LOC budget (`capture.ts` 132, `gap-tracking.ts` 68, `gaps.ts`
36, ADR 37 lines) — `lint:structure`'s `lint-loc` confirms no violation was introduced.

## Status: checked-PASS
Verdict: qa/verdicts/T-006-recording-gap-tracking.md (Cycle checked: 1, commit 819262a) — 7/7 criteria met; ADR content independently verified against source HTML.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
