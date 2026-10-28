# Manifest — chunk-backfill
**Contract:** qa/contracts/ingest-indexing-pipeline.md
**Goal task:** U1.0 (new — the backfill step no unit owned)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-116 (high, the >100 batch rejection) · ISS-113 (C8 row-level, now dischargeable)

## Why this unit exists

`chunks` was measured **0 rows** against 26 sessions / 2118 turns, even though U1.1 (embed seam),
U1.2 (chunker + schema) and U1.3 (embed-on-index) had all PASSed. Nothing was broken:
`writeSessionChunks` only runs *during indexing*, and every existing session was indexed before
that code existed. **Three PASSed units had added a capability that never produced a single row.**
No manifest overclaimed — `embed-on-index.md` says in its own evidence block that no live row had
been written and C8 should stay open — but the gap was owned by nobody.

## What changed

- `apps/api/src/indexing.ts` — **extracted** the chunk+embed block out of `indexSession` into an
  exported `writeSessionChunks(tenantId, sessionId, turns, embed, db)`. Behaviour identical; it now
  **returns `{written, skipped}`** so a caller can see a degradation instead of inferring success
  from the absence of a throw. Extracted, not copied — the backfill and the live pipeline must not
  drift, and the chunk write is exactly where this project already paid for a delete/insert
  asymmetry (ISS-056).
- `apps/api/src/production.ts` — extracted `buildRouting()` (chains + providers + job writer) so an
  offline job gets the **same** chain config and provider set as the server. A script registering
  its own providers would be a second definition free to drift.
- `packages/ai/src/providers/gemini.ts` — **the real bug.** `batchEmbedContents` rejects >100
  requests with a 400. `embed()` sent one unbounded batch. Now splits at `MAX_BATCH = 100`,
  per-batch arity checked with its own offset, and the **combined** dims/ragged/empty checks kept so
  a cross-batch dimension change — which no single batch can see — is still caught.
- `scripts/backfill-chunks.mjs` (new) — `--dry-run` / `--session` / `--tenant` / `--limit`. Calls
  only `writeSessionChunks`, deliberately **not** `indexSession`: re-indexing would re-bill
  `summarize`+`claims` on 26 sessions and a degraded summarize could overwrite a good
  `session_pages` row. **Exits non-zero and names the sessions that got no chunks.**
- `structure.config.json` — `dirsize.overrides.scripts` 31 → 32, authorized by **D-018**.
- Tests: 4 new in `indexing.test.ts` (the return contract), 4 new in `providers.test.ts` (the batch
  limit, order across boundaries, cross-batch raggedness, short second batch).

## How the bug was found — and why it matters

It was **not** found by reasoning. The first full backfill run reported:

```
3 session(s) did NOT get chunks:
  2026-04-21-visa-blueprint-part2-italy-france-nz — embedding-failed (237 chunk(s) not written)
  2026-07-15-creative-futures — embedding-failed (228 chunk(s) not written)
  2026-08-10-ucas-what-changed-what-matters — embedding-failed (111 chunk(s) not written)
EXIT=1
```

The failures were **exactly the three largest sessions** — a monotone cutoff between 230 and 134
turns, i.e. size-dependent, not content-dependent. 576 chunks, **40% of the corpus, and precisely
the most content-rich sessions**, would have been silently absent from the vector index while it
looked populated. Every fixture test in U1.1–U1.3 passed at 2–3 texts and could never see it.

The `{written, skipped}` return added by this unit is the only reason this surfaced rather than
being reported as a completed backfill.

## How to verify (commands + expected)

- `node scripts/backfill-chunks.mjs --dry-run` → exit 0, `26 session(s) would produce 1452 chunk(s)`, no writes
- `pnpm --filter @lkb/ai test` → exit 0 (74 pass, incl. the 4 new batch-limit cases)
- `pnpm --filter @lkb/api test` → exit 0 (121 pass, incl. the 4 new return-contract cases)
- `pnpm -r typecheck` → exit 0
- each structure gate run **individually by exit code** (ISS-100: the `&&` chain short-circuits)
- live: `chunks` = 1452 rows / 26 distinct sessions / dims all 3072 / 0 dim mismatches / 0 dangling turnRefs

## Actual outputs (from maker's own run)

