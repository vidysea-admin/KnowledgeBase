# Verdict — ask-fast-rag (Mode A, dual-check coordinator A)
Date: 2026-10-28 · Bound to D:/KnowledgeBase/.worktrees/ask-fast-rag · branch wave/ask-fast-rag · Head 8f493875 (code at f6b353b9) · Base 10635a57 (= merge-base with docs/devops-golive-2026-10-26)
Cycle checked: 0 · Policy-Version: proportional-verification/2026-10-19.17

## Check plan
Logic + tenancy (L, dual-trigger packages/ask/src/ask-graph.ts:93, apps/api/src/ask/ask-arms.ts:86) -> affected tests per file, own cross-tenant probe, one falsification per criterion in a copy, step 4c diff-scope read, HEAD-fidelity of builder-touched product files. No UI/web file in the diff -> Mode D not applicable. No live provider calls, no .env read, no DB writes.

VERDICT: PASS
SCOREBOARD: 7/7 criteria met, 2/2 invariants hold
TIER: L (tenancy-scoped retrieval refactor: gatherCandidates extracted around the membership guard at packages/ask/src/ask-graph.ts:91-93; default path now retrieves arms-only)
FAILURES (if any): none
PROPOSED-ISSUE lines (non-blocking, no ledger writes; maker mints rows after both coordinators PASS):
- P1 sev high · default path sets sources.internal = ALL top-5 retrieved chunks (ask-v2.ts `sources: { internal: s.candidates.map(internalSource) ...}`), not the cited ones, and answer() discards which chunks were cited. One retrieved-but-uncited chunk that fails verification makes the whole run stale: answer "", sources [] (the C7 symptom). Repro: copy-only probe (rig with a 2-node arm result, verifier rejecting internal:n2) -> `PROBE-STATE stale internal [] answer ""`. Deep mode only verified score>=lower good_docs, so exposure is wider on the default path. C7 text is satisfied as written (real reason surfaced, all-valid case ships); fix direction: bind sources to chunks cited by grounded sentences, or verify only cited. Needs a maker/Umesh scope call.
- P2 sev medium · apps/api/src/answer-policy/answer-workflow.ts published(): `whyNot = await whyUnverified(t, run.evidence, verify)` sits in the catch with no guard. If the evidence verifier throws (db down), deep mode returns a stale answer but the default path throws out of execute (500) after store.create already persisted the run. Repro: copy-only probe, `PROBE-T2 fast THROWS db down` vs `PROBE-T2 deep state stale`. Fix: wrap whyUnverified in try/catch and fall back to the generic reason.
- P3 sev medium · default path hard-codes verdict "correct" with scored [] whenever retrieval is non-empty (ask-v2.ts), so policy simulateAnswerPolicy (answer-policy.ts:97) can only hold for review on no-sources/missing-provenance; score-based review/refuse for weak retrieval no longer fires by default. This is inherent to D-203/C1 but the manifest's Known limits omit it; Umesh should confirm.
- P4 sev low · C4 coverage: in bounded mode removing only the arms-branch guard (ask-graph.ts:93) is caught only by the `ask.candidates_dropped` audit assertion (the second guard at :104 still drops the node); the legacy no-sourceContext fast path has no committed test. My probe (9 cases, scratchpad/probe-tenant.test.mts) passes on real code, incl. legacy mode and a spoofed same-id node.
- P5 sev low · the four native-evidence createServer/HTTP tests (vertical.test.ts x3, message-vertical.test.ts) and server.test.ts now run only in deep mode; no composition-level test drives the default path with real arms + native sources (the answerNode native revalidate path on the fast route is unexercised end to end). answer-policy/routes.ts, yaml-simulation.ts, evaluation-flywheel and compete still call askV2 directly, so policy simulation does not reflect the production default.
- P6 sev low · filters.sources=internal strips tavily only inside the answer workflow (answer-workflow.ts:190); the legacy router without answerWorkflow ignores it (pre-existing, unchanged). LKB_ASK_FAST_DEADLINE_MS parsing has no unit test (works: probe 80 ms -> state refused, reason "deadline exceeded after 80 ms"). The abandoned run is not cancelled and may still write job rows or call web search after the response (documented limit).

