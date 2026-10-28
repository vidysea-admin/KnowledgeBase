# Verdict: w27-ythost (ISS-T036NEXT-001)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: cb85c8d96a0ccdb2a9fba4bc09e6c4400612eee8
Base: 4264418c

## Checks (independently run)
1. Diff test-only: `git diff 4264418c cb85c8d9` touches only apps/api/src/join-rules/youtube-live-extract.test.ts (+17, one new test) and qa/manifests/w27-ythost.md. No source change.
2. D-015 replay: the row's recorded cases (evilyoutube.com, evilyoutu.be, notyoutu.be, youtube.com.evil) probed verbatim via youtubeVideoId: all undefined (refused); evil.youtube.com refused; YOUTUBE.COM accepted. Note: notyoutu.be, evilyoutube.com and evilyoutu.be already sit in the base hostile list (test line 41, present at 4264418c). The new test adds the accepted-host table and explicit subdomain/lookalike pins. The manifest's "all in the test" is true, though three of the four were already there.
3. Test: `node --test --test-force-exit --import tsx` (apps/api, timeout 600): exit 0, tests 8, pass 8, fail 0.
4. Own mutation: `host === "m.youtube.com"` -> `host.endsWith(".youtube.com")` (arbitrary subdomain accepted; the toLowerCase removal would be an equivalent mutant because URL already lowercases hostname). Result exit 1, pass 7 fail 1: killed ONLY by the new test, so the new pin adds real coverage. Per-mutation byte backup and trap on EXIT/INT/TERM/ERR; restored; `git -c core.autocrlf=true hash-object` ed014658d6acdd6276d20578315109beacea7300 == HEAD blob.
5. tsc (apps/api, `--noEmit -p tsconfig.json`) in w26-integrate with the candidate test copied in: exit 0. The test file was restored with git checkout; `git status --porcelain` in w26-integrate is clean. Candidate test blob in w27 = ddd48a03... matches the commit.

## Findings
None. Orchestrator ruling honoured: exact-host list kept, evil.youtube.com pinned as rejected.
ISSUES-WRITTEN: none
Ledger: ISS-T036NEXT-001 may be flipped to verified.

## Not verified
Full suites, browsers and network were not run (out of scope). Token and time ratios were not measured.
