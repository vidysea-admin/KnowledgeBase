# Manifest — ask-fast-rag
**Contract:** qa/contracts/ask-fast-rag.md
**Goal task:** none
**Date:** 2026-10-28
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** required
dual-trigger: tenancy packages/ask/src/ask-graph.ts:93
**Persona walk:** skip (no new screen, flow or user type; the API default changes, response shape unchanged)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** multi-file change with a precise design (reuse the graph's own pieces); no external executor was worthy.

Authority: D-203 (draft), quoted in qa/QUEUE.md row 0c.

## What changed
- packages/ask/src/ask-graph.ts — `gatherCandidates(s, treeCandidates, limit?)` extracted in place from `retrieveNode` (arms merge via rrfMerge, tenant-tree membership guard at :91-93, SOURCE_LIMITS cap, hydrate); `retrieveNode` now calls it (deep behaviour unchanged). Also exported `boundedSourcesOf` and `askFailure` (extracted from the askGraphV2 catch).
- packages/ask/src/ask-v2.ts — `FAST_DEADLINE_MS = 20_000`, `AskFastOptions`, `askFastV2`: arms-only top-k retrieval, web fallback only if empty, then the graph's own `answer` node (ONE answer call + ONE grounding check), with a deadline race returning a degraded answer.
- packages/ask/src/router.ts (export `internalSource`), packages/ask/src/index.ts (exports).
- apps/api/src/answer-policy/application.ts — `askForMode(mode, ...)` (deep -> `askV2`, otherwise `askFastV2`), `fastDeadlineMs(env)` (LKB_ASK_FAST_DEADLINE_MS, default 20 s).
- apps/api/src/answer-policy/answer-workflow.ts — `AnswerInput.mode?: "deep"` parsed from `filters.mode` ("fast"|"deep", else 400 "Invalid ask mode."), never persisted (stored filter schema untouched); `execute` uses `askForMode`; `published(t, run, fresh)` is passed `fresh` for non-deep runs so a stale verdict carries its real reason (C7).
- apps/api/src/answer-policy/answer-evidence.ts — `whyUnverified()` returns the origin-specific reason (no bindings / internal evidence changed or withdrawn / web unverifiable / policy changed). The verifier itself is unchanged.
- apps/api/src/routes/ask/ask.ts — non-workflow path calls `askForMode`.
- NOT touched (other unit): apps/api/src/composition/production.ts, ask-web-fallback.ts. Arms are wired only in production.ts, so tests with no arms need `mode: "deep"` to retrieve via tree selection (below).
- New tests: packages/ask/src/ask-fast.test.ts (8), apps/api/src/answer-policy/answer-fast.test.ts (8), plus the C4 HTTP test appended to apps/api/src/ask/ask-tenant-isolation.test.ts.
- Existing tests migrated to `filters.mode: "deep"` because they exercise graph-only mechanics (per-candidate score thresholds driving review/stale, select_nodes gating, tree-selected retrieval with no arms wired). Only the request input changed; no assertion was edited: apps/api/src/answer-policy/answer-workflow.test.ts (`deep()` helper; 8 tests: review/approve, stale approval, conflict report/rerun, conflict race, saved-answer fail-closed, default-policy invalidation, digest corruption, byte alteration), apps/api/src/native-evidence/vertical.test.ts (3 /ask calls), apps/api/src/native-evidence/message-vertical.test.ts (1), apps/api/src/server.test.ts (1). Tests of the deep graph itself (packages/ask) are untouched.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 17 files, 7 criteria, est 60 min — single builder, per-file node --test runs, 2 blind checkers (maker-added at dispatch)
slow-plan: tier L tenancy unit with dual check; per-file test runs because multi-file node --test stalls on this machine
Tier: L (touches tenancy-scoped retrieval; dual-trigger: tenancy packages/ask/src/ask-graph.ts:93 membership guard; apps/api/src/ask/ask-arms.ts:86 scopedCollection tenant filter)
Base / checked state: code commits ca461c94 + f6b353b9 (HEAD f6b353b91f3fdb835139ab7c94c6885f06ea267e on wave/ask-fast-rag); the manifest commit follows and touches only qa/.
Affected tests: packages/ask/src/*.test.ts; apps/api answer-policy/*, ask/*, routes/ask/ask.test.ts, native-evidence/*, server.test.ts, score.test.ts, composition and production tests that POST /ask. No full suite run.
Independent review: NOT run. The senior-software-engineer dispatch was blocked by the "Compact agent handoff required" hook and a builder must not re-delegate; the checker owns review.
Known limits: `scored` is always [] on the default path (nothing is LLM-scored); the default path depends on the production arms (lexical + semantic) wired in production.ts, so a tenant whose arms return nothing gets an honest insufficient_coverage answer rather than the deep graph's tree-selection retrieval, and `filters.mode:"deep"` is the escape hatch. The deadline abandons, but cannot cancel, in-flight provider calls. The pre-existing lint-loc violation workbench.test.ts:402 is unrelated.
Tests[C1]: packages/ask/src/ask-fast.test.ts::"[C1] default path ..." (calls = [ask.answer, ask.answer_grounding], scoreFn/treeSearchFn never called); apps/api/src/answer-policy/answer-fast.test.ts::"[C1][C2] default = one answer call + one grounding check ..."
Tests[C2]: answer-fast.test.ts::"[C1][C2] ..." (mode deep records ask.select_nodes), "[C2] mode is parsed ... never persisted"; packages/ask deep suites unmodified (176 pass); workflow tests that need the graph opt in via mode deep
Tests[C3]: ask-fast.test.ts::"[C3] response keys ...", "[C3] empty retrieval ..."; answer-fast.test.ts::"[C3] response shape is identical in both modes", "[C3] empty retrieval ..."
Tests[C4]: ask-fast.test.ts::"[C4] a candidate the arms return from outside this tenant's tree is dropped and never cited"; ask-tenant-isolation.test.ts::"HTTP /ask default fast path as tenant A: at most 2 model calls, B's chunk/turn never returned, cited or sent to the model"; ask-tenant-hostile.test.ts (70) unmodified and green
Tests[C5]: ask-fast.test.ts::"[C5] web fallback only when retrieval is empty", "[C5] a throwing or empty web search degrades"; answer-fast.test.ts::"[C5] ... never for sources=internal"
Tests[C6]: ask-fast.test.ts::"[C6] total deadline returns a degraded answer instead of hanging", "[C6] default deadline is 20 s and is configurable"
Tests[C7]: answer-fast.test.ts::"[C7] a fresh default-path answer whose citations are valid internal chunks ships those sources" (real createMongoEvidenceVerifier), "[C7] a verification failure surfaces its real reason ...", "[C7] deep mode keeps the previous stale wording"
Tests[I1]: ask-tenant-isolation.test.ts, ask-tenant-hostile.test.ts (unmodified, green)
Tests[I2]: none needed — no repository write, schema or migration change
Pre-check[C1]: f6b353b9 node --test --import tsx packages/ask/src/ask-fast.test.ts; node --test --import tsx apps/api/src/answer-policy/answer-fast.test.ts -> exit 0, 8 passed + 8 passed t=2 blobs=packages/ask/src/ask-fast.test.ts:f84ec37a,apps/api/src/answer-policy/answer-fast.test.ts:17fb34d8
Pre-check[C2]: f6b353b9 node --test --import tsx apps/api/src/answer-policy/answer-workflow.test.ts -> exit 0, 18 passed (deep-mode workflow; builder also reported packages/ask 176 passed per file) t=2 blobs=apps/api/src/answer-policy/answer-workflow.test.ts:a571e36c
Pre-check[C3]: f6b353b9 answer-fast.test.ts (apps/api) + ask-fast.test.ts (packages/ask) via node --test --import tsx -> exit 0, 16 passed t=2 blobs=packages/ask/src/ask-fast.test.ts:f84ec37a,apps/api/src/answer-policy/answer-fast.test.ts:17fb34d8
Pre-check[C4]: f6b353b9 node --test --import tsx apps/api/src/ask/ask-tenant-isolation.test.ts; node --test --import tsx apps/api/src/ask/ask-tenant-hostile.test.ts -> exit 0, 17 passed + 70 passed t=2 blobs=apps/api/src/ask/ask-tenant-isolation.test.ts:b45d6edd
Pre-check[C5]: f6b353b9 ask-fast.test.ts (packages/ask), answer-fast.test.ts and ask/ask-web-fallback.test.ts (apps/api) via node --test --import tsx, one file per run -> exit 0, 8 + 8 + 4 passed t=3 blobs=packages/ask/src/ask-fast.test.ts:f84ec37a
Pre-check[C6]: f6b353b9 node --test --import tsx packages/ask/src/ask-fast.test.ts -> exit 0, 8 passed t=1 blobs=packages/ask/src/ask-fast.test.ts:f84ec37a
Pre-check[C7]: f6b353b9 node --test --import tsx apps/api/src/answer-policy/answer-fast.test.ts; node --test --import tsx apps/api/src/answer-policy/answer-workflow.test.ts -> exit 0, 8 + 18 passed t=2 blobs=apps/api/src/answer-policy/answer-fast.test.ts:17fb34d8
Pre-check[I1]: f6b353b9 node --test --import tsx apps/api/src/ask/ask-tenant-hostile.test.ts -> exit 0, 70 passed t=1
Pre-check[I2]: f6b353b9 git diff --stat ca461c94~1 HEAD -- schema migrations -> exit 0, empty t=1
Metrics: builder_min=120 mutants=7 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Falsifications (one per criterion)
Per-mutation byte backup (taken immediately before each single mutation, restored right after it), `timeout 120`, no EXIT trap. After each restore `git hash-object <file>` equalled `git rev-parse HEAD:<file>` (fidelity OK for all 7).

| Criterion | falsifying edit | test file | observed |
|---|---|---|---|
| C1 | application.ts `mode === "deep" ? askV2` -> `true ? askV2` (default routed to the deep graph) | answer-fast.test.ts | pass 4 / fail 4, incl. "[C1][C2] default = one answer call ..." |
| C2 | application.ts `mode === "deep" ? askV2` -> `false ? askV2` (deep routed to fast) | answer-fast.test.ts | pass 7 / fail 1, "[C1][C2] ..." select_nodes assertion |
| C3 | ask-v2.ts base `insufficient_coverage: true` -> `false` | ask-fast.test.ts | pass 5 / fail 3, incl. "[C3] empty retrieval ..." |
| C4 | ask-graph.ts:93 membership filter -> `byId.get(id) ?? n` (keep non-tenant candidates) | ask-fast.test.ts | pass 7 / fail 1, "[C4] a candidate the arms return from outside this tenant's tree ..." |
| C5 | ask-v2.ts web-fallback gate `if (empty)` -> `if (true)` | ask-fast.test.ts | pass 4 / fail 4, incl. "[C5] web fallback only when retrieval is empty ..." |
| C6 | ask-v2.ts `Promise.race([pending, deadline])` -> `pending` (no deadline), `--test-timeout=15000` | ask-fast.test.ts | "[C6] total deadline ..." failed by timeout at 15013 ms |
| C7 | answer-workflow.ts `published(t, run, input.mode !== "deep")` -> `published(t, run, false)` (generic wipe) | answer-fast.test.ts | pass 7 / fail 1, "[C7] a verification failure surfaces its real reason ..." |

## How to verify
- `cd packages/ask && node --test --import tsx src/*.test.ts` -> pass 176, fail 0
- `cd apps/api && node --test --import tsx src/answer-policy/answer-fast.test.ts` -> pass 8; likewise answer-workflow.test.ts pass 18, ask/ask-tenant-isolation.test.ts pass 17, native-evidence/vertical.test.ts pass 4, native-evidence/message-vertical.test.ts pass 4, server.test.ts pass 10
- `npx tsc --noEmit -p .` in apps/api and packages/ask -> exit 0
- Run test files one at a time; multi-file invocations stall on this machine.
