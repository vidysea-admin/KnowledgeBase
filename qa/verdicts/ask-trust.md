# Verdict — ask-trust (coordinator A, cycle 0)
Date: 2026-10-28 · bound to D:/KnowledgeBase/.worktrees/ask-trust · head cf3a3623 (code ba84f302) · base 338d2178
Cycle checked: 0 · Policy-Version: proportional-verification/2026-10-19.17 · Dual check: coordinator A (blind; other coordinator not read)
TIER: L (prod-write dual-trigger packages/ask/src/ask-v2.ts:85, the moved recordJob audit writes; no tenancy line changed)

VERDICT: PASS

## Results (independent runs, one file per invocation, under timeout)
| Check | Evidence | Result |
|---|---|---|
| Identity of maker evidence | test blobs ask-fast.test.ts 07833ab2, answer-fast.test.ts 232646b5 equal the manifest's; ask-v2.ts blob dce27ef6 | valid, but all runs below re-executed by me |
| AFR-001..004 ask-fast.test.ts | 14 pass / 0 fail (4 `[ISS-AFR-00x]` scenarios green) | ok |
| AFR-001..003 answer-fast.test.ts (workflow) | 13 pass / 0 fail (default-path ambiguous goes to review; irrelevant retrieval is a persisted refusal; web fallback reachable) | ok |
| STRUCT | `node scripts/lint-dirsize.mjs` -> OK (284 dirs within budget); renames are pure moves | ok |
| Regression (deep path / answer.ts shared) | answer.test 6, bounded-ask 12, ask-v2 14, ask-graph 60 (packages/ask); answer-workflow 18, routes/ask/ask 7 (apps/api): all pass | ok |
| tsc --noEmit -p packages/ask | exit 0, no output | ok |

## Falsifications (throwaway copy under the scratchpad, own mutants, not the maker's; per-mutation byte backup, restore verified by `git hash-object` == `git rev-parse HEAD:<file>` after every run, all equal)
| Criterion | edit | observed |
|---|---|---|
| AFR-001 | `dropped > 0` -> `dropped > 99` (ask-v2.ts) | 13/1, `[ISS-AFR-001]` red |
| AFR-002 | `if (!answered)` web block -> `if (!answered && !haveInternal)` | 13/1, `[ISS-AFR-002]` red |
| AFR-003 | model abstain `AnswerAbstainError` -> `BoundedAskError` (answer.ts) | 13/1, `[ISS-AFR-003]` red |
| AFR-003 (judge rejects all) | judge-refusal throw -> `BoundedAskError` | 12/2, `[ISS-AFR-002]`,`[ISS-AFR-003]` red |
| AFR-004 (provider call) | remove `alive()` from guarded `complete` | 13/1, `[ISS-AFR-004]` red |
| AFR-004 (snapshot) | return live `s.auditLog` mutated | 12/2, `[C6]`,`[ISS-AFR-004]` red |
Floor (1 red per changed criterion) met for every criterion. Beyond-floor probes found two surviving mutants (test-strength only, code is correct, see proposed issues).

## Adversarial hunt (auth / tenancy / data-write paths touched)
- Web withheld: `tavilySearchFn` is stripped from deps before askFastV2 for `filters.sources === "internal"` (answer-workflow.ts:194), for policy internal-only (application.ts:49) and for graph-scoped asks (ask/source-context.ts:276); `guarded` is built from those already-stripped deps, so an abstain can never create a web path. No bypass found.
- Tenancy: gatherCandidates / membership guard untouched; the web round sets `s.candidates = []` so internal sources never ship alongside web ones; abstain audit text carries only the fixed `reason` string, no tenant content.
- Writes: only the two existing `recordJob` kinds, now also reachable after an internal abstain; no new collection or kind. Refusal is a normal 200 result persisted by the workflow as a refused run (test green).
- Orphan after deadline: with an abstaining loser released after the deadline, HEAD starts 0 web searches and writes 0 web job rows (probe red only under the guard-removal mutant). In-flight provider call and its job row are still recorded (disclosed as ISS-ASK-002).
- Fail-closed note: a malformed grounding-judge reply (non-array decisions) drops all sentences and now becomes an abstain, hence a web round or an honest insufficient answer, rather than a 503. Safe, consistent with "judge rejects every sentence".

## Proposed issues (dual check: no ledger rows written by me)
PROPOSED-ISSUE: severity=low, feature=ask-trust, title="AFR-004 test never exercises the web-search clause: removing the `alive()` guard on guarded tavilySearchFn leaves ask-fast.test.ts green (14/14); the loser in the test answers instead of abstaining so tavily is never reached. Probe (abstaining loser released post-deadline, tavily 0 and no ask.web* job row) passes on HEAD and fails on the mutant.", source="packages/ask/src/fast/ask-fast.test.ts:217-236, packages/ask/src/ask-v2.ts:57"
PROPOSED-ISSUE: severity=low, feature=ask-trust, title="Removing the AnswerAbstainError on 'no relevant supported answer context' (answer.ts empty admitted context) survives all tests; the branch looks unreachable from askFastV2 when haveInternal is true (strips are non-empty), so AFR-003's 'empty admitted context' clause has no reaching test.", source="packages/ask/src/answer.ts:32"
PROPOSED-ISSUE: severity=low, feature=ask-trust, title="`expired = true` is set after `await Promise.race` resumes, not in the timer callback, leaving a microtask-sized window in which the orphan could still start a call; and the insufficient result after a web round reports web_used:false although a web search ran.", source="packages/ask/src/ask-v2.ts:141-145"

## Notes
ISS-ASK-001 (up to 4 LLM calls on fallback) and ISS-ASK-002 (in-flight call not cancellable) are accurately disclosed by the maker and are product decisions, not defects against the stated criteria.

Metrics: start=2026-10-28T00:00:00Z end=2026-10-28T00:00:00Z wall_min=35 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2100 check_min=35 mutants=8 defects_unit=0 defects_6c=0
