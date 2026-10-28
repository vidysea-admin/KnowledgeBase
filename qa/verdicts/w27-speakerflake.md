# Verdict: w27-speakerflake

Verdict: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: b85be01d55ddc6a5ea7cfb0c8acdb9a707d627ad
Base: c7574a5e88ba9f89691fc6ff4b56b324582a30ee
Checker: independent (fresh context)

## Diff verified
git diff base..candidate: SpeakerRelationWorkbench.tsx (+8/-1), SpeakerRelationWorkbench.test.tsx, KnowledgeSpeakerProfilePage.test.tsx, manifest. No other source touched.

## Focus 1: fail-closed clear (by code reading + new test + mutation)
- defined A -> defined B: prev=A, next=B -> clears. Covered by new test (real change step).
- A -> undefined -> B: undefined returns early without resetting lastDigest, so prev stays A, next=B -> clears.
- A -> undefined -> A: prev===next -> picks kept. Intended (identical trusted evidence digest); covered by new test.
- First settle undefined -> value: no clear (intended fix; nothing selectable before first digest).
## Focus 2: test integrity
Page test: assertions unchanged; only From/To picks moved inside waitFor ending with the same checkbox expectation; no skip/loosening. New test asserts values retained, then "" after real change.
## Focus 3: runs
- Target test ("mounted speaker workbench ...") 10/10 exit 0 (logs t1..t10 in scratchpad ck/).
- vitest speaker-relations + speakers: 17 passed, 1 skipped, 1 failed (exit 1). The failure is the U24 scripted-artifact sha256 test: working-copy hash c85a3125... vs expected 98948cae.... Artifact qa/evidence/u24-speaker-profile/broker-run-20261014T210625/scripted-producer-profile-responses.json is i/lf w/crlf; `git show` of the blob at BOTH base c7574a5e and candidate gives 98948cae... (artifact not in diff). So it fails identically on base in this checkout: environmental (autocrlf), not caused by the change.
## Focus 4: tsc --noEmit -p apps/web/tsconfig.json exit 0.
## Focus 5: fresh D-020 mutation (checker-chosen, differs from maker's M2/M3)
Replaced `prev !== undefined && prev !== next` with `prev !== undefined && true` via script outside repo (absolute-path trap, per-mutation backup). Result: new workbench test FAILED (1 failed, 8 passed). Restored; git hash-object == HEAD blob f86e2a327016a0e36f0f51f2678d94a4c7f5074e; git status clean.

## Not run / limits
lint-loc not re-run (maker-reported OK; low risk, no new files). No D-015 corpus applicable. Checker budget metrics not recorded via review_budget.py (usage unknown).
