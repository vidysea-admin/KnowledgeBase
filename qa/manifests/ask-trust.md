# Manifest — ask-trust
**Contract:** qa/contracts/ask-fast-rag.md (the unit is the follow-up of its checked-PASS cycle; ledger rows ISS-AFR-001..004 in qa/issues.afr.jsonl are the acceptance source; no new contract file, the maker never edits qa/contracts/)
**Goal task:** none
**Date:** 2026-10-28
**Status:** checked-PASS (qa/verdicts/ask-trust.md + .b.md, cycle 0, 2026-10-28)
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** required
dual-trigger: prod-write packages/ask/src/ask-v2.ts:85
**Persona walk:** skip (no new screen, flow or user type; API behaviour on the default /ask path only, response shape unchanged)
**Issues addressed:** ISS-AFR-001, ISS-AFR-002, ISS-AFR-003, ISS-AFR-004
**Executor:** claude-opus-subagent
**Executor rationale:** one small design touching one function (askFastV2) plus three one-line seams; no external executor was worthy.

Authority: Umesh 2026-10-28 Wave 1 approval, row `W1-ask-trust` of qa/QUEUE.md ("remaining run krr aur kaam khatam krr"); plan docs/REMAINING-PLAN-2026-10-28.md W-AFR.

## Acceptance criteria (ids used below)
- **AFR-001** the default path no longer hard-codes verdict "correct": a bounded answer whose grounding check dropped sentences is verdict "ambiguous" (the policy then routes it to review); a fully grounded answer stays "correct".
- **AFR-002** the web fallback is reachable on the default path: when retrieval returned sources but none could support an answer, and web is allowed (filters.sources "all", policy not internal-only), the injected tavilySearchFn runs once and the answer is built from web sources; never when web is withheld.
- **AFR-003** there is an abstain channel: a model abstain (`sentences: []`), a grounding judge that rejects every sentence, or an empty admitted context yields an honest insufficient-coverage answer (verdict "incorrect", empty sources, honest text, persisted as a refused run) instead of a thrown BoundedAskError/503. Malformed model output still throws.
- **AFR-004** the deadline loser is contained: after the deadline fires the orphaned run starts no further provider call or web search, and the degraded answer's auditLog is a snapshot (the loser cannot mutate it later).
- **STRUCT** (coordinator scope addition) packages/ask/src and apps/api/src/answer-policy are back within the 30-file dirsize budget without raising it: the two ask-fast-rag test files moved into `fast/` subfolders (imports only; no assertion weakened).

## What changed
- packages/ask/src/ask-v2.ts `askFastV2` (edited in place, was :38-109): `answerOnce()` runs the graph's own `answer` node and turns an `AnswerAbstainError` into "not answered"; `searchWeb()` is the old web-fallback block moved verbatim into a closure and now also reached after an internal abstain (AFR-002); the final verdict is "ambiguous" when `removedSentences > 0` on the internal path (AFR-001); an unanswerable result returns the honest insufficient answer (AFR-003); `guarded` deps refuse new `complete`/`tavilySearchFn` calls once `expired` is set and the deadline result carries `[...s.auditLog, deadlineEntry]` (AFR-004). The in-flight provider call still cannot be cancelled (CompleteFn has no signal); it finishes and its job row is still recorded, it just cannot start another step or alter the returned log.
- packages/ask/src/source-context.ts: `AnswerAbstainError extends BoundedAskError` (same message/code, so deep behaviour and every `instanceof BoundedAskError` is unchanged).
- packages/ask/src/answer.ts: the three "nothing to answer" throws use `AnswerAbstainError` (messages unchanged); empty `sentences: []` is an abstain, a non-array/oversized list is still a hard `BoundedAskError`; new optional `options.abstain` appends one sentence to the answer system prompt ("reply {sentences:[]} instead of guessing"), set only by the fast path, so the deep prompt is byte-identical.
- packages/ask/src/ask-graph.ts: `AskGraphState.abstainable?` and its pass-through in the answer node (+2 lines; file is 290 lines, limit 300).
- Tests: packages/ask/src/fast/ask-fast.test.ts (git mv from src/, imports `../`, +4 tests), apps/api/src/answer-policy/fast/answer-fast.test.ts (git mv, imports `../`, +3 tests). No existing assertion was edited.
- NOT touched: apps/api/src/composition/production.ts, ask-web-fallback.ts, any tenant filter / membership guard (ask-graph.ts gatherCandidates untouched), schema, migrations, answer-workflow.ts, evaluate.ts, routes/ask/ask.ts (no change was needed there: the abstain result is a normal 200 AskV2Result and the workflow persists it).
- Dual-trigger honesty: the diff moves the two existing `recordJob(...)` audit writes (jobs rows to the work DB, ask-v2.ts:85/90) into `searchWeb()` and makes them reachable from a second branch. No new collection, no new write kind, no tenant-filter change. Declared as the prod-write trigger for conservatism; a tenancy trigger is NOT claimed because no tenant scoping line changed.

