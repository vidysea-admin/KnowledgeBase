# Contract — schema-v2 (T-018)

> Ground truth for the second-generation Mongo schema, per plan §6d ("schema is not final until
> T-018 PASSes — bounded web research first, recorded as docs/adr/0001-schema-v2.md") and D-008
> (provided-first capture, gated purge, evidence clips). Drafted by the maker; /checker adopts or
> amends on first check (pattern established by T-016/T-017/T-017b).

## Scope
Research-then-build. (1) A bounded comparison of MongoDB multi-tenant + provenance schema patterns
against 2–3 real open-source data models in the same problem space, written up as
`docs/adr/0001-schema-v2.md` (≤60 lines) BEFORE any schema file changes. (2) camelCase evidence
keys across the 4 knowledge-layer schemas. (3) New collections: `programs`, `media` (with
`retention`, `kind` incl. `evidence-clip`), `chunks`, `graph_edges`, `jobs`, `tenants`, `api_keys`,
`consent_policies`. (4) `sources.captureMode` field (D-008: `provided|public|notes|silent`). (5) A
real migration tool (migrate-mongo) with a baseline migration, replacing the current
JSON-Schema-files-only approach with schema + migrations working together. (6) `packages/db`
collection accessors enforcing `coll(tenantId)`.

## Criteria (each machine-checkable)

1. **ADR exists first, git-log-provably before the schema changes.** `docs/adr/0001-schema-v2.md`
   (≤60 lines) cites ≥2 real external sources (Vexa's transcript/segment model, Onyx's
   document/chunk/connector model, or an equivalent — actual repo/doc URLs, not invented) plus the
   already-adopted brain patterns (`pageindex-multi-source-merge`, `vectorless-rag`), and states a
   decision for: (a) evidence-key casing, (b) whether `media`/`chunks` reference `turns` by id only
   or duplicate text, (c) tenancy enforcement mechanism. The manifest's git log shows this file
   committed in an earlier commit than any `schema/*.schema.json` diff in this unit.
2. **camelCase evidence keys.** `session_pages`, `claims`, `speakers`, `decisions` schemas use
   `evidence[].turnId` / `evidence[].sessionId` (not `turn_id`/`session_id`); `schema/validate.py`
   fixtures updated to match; `packages/core/src/generated/*.ts` regenerated (`pnpm gen:types
   --check` clean). **This is the one intentional breaking change** (plan §6c.1) — grep-checkable
   that no schema file still declares `turn_id`/`session_id` as a property name.
3. **8 new collection schemas** (`programs`, `media`, `chunks`, `graph_edges`, `jobs`, `tenants`,
   `api_keys`, `consent_policies`) each with `required: tenantId` (except `tenants` itself, whose
   PK is the tenant), fixtures (valid+invalid), and pass `schema/validate.py`. `media` schema
   requires `retention` (object: `{purgeAfterVerified: bool}` per D-008) and `kind` enum including
   `evidence-clip`. `sources` schema gains `captureMode` enum `{provided, public, notes, silent}`,
   required.
4. **`schema/index.json`** declares the Mongo indexes per collection (at minimum: every collection
   leads with `tenantId`; `turns.sessionId`; `claims.status`; `jobs.status`+`jobs.createdAt`).
5. **`migrate-mongo` installed and configured** (`migrate-mongo-config.cjs` or `.js`,
   `migrations/` dir per ARCHITECTURE §4); one baseline migration
   (`migrations/<timestamp>-baseline.js`) that creates the 18 collections (10 existing + 8 new)
   and applies `schema/index.json`'s indexes. `npx migrate-mongo status` shows the baseline as the
   only migration, pending (no live Mongo required to PASS this criterion — `status` against a
   `MONGODB_URL` pointed at a local/ephemeral instance, OR a dry-run mode if no Mongo is reachable
   in this environment; the manifest states which and why).
6. **`packages/db` accessors.** `packages/db/src/collections/<coll>.ts` for at least `sources`,
   `sessions`, `turns`, `claims` (the 4 most load-bearing) exporting `coll(tenantId): Collection`-
   shaped functions whose TS signature makes a tenant-less call a compile error (verified by a
   `// @ts-expect-error` test line that fails to compile without the tenantId argument).
   `pnpm -r typecheck` clean.
7. **No regression:** `python schema/validate.py` exits 0 for all 18 schemas; `pnpm gen:types
   --check` clean; `pnpm -r test` still 4/4 (tree) + 6/6 (ask); `pnpm lint:structure` clean
   (including the new files' LOC/dir budgets).

8. **`chunks` rows carry a usable embedding — enforced at WRITE time, checked at U1.3.** (Added by
   amendment 2026-09-08 after the `chunk-schema-and-chunker` cycle-1 check, which ruled the
   U1.2/U1.3 split correct *on condition that the deferred checks be recorded on disk rather than
   left in a manifest's prose*.) `schema/chunks.schema.json` alone cannot close this: the checker
   verified that `vector` and `dims` are **optional and uncorrelated** — a row with no `vector` at
   all validates, and `{"vector": [0.1, 0.2, 0.3], "dims": 99}` validates. That is correct at U1.2,
   where the chunker emits plans and no writer exists; it is the ISS-096 failure mode again at U1.3,
   where a row with no vector or a lying `dims` would validate and then silently match nothing.
   So the unit that wires `embed()` into `apps/api/src/indexing.ts` MUST evidence, over real rows:
   (a) `chunks` non-empty for all 26 sessions; (b) `vector.length === dims` for **100%** of rows,
   asserted in the write path (JSON Schema cannot express a cross-field length equality);
   (c) every `turnRefs` id resolves to an existing `turns` row. (a) and (b) are plan §10 U1.2's own
   verification clauses, carried forward — not dropped.

   Also recorded so it is not re-litigated from the plan text: **plan §10 U1.2's `text` field on
   `chunks` is STRUCK.** ADR-0001 decision 2 ("`media`/`chunks` reference `turns` by id only — never
   duplicate text") governs, and plan §6c.1 already agreed with it. The checker verified that a
   chunk's text is a byte-exact function of its `turnRefs` (`text === turns.map(trim).join(" ")`,
   0 violations over 3024 generated shapes), so storing it would be pure duplication carrying a
   drift hazard against ARCHITECTURE H3 and a second surface for D-008's gated purge. The stored
   `vector` is **not** covered by that prohibition: it is an irreversible derived numeric artifact,
   not a second copy of the source, and brute-force cosine (D-a) cannot read the retired
   `embeddingRef` string pointer.

## Non-goals for T-018
- No live Mongo connection wired into the app (T-019/T-020 use it). No provider code. No API
  routes. No actual data migration of the 23 TOC sessions (T-002).

## Amendment log
- 2026-09-08 · routine · added C8 (`chunks` rows carry a usable embedding; the `text` field struck)
  after the `chunk-schema-and-chunker` cycle-1 check · TIGHTENING ONLY, nothing weakened. Two parts,
  each recording something the checker verified itself rather than something it was told: (i) the
  U1.2/U1.3 split was ruled correct *conditionally* — the two row-level checks plan §10 U1.2 asks for
  ("chunks non-empty for all 26 sessions", "vector.length === dims for 100% of rows") are impossible
  before U1.3's writer exists, but a criterion left in a manifest's prose is a criterion on its way to
  being lost, so they are bound here to the unit that wires embed() into indexing.ts, together with a
  gap the checker found while probing the schema directly (vector/dims are optional and uncorrelated,
  so a row with no vector, or with a dims that disagrees with vector.length, validates cleanly);
  (ii) plan §10 U1.2's `text` field is struck in favour of ADR-0001 decision 2, recorded here so
  U1.4/U1.5 cannot re-litigate it from the plan text.
- 2026-09-22 · routine (record lesson) · **generated input space** (inbox 2026-09-08, chunker
  cycle 1): hand-picked fixtures verify the shapes the author already imagined; the defects live
  in the shapes they did not. Any function with a branchy accumulation loop needs a GENERATED
  input space, not examples — `buildChunks` now carries its own 45-shape fuzz, which immediately
  caught a third bug (an 802-char chunk against an 800 ceiling). Same treatment owed to any
  future accumulation loop (U1.4's top-k merge, U1.5's reciprocal-rank fusion) ·
  qa/feedback-inbox.md, folded by Mode B sweep
