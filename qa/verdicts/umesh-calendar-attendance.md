# Umesh Calendar attendance — independent cycle 1 verdict

VERDICT: HOLD
Cycle checked: 1
ISSUES-WRITTEN: none

Scoped implementation checks satisfied C1–C6 and the implementation portions of C7–C8/I1–I4 on controlled samples. This is not a whole-unit PASS, manifest close-out, activation permission, T-051 completion or product release. C7/C8 real-operation evidence and separate live acceptance remain incomplete.

Checker dispatch/start: 2026-10-09 09:46:22 UTC. First completed scope read: 09:46:57 UTC. The dispatch-to-read interval is included in total timing. The 120–180 second target was exceeded. Focused tests took 50.197 seconds, the failed sandbox test attempt 1.846 seconds, TaskPreview attempts 7.840 and 6.177 seconds, and validator 1.075 seconds. Source reads, sandbox/approval orchestration, review and verdict drafting also consumed elapsed time; their individual wait/review attribution is not fully measured, so the overrun is not attributed solely to persistence. No broad suite, browser or mutation run occurred.

## Independent findings and evidence

Reviewed the exact runner diff and new policy/source/launcher/test/doc bytes, plus immediate acquisition, reconciliation, capture stop and CLI-consumer call sites. Fresh primary-calendar provider identity is required before and after native acquisition; tenant mutation fails before writes; current exact snapshot fingerprints bind observed acceptance and invalidate borrowed/failed generations. Conflicting observations refuse selection. Declined/tentative/unanswered/foreign/ambiguous/malformed/cancelled events and unsafe/registration links are refused. Owner-organized accepted events qualify without invented title/organizer evidence.

The explicit mode bypasses registration execution and replaces notification callbacks; controlled actual runner tests observed zero registration/send calls. Existing durable lane lock, owner-bound occurrence/rejection state, cancellation/reschedule transitions and sequential capture execution remain authoritative. Overlap produces overlap-lost coverage rather than claiming attendance. Actual record arguments carry the real source URL, end bound, session and tenant to recordingBackend; controlled downstream failure stays failed and cannot be silently rejoined on restart. Work-database and platform/live-proof gates precede unattended launch; ffprobe checks audio/video metadata but cannot establish playable, audible real-meeting acceptance.

Reviewed genuine ScheduledTasks construction, activation confirmations, bounded readiness subprocesses, absolute executable/working-directory paths, owned-task update and foreign-task refusal. Independently exercised the actual final TaskPreview serialization against Windows ScheduledTasks: registered=false, activationReady=false, current operator Interactive/Limited, IgnoreNew, restartCount=3, PT1M restart interval, PT0S execution limit. This independent probe constructed a definition only; it did not install/start a task.

## Exact verification commands/results

Cwd: C:/Users/product/Desktop/KnowledgeBase. Node binary: C:/Users/product/AppData/Local/OpenAI/Codex/runtimes/cua_node/3dd31cfff853001c/bin/node.exe. Its directory was prepended to PATH only for that command.

