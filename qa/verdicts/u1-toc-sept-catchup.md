# Verdict — u1-toc-sept-catchup

**Date:** 2026-09-25
**Cycle checked:** 0
**Checker:** fresh Claude subagent (claude-sonnet-subagent), Mode A unit check
**Bound root:** D:/KnowledgeBase-lanes/u1-toc-sept-catchup (branch wave/u1-toc-sept-catchup, HEAD 5760f5e — matched at check start)
**Executor (manifest):** claude-sonnet-subagent — self != executor confirmed (this checker runs under no `ANTHROPIC_BASE_URL` override)

## What I re-ran myself (no pasted output trusted)

1. **`git diff 29696ea..HEAD --stat` + full diff** of the 3 code files — matches the manifest's
   "What changed" exactly: `scripts/seed-toc.mjs` (additive `--sessions` filter, exact-match via
   `Array.includes`, default path unchanged when absent), `packages/ai/src/stt/gemini-file-upload.ts`
   (single-char `>` → `>=`), its test file (+1 boundary test). 25 files, +12803/-3, all under the
   claimed "What changed" list — no untouched-file surprises, no deleted functions/tests.
2. **`pnpm --filter @lkb/ai test`** (after `pnpm install --frozen-lockfile` — the worktree had no
   `node_modules`, install took 8s from the local pnpm store, no network) — **75/75 pass**, matches
   manifest exactly, including the new boundary test.
