# KB Ask grounding release review

**Cycle checked:** 2
**Policy-Version:** proportional-verification/2026-11-22.19
**Commit:** f445c61a
**Managed review receipt:** qa/.delivery/c102febc2a3baf929bca14f9ccb1136dfc22d63fcdde985238e4e0ac2a9485a2.log

**PASS — fix cycle 2, scoped to C1, C3 and C4 at `f445c61a`** in `.worktrees/kb-password-min8`, under `proportional-verification/2026-11-22.19`.

| Criterion | Independent result |
|---|---|
| C1 — Provider confinement | Ollama ran first and Gemini handled fallback. Both used fixed hosts and disabled redirects. Each fixture key stayed in its own provider header, and only publisher text reached the result. Setup accepted either key. |
| C3 — Refusals and history | **4/4** initial responses returned `refused`, with distinct messages for empty search and outage in both fast and deep modes. **8/8** history list and detail reads returned `stale` with the answer, sources, scores, and diagnostics redacted. Loading the first-cycle workflow in memory reproduced both deep-mode failures. |
| C4 — Qualifiers | **4/4** fixtures withheld the broadened claim and retained the supported sentence. The generator and grounding judge both received instructions to preserve school, audience, jurisdiction, and date qualifiers. |

Commands run in the release worktree

```powershell
$env:TSX_DISABLE_CACHE='1'
node --import tsx --test apps/api/src/ask/ask-web-fallback.test.ts apps/api/src/activity-health/setup-status.test.ts apps/api/src/answer-policy/fast/answer-fast.test.ts packages/ask/src/answer.test.ts packages/ask/src/fast/ask-fast.test.ts
node --import tsx --test --test-name-pattern 'direct older answer|changed evidence or policy|saved allowed and approved answers|new saved policy|stored candidate and evidence digest|stored candidate or evidence bytes' apps/api/src/answer-policy/answer-workflow.test.ts
```

Actual output summary

```text
ℹ tests 60
ℹ pass 60
ℹ fail 0
ℹ skipped 0

ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ skipped 0
```

The worktree was clean. All checks used offline fixtures, with no code writes, cloud operations, or live model calls.

## Earlier independent report

# KB Ask grounding release review

**Cycle checked:** 1
**Policy-Version:** proportional-verification/2026-11-22.19
**Commit:** 6ce91811
**Managed review receipt:** qa/.delivery/bb16d5d75ef8272b828a4caa878548fdf3ccad5b2b44941063e235003d604f15.log

**FAIL — scoped engineering review of `6ce91811` in `.worktrees/kb-password-min8`.**

C3 failed in **2 of 4 offline cases**. Fast mode correctly distinguished an empty search from a search outage. Deep mode stored both outcomes as `refused` but returned `stale` with the same generic message on the initial response. History remained `stale` in all four cases, as expected. [Answer workflow](D:/KnowledgeBase/.worktrees/kb-password-min8/apps/api/src/answer-policy/answer-workflow.ts:223) · [C3 acceptance criterion](D:/KnowledgeBase/qa/manifests/kb-ask-web-grounding-repair.md:18)

**Correction.** Separate initial publication from fast-mode diagnostics. Apply the zero-evidence refusal check on the initial response in both modes, and add deep-mode coverage for empty search and outage.

```powershell
node --import tsx --test packages/ask/src/answer.test.ts apps/api/src/answer-policy/fast/answer-fast.test.ts
```

The requested suites passed **21/21**, including the qualifier checks. Discovery and setup passed **25/25**. The Ask UI suite passed **21/21**, including both refusal messages. All checks used local fixtures.

## UC citation follow-up, cycle 1

Verdict: PASS
Cycle checked: 1
Head: a9bbeb989cfea3e28862ea0dcbb538fe5a3fd631

Fresh checker: 60 offline tests passed. Ask, persistence, the evidence binding and reopened history returned only the cited turns. Removing an uncited sibling left the answer allowed. Removing the cited turn correctly withheld the answer. Native and web evidence each retained a valid binding. Two controls failed on the parent as expected.

Engineering review: APPROVE. 99 offline tests and four additional probes passed.

Checker log: qa/.delivery/c2f4db6646efa06edd92b167e81f06bbb23504b603993c9f502dda50f82af0fe.log
Engineering log: qa/.delivery/19882385608f6a476105cc63fd0eedfa89b595f13a6b8e6ffba1de41f8fb948c.log

## School policy wording follow-up
Cycle checked: 3
Verdict: FAIL
Candidate: def9078d19f312c58a40b27defcbb410e4e231cd
Independent check: qa/.delivery/cb83c01058334c10d11177acc9b90af6d4a10005aba1d2484c96f1b80acd1c3b.log
Engineering review: qa/.delivery/f7db56dfd2f94ac9ff5bd34e7a7cfaeca1b89df561976f4ec31a001edef2741b.log
The Inside UC t042 source case passed all 14 replays. Distinct source wording bypassed scope protection and the SAT selector discarded an adjacent eligibility restriction. Both could reach public allow and remain present in history. The test-tag release and its one approved live question were held.
