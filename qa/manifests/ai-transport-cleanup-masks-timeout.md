# ai-transport: ephemeral-dir cleanup masks the primary outcome
Status: checked-PASS (Checked: qa/verdicts/ai-transport-cleanup-masks-timeout.md, cycle 0, 73afea0)
Fix cycle: 0
Owner: aitransport lane
Tier: 3 (non-security reliability defect, medium; roadmap-style fix, light ceremony).

## Seam PASS count / cap ruling
Prior PASSed verdicts naming the ai-transport seam: 1 (qa/verdicts/local-provider-boundary.md, scoped PASS). golden-set-regeneration.md names the file but explicitly does NOT certify it; ci-ffmpeg and ingest-indexing only mention it in passing. Count 1 < 2, and the class is reliability (not tenancy/auth/data-write), so the cap does not apply.

## Scope (exact changed paths)
- apps/api/src/ai-transport.ts (111 non-blank lines)
- apps/api/src/ai-transport.test.ts (105 non-blank lines)
- qa/issues.aitransport.jsonl (ISS-AITRANSPORT-001)
- qa/manifests/ai-transport-cleanup-masks-timeout.md
No new file in apps/api/src. No change to kill logic, timeouts, or success-path behaviour.

## Callers and the masked error
Only caller chain: realTransport -> ClaudeCodeProvider / runClaudeCodePrompt (packages/ai) -> router.complete/embed. The router does not branch on error class: any throw is recorded as job status "failed" with the error MESSAGE in the ledger, then falls to the next provider; all failing -> AllProvidersFailedError(attempts with messages). Findings: (a) no security/data decision changes, so severity stays medium; (b) the masked message is Node's EPERM text, which embeds the temp directory path, and lands in the job ledger and AllProvidersFailedError (reachable by API clients depending on the route); (c) a masked SUCCESS would be recorded as failed and the next, possibly paid, provider would be tried (cost/duplicate work); (d) operator sees EPERM instead of "timed out".

## What the ephemeral directory contains
mkdtempSync(tmpdir()/lkb-cli-*) is created empty and used only as the child's cwd when no options.cwd is given. This code writes nothing into it; the prompt goes via stdin, not a file. The CLI child (claude -p, no session persistence) could write into its cwd, so contents are not under this file's control; it may in principle hold prompt-derived or credential-bearing files, so a leftover directory is a data-at-rest concern. Mitigation here: the path is never put into any error; the optional onFailure receives only the error code.

## Fix and bound
removeEphemeral(): up to 4 attempts; after a failure waits delayMs*attempt (default 50) = 50+100+150 = 300 ms worst case, only on the failure path. The success path makes one remove call, no wait. Final failure is swallowed and reported through optional `cleanup.onFailure(code)` (a throwing reporter is also swallowed). `cleanup.remove/delayMs` are test seams. The primary rejection or result always wins.

## Limits left open
- Directories under os.tmpdir() that survive all 4 attempts are not swept by anything in this repo (OS temp cleanup / Storage Sense only). Not building a sweeper here; filed as a limit. Production does not wire onFailure, so a leak is silent: wiring a log hook is a follow-up.
- The real Windows lock race is not reproduced; tests inject the failure.

## Evidence
Commands run in apps/api with node v24 from the codex runtime on PATH.
`node --test --import tsx src/ai-transport.test.ts` x3 consecutive: `ℹ tests 17 ℹ pass 17 ℹ fail 0 ℹ skipped 0` each run (10 pre-existing tests unchanged + 7 new).
`node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: exit 0.
`node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (112 dir(s) within budget)`.

D-015: ISS-AITRANSPORT-001: 1/1 recorded reproduction (deadline + cleanup EPERM -> timeout error): reproduced unfixed via mutation M1 (bare unguarded removal) failing test "Cleanup EPERM after deadline: caller gets the timeout error, not EPERM"; passes on the fix.

## Mutations (timeout 60 s per run, per-mutation byte backup, restore in finally, hash check)
Final `git hash-object apps/api/src/ai-transport.ts` = 918fbf41... equals the pre-mutation blob (committed blob verified at commit).
- M1 remove try/catch: KILLED (7 tests, incl. "...caller gets the timeout error, not EPERM", "...result is still returned").
- M2 cleanup error wins: KILLED (6 tests incl. timeout/success/nonzero/overflow).
- M3 unbounded retry (Infinity): KILLED by timeout (SIGTERM) plus "...bounded at 4", "...timeout error".
- M3b bound 5: KILLED by "Cleanup is attempted exactly once on success and bounded at 4 on persistent failure".
- M4 skip cleanup: KILLED ("second attempt removes the directory", "exactly once...", timeout test).
- M5 remove twice: KILLED ("exactly once", "second attempt").
