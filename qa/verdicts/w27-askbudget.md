# Verdict: w27-askbudget (ISS-ASKSHARED-001)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 93fdc62fca6dad329659493f1ca983cea5e4d4eb
Base SHA: 4264418c7488d95e76bc0d86e3920efb0e0ccd72

## Evidence (all independently run; raw outputs in qa/.chk/, untracked)
1. Diff 4264418c..93fdc62f: only packages/ask/src/ask-graph.test.ts (+15, one test) and qa/manifests/w27-askbudget.md. No production code changed. PASS.
2. ask-graph.baseline.json not in the diff. PASS.
3. D-015 replay: the new test is the row's fix_direction scenario verbatim (boundedX({swallowedHuge:true}), score 0.05, no tavily, askV2 and askGraphV2 reject /budget exhausted/, calls == ["ask.select_nodes"]). It passes at candidate.
4. node --test ask-graph.test.ts: tests 60, pass 60, fail 0, exit 0 (under heavy load, ~290 s). tsc --noEmit -p packages/ask: exit 0.
5. Own mutation: ask-graph.ts line 127 `s.budget?.assertHealthy();` (the first one, after ask()) replaced with a comment, per-mutation byte backup, timeout 600, trap EXIT/INT/TERM/ERR. New test FAILS (pass 0 fail 1, rc 1). Restored; cmp OK; `git -c core.autocrlf=true hash-object` 895bc4e0... == HEAD blob. Working tree clean afterwards.
6. lint-loc --all in w26-integrate with the one test file copied in: run 1 rc 1 (tracker stage SIGTERM at its 120 s internal timeout, load; other 9 stages green). Rerun once: rc 0, 10 stages, 0 failed. Copy removed via git checkout; `git status --porcelain` empty.

## Findings
None. ISSUES-WRITTEN: none.

## Notes
- Manifest claimed dependencies stage fails in the lane; in w26-integrate it passes (lane lacks junctions, irrelevant).
- Not verified: the optional baseline-extension in the row's fix_direction (not done, optional); no browsers/network/full suites.

## Ledger
ISS-ASKSHARED-001 may be flipped open -> verified.