CAPABILITY-COVERAGE: 7/7 rows reproduced (C1 C2 C3 C4 C5 C6 C7), each green-before / red-after in a copy (+2 extra C4 mutants)
LIVE-BROWSER: not-applicable (changed paths are packages/ask/src, apps/api/src only)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## Evidence (own runs, one file per node --test invocation)
- packages/ask: ask-fast 8/8; full per-file sweep of all 29 test files under packages/ask/src (+bounded-evidence) green, incl. ask-graph 60, ask-v2 14, bounded-ask 12 (deep suites untouched, C2).
- apps/api: answer-fast 8, answer-workflow 18, ask-tenant-isolation 17, ask-tenant-hostile 70, ask-web-fallback 4, routes/ask/ask 7, vertical 4, message-vertical 4, server 10, plus 21 other files that POST /ask or call execute (answer-persistence, answer-router, native-*, routes, service, stale-citation-refusal, ask-arms, source-context*, source-exclusion, composition x2, evaluation-flywheel, eligible-tree-partial, production, compete, pages, score, current-corpus): all pass, 0 fail.
- `tsc --noEmit -p .` apps/api exit 0, packages/ask exit 0.
- (a) Test migration: git diff shows only the request input changed (`deep()` helper, `filters.mode:"deep"`); no assertion line added, removed or reworded in answer-workflow, vertical, message-vertical, server tests. Judged a legitimate scope split, not a protected-test weakening: those tests assert graph mechanics (per-candidate score thresholds, select_nodes) that the default path deliberately no longer has, and the package-level deep suites are byte-untouched. Default path is covered at workflow level (answer-fast), HTTP level (ask-tenant-isolation new test, non-vacuous: A gets cited answer, <=2 model calls), and ask-tenant-hostile (arms wired via requestDepsFor). Gap noted as P5.
- (b) Tenant guard on DEFAULT path: gatherCandidates diff is a pure extraction, deep behaviour byte-equivalent (limit undefined -> same cap, same return). My probe: foreign node id never reaches hydrate, model prompt or sources; same-id spoof resolved to the tree's own node; hydrate returning an extra foreign node is refused; no arms -> empty/insufficient; legacy mode also safe.
- (c) C7: no unverified citation ships: sources reach the client only if verify(run.evidence) passes; web bindings fail without a web verifier (reason names it). Empty retrieval -> state refused, answer "", reason set; same as deep.
- (d) Deadline: slow arms, slow web search, hung complete all return a degraded insufficient_coverage answer in ~90 ms at 80 ms deadline; late rejection after race loss is swallowed; env var path works through the workflow.
- (e) Shape: answer-fast shape test + probe show identical keys in both modes.
- (f) HEAD-fidelity: git hash-object == git rev-parse HEAD:<file> for all 8 builder-touched product files; tracked tree clean. My falsifications ran only in a copy (scratchpad/copy, git archive HEAD + node_modules junctions), restored by rewrite.

| Row | Edit (copy only) | Test | green-before | red-after |
|---|---|---|---|---|
| C1 | application.ts askForMode always askV2 | answer-fast | 8/8 | 4 fail incl. [C1][C2] |
| C2 | askForMode always askFastV2 | answer-fast | 8/8 | 1 fail [C1][C2] |
| C3 | ask-v2.ts askResult insufficient_coverage -> true | ask-fast | 8/8 | 2 fail [C3],[C5] |
| C4 | ask-graph.ts arms guard -> `?? n` (a); both guards (ab) | ask-fast | 8/8 | 1 fail [C4] (both); (b) second guard alone survives, redundant by design |
| C5 | ask-v2.ts web gate -> `if (true)` | ask-fast | 8/8 | 4 fail incl. [C5] |
| C6 | Promise.race -> await pending | ask-fast | 8/8 | [C6] timeout 8002 ms |
| C7 | published(..., false) | answer-fast | 8/8 | 1 fail [C7] real reason |

EXPLANATION: All seven criteria and both invariants are evidenced by my own runs, the falsification floor is met, and the diff touches only declared files (4c clean: no removed export/route/test, assertion-free test migration). Verdict is PASS with P1 and P2 filed as the two findings most worth a maker decision; P1 especially reads C7's "citations" as the response's sources list, so a reader of C7 who means only cited chunks would want it fixed before ship. Question for Umesh/maker, not a failure: should the default path restrict sources to cited chunks?
Metrics: start=2026-10-28T14:11:20+05:30 end=2026-10-28T14:27:00+05:30 wall_min=16 agent_min=16 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=940 mutants=2 defects_unit=0 defects_6c=0