## D-015 evidence: ledger rows vs tests, counts by issue id
The ledger rows ISS-AFR-001..004 record a title and the verdict source (qa/verdicts/ask-fast-rag.md, .b.md findings R1/R2/R3/S4/R6); they record NO payload corpus or fix_direction. The floor therefore is the recorded scenario, one test per scenario, run at both layers (AskV2 function and answer workflow):
- ISS-AFR-001: 2/2 scenario tests green at the recorded failure (ask-fast `[ISS-AFR-001]`, workflow `[ISS-AFR-001]`); both red before the change.
- ISS-AFR-002: 2/2 (ask-fast `[ISS-AFR-002]`, workflow `[ISS-AFR-002]`); both red before.
- ISS-AFR-003: 2/2 (ask-fast `[ISS-AFR-003]`, workflow `[ISS-AFR-003]`); both red before.
- ISS-AFR-004: 1/1 (ask-fast `[ISS-AFR-004]`, two assertions: no further call, snapshot log); red before.
- Left open on purpose, named: ISS-AFR-005..012 (low, untouched). One deliberate behaviour note for the checker: after an internal abstain the web round makes a SECOND answer+grounding pair, so a fallback request costs up to 4 LLM calls (contract C1's "<= 2" applies to the retrieval-hit path, which is unchanged at exactly 2; a fallback is the only way to make the web path reachable after retrieval returned sources). If Umesh wants a hard 2-call ceiling this is a product decision, not a code defect.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 9 files, 4 criteria, est 45 min - one small design over one function, TDD red/green, per-file test runs
Tier: L (dual-trigger: prod-write packages/ask/src/ask-v2.ts:85, the moved recordJob audit writes on a default /ask path)
Base / checked state: unit base 338d2178; code commit recorded in the Pre-check lines below (the manifest commit that follows touches only qa/).
Affected tests: every packages/ask/src/**/*.test.ts and apps/api answer-policy/*, ask/*, routes/ask/ask.test.ts, native-evidence/{vertical,message-vertical}.test.ts, server.test.ts, usage/usage.test.ts; one file per invocation (multi-file runs stall on this machine). No full suite run.
Independent review: NOT run by the builder (a builder does not re-delegate; the checker owns review).
Known limits: `scored` stays [] on the default path (nothing is LLM-scored; confidence stays null); verdict "ambiguous" comes from the grounding judge, not a retrieval score. The deadline cannot cancel an in-flight provider call. lint-loc has one pre-existing unrelated violation (apps/api/src/knowledge-outputs/workbench.test.ts:402).
Tests[AFR-001]: packages/ask/src/fast/ask-fast.test.ts::"[ISS-AFR-001] the verdict reflects the grounding check ..."; apps/api/src/answer-policy/fast/answer-fast.test.ts::"[ISS-AFR-001] a default-path answer whose grounding check dropped sentences ..."
Tests[AFR-002]: ask-fast.test.ts::"[ISS-AFR-002] irrelevant top-k falls back to web when sources allow it, and never when web is withheld"; answer-fast.test.ts::"[ISS-AFR-002] irrelevant retrieval reaches the web fallback when filters.sources allows web"
Tests[AFR-003]: ask-fast.test.ts::"[ISS-AFR-003] irrelevant top-k yields an honest insufficient answer ..."; answer-fast.test.ts::"[ISS-AFR-003] irrelevant retrieval is a persisted, honest refusal ..."
Tests[AFR-004]: ask-fast.test.ts::"[ISS-AFR-004] after the deadline the orphaned run starts no further provider call and cannot mutate the returned auditLog"
Tests[STRUCT]: none needed — structural; checked by `node scripts/lint-dirsize.mjs`
Pre-check[AFR-001]: ba84f302 node --test --import tsx packages/ask/src/fast/ask-fast.test.ts; node --test --import tsx apps/api/src/answer-policy/fast/answer-fast.test.ts -> exit 0, 14 passed + 13 passed t=2 blobs=packages/ask/src/fast/ask-fast.test.ts:07833ab2,apps/api/src/answer-policy/fast/answer-fast.test.ts:232646b5
Pre-check[AFR-002]: ba84f302 node --test --import tsx packages/ask/src/fast/ask-fast.test.ts; node --test --import tsx apps/api/src/answer-policy/fast/answer-fast.test.ts -> exit 0, 14 passed + 13 passed t=2
Pre-check[AFR-003]: ba84f302 node --test --import tsx packages/ask/src/fast/ask-fast.test.ts; node --test --import tsx apps/api/src/answer-policy/fast/answer-fast.test.ts; node --test --import tsx apps/api/src/routes/ask/ask.test.ts -> exit 0, 14 passed + 13 passed + 7 passed t=3
Pre-check[AFR-004]: ba84f302 node --test --import tsx packages/ask/src/fast/ask-fast.test.ts -> exit 0, 14 passed t=1
Pre-check[STRUCT]: ba84f302 node scripts/lint-dirsize.mjs -> exit 0, lint-dirsize: OK (284 dir(s) within budget) t=1
Pre-check[regression-packages-ask]: ba84f302 each packages/ask/src/**/*.test.ts one file per run (20 files) + npx tsc --noEmit -p packages/ask -> exit 0, 233 passed 0 failed, tsc clean t=21
Pre-check[regression-apps-api]: ba84f302 one file per run: answer-policy/* (11 files incl. answer-workflow 18, answer-router 5, routes 7), ask/* (ask-arms 12, tenant-hostile 70, tenant-isolation 17, web-fallback 16, graph-context 10, native-source-context 7, passage-lexical 5, source-context 25, source-context-lexical 7, source-exclusion 13, source-context-quarantine 3), routes/ask/ask.test.ts 7, native-evidence/vertical 4 + message-vertical 4, server.test.ts 10, usage/usage.test.ts 14; npx tsc --noEmit -p apps/api -> exit 0, 319 passed 0 failed over 27 files, tsc clean t=28
Metrics: builder_min=95 mutants=7 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Falsifications (one per criterion; a second one for the sub-behaviours that have their own assertion)
Method: the code was committed first (ba84f302); each mutation then ran in the bound worktree (not a copy: the worktree is itself the throwaway branch checkout and the main checkout was never touched) with a per-mutation byte backup taken immediately before, `timeout 150`, NO trap, restored right after, then `git hash-object <file>` == `git rev-parse HEAD:<file>` (ask-v2.ts blob dce27ef6e02529e5cf16e39fe04a1396210a0d54) checked after each of the 7 runs: all "restore OK"; `git status` showed no tracked change afterwards. Script and raw output kept in the builder scratchpad (falsify.sh / falsify.out).

| Criterion | falsifying edit (packages/ask/src/ask-v2.ts) | test file | observed |
|---|---|---|---|
| AFR-001 | `if (!web.length && dropped > 0)` -> `if (false && dropped > 0)` (verdict never downgraded) | ask-fast.test.ts | pass 13 / fail 1, `[ISS-AFR-001]` |
| AFR-001 (workflow) | same edit | answer-fast.test.ts | pass 12 / fail 1, `[ISS-AFR-001]` |
| AFR-002 | `web = await searchWeb();` -> `web = haveInternal ? [] : await searchWeb();` (fallback only on empty retrieval, as before) | ask-fast.test.ts | pass 13 / fail 1, `[ISS-AFR-002]` |
| AFR-003 | `if (!(err instanceof AnswerAbstainError)) throw err;` -> `throw err;` (abstain rethrown) | ask-fast.test.ts | pass 12 / fail 2, `[ISS-AFR-003]` and `[ISS-AFR-002]` |
| AFR-003 (prompt) | `s.abstainable = true;` -> `false` (model not told how to abstain) | ask-fast.test.ts | pass 13 / fail 1, `[ISS-AFR-003]` |
| AFR-004 (no new call) | `expired = true; //` -> `expired = false; //` (guard never trips) | ask-fast.test.ts | pass 13 / fail 1, `[ISS-AFR-004]` |
| AFR-004 (snapshot) | deadline result `auditLog: [...s.auditLog, Ellipsis]` -> pushes the entry into the live `s.auditLog` and returns it | ask-fast.test.ts | pass 13 / fail 1, `[ISS-AFR-004]` |

## How to verify
- One file per run, from `packages/ask`: `node --test --import tsx src/fast/ask-fast.test.ts` -> 14 pass; every other `src/**/*.test.ts` unchanged and green (233 in total over 20 files).
- From `apps/api`: `node --test --import tsx src/answer-policy/fast/answer-fast.test.ts` -> 13 pass; answer-workflow.test.ts 18; ask/ask-tenant-isolation.test.ts 17; ask/ask-tenant-hostile.test.ts 70; routes/ask/ask.test.ts 7; native-evidence/vertical.test.ts 4, message-vertical.test.ts 4; server.test.ts 10; usage/usage.test.ts 14.
- `npx tsc --noEmit -p .` in packages/ask and apps/api -> exit 0; `node scripts/lint-dirsize.mjs` -> OK.
- Run test files one at a time; multi-file invocations stall on this machine. The machine was also loaded by other sessions' test runs, so wall times are long.
