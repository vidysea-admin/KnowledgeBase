# Verdict (coordinator B) — ask-fast-rag, cycle 0
Date: 2026-10-28 · Bound to D:/KnowledgeBase/.worktrees/ask-fast-rag · judged head 8f493875 (code 8f493875 = f6b353b9 product state) · Policy-Version: proportional-verification/2026-10-19.17
Cycle checked: 0
Dual check, second blind coordinator. Did not open the other coordinator's verdict or checkpoint (a directory listing incidentally showed a same-named file; not opened).

## Check plan
Logic + tenancy + LLM path: affected tests (own runs, one file per invocation), tenant probe, deadline probe, fabricated-citation probe, one falsification per criterion (copy only), HEAD-fidelity of the builder's touched files, test-migration review (scrutiny point a), importer sweep. Mode D: not applicable (no web file in the diff).

VERDICT: FAIL
SCOREBOARD: 6/7 criteria met (C1 partly), 2/2 invariants hold
TIER: L (tenancy: packages/ask/src/ask-graph.ts:93 membership guard; apps/api/src/ask/ask-arms.ts:86 tenant filter)
FAILURES:
- [C1] sev: high · The default path does not "retrieve via the same retrieval /search uses": it only uses the ask arms (lexical turns, no vector in production composition). Native document/message sources, which /search (createNativeSearch) and deep /ask reach, are unreachable on the default path. Reproduced: in a copy, removing only the `mode:"deep"` knob from the migrated existing tests gives native-evidence/vertical.test.ts pass 1 / fail 3 (answer "No supported internal source was retrieved for this question...", expected the Hindi document text) and message-vertical.test.ts pass 0 / fail 4. Those tests wire the real createSourceRequestDepsFor, so the manifest reason "no arms wired" is false for them. Fix direction: add a native arm / reuse the /search retrieval in the fast path, then move the vertical tests back to the default path. · issue: P1
- [regression of an unmodified affected test] sev: medium · apps/api/src/usage/usage.test.ts "a throwing store never fails the request..." (line 110) expects "This is the fake answer." from a default POST /ask; now returns the empty-retrieval answer (fixtures.ts has no arms/sourceContext). Base (10635a57 product state, copy) 14/14 pass; HEAD 13/14. Builder never ran this file (affected set under-selected). Fix direction: opt the fixture request into mode deep or give buildTestDeps an arm. · issue: P2
CAPABILITY-COVERAGE: 7/7 criteria falsified in a copy (table below); C4 needs both guards mutated (one alone survives: redundant guards)
LIVE-BROWSER: not-applicable (no web file in diff)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: C1 call-count, C2, C3, C5, C6, C7 and I1/I2 hold on my own evidence; C4 holds (my probe: a foreign-id candidate is dropped and a forged same-id node is replaced by the tenant's own node). The unit fails on the default path losing native-source retrieval (masked by moving existing vertical tests to deep, which is not a legitimate scope split for those three files) and on one unmodified affected test going red.

## Scrutiny points
- (a) answer-workflow.test.ts moves (8 tests, assertions untouched): legitimate scope split (they drive per-candidate score thresholds, which the default path never produces). server.test.ts: fixture has no arms, legitimate. native vertical/message-vertical moves: NOT legitimate (see P1). Default HTTP coverage otherwise: tenant-hostile (70), tenant-isolation new test, answer-router, routes, source-context suites all green.
- (b) tenant guard on default path: ask-graph.ts:91-93 and :102 both apply on gatherCandidates; probe packages/ask (copy): forged same-id foreign node replaced by tenant node, foreign-id dropped, zero model calls when only foreign candidates; no B text in output or prompts.
- (c) C7: sources ship for valid internal citations (answer-fast, real verifier); a verification failure still returns empty sources but with the origin-specific reason (matches the contract wording). Fabricated sourceId in model output throws BoundedAskError (503), all sentences rejected by grounding throws (503): no unverified citation ships.
- (d) deadline: hanging arms, hanging hydrate and hanging complete each return the degraded answer at the deadline (probe, 50 ms). Low note P3: LKB_ASK_FAST_DEADLINE_MS above 2147483647 makes setTimeout clamp to 1 ms (Node TimeoutOverflowWarning) so every request degrades.
- (e) response shape identical both modes (test + code read).
- (f) HEAD-fidelity: all 17 diff files `git hash-object` == `git rev-parse HEAD:<file>`, tracked tree clean; the 7 builder mutation sites are in original form at HEAD. No production.ts / ask-web-fallback.ts change.

## Evidence (my runs, node --test --import tsx, one file each)
packages/ask: ask-fast 8/8; all 35 other test files in packages/ask, zero failures. apps/api: answer-fast 8/8, answer-workflow 18/18, tenant-isolation 17/17, tenant-hostile 70/70, vertical 4/4, message-vertical 4/4, server 10/10, routes/ask 7/7, plus 31 importer files (answer-policy, ask/*, composition, production, score, visibility, tenant-guards, speaker-suggestions, standalone-mongo...) all green; usage.test.ts 13/14 (P2).
Falsification (copy, green-before / red-after / restored to HEAD blob): C1 8/0 -> 4/4 · C2 8/0 -> 7/1 · C3 8/0 -> 5/3 · C4 (both guards) 8/0 -> 7/1, leak assertion fired · C5 8/0 -> 4/4 · C6 8/0 -> timeout 15 s on the C6 test · C7 (reason) 8/0 -> 7/1 · C7 (sources) 8/0 -> 5/3. mutants=0 beyond the floor.

PROPOSED-ISSUE: {"id":"P1","severity":"high","type":"correctness","criterion":"C1","title":"Default /ask cannot retrieve native document/message sources; native vertical tests moved to mode deep mask it","repro":"copy of HEAD, delete the mode:deep knob in apps/api/src/native-evidence/vertical.test.ts and message-vertical.test.ts, node --test --import tsx each -> 3 and 4 failures with 'No supported internal source was retrieved'"}
PROPOSED-ISSUE: {"id":"P2","severity":"medium","type":"regression","title":"usage.test.ts 'a throwing store never fails the request' red on default /ask","repro":"cd apps/api && node --test --import tsx src/usage/usage.test.ts -> 13 pass 1 fail; base product state 14/14"}
PROPOSED-ISSUE: {"id":"P3","severity":"low","type":"robustness","title":"LKB_ASK_FAST_DEADLINE_MS > 2^31-1 clamps to 1 ms (setTimeout overflow), every default answer degrades","fix":"cap fastDeadlineMs at 2147483647"}
PROPOSED-ISSUE: {"id":"P4","severity":"low","type":"process","title":"Affected-set under-selected: builder ran 6 test files, never usage.test.ts nor the importer sweep; manifest reason for the vertical-test migration is factually wrong"}
PROPOSED-ISSUE: {"id":"P5","severity":"low","type":"question","title":"Production default path is lexical-only (createSourceRequestDepsFor passes no embed to the arms, 'vectorless'); confirm top-5 lexical retrieval is the intended D-203 quality bar"}

Metrics: start=2026-10-28T08:42:00Z end=2026-10-28T08:57:00Z wall_min=15 agent_min=15 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=900 mutants=0 defects_unit=2 defects_6c=0