- `node --test --test-concurrency=1 scripts/webinar/calendar-attendance.test.mjs scripts/webinar/start-calendar-attendance.test.mjs`: default sandbox attempt exit 1 with child spawn EPERM, stopwatch 1846 ms, no behavioral result (tool output 1309ca). Approved isolated retry exit 0, 38/38 passed, zero failed/skipped/cancelled: 32 attendance and all six final-byte launcher tests. Stopwatch 50197 ms; Node duration 50018.0944 ms (outputs ef3984 and 76168a). Fixture PowerShell children each have a 10000 ms timeout. No live provider/database/browser calls.
- `C:/Program Files/PowerShell/7/pwsh.exe -NoProfile -File scripts/webinar/start-calendar-attendance.ps1 -TaskPreview`: default sandbox exit 1, ScheduledTasks CIM Access denied, stopwatch 7840 ms (bc4f02). Approved nonmutating retry exit 0, stopwatch 6177 ms (456be2), configuration described above. Sandbox failures are infrastructure restrictions, not proven acceptance defects.
- `python contracts/verify_contracts.py`: exit 0, stopwatch 1075 ms, exact output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity` (5814fe). This establishes no release acceptance.
- Initial hash/source batch: `Get-FileHash -Algorithm SHA256 -LiteralPath <nine paths below>; git diff -- scripts/webinar/run-pipeline.mjs; Get-Content` of policy, source, launcher and doc. Exit 0; tool wall duration 6.582 s (074711). Test/runner reads exit 0, wall 10.0015 s plus streamed completion (e753d5/19063d). Focused `rg -n` of acquisition/stop/reconciliation symbols and validator read exit 0, wall 5.489 s (ad477f). Scope read command used Get-Content on skills/checker/SKILL.md, manifest and contract; its individual duration was not separately retained, rather than estimated.
- Final Get-FileHash recheck: exit 0, stopwatch 802 ms (72ab42); displayed table truncated hash text, so a further full-string assertion of every expected hash immediately before verdict writing was required and passed. No candidate changed.

Attributed reused evidence: manifest cycle 1 reports 22 default runner regressions within the earlier 52/52 pass run (24207.7921 ms), bound to the same unchanged final runner hash. I independently reviewed the conditional default-path seam; those unchanged default regressions were not rerun. Earlier six-launcher result was not reused; all six were rerun on final bytes. No issue-fix corpus is claimed; no issue IDs were allocated or contracts/source/other-owner artifacts modified.

## Checked final SHA256

| Path | SHA256 |
|---|---|
| scripts/webinar/calendar-attendance.test.mjs | A02F5681288479340719F680E9FA8DDC01D8903B05A5C29F4537F2CDB0AAEB2D |
| qa/contracts/umesh-calendar-attendance.md | 1821339B899CAD91F3D94A0B6A155044CE7F49D5D618BE67C2E3B31470F3A88A |
| docs/windows-calendar-attendance.md | E1014EFF88A11EF87DA305EA9A3F47F59DCE0B8D74D2B21D93076FF253F6296E |
| scripts/webinar/calendar-attendance-policy.mjs | 529E809F20A3F1EB68DA3B3E6324B2614CA979497251E8E5A665DA5D7CEBA863 |
| scripts/webinar/start-calendar-attendance.test.mjs | 81D715C4B0144C930241EB5B8C43F997FAD19E443978AAB99CC77490B5A9BB0E |
| scripts/webinar/start-calendar-attendance.ps1 | 96E86330D88E1CCD6FF4042CA3E200DCAB831408CE7B567A927378B91A6AA91D |
| scripts/webinar/run-pipeline.mjs | F422F3A0D7CF172E678A43DF6C63F8EDD84A0CBCBA179F955592E6F02309EC54 |
| scripts/webinar/calendar-attendance-source.mjs | A06991CCB19774A26658A3455B3E6C7B94182D0F5B68B135DC47F9F641D6D3D4 |
| apps/api/src/gws-calendar.ts | 1D6B830419CB4ED608B1BF0BCAD37B695013B4FE1DDF5B8B9C0830B1390691C1 |
## Remaining gates / explanation

Real Google OAuth/account acquisition, actual accepted meeting scheduled join, signed-in managed browser and usable interactive Windows desktop, awake state and measured CPU/RAM capacity with the shared worker, genuine playable audio/video with successful processing/index and durable owner/session proof, and observed continuous-operation/restart/logout/locked-session behavior are not established. Task configuration is distinct from 24/7 attendance. Activation and full acceptance remain HOLD. No Ubuntu/deployment claim follows from these checks. No proven new defect was found in this bounded implementation check.

Completion/persist timestamp (UTC): 2026-10-09 09:51:17.029
Dispatch-to-verdict elapsed seconds: 295.029 (timestamp captured immediately before write; filesystem write latency excluded).

