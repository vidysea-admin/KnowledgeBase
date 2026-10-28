# Verdict (coordinator B, repair checker) — ask-fast-rag, cycle 1
Cycle checked: 1
Judged head: 6a9dbfc8 (product files == bd6af83b). Repair base feee65eb (verified ancestor of HEAD). Unit base 10635a57 (merge-base with docs/devops-golive-2026-10-26).
Policy-Version: proportional-verification/2026-10-19.17

## Check plan (step 0)
Signals: logic changed (retrieval arm, cited-only sources, guarded diagnosis), tenancy-scoped retrieval (L, dual: packages/ask/src/ask-graph.ts:93).
Scope: failed C1 + regression usage.test.ts:110 + every criterion whose input files the repair diff touches (C7 via answer-workflow.ts/answer.ts/ask-v2.ts; C4/I1 via the new tree arm). Repair diff read in full (12 files); whole-unit diff (23 files) scanned for out-of-scope paths. No live calls, no DB, no .env.

## Findings per repaired item
- **C1 / F1 PASS.** Default path now feeds `treeLexicalIds` (apps/api/src/ask/passage-lexical.ts:83-98, non-LLM, lexical scorer only) through `deps.treeSearchFn` into the existing `gatherCandidates` (membership guard ask-graph.ts:91-93 and :101-103, SOURCE_LIMITS, hydrate). vertical.test.ts 4/4 and message-vertical.test.ts 4/4 on the default path, no `mode:"deep"` knob (vertical.test.ts keeps one added deep case). LLM calls stay [ask.answer, ask.answer_grounding].
- **Regression usage.test.ts:110 / F2 PASS.** usage.test.ts 14/14, file untouched by the repair (and by the unit).
- **C7 / F4 PASS.** `answer()` reports kept-sentence citations via additive `options.onCited` (answer.ts:82); `askFastV2` narrows `sources.internal`/`web` to cited ones (ask-v2.ts:86-94). packages/ask answer.test.ts (key pin) 6/6; answer-fast.test.ts 10/10 incl. [F4], [F3], [C7] x3. F3 guard (answer-workflow.ts:147-151) verified by [F3] in both modes.
- **Existing assertion edit (ask-fast.test.ts [C1], internal length 2 -> 1): correct behaviour change, not a protected weakening.** The old value pinned "every retrieved chunk is shipped" while the answer cited one, which is the defect F4 fixes (uncited chunks reached the verifier and wiped valid sources, contract C7). The new assertion is strictly stronger: length 1 AND `node_id === nodeA.node_id`, plus a new [F4] test pinning the cited second chunk. Response shape (C3) unchanged. Falsification below turns both red.
- **Tenant isolation of the new arm (C4/I1) PASS.** `treeLexicalIds` walks only the tree passed in (the tenant tree, already session-filtered by `filteredTree` in answer-workflow.ts:79-90, which prunes sessionId-excluded and ref-less content nodes). The ids go through `treeSearchFn(tree, ids)` and then `gatherCandidates`' tree-membership resolve, so only that tenant's own node object reaches `hydrate`. Probe (own file, scratch): hostile lexical fn returning tenant B's id + tenant-blind `treeSearchFn` + a B node from an arm + an id collision (`shared/p1`) -> admitted set contains only A's own nodes (A's summary, never B's); real `treeLexicalIds` over A never returns B ids. Graph-scoped requests: composition returns `[]` from `treeSearchFn`, so no tree arm (ask-fast.test.ts [F1] covers it).
- **Out-of-scope scan.** No change to apps/api/src/composition/production.ts, ask-web-fallback.ts, schema, migrations or any write path (I2). Whole-unit files are all in the declared set; qa/* are bookkeeping.

## Evidence run by this coordinator (HEAD 6a9dbfc8, one file per invocation, node v24.13.1, tsx 4.23.13)
ask-fast 10/10; answer-fast 10/10; vertical 4/4; message-vertical 4/4; usage 14/14; passage-lexical 5/5; answer-workflow 18/18; ask-tenant-isolation 17/17; ask-tenant-hostile 70/70; routes/ask 7/7; server 10/10; all 14 packages/ask/src/*.test.ts 0 fail; `tsc --noEmit -p .` exit 0 in packages/ask and apps/api.

## Falsification (throwaway copy only; copy == worktree for the touched files before each edit; restore verified with cmp)
| Item | Edit | Test | Observed |
|---|---|---|---|
| F4 / C7 | ask-v2.ts `if (cited && s.result)` -> `if (false && ...)` | ask-fast.test.ts; answer-fast.test.ts | 8/2 fail ([C1],[F4]); 9/1 fail ([F4]) |
| F1 / C1 | ask-v2.ts tree-arm expression -> `[]` | vertical; message-vertical | 1 pass/3 fail; 0/4 fail |
| F2 | application.ts drops `treeLexicalIds` wiring | usage.test.ts | 13/1 fail (the :110 test) |
| tenant probe (extra) | ask-graph.ts membership resolve `?? n` (both sites) | probe | foreign id admitted -> red |
Green-before in the copy for every row. Bound tree untouched (git status: no tracked changes besides other coordinator/bookkeeping files).

## Non-blocking notes (PROPOSED-ISSUE, low)
PROPOSED-ISSUE: {"sev":"low","criterion":"C3","title":"fast path ships cited-only sources, deep ships scored-good candidates","detail":"sources.internal membership semantics differ between modes; shape identical. Document in API notes if consumers diff modes.","kind":"note"}
PROPOSED-ISSUE: {"sev":"low","criterion":"C6","title":"treeLexicalIds scans the whole tenant tree synchronously","detail":"apps/api/src/ask/passage-lexical.ts:86-98 is O(nodes x summary size) on the event loop before the deadline race can preempt it; consider a node cap for very large tenants.","kind":"perf"}

VERDICT: PASS
SCOREBOARD: 7/7 criteria met, 2/2 invariants hold (C1-C7, I1, I2; C2-C6 and I1/I2 unchanged by the repair and re-run green)
TIER: L (tenancy-scoped retrieval: packages/ask/src/ask-graph.ts:93 membership guard; dual-trigger cited in the manifest)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api only)
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The repair restores native document/message reach on the default path through a non-LLM, tenant-tree-bound arm, and ships cited-only sources, which removes the 0-sources defect at its root. The single edited assertion is a justified, strengthened behaviour change. The tenant probe and six falsification runs confirm foreign passages cannot surface and the new tests bite.
Metrics: start=2026-10-28T08:55:00Z end=2026-10-28T09:30:00Z wall_min=35 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2100 mutants=1 defects_unit=0 defects_6c=0
