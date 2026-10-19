# Verdict: w27-judgecost (ISS-T040WIRE-001)

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: 4d9c64e9635af236b84afbba9030c8478e75371d
Base: 4264418c

## Evidence (independently produced)
- Diff 4264418c..4d9c64e9: test file (+22, one import of createLlmNoteJudge, two tests) and qa/manifests/w27-judgecost.md. No production source changed. Test-only: confirmed.
- D-015: the row's single recorded reproduction (cap 0 through indexSession, judge never called, nothing written) replayed by the new test: 1/1. Second point of the row (per-extraction cap) is left open and named, see below.
- Test file, timeout 900, node --test --test-force-exit --import tsx: 11/11 subtests pass, including both new tests (exit 1 is a Windows libuv teardown assertion `UV_HANDLE_CLOSING` at process exit after all subtests passed; it reports as a file-level fail. Not compared against base, environmental). Receipt: scratchpad w27-base.out.
- Both paths: session.ts:91 (summarize) and :92 (claims) each pass judgeMaxCostUsd. The test counts a shared judge (injected and judge-model provider modes), so it is path-agnostic by itself; I proved each path separately by mutation:
  - M-claims: removed `, judgeMaxCostUsd: deps.judgeMaxCostUsd` at session.ts:92 -> new cap-0 test FAILED (10 pass / 1 fail).
  - M-summarize: same removal at :91 -> new cap-0 test FAILED (10 pass / 1 fail).
  - Per-mutation byte backup, trap on EXIT/INT/TERM/ERR, timeout 900. Restored: cmp ok; `git -c core.autocrlf=true hash-object session.ts` = eb65aee8ab9e10c70811e7dce169f75cd88b9474 = HEAD blob; git diff clean.
- Control test (no cap, judge called >0) passes, so the counter is live.

## Policy question (per-extraction vs per-session cap)
Confirmed a genuine design choice, not a defect in this unit: summarize.ts:96 and claims.ts:82 each call makeJudgeContext with the full maxCostUsd, so the cap is per extraction (up to 2x per session). session.ts:159-160 already passes a remaining budget (cap minus spent) to assertPreservedClaimMeaning, so per-session accounting has precedent; either documenting the per-extraction semantics or sharing one context is defensible. Needs Umesh/owner decision; do not fix here.

## Findings
None. ISSUES-WRITTEN: none.

## Ledger
ISS-T040WIRE-001 may be flipped to verified for the wiring-pin point. Keep the per-session-cap sub-point recorded as an open policy question (or a separate low row).

## Not verified
tsc, lint-loc (not run, per brief); runtime totals not measured.
