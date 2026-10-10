# Manifest: medium-fix-batch-2026-10-10

**Lane:** MEDFIX (`lane/medfix`, from 8c8429d). **Tier:** 3/4 mixed batch of audit-classed small MEDIUM issues.
**Ceremony:** ISS-155 is tenancy-adjacent (security class, full care); the rest are light ceremony (medium, no auth/tenancy/data-write change).
**Commits (one per issue):** ISS-171 d27f0ba | ISS-155 de0154c | ISS-145+ISS-146 31a081c (same two files, one commit). The ISS-369 commit 5e7b1c0 was reverted in 4bd9bd8 and is not part of this unit.
**New ledger row:** ISS-MEDFIX-001 in `qa/issues.medfix.jsonl`.
**Toolchain:** worktree node_modules junctions created for root, apps/*, packages/* (main-tree source resolves via them). No DB, network, browser, full suite or build was run; `backfill.mjs` was only `node --check`ed, never executed.

## ISS-155 (security class) - FIXED (dry-run); non-dry-run path checked
- Reproduced: yes. `scripts/backfill.mjs` dry run printed `topic ${t._id}` (bare slug off `promoteTreeEntities`).
- **Non-dry-run finding (explicit):** the live path calls `promoteAndPersistEntities`, which writes `entityId(tenantId, slug)` for topics AND orgs and namespaces the claim `topicRefs`. It does NOT write un-namespaced ids. No data-write defect; nothing run against any DB. Only the preview was wrong.
- Fix: new exported `topicPreviewLine(tenantId, t)` in `apps/api/src/indexing/promote-entities.ts` (uses the existing `entityId`); backfill dry run prints it. Files: promote-entities.ts, promote-entities.test.ts, scripts/backfill.mjs.
- D-015: ISS-155: 1/1 recorded reproductions (bare `uk` previewed vs `<tenant>:uk` written; replayed with slug `uk`, tenant `toc`). The row's second item (no `tagClaims`) is deliberately left open and filed as ISS-MEDFIX-001. The row's third item (no test of the sub-command) is only partly met: the preview line is tested; the script's DB path is not executed.
- Tests: `node --test --import tsx src/indexing/promote-entities.test.ts` in apps/api: pass 20, fail 0 (includes the ISS-155 test). `node --check scripts/backfill.mjs`: ok. `tsc --noEmit -p apps/api`: no errors.

## ISS-171 - FIXED (test only)
- Reproduced: yes (the gap): removing the two `seen` lines left the suite green before this test.
- Fix: `apps/api/src/ask-arms.test.ts` new test, 3 turns of s1 + 1 of s2, query "visas?" -> arm is exactly `[s1 node]`.
- Mutation: deleting both `seen` lines -> `pass 11 / fail 1` (the new test); restored, `git hash-object` equals `HEAD:` blob (542cf75).
- D-015: ISS-171: 1/1 (the row's single case: 3 turns, same session, node once).
- Tests: `node --test --import tsx src/ask-arms.test.ts` (apps/api): pass 12, fail 0.
- Round cap: ask-arms.ts has one non-security PASS in qa/verdicts (hybrid-merge touches merge.ts; hybrid-arms-binding is tenancy). Cap not hit. Production code unchanged.

## ISS-T057-B8-KNOWLEDGE-EXPLORER-004 - SKIPPED
- The stale decoder line is in `apps/api/src/routes/ask/ask.test.ts` line 74 (`JSON.parse(...).context;` expects an array; the row's path `routes/ask.test.ts` has since moved). `apps/api/src/routes/` is off limits to this lane (other lanes edit it). Producer confirmed read-only: `packages/ask/src/bounded-refine.ts` exports `PackedContext` (`{sources, strips}`) with `unpackContext`. The fix is ready for whoever owns routes/: use `.context.sources` (as WIP commit ae41401 did on another branch). Not reproduced by running (routes/ off limits and test not run). D-015: n/a, not attempted.

## ISS-145 and ISS-146 - FIXED
- Reproduced: both yes (no `parseGate`/all-lane caller existed; the only call site passed `'speaker'`).
- Fix in `scripts/lib/id-divergence.mjs`: `parseGateMapping(text)` (reads the "### The mapping, complete" table) and `deriveAllDivergence(root)` (no lane filter). Tests added in `id-divergence.test.mjs`. No other callers existed; no new file (dirsize unchanged).
- ISS-145: the gate table (12 rows) equals `deriveDivergence(speaker)`; a corrupted copy (ISS-093 -> ISS-111) is detected. D-015: ISS-145: 1/1 (the row's drift scenario).
- ISS-146: injected test shows two non-speaker lanes' commits are swept with an empty pattern; real repo: all-lane sweep returns 16 rows = the 12 speaker rows + 4 other (ISS-360->ISS-360-HEARTBEAT, ISS-308->ISS-311, ISS-309->ISS-312, ISS-113 absent). D-015: ISS-146: 1/1. Those 4 rows are newly visible divergence; nothing was renumbered (D-019).
- Tests: `node --test scripts/lib/id-divergence.test.mjs`: pass 13, fail 0. Note: the real-repo all-lane test walks ~225 commits via git and took ~86 s on this loaded machine; a candidate for a cheaper pin if it slows the suite.

## ISS-369 - WITHDRAWN, still open (commit 5e7b1c0 reverted in 4bd9bd8)
- Cycle 0 mapped the legacy status `reset-awaiting-rebuild` to `paused` in two manifests. The checker rejected that: the handshake-liveness contract (section 4.2) maps it to `building`, and `paused` would hide an owed rebuild from the backlog.
- The commit is reverted in full; both manifests are byte-identical to their state before it. Nothing in this unit fixes ISS-369 and no D-015 count is claimed for it.
- The correct fix needs `building` in the readers' vocabulary (a reader unit) or an Approver ruling. ISS-369 stays open in the ledger.

## Gates
- `node scripts/lint-dirsize.mjs` before: OK (109 dir(s) within budget); after: OK (109 dir(s) within budget).

**Status:** ready-for-check
**Fix cycle:** 2

## Fix cycle 1 (2026-10-10)

Cycle 0 verdict: FAIL, on the ISS-369 commit only (5e7b1c0). The checker ruled the `paused` mapping wrong: the handshake-liveness contract (section 4.2) maps `reset-awaiting-rebuild` to `building`, and `paused` would hide an owed rebuild from the backlog. `building` is not yet in the readers' vocabulary, so the correct fix waits on the reader unit or an Approver ruling.

Fix: the ISS-369 commit is reverted in full (git revert of 5e7b1c0); the two manifests it touched are back to their previous text. ISS-369 stays open and is NOT claimed by this unit any more. No other commit changed: de0154c (ISS-155), d27f0ba (ISS-171) and 31a081c (ISS-145, ISS-146) stand as checked at cycle 0. Revert applied by the orchestrator on the maker's behalf.

## Fix cycle 2 (2026-10-10)

Cycle 1 verdict: FAIL on the manifest text only: the body still listed ISS-369 among the commits and kept its "FIXED" section. Fixed here: the Commits line and the ISS-369 section now say withdrawn and still open. No source, test or other manifest changed since cycle 0.
