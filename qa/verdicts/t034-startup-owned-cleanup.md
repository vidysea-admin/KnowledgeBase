# Verdict - t034-startup-owned-cleanup (Mode A, bound to D:/KnowledgeBase)

## Check plan
Logic changed (error-path cleanup in createTabBrowserDeps.launch catch) -> affected test + falsification floor. No UI, no data artifact, no LLM output, no external data. Tier M: single product file, resource-lifecycle behaviour; tab-browser.ts:195-213 changes no auth/tenancy/ownership-validation code (writeOwnedTabStatus, :36-59, is unchanged and still refuses corrupt/foreign status). Lock/extension removal is own-pid guarded (:207). Not raised to L, so no dual check.
Judged: CURRENT bytes (working tree sha256 f149985b... CRLF; LF-normalised / HEAD blob c3de52d5 = 57600ff2...), HEAD a8d3c0f4 on docs/devops-golive-2026-10-26. The manifest pin FED87C5A is stale: the file later gained native-capture and stop() hunks (commit 0f3d9bb4), which belong to other units; only the catch hunk (:194-214) is this unit's claim.
Contract: qa/contracts/goal-t034.md criteria 4/5/7 (scoped slice), sha A819BCCD... Policy-Version: proportional-verification/2026-10-19.17 (manifest had no pin; current block used). Cycle checked: 0.

## Criteria (scoped slice; parent stays open)
| Crit | Result | Independent evidence |
|---|---|---|
| C4 lifecycle/failure boundary: capture-start failure releases owned locks/processes/resources, original error kept, retry bounded | MET (slice) | Ran `node --test --test-concurrency=1 --test-timeout=20000 --import tsx src/capture/tab-startup-cleanup.test.ts` (node v24.13.1): 2/2 pass, exit 0, 9.05 s. Each case launches twice on one adapter; asserts original /fixture startup refused/, lock gone, no .extension-*, child-stopped marker, receiver port refuses. Read tab-browser.ts:194-213 myself: every cleanup action in its own try, status refusal secondary. |
| C5 ownership/security: credential extension removed; foreign/corrupt status bytes untouched; no credentials in diagnostics | MET (slice) | Same run: status bytes asserted equal to "{" and {"tenantId":"foreign","untouched":true} after both attempts. Log strings at :198,:211 are generic (no URL/token). Lock removal needs readFileSync(lock)==String(process.pid) (:207). |
| C7 provenance / issue replay | MET (slice) | ISS-CAPTUREMAKER-001: 2/2 recorded reproductions (corrupt, foreign) replayed verbatim by the named test file, 2 attempts each, pass. contracts/verify_contracts.py exit 0, "PASS by vacuity" (no frozen contracts). Manifest pins stale for tab-browser.ts only, explained above. |

## Falsification (floor: 1 per changed criterion; isolated copies outside the root; green-before from each copy 2/2)
- F1 (C7, ledger case / original defect): status("failed") made unprotected again -> red: corrupt gives SyntaxError, foreign "Capture status ownership changed" instead of /fixture startup refused/ (assert.rejects fired, both cases).
- F2 (C4): child stop action replaced by `return;` -> red: ENOENT child-stopped (both cases).
- F3 (C5): `.extension-` rmSync action emptied -> red: existsSync(.extension-*) actual true, expected false (both cases).
Note: F1/F2 first showed only a 15 s test timeout (the test's finally `tab.disconnect()` waits 20 s on a stranded run). To confirm the firing assertion I raised the timeout and wrapped disconnect in try/catch in those two copies only; the bound tree was never edited.

## Other recorded reproductions (D-015, dispatcher request)
- ISS-CAPTUREMAKER-003 (other unit, t034-stop-owned-cleanup): tab-stop-cleanup.test.ts 3/3 pass, exit 0, 14.8 s.
- ISS-CAPTUREMAKER-002 (other unit, t034-original-private-eof): finalize-original-eof.test.mjs 0/5, NOT REPLAYABLE: corpus stale-duration-source.mkv is absent from the tree (ENOENT at test line 17; sha d07c93e9... cannot be verified). Not this unit's claim; filed ISS-387. No judgement on that unit is made here.

## Diff scope (4c)
The catch hunk only changes status handling and cleanup structure; it deletes no existing function/export/test. The rest of the file differs from the manifest pin because of other units' commit 0f3d9bb4, not judged here.

## Findings (non-blocking, low, ledger only)
ISS-385 lock removed without confirming child exit (cf. stop() :234-252); ISS-386 pre-try throws (:98,:105,:107,:112) leave active=true; ISS-387 missing 002 corpus; ISS-388 process row.
Environment: node v24.13.1 here vs v24.19.0 in the maker receipt; results identical. No load-induced flakiness seen.
Parent T-034 (60-min live, two-tab, downstream) stays NOT VERIFIED; this is a scoped unit verdict only.

VERDICT: PASS
SCOREBOARD: 3/3 scoped criteria met (4,5,7 slice), 0/0 invariants
TIER: M (single-file resource-lifecycle error path; no auth/tenancy code changed)
FAILURES: none
CAPABILITY-COVERAGE: 3/3 rows reproduced (F1-F3)
LIVE-BROWSER: not-applicable (packages/meeting-bot/src/capture/tab-browser.ts and a node test; no UI)
ISSUES-WRITTEN: ISS-385, ISS-386, ISS-387, ISS-388 (all low)
EXECUTOR: capture_maker (checker: claude-sonnet-subagent)
EXPLANATION: The startup catch now attempts every owned cleanup independently and treats status refusal as secondary; ISS-CAPTUREMAKER-001 replays 2/2 on current bytes and each of three isolated mutants reddens the intended assertion. Scoped unit PASS only; parent criteria stay open.
slow: protocol reading 3 min; isolated copy setup 2 min; masked-assertion mutant reruns 3 min
Metrics: start=2026-10-26T21:50:22+05:30 end=2026-10-26T22:03:00+05:30 wall_min=12 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=2026-10-19.17 check_s=758 mutants=0 defects_unit=0 defects_6c=0
