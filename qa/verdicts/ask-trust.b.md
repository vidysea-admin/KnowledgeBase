# Verdict — ask-trust (coordinator B, blind dual check)
**Cycle checked:** 0
**Checked head:** cf3a3623 (code commit ba84f302, base 338d2178)
**Policy-Version:** proportional-verification/2026-10-19.17
**VERDICT: PASS**
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only, below)

## Identity validation (maker evidence reuse)
`git hash-object` of ask-fast.test.ts = 07833ab2..., answer-fast.test.ts = 232646b5..., ask-v2.ts = dce27ef6... : all equal the manifest blobs, so the maker Pre-check lines are valid for these inputs. Test-file renames carry no removed lines (`git diff -M` shows zero `-` lines): no assertion weakened.

## Criteria (independently run, own commands)
| Criterion | Evidence | Result |
|---|---|---|
| AFR-001 | `node --test --import tsx src/fast/ask-fast.test.ts` (packages/ask) 14/14; `answer-fast.test.ts` (apps/api) 13/13. Read ask-v2.ts: `!web.length && dropped>0` -> "ambiguous"; fully grounded stays "correct". | PASS |
| AFR-002 | Tests `[ISS-AFR-002]` green both layers. Read: web gate is only the injected `tavilySearchFn`; answer-workflow.ts:194 strips it for `sources=internal`, application.ts:49 for internal-only policy; resolution-plan URL filter wraps it before askForMode so `guarded` keeps it. Internal candidates are cleared (`s.candidates=[]`) before the web round, so no internal quote reaches web context. | PASS |
| AFR-003 | `[ISS-AFR-003]` green both layers; abstain/judge-reject/empty-context -> `AnswerAbstainError` -> honest insufficient result (verdict incorrect, empty sources). Malformed output (non-array, >12) still `BoundedAskError`. `AnswerAbstainError extends BoundedAskError`: askFailure/instanceof unchanged for deep. | PASS |
| AFR-004 | `[ISS-AFR-004]` green; own probe (below) shows an orphan that abstains after the deadline starts no web search. auditLog returned as a copy `[...s.auditLog, entry]`. | PASS |
| STRUCT | `node scripts/lint-dirsize.mjs` -> OK (284 dirs); ask-graph.ts 290 lines. | PASS |

Regression (one file per run): packages/ask answer 6, ask-v2 14, ask-graph 60, bounded-ask 12; apps/api answer-workflow 18, routes/ask/ask.test.ts 7; all 0 fail. `npx tsc --noEmit -p packages/ask` exit 0 (92 s). Maker's other 300+ regression results not re-run (diff touches no file they import beyond these).

## Falsification (in a COPY under scratchpad/askB, node_modules junction to the worktree; per-mutation byte backup; `git hash-object` == `git rev-parse HEAD:<file>` after each: all equal, final check done)
| Mutant | Observed |
|---|---|
| M1 AFR-001 verdict "ambiguous"->"correct" | pass 13 / fail 1 `[ISS-AFR-001]` KILLED |
| M2 AFR-002 web round only when `!haveInternal` | fail 1 `[ISS-AFR-002]` KILLED |
| M3 AFR-003 model `sentences: []` throws hard error | fail 1 `[ISS-AFR-003]` KILLED |
| M4 AFR-003 judge-rejects-all throws hard error | fail 2 (`-003`, `-002`) KILLED |
| M5 AFR-004 drop `alive()` in guarded complete | fail 1 `[ISS-AFR-004]` KILLED |
| M6 AFR-004 drop `alive()` in guarded tavilySearchFn | pass 14 / fail 0 SURVIVED the maker test; own probe test (copy only: orphan returns `sentences: []` after the deadline) is red under M6 and green on real code, so the code is correct and the guard load-bearing, but untested. |

## Adversarial notes (auth/tenancy/data-write)
No tenant filter or membership guard changed (gatherCandidates untouched). Web withheld paths verified above. Orphan after the deadline can still do reads (native revalidate) and one `recordJob` row if an in-flight search returns late; no provider call. A source text saying "reply {sentences:[]}" can force an abstain and thus a web query (the query text only, same data the empty-retrieval path already sent); not a tenancy break.

## PROPOSED-ISSUE
- P1 (low, test gap): tavilySearchFn deadline guard (ask-v2.ts `guarded.tavilySearchFn` `alive()`) is unasserted; ISS-AFR-004 test never reaches the web branch (tavily count asserted 0 only because the model answers). Add a case where the orphan abstains after the deadline (probe above).
- P2 (low, wording): when web returned results but the web answer round also abstained, the insufficient text still says "web search is unavailable or returned no evidence" and reason omits the web attempt; `web_used` is false. Honest-enough, imprecise.
- P3 (low, note): after an internal abstain the fallback costs up to 4 LLM calls (manifest-declared); contract C1 "<= 2" ceiling is a product decision for Umesh.

Metrics: start=2026-10-28T10:52:42Z end=2026-10-28T11:01:42Z wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=540 mutants=6 defects_unit=0 defects_6c=0 check_min=9