3. **`pnpm -r typecheck`** across all 10 workspace projects — clean, no errors.
4. **`pnpm gen:types --check`** — `OK: 24 generated type file(s) + index.ts match schema/`.
5. **`python schema/validate.py`** — `PASS: 24 collection schema(s) validated correctly.`
6. **`python D:/ai_os/.claude/skills/_shared_validation/data_boundary.py <root>`** — `data-boundary OK`.
7. **Schema-shape check** (`validate-toc-migration.py`, grep-filtered per the manifest's own recipe)
   for the 4 new sessions — no output, as expected.
8. **Gap-free turn counts** for all 4 sessions — `150 257 396 553`, exact match.
9. **Corpus-wide garbled-speakerRef scan (≥55 chars)** — `0`, exact match. Inspected `t280` directly:
   `speakerRef: "Anuradha"`, `text` = the garbled fragment prepended to the original sentence —
   matches exactly what the fixed parser produces (independently confirmed via the mutation test
   below).
10. **C3-staleness claim** — reproduced on base `29696ea` in a throwaway worktree (removed after):
    2030 `speakerRef must be 'unknown'` lines / 2062 total, pre-existing. At HEAD: 3386/3418 — the
    delta (1356 speakerRef lines, 0 other) equals exactly this unit's own new turn count
    (150+257+396+553). Confirms: pre-existing staleness class, this unit adds only its own share,
    never a new failure class.
11. **ffprobe real durations** on all 4 gitignored audio files in the main tree — 4342.8s, 4372.7s,
    3974.9s, 4318.7s — match the manifest's claimed real durations (4343/4373/3975/4319s) exactly.
12. **Spot-read 3 random turns per session** (seeded sample) — plausible, on-topic, monotonic
    timestamps. Found one data-quality nuance not in the manifest — see ISS-U1-3 below.
13. **Mongo, read-only, tenant `toc`** (via a checker-authored script using `createRequire` +
    `tsx/esm/api` register, main-tree `.env` parsed manually so the connection string is never
    printed): scoped counts **sources 4, sessions 4, turns 1356, session_pages 4, claims 454,
    chunks 687** — exact match to the manifest, including the `-src` id-suffix convention for
    `sources._id`. Whole-tenant totals **31/31/3554/29/601/2204** match the claimed before/after
    deltas. `tree_index` doc contains all 4 sessionIds. **No duplicate `_id`s** (each of the 4
    `sources`/`sessions` ids counts exactly 1). **No cross-tenant writes** (0 rows under any
    tenant other than `toc` for these ids). **6 pre-existing sessions sampled** (turn counts
    compared local-file vs Mongo): `83/83, 83/83, 8/8, 69/69, 80/80, 56/56` — all 27 pre-existing
    sessions' rows are untouched.
14. **Idempotence review** (code, not a live re-run — a non-idempotent write must not be executed
    live per the dispatch): `seed-toc.mjs` uses `insertOne` with no upsert throughout (T-002
    lineage, unmodified by this unit). A second run over an already-seeded id **throws** on the
    duplicate `_id` rather than silently double-inserting — fails safe, not idempotent-by-design,
    exactly as the manifest itself discloses. Not run live.
15. **Capability coverage rows 1 and 2 — independently re-falsified by the checker**, in a
    throwaway copy (`robocopy` excluding `.git`/`node_modules`, node_modules re-attached via
    Windows junctions to the real worktree dirs, so no reinstall needed), **never the bound tree**:
    - Row 1 (`--sessions` scoping): green before (`1 session(s) (--sessions scoped)`, `turns: 51`)
      → mutant `if (ONLY_SESSIONS)` → `if (false && ONLY_SESSIONS)` → red (`28 session(s)`,
      `turns: 3386`, the guard's own log line kept saying "scoped" while silently no-op'd) →
      restored, `cmp` byte-identical, green again. **COVERED**, independently reproduced.
    - Row 2 (ISS-U1-1 boundary): green before (75/75) → mutant `>=` → `>` → red (the exact named
      assertion failed: `'through any of the three intakes...' !== 'Anuradha'`) → restored, `cmp`
      byte-identical, green again (75/75). **COVERED**, independently reproduced.
    - Rows 3–5 (gap-free guard, tenant scoping, search reachability): the manifest marks these
      "NO ISOLATING FALSIFICATION" / "UNVERIFIED by falsification" with a stated reason (pre-
      existing, unmodified code this unit didn't touch) plus live evidence instead. Accepted as
      adequately justified disclosure, not unenumerated claims — consistent with this codebase's
      own established pattern for non-falsifiable capabilities.
    - Bound worktree confirmed byte-identical / untouched throughout (`diff` against the copy
      after restore, for both mutated files).
16. **Search reachability — checker's own 2 `askV2` calls** (the sanctioned "at most 2 cheap
    retrieval queries" exception), same production binding as the manifest
    (`buildProductionDeps().ask` from `apps/api/src/production.ts`):
    - Japan session: **HIT** — `verdict: correct`, `citedSessionRefs: ["2026-09-21-uniaccess-japan"]`.
      Matches the manifest's own claim.
    - India Test Series Part II: **MISS** — a differently-worded-but-similar query ("...like JEE
      and NEET?") returned `internalSourceCount: 1`, citing the OLDER, pre-existing
      `2026-06-19-entrance-exams-pathways-india-part1` instead of the target session. See ISS-U1-4.

## PROCESS BREACH (dispatch item 5)

Verified: `git -C D:/KnowledgeBase status --short` at check time is **byte-for-byte the same** as
the pre-unit gitStatus snapshot (`M .goal/goal.json`, `M qa/.last-tick`, `?? .codex/`,
`?? qa/.paused.lifted-2026-09-24`, `?? qa/manifests/u2-4-phase3-precision-regate.md` — all
attributable to other concurrent lanes, none to u1). `git -C D:/KnowledgeBase log -3` shows no
commit touching `data/toc-migrated/2026-09-*`. `data/toc-migrated/` in the main tree has **no**
leftover `2026-09-(02|09|16|21)` directories. `git log --all --oneline -- data/toc-migrated/
2026-09-02-india-test-series-part2` shows only this worktree's own commit. **Main tree lost
nothing.** The breach itself (tracked edits + directory creation in the MAIN tree, then
`git checkout --`/`rm -rf` cleanup there) is real, self-disclosed, and a genuine violation of the
project-binding rule — filed as **ISS-U1-2, severity medium** (same hazard class and severity as
today's `ISS-T-033-1`; "no damage shipped" keeps it a process finding, not a shipped defect, but
it is *worse in kind* than ISS-T-033-1 because it happened outside the bound root entirely, with
other lanes concurrently active in sibling worktrees off the same main tree).

## Findings

- **ISS-U1-2** (medium, process) — main-tree process breach, see above. No damage found.
- **ISS-U1-3** (medium, data quality) — the manifest's "one-time, one-turn occurrence" framing for
  the garbled-marker phenomenon undercounts it: 10 turns (not 1) in the psychology session carry
  an embedded `[MM:SS] Anuradha:` fragment inside `text` — only 1 of the 10 (t280) crossed the
  60-char threshold into an actual speakerRef misattribution. speakerRef stays correct in all 10;
  this is cosmetic transcript noise, not a gap or misattribution, but the disclosure undercounts
  the underlying phenomenon's scope.
- **ISS-U1-4** (medium, retrieval quality) — India Test Series Part II session is correctly
  ingested/chunked/tree-indexed, but a checker-authored rephrasing of the manifest's own query
  missed it, citing an older similarly-topical session instead. Not a data-loss/scoping defect.

None of the three reach the project's tenancy/data-write full-ceremony trigger (that category is
independently clean — see item 13 above) and none clear the >80% "defend as a criterion FAILURE"
bar on their own: the underlying infrastructure (data written, scoped correctly, indexed,
retrievable via at least one real query per session) is sound in all three cases.

## VERDICT: PASS

SCOREBOARD: 9/9 how-to-verify checks confirmed (1 — default-scan dry-run row — confirmed via
equivalent live-Mongo evidence rather than a byte-identical re-run, since the worktree's branch
point predates 3 of the main tree's later merges; 1 — search reachability — confirmed for 2/2
sessions checked, with a caveat on query-phrasing sensitivity for a 3rd, untested-by-checker
session), 4/4 invariants hold (tenant scoping, no dupes, no cross-tenant writes, pre-existing data
untouched).
FAILURES: none.
CAPABILITY-COVERAGE: 2/5 rows independently re-falsified by the checker (COVERED); 3/5 rows
justified-disclosed non-falsifiable pre-existing code paths (accepted, not unverified debt).
LIVE-BROWSER: not-applicable — no `apps/web` or `apps/api` route file changed. Changed paths:
`data/toc-migrated/**` (data only), `scripts/seed-toc.mjs` (additive CLI flag), `packages/ai/src/
stt/gemini-file-upload.ts` + its test (shared-library bugfix, no UI surface).
ISSUES-WRITTEN: ISS-U1-2, ISS-U1-3, ISS-U1-4
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every hard-line criterion — tenancy scoping, no duplicate writes, no cross-tenant
leakage, pre-existing data integrity, no-regression suite, diff-scope discipline, additive/
backward-compatible CLI flag, the ISS-U1-1 boundary fix and its hand-repair — was independently
re-derived, not trusted from the manifest's pasted output, and all held. The process breach (main
tree touched then cleaned) is real and filed at medium severity per precedent (ISS-T-033-1); no
damage resulted. Two medium data/retrieval-quality observations (ISS-U1-3, ISS-U1-4) are
disclosed for the backlog; neither indicates lost or misattributed data. The maker's own
`qa/issues.u1.jsonl` entry pre-set `verified_date` on ISS-U1-1, which is procedurally the
checker's call, not the maker's — noted here rather than filed, since this check's own
independent mutation-reproduction of that exact fix is what makes "verified" actually true now.
