# Verdict: iss394-api-acl-timeout-retry (coordinator A of dual check)

Date: 2026-10-26 · Bound to D:/KnowledgeBase · Cycle checked: 0 · Policy-Version: proportional-verification/2026-10-19.17
Candidate (unmerged): branch iss394-api-acl-timeout-retry HEAD b714c5e5, code 11a40951, base b3eabbee. Judged bytes: `git archive b714c5e5` (private-acl.ts blob 53ac2c23, equals the manifest's).

## Check plan
Diff scope read (3 files: private-acl.ts +4/-1, new private-acl.test.ts, manifest) -> own re-run in a throwaway archive copy (junctioned main node_modules; junctions removed before deletion) -> sibling consumers -> fail-open probe + falsification in per-mutant copies.

## Evidence (all run by me, this check)
- C1/C2 test `node --test --import tsx apps/api/src/bot-privacy/private-acl.test.ts` -> pass 1 / fail 0.
- Base red: same test on base b3eabbee private-acl.ts -> fail (golden red-before / green-after confirmed).
- Sibling apps/api/src/bot-privacy/router.test.ts -> pass 4 / fail 0.
- Sibling apps/api/src/source-intake/jobs/privacy.test.ts -> pass 12, fail 0, skipped 2 (native private-directory receipt prerequisite / POSIX control; pre-existing skips, not gated by this diff).
- Typecheck (tsc -p apps/api): other errors from missing deps (ISS-396), none reference bot-privacy/private-acl*.
- Fail-open probe (my own file, 10 cases + 6 first-failure variants): ETIMEDOUT then {second ETIMEDOUT, exit 1, EPERM, ENOENT, oversize stdout, bad JSON, null stdout, unrelated-SID ACL, wrong-path proof} all throw "ACL unavailable"/Invalid with exactly 2 launches; first failure of exit 1, ENOBUFS, EACCES, no-code error, lowercase "etimedout", signal-only is launched exactly once and refused; a timed-out result carrying status 0 + valid stdout is not trusted (retry then 2nd decides); verifyPrivateArtifact shares the behaviour; failure cause leaks no path or SID. Positive control timeout->valid = accepted after 2 launches.
- Code read (private-acl.ts:54-58): `result` is overwritten only when the first `error.code === "ETIMEDOUT"`; the unchanged gate on line 59 (`error || status!==0 || non-string || >65536`) then judges the LAST result, then JSON parse and validatePrivateAclSnapshot (owner/rules/path). Retry adds no path to success: a second timeout keeps `error` set and throws `deadline`; any non-timeout failure is judged once. Deadline stays 5000 per launch (bounded 2x5000 ms). Diagnostic `elapsedMs` now spans both launches (benign).

## Falsification (one per criterion, copies under scratchpad, bound tree untouched)
| mutant | result |
|---|---|
| unmutated copy | exit 0 (maker test + probe pass 2/2) |
| base b3eabbee code | red (timeout-then-success refused) |
| C1 retry on any error | red, "Missing expected exception" (non-timeout retried to success) |
| C1 retry up to twice | red (double-timeout then success accepted) |
| C2 retry result discarded | red |
| C2 second-launch result ignored, forced success (explicit fail-open) | red, caught by probe "timed-out result then TO" |
The test cannot be satisfied by a fail-open change; the strongest mutants die.

## Findings
- PROPOSED-ISSUE: {"severity":"low","type":"process","feature":"iss394-api-acl-timeout-retry","title":"Manifest says private-acl.ts CRLF endings preserved but the committed blob has LF-only lines in the diff; wording only","fix_direction":"none required; note only"}
  (Wording, non-blocking.)
- Residual (by design, named): both launches >5 s still fail closed; the issue's 5.3-6.0 s CPU-100% host timing not run live (D-015 failure mode replayed deterministically instead, accepted).

VERDICT: PASS
SCOREBOARD: 2/2 criteria met, 3/3 invariants hold (fail-closed on non-timeout, fail-closed on second timeout, <=2 launches)
TIER: L (security: fail-closed privacy ACL publisher; timing path altered)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api-only, no UI)
LIVE-BROWSER: not-applicable (apps/api/src/bot-privacy/private-acl.ts, test)
ISSUES-WRITTEN: none (dual coordinator: PROPOSED-ISSUE lines only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The change retries exactly once and only on ETIMEDOUT; the last result still passes the unchanged fail-closed gate and full ACL validation, so no non-timeout failure and no second timeout can become success (verified by 16 probe cases and 3 killed fail-open mutants). Maker test is red at base, green on the fix; both sibling consumers green. RERUN-BLOCKED: none of the needed tests (ajv/pdfjs-dependent suites not needed).
Metrics: start=2026-10-26T22:40:00+05:30 end=2026-10-26T22:58:00+05:30 wall_min=18 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1080 mutants=5 defects_unit=0 defects_6c=0
