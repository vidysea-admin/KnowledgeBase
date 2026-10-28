# Verdict — ask-fast-rag (coordinator A, repair checker, cycle 1)
Date: 2026-10-28 · bound to D:/KnowledgeBase/.worktrees/ask-fast-rag · head 6a9dbfc8 (code bd6af83b) · base 10635a57 (= merge-base with docs/devops-golive-2026-10-26) · Repair base feee65eb (ancestor of HEAD, verified)
Cycle checked: 1 · Policy-Version: proportional-verification/2026-10-19.17 · Dual check: coordinator A (blind; other coordinator not read)

## Check plan
Logic + tenancy-scoped retrieval changed (repair diff touches ask-v2.ts, ask-graph.ts, answer.ts, passage-lexical.ts, application.ts, answer-workflow.ts). Plan: (1) read repair diff feee65eb..6a9dbfc8 in full; (2) scan whole-unit diff 10635a57...HEAD for out-of-scope files/deletions; (3) re-run every criterion's test file whose inputs the repair touched (one file per node --test invocation); (4) own tenant probe of the new tree arm; (5) one falsification per repaired criterion in a throwaway copy; (6) tsc.
TIER: L (tenancy dual-trigger packages/ask/src/ask-graph.ts:93 membership guard, unchanged tier).

## Results
| Check | Evidence | Result |
|---|---|---|
| Repair diff read in full | 8 product files + 5 test files; no deletion/rename of an export, route, test or config key in the repair | ok |
| Whole-unit scan | every file in `git diff --stat 10635a57...HEAD` is listed in manifest "What changed"; only deletion is the `export { askV2 }` line, replaced by the wider export in packages/ask/src/index.ts | in scope |
| ask-fast (10), answer.test (6) | packages/ask | pass |
| answer-fast (10), answer-workflow (18) | apps/api answer-policy | pass |
| passage-lexical (5), vertical (4), message-vertical (4) | apps/api, default path, no `mode` knob | pass |
| ask-tenant-isolation (17), ask-tenant-hostile (70) | apps/api ask | pass |
| usage (14), server (10), routes/ask/ask (7) | apps/api | pass |
| tsc --noEmit | packages/ask, apps/api | exit 0 / exit 0 |

## Hint 1: the edited [C1] assertion (sources.internal length 2 -> 1)
Judged a CORRECT BEHAVIOUR CHANGE, not a protected weakening. The old value counted every retrieved chunk although the answer cited one; contract C7 requires the shipped sources to be the valid internal chunks the answer cites, and C3 fixes the response SHAPE, not the count. The assertion got stricter, not looser: it now pins the exact cited node (`node_id === nodeA`), and a new [F4] test asserts an uncited retrieved chunk is not shipped. The edit is reachable only through F4: with the F4 narrowing disabled in a copy, both the [C1] and the [F4] tests go red (below). Every kept sentence must carry non-empty sourceIds (packages/ask/src/answer.ts:~60), so `cited` is never empty on a shipped bounded answer. Without `sourceContext` `citedSourceIds` stays undefined and the full set ships, as before.

## Hint 2: tenant isolation of the new arm (my own probe)
Code read: `treeLexicalIds` (apps/api/src/ask/passage-lexical.ts:~88) only walks the `tree` argument, which askForMode receives as the request's own tenant tree (routes/ask/ask.ts loads `deps.tree.load(tenantId)`; filteredTree prunes by sessionIds/exclusions first). Ids go through `deps.treeSearchFn(tree, ids)` (empty for graph-scoped asks, source-context.ts:276) and then `gatherCandidates`, whose membership guard (ask-graph.ts:~83-93 and the sourceContext block) resolves every candidate to the tenant tree's own node, followed by the tenant-bound hydrators. Probe (copy only, scratchpad probe-tree-arm.test.ts, real createSourceRequestDepsFor + BlindDb holding both tenants): P1 lexical ids are a subset of the handed tree; P2 foreign B ids injected as lexical ids resolve to nothing, no B marker in body/prompts; P3 a deliberately PERMISSIVE treeSearchFn returning B's topic/native-passage/session nodes is stopped by the guard; P4 production askForMode default path over A's tree (topic cross-referencing b-only-session) leaks no B content, every db query carries tenantId=tA. 4/4 pass. Falsification: removing both membership filters (`?? n`) makes P3 and ask-fast [C4] go red. No foreign tenant passage or topic can surface.

