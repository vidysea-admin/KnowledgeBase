# Verdict B - iss394-api-acl-timeout-retry (second blind coordinator)
Date: 2026-10-26 · Bound: D:/KnowledgeBase · Cycle checked: 0 · Policy: proportional-verification/2026-10-19.17 · Dual check: coordinator B
Candidate: branch iss394-api-acl-timeout-retry HEAD b714c5e5 (code 11a40951, base b3eabbee), unmerged, worktree .claude/worktrees/agent-a164645fde19d5038. Product diff = 2 files: apps/api/src/bot-privacy/private-acl.ts (+4/-1) and private-acl.test.ts (new, 32 lines); the third changed file is the manifest.
Blind: the maker's manifest excerpt came in the dispatch; I did not open the A coordinator's verdict, checkpoint or evidence. No contract file was read; criteria C1 (one retry on ETIMEDOUT recovers) and C2 (every other failure and a second timeout still fail closed, launches bounded) are taken from the dispatch.

## Check plan (step 0)
Tier L (security, fail-closed privacy-ACL publisher; dual-trigger apps/api/src/bot-privacy/private-acl.ts:54). Instruments: own re-run of the unit test and both sibling consumers, a 42-case fail-open probe matrix on the real function with a stubbed `run`, real Node ETIMEDOUT semantics (two real spawnSync timeouts), one falsification per criterion plus three extra fail-open mutants in an isolated copy, step-4c read of the diff and the whole file. No UI, no live host-load run, no LLM.

## Evidence (all run by me; copy of b714c5e5 via git archive under scratchpad, node_modules junctioned from the main checkout, junctions removed before the copy was deleted; node v24.13.1, win32)
- `node --test --import tsx src/bot-privacy/private-acl.test.ts` (cwd apps/api) -> pass 1 / fail 0, 280 ms.
- Sibling `src/bot-privacy/router.test.ts` -> 4/4 pass. Sibling `src/source-intake/jobs/privacy.test.ts` -> 12 pass, 0 fail, 2 skip (the "actual native private-directory receipt" and "actual POSIX" cases skip on their own guards; not counted as evidence). Neither was RERUN-BLOCKED (apps/api/node_modules supplied express and @lkb/*; no ajv/pdfjs needed).
- Probe matrix (scratchpad b394/probe.mts, 42 stub cases + 2 real-timeout cases, BAD_COUNT=0): [timeout,ok] accepted after exactly 2 launches; [ok] 1 launch; [timeout,timeout,ok] throws after 2 launches (no third); [timeout, timeout with status 0 and valid stdout] throws. For each of ENOENT, EACCES, EPERM, ENOBUFS, exit 1, exit 1 with valid stdout, status null with valid stdout, error plus valid stdout, stdout null, 70 KB stdout, bad JSON, unrelated-SID Allow, wrong path, no explicit control, foreign owner, service Deny: in first position -> throws with 1 launch (no retry); after a timeout -> throws with 2 launches. The retry result is fully re-validated (JSON parse + validatePrivateAclSnapshot), so [timeout, bad proof] is refused with the validator's own error.
- Real Node semantics: a real `spawnSync` exceeding a 400 ms timeout yields error.code "ETIMEDOUT", the retry fires and a good second result is accepted (2 launches); two real timeouts throw "Private Windows directory ACL unavailable", classification deadline/ETIMEDOUT, 2 launches.
- Falsification (isolated copy, byte-restored after each mutation; bound worktree `git hash-object` of private-acl.ts = 53ac2c23 = HEAD blob, `git status` clean): m0 unmutated green. C1: m1 retry line removed -> RED. C2: m2 retry on any error -> RED; m3 retry up to twice -> RED; m4 retry on timeout or status!==0 -> RED; m5 second-attempt error masked as success (explicit fail-open) -> RED. mutations=5 (floor 2; extras are L fail-open probes, under the L cap of 10).
- 4c read of diff and file: `launch` repeats identical args/env/options (deadline stays 5000 per launch, total bounded at 2 x 5000 ms). The retry condition reads only the first result's own `error.code === "ETIMEDOUT"`. `result` is reassigned wholesale, so nothing from the timed-out attempt (partial stdout, status) survives. The single `if(result.error||status!==0||typeof stdout!=="string"||size>65536)throw` gate and the proof validator are unchanged and run on whichever result is last. private-acl.ps1 only reads (Get-Acl), so a killed first child cannot mutate anything or race the second. `began` is taken before the first launch, so the diagnostic elapsedMs now spans both attempts (cosmetic, P1).

## Criteria
- C1 met: timeout-then-success accepted after exactly 2 launches (unit test, probe, real spawnSync timeout); red at m1.
- C2 met: a second timeout, any non-timeout failure and every bad ACL proof still throw; launches never exceed 2; red at m2-m5. Fail-open question answered no: no non-timeout failure and no second timeout became success in 42 probe cases plus five mutants.
- Invariants: caller signature `verifyPrivateDirectory(directory, run)` unchanged; both siblings green.

## Limits
The 5.3-6.0 s CPU-saturated-host timing in ISS-394 was not reproduced live (non-deterministic); its failure mode is replayed deterministically and with real spawnSync timeouts. A host where both launches exceed 5 s still fails closed by design. I did not assert a real PowerShell ACL read of a real private directory (the sibling native-receipt test skipped).

## Proposed issues (dual check: nothing written to the ledger)
PROPOSED-ISSUE: {"sev":"low","type":"test-coverage","file":"apps/api/src/bot-privacy/private-acl.ts:53","summary":"`began` is taken before the first launch, so on a double timeout nativeUnavailable reports elapsedMs of about 10 s against deadlineMs 5000; the new test asserts launches and the 'deadline' classification but not the diagnostic. No behaviour risk.","fix_direction":"Take `began` per launch, or document that elapsedMs spans retries."}
PROPOSED-ISSUE: {"sev":"low","type":"process","file":"qa/manifests/iss394-api-acl-timeout-retry.md","summary":"Manifest says private-acl.ts 'CRLF endings preserved'; the committed blob is LF (git ls-files --eol: i/lf, w/crlf via autocrlf). Wording only.","fix_direction":"Drop the CRLF sentence."}

VERDICT: PASS
SCOREBOARD: 2/2 criteria met, 2/2 invariants hold (signature unchanged, siblings green)
TIER: L (security: fail-closed privacy ACL publisher, apps/api/src/bot-privacy/private-acl.ts:54 timing path)
FAILURES: none
CAPABILITY-COVERAGE: C1, C2 falsified red-after/green-before in an isolated copy (m1-m5); fail-open probe 42/42 plus 2 real-timeout cases; siblings 4/4 and 12 pass + 2 skip (skips not counted)
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (dual coordinator; see PROPOSED-ISSUE lines)
EXECUTOR: claude-sonnet-subagent
EXPLANATION: The retry fires only when the first launch's own error code is ETIMEDOUT, runs once, and its result goes through the unchanged error/status/size gate and the full ACL validator, so no non-timeout failure and no second timeout can become acceptance. The unit test, both sibling consumers, a 42-case fail-open matrix and two real spawnSync timeouts agree. Not proven: the CPU-saturated host timing from ISS-394 and a real PowerShell ACL read of a private directory.
Metrics: start=2026-10-26T17:05:00Z end=2026-10-26T17:30:00Z wall_min=25 agent_min=25 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1500 mutants=3 defects_unit=0 defects_6c=0
