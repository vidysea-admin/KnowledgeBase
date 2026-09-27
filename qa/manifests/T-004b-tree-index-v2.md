# Manifest — T-004b tree-index-v2

**Contract:** `qa/contracts/tree-index-v2.md`
**Goal task:** T-004b
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3

## What changed

1. **`packages/index/src/tree/extract-topics.ts` (new, 55 LOC) — C1.**
   `extractTopicRefs(sessionPage: SessionPages | null): string[]` — pure heuristic, no LLM,
   no network. Reads `summary` + `keyInsights` (T-002's real fields), extracts runs of 1-4
   capitalized words via regex, drops single-stopword matches, ranks by frequency (stable ties
   -> first-seen order), caps at 6 topics/session. Returns `[]` for a null page. Exported type
   `ExtractTopicRefs` is the injectable-seam type (same pattern as `Summarize` in build.ts).

2. **`packages/index/src/tree/build.ts` (extended, 72 -> 129 LOC) — C2.**
   `buildTree` gained a 4th optional param `extractFn: ExtractTopicRefs = extractTopicRefs`
   (default = the heuristic; existing 2-arg and 3-arg call sites are unaffected — this is a
   backward-compatible additive signature change). Added:
   - Pass 1 (new): builds a cross-session `topicSessionIds: Map<slug, Set<sessionId>>` by
     running `extractFn` over every session's page before the main per-session loop.
   - Per session: pushes `topic` child nodes under the session leaf (id
     `<sessionId>/topic:<slug>`, level `"topic"`, `evidence.sessionRef` = this session,
     `evidence.sessionRefs` = every session in this `buildTree` call that shares the topic —
     this is what proves cross-session grouping in C4).
   - Per session: pushes one `org` child node (id `<sessionId>/org:<slug>`, level `"org"`) when
     `session.org` is set, using the `orgs.schema.json` shape (tenant-scoped name).
   - New private `slugify()` helper for both topic and org node ids.
   **Existing T-004/T-016 exports and behavior are unchanged** — `Summarize`, `buildTree`'s
   first 2 params, `treeSearch` (search.ts untouched) all still work exactly as before. The 4
   original test cases in `tree.test.ts` pass **unmodified** (verified below) because they only
   assert on `tenant`/`year`/`month`/`session` nodes and session-level `evidence.sessionRef`,
   which the new topic/org children don't disturb.

3. **`schema/tree_index.schema.json` (extended) — required for C2/C4.**
   `level` enum extended from `["tenant","year","month","session","topic"]` to add `"org"`
   (topic was already allowed by T-004/T-018; org was not). This is the one schema touch the
   contract's "extend, don't replace" scope required — without it, org nodes can never validate
   against the tree_index shape, which C4 explicitly checks. `evidence`'s sub-schema had no
   `additionalProperties: false`, so `sessionRefs` (plural, array) needed no schema change to be
   allowed alongside the existing `sessionRef`.
   Regenerated `packages/core/src/generated/tree_index.ts` via `pnpm gen:types` (the only
   generated file that changed; `pnpm gen:types --check` is clean — see below).

4. **`packages/index/src/tree/regenerate.ts` (new, 56 LOC) — C3.**
   `regenerate(tree: TreeIndexNode, changedSessionIds: string[], sessions: Sessions[], sessionPages: SessionPages[], extractFn = extractTopicRefs): TreeIndexNode`.
   `tree` is **one tenant's root** (matches `search.ts`'s existing "operate on one root"
   convention, since `buildTree`'s output is `Record<tenantId, TreeIndexNode>`). Algorithm:
   finds which **years** contain a changed session (from the full current `sessions` array, so a
   session that moved year is handled), rebuilds only those year subtrees via `buildTree` scoped
   to sessions in the touched years, and **reuses the exact object references** for every
   untouched year node from the input tree — so an untouched year is `===` to the input, not
   just deep-equal. Two scope notes documented in the file's header comment (not required by the
   contract, flagged for honesty): (a) a session whose `date` changes to a different year leaves
   its old-year node only cleaned up if that old year also has another changed session in it —
   this is an incremental heuristic, not a full diff; (b) cross-session topic evidence inside a
   regenerated year subtree is computed only from sessions in the touched years, so a topic
   shared with an untouched year won't pick up a same-topic edit there until that year is itself
   touched. Both are acceptable for the same-year-edited-repeatedly hot path this targets, and
   neither breaks the contract's actual C3 requirement (untouched subtrees stay identical).