## Falsifications (throwaway copy, green-before / red-after / restored; HEAD-fidelity `git hash-object` == `git rev-parse HEAD:<file>` after each)
| Criterion / fix | edit | test | observed |
|---|---|---|---|
| C1/F1 tree arm | ask-v2.ts `lexicalIds.length ? treeSearchFn(...) : []` -> `[]` | ask-fast.test.ts | 10/0 -> 9/1, `[F1]` red |
| C7+C1/F4 cited-only | ask-v2.ts `if (cited && s.result)` -> `if (false && ...)` | ask-fast, answer-fast | ask-fast 10/0 -> 8/2 (`[C1]`, `[F4]`); answer-fast 10/0 -> 9/1 (`[F4]`) |
| C7/F3 guarded diagnosis | answer-workflow.ts guarded whyUnverified -> unguarded | answer-fast.test.ts | 10/0 -> 9/1, `[F3]` red |
| C4 membership guard | ask-graph.ts both `byId.get(..)` filters -> `?? n` | probe P3 + ask-fast [C4] | 4/0 -> 3/1 (P3); 10/0 -> 9/1 (`[C4]`) |
Note: vertical.test.ts is not runnable in the copy (relative fixtures), so its F1 red was not used; ask-fast `[F1]` carries F1.

## Criteria
C1-C7, I1, I2 evidenced on 6a9dbfc8. Criteria whose inputs the repair did not touch (none; all seven share ask-v2.ts/ask-graph.ts) were re-run anyway. I2: repair diff has no schema/migration/db-write change (read).

PROPOSED-ISSUE: {"severity":"low","type":"quality","criterion":"C1","title":"treeLexicalIds admits level 'topic' nodes that the production hydrators cannot hydrate","detail":"apps/api/src/ask/passage-lexical.ts TREE_ARM_LEVELS includes 'topic'. createSourceHydrator keeps only level==='session' nodes (apps/api/src/ask/source-context.ts:~104) and the native hydrator only native nodes, so in production a lexically matched topic is dropped silently after it has consumed a top-k slot before hydrate (ask-graph.ts gatherCandidates cap). Only the usage.test.ts fixture hydrator accepts topics. Not reproduced end to end; read from code. Harmless to tenancy; can lower recall.","fix_direction":"Restrict the arm to levels the request hydrators accept, or hydrate topics through their sessionRef."}

VERDICT: PASS
SCOREBOARD: 7/7 criteria met, 2/2 invariants hold
TIER: L (tenancy-scoped retrieval; dual-trigger packages/ask/src/ask-graph.ts:93)
FAILURES: none
CAPABILITY-COVERAGE: 4/4 repaired-criterion falsifications reproduced (F1, F4, F3, C4) in a copy
LIVE-BROWSER: not-applicable (changed paths: packages/ask, apps/api; no UI surface)
ISSUES-WRITTEN: none (dual coordinator: PROPOSED-ISSUE P1 above)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The repair adds a non-LLM tree arm, cited-only sources and a guarded diagnosis; all affected test files re-ran green, tsc is clean, and each repaired behaviour goes red when its code is mutated in a copy. The [C1] edit is a correct behaviour change tightened to a specific node, and the new arm cannot surface another tenant's passages or topics because it only walks the request's tenant tree and still passes the membership guard and tenant-bound hydration.
Metrics: start=2026-10-28T09:16:41Z end=2026-10-28T09:27:30Z wall_min=11 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=649 mutants=0 defects_unit=0 defects_6c=0