```
DRY RUN: 26 session(s) would produce 1452 chunk(s). No calls made, nothing written.

pnpm -r typecheck                 exit=0
pnpm -r test                      exit=0
@lkb/ai   tests 74  pass 74  fail 0
@lkb/api  tests 121 pass 121 fail 0

lint-loc exit=0        lint-dirsize exit=0     lint-root exit=0
lint-dupes exit=0      lint-migrations exit=0  snapshot --check exit=0
depcruise exit=0  (no dependency violations found, 277 modules, 844 dependencies)
tracker-audit g1 exit=1  ← PRE-EXISTING, NOT THIS UNIT (see below)
```

**Live corpus verification (C8 / ISS-113, discharged on real rows):**

```
total chunks: 1452
distinct sessions: 26   (sessions in db: 26)          ← C8(a) 26/26
dims values: [ 3072 ]   models: [ gemini-embedding-001 ]   tenants: [ toc ]
rows where vector.length != dims: 0                   ← C8(b)
distinct turnRefs: 2118 | resolving to real turns: 2118 | dangling: 0   ← C8(c)
rows with forbidden text field: 0                     ← ADR-0001
empty vectors (ISS-096 floor): 0
```

`1452` written equals `1452` planned by the dry run, and **2118 distinct turnRefs equals the exact
total turn count**, so every turn in the corpus is now reachable from the vector index.

## Disclosed — the checker should press on these

1. **`tracker-audit --gate g1` fails, and it is not mine.** `U2.4` carries the unknown status
   `"partial"` in `TASKS.md` at HEAD and diverges from `goal.json`'s `"pending"`. That row belongs
   to the concurrent `lane/a-speakers` (its unit is at fix cycle 3). I did not edit either tracker —
   `git status` shows neither `TASKS.md` nor my commit touching it. **This means `pnpm
   lint:structure` is red for everyone**, which is a definition-of-done gate. Filed, not fixed.
2. **`.goal/goal.json` and `qa/evidence/live-.../preflight.json` were already dirty at session
   start** and are not mine. Not committed, per the lane rule that a dirty file belongs to whoever
   is mid-unit on it.
3. **The second dirsize override raise in one day** (D-017 → D-018, 31 → 32). D-017 explicitly
   reserved a reviewer's right to reject the override and demand consolidation. I took the raise
   and said so in D-018 rather than burying it; a checker is entitled to reject it.
4. **The `--dry-run` count is a chunker plan, not an embedding guarantee** — it proves what *would*
   be sent, not that the provider accepts it. That is exactly the gap that hid the batch bug, so
   the dry run must never be cited as evidence the backfill will succeed.
5. **Cost:** 1452 real Gemini embedding calls' worth of text across 29 batched requests. Re-running
   the backfill is idempotent per session (delete-then-insert) but re-bills.

## Status: checked-PASS

**Verdict:** `qa/verdicts/chunk-backfill.md` — PASS, cycle 1, 8/8 criteria, `ISSUES-WRITTEN: none`
(committed `226fa06`). The checker reproduced every claim under its own instruments and, rather
than reading the new tests, **proved them by mutation**: raising `MAX_BATCH` kills 3 of the 4
Gemini tests and reversing the batch concatenation kills the 4th; nulling `skipped` kills 2
return-contract tests; swapping `scopedCollection` for the raw handle kills the tenant-scoping
test — so the extraction demonstrably preserves ISS-112 and ISS-060/3a. It wrote its own driver
probe over all 1452 rows and discharged **C8(a), which the preceding sweep had measured failing at
23/26**. ISS-116 and ISS-113 flipped to `fixed`.

**Rulings carried forward:**
- **D-018 accepted**, exercising the review right D-017 reserved — with a bound now recorded by the
  checker rather than merely intended by me: **a third raise must consolidate, not widen.**
- **ISS-117 confirmed genuinely pre-existing** (`"partial"` entered `TASKS.md` at `388edf0`; this
  unit's commit touches neither tracker), but the checker rightly pressed that a permanently-red
  definition-of-done gate deserves more urgency than its `medium` label, since `pnpm lint:structure`
  is red for *every* session until it closes.
- Three low notes recorded, not filed, per the severity gate: a dead `chunksColl` binding left at
  `apps/api/src/indexing.ts:157` by the extraction; the contract's stale ping-based Mongo
  disclosure; and this manifest citing C8 against `ingest-indexing-pipeline.md` when C8 actually
  lives in `schema-v2.md`. **The dead binding is cleaned up immediately** rather than deferred to
  "the next unit touching this file" — the checker's own standing point is that such a deferral,
  with no such unit scheduled, is how a defect becomes permanent.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