5. **`packages/index/src/tree/tree-real-data.test.ts` (new, 86 LOC) — C4.**
   Loads all 23 `data/toc-migrated/*/session.json` + `session_page.json` via `node:fs` (no
   network, no fixtures), builds a real tree with `buildTree`'s default heuristic extractor, and
   asserts: exactly 23 `session`-level nodes; at least one `topic`-level node whose
   `evidence.sessionRefs` has length > 1 (cross-session grouping proof); and every node in the
   tree passes a small hand-rolled recursive shape check
   (`node_id`/`title` non-empty strings, `level` in the schema's enum incl. the new `"org"`,
   `summary` a string, `children` an array, recursive) mirroring `schema/tree_index.schema.json`.
   **No new dependency was added** — confirmed no `ajv` (or any JSON-Schema validator) is
   present anywhere in `node_modules` (`node -e "require.resolve('ajv')"` fails), and
   `json-schema-to-typescript` (already a devDependency, used only by `gen-types.mjs`) does not
   expose a runtime validator either — so a small in-file structural check was used instead of
   adding a library, exactly as the contract allows ("check what's already available before
   adding a new schema validator dependency").

6. **`packages/index/src/tree/regenerate.test.ts` (new, 81 LOC) — exercises C3.**
   Three cases: (a) the touched year is actually rebuilt with the changed session's new data;
   (b) with two sessions in two different years, the untouched year's subtree is both `===` and
   deep-equal to the input, and the touched year reflects the change; (c) `changedSessionIds`
   that don't match anything in this tenant's tree returns the exact same tree reference
   (no-op fast path).

7. **`packages/index/src/index.ts` (extended).** Added barrel exports for `extractTopicRefs`,
   `ExtractTopicRefs`, and `regenerate` alongside the existing `buildTree`/`Summarize`/
   `treeSearch` exports (none removed, none renamed).

## Real cross-session topic found on T-002's actual 23 sessions

The heuristic naturally picks up **"New Zealand"** as a shared topic between
`2026-04-21-visa-blueprint-part2-italy-france-nz` (multiple `keyInsights` mention "New
Zealand") and `2026-07-30-in-focus-3` (`"Estero's cited New Zealand visa approval rate: ~92%
average over the last 15 years."`) — the C4 test's cross-session assertion passes on this real
pair, not a synthetic one.

## How to verify (exact commands + actual output)

### C1 + C2 + real T-002 data run (all tree tests, includes C4)
```
pnpm --filter @lkb/index test
```
Actual output:
```
> @lkb/index@0.0.0 test D:\KnowledgeBase\packages\index
> node --test --import tsx "src/**/*.test.ts"

✔ regenerate rebuilds the touched year to reflect the session change (2.847ms)
✔ regenerate keeps an untouched year's subtree === to the input (different years) (0.9091ms)
✔ regenerate is a no-op when changedSessionIds don't touch this tenant's tree (0.3084ms)
✔ real T-002 data: 23 session leaves, cross-session topic, schema-valid shape (19.7073ms)
✔ grouping and nesting (2.2971ms)
✔ evidence on every session node (0.277ms)
✔ tree_search known and unknown (0.2456ms)
✔ summarize injection and fallback (0.3484ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 469.616
```
`grouping and nesting`, `evidence on every session node`, `tree_search known and unknown`, and
`summarize injection and fallback` are T-004's/T-016's **original, unmodified** 4 test cases
(file `tree.test.ts` was not touched) — all still pass, proving C2's "additive, no regression"
requirement.

### C3 (regenerate) — included above; isolated run
```
node --test --import tsx packages/index/src/tree/regenerate.test.ts
```
(same 3 passes as shown in the combined run above.)

### C4 real-data assertions, in detail (from `tree-real-data.test.ts`)
- `sessions.length === 23` — actual: 23 (loaded from `data/toc-migrated/*/session.json`)
- `pages.length === 23` — actual: 23
- `allSessionLevelNodes.length === 23` — actual: 23 session-level nodes in the built tree
- `crossSessionTopics.length > 0` — actual: >= 1 (the "New Zealand" topic node described above
  is one concrete member of this set; `evidence.sessionRefs` on it has length 2)
- every node (root through every topic/org/session/month/year/tenant node) passed
  `assertValidNode` (node_id non-empty string, title non-empty string, level in
  `{tenant,year,month,session,topic,org}`, summary is a string, children is an array,
  recursively) — 0 assertion failures, test passed.

### C5 — no regression, full sweep
```
pnpm -r typecheck
```
Actual: `Scope: 9 of 10 workspace projects` — every package (`core`, `ai`, `db`, `index`, `ask`,
`ingest`, `apps/api`, `meeting-bot`) reported `typecheck: Done`, 0 errors.

```
pnpm -r test
```
Actual: every workspace package's test run passed — `packages/index` 8/8, `packages/ai` 23/23,
`packages/ingest` 15/15, `packages/ask` 18/18, `apps/api` 8/8, `packages/meeting-bot` 19/19.
0 failures anywhere in the monorepo.

```
pnpm gen:types --check
```
Actual:
```
> living-knowledge-base@0.0.0 gen:types D:\KnowledgeBase
> node scripts/gen-types.mjs "--check"

OK: 19 generated type file(s) + index.ts match schema/
```

```
python schema/validate.py
```
Actual: `PASS: 19 collection schema(s) validated correctly.` (all 19 collections, including the
now-extended `tree_index`, `OK`).

```
pnpm lint:structure
```
Actual:
```
lint-loc: OK (106 file(s) within budget)
lint-dirsize: OK (54 dir(s) within budget)
lint-root: OK (13 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (148 unique export(s), 19 unique schema $id(s))
lint-migrations: OK (636 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (107 lines, budget 200)

✔ no dependency violations found (117 modules, 309 dependencies cruised)
```

### LOC budget check (structure.config.json: max 300 non-test, 400 test)
```
build.ts            129
extract-topics.ts     55
regenerate.ts         56
regenerate.test.ts    81
tree-real-data.test.ts 86
```
All well under budget; no `structure.config.json` changes were needed or made.

## Files touched (staged narrowly, no `git add -A`)
- Modified: `packages/core/src/generated/tree_index.ts` (regenerated), `packages/index/src/index.ts`,
  `packages/index/src/tree/build.ts`, `schema/tree_index.schema.json`
- Added: `packages/index/src/tree/extract-topics.ts`, `packages/index/src/tree/regenerate.ts`,
  `packages/index/src/tree/regenerate.test.ts`, `packages/index/src/tree/tree-real-data.test.ts`
- **Not staged** (per instruction): `.goal/goal.json`, `qa/.last-tick`

## Criteria coverage
- C1 (topic/org extraction, real output not stub): **met**
- C2 (tree gains topic/org levels, additive, existing tests pass unmodified): **met**
- C3 (`regenerate`, incremental, untouched subtrees preserved): **met**, with two documented
  scope limitations (year-move cleanup, cross-year topic-evidence refresh) that don't violate
  the contract's literal requirement but are disclosed for the checker's judgment
- C4 (real integration test, 23 leaves, cross-session topic, schema-shape valid): **met**
- C5 (no regression across typecheck/test/gen:types/schema validate/lint:structure): **met**

## Status: checked-PASS
Verdict: qa/verdicts/T-004b-tree-index-v2.md (Cycle checked: 1, commit 15e4ecf) — 5/5 criteria met; NZ cross-session claim independently confirmed; follow-up T-004c logged.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
