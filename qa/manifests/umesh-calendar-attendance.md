# Umesh Calendar attendance

**Handshake status:** HOLD
Status: HOLD
Fix cycle: 1
Task: T-051 additive account attendance exception requested by Umesh
Priority: tier 3 roadmap continuation, with direct user steering; existing higher-tier human gates remain separate.

## Authorization and acceptance

Umesh explicitly requested meeting attendance for umeshsugara@vidysea.com on the current Windows server until the other deployment is running. This scope supplements D-056 for an explicit account opt-in; defaults, live proof, isolated database and independent acceptance remain required.
Contract: qa/contracts/umesh-calendar-attendance.md, C1-C8 and I1-I4. Maker does not edit it.
This code unit cannot establish actual Google credentials, real meeting/capture/index validity, 24/7 service availability, host restart or full T-051 completion.

## Ownership and proposed implementation

Maker owns only the existing clean scripts/webinar/run-pipeline.mjs integration seam and new attendance policy/adapter plus focused tests. Launcher scripts/webinar/start-calendar-attendance.ps1 belongs to the sibling launcher agent; coordinate its CLI without writing that file. Contract, check packet and verdict belong to independent checker. Other source/API/QA WIP remains outside this unit.

Existing runner base SHA256: A2513CD0F28B68D1AAB8ABBB6BD11240F45E4800D0701EDE4C3EA07729EA85EC.
Read-only transport dependency apps/api/src/gws-calendar.ts SHA256: 1D6B830419CB4ED608B1BF0BCAD37B695013B4FE1DDF5B8B9C0830B1390691C1.
New files have no base. Exact final paths/hashes and commands will be added before ready-for-check.

The intended minimal integration reuses exported native Calendar transport and the existing runner. Fresh provider account and attendance observations remain bound to the acquired event through strict lookup before selection; no fabricated webinar titles or attendance metadata. The explicit mode suppresses registration execution and retains native control, lock, overlap and run prerequisites. Implementation details remain subject to independent contract review.

Security flags: authentication/account ownership, tenancy, capture scheduling and work-state writes, credential handling. Security checks are uncapped.

## Candidate packet (cycle 1; bounded implementation review)

Authorization entry: D-118, appended solely through scripts/append_decision.ps1 using Umesh's exact instruction. No frozen interface, enforcement, settings, architecture or other-owner source/QA edit.
Base commit before this unit: f4e40f47d6cc698556927bdb00655dc090643bc1. Existing runner base hash above; all other candidate source/test/docs files are new and have no base.

Final SHA256:

| Path | SHA256 |
|---|---|
| scripts/webinar/run-pipeline.mjs | F422F3A0D7CF172E678A43DF6C63F8EDD84A0CBCBA179F955592E6F02309EC54 |
| scripts/webinar/calendar-attendance-policy.mjs | 529E809F20A3F1EB68DA3B3E6324B2614CA979497251E8E5A665DA5D7CEBA863 |
| scripts/webinar/calendar-attendance-source.mjs | A06991CCB19774A26658A3455B3E6C7B94182D0F5B68B135DC47F9F641D6D3D4 |
| scripts/webinar/calendar-attendance.test.mjs | A02F5681288479340719F680E9FA8DDC01D8903B05A5C29F4537F2CDB0AAEB2D |
| scripts/webinar/start-calendar-attendance.ps1 | 96E86330D88E1CCD6FF4042CA3E200DCAB831408CE7B567A927378B91A6AA91D |
| scripts/webinar/start-calendar-attendance.test.mjs | 81D715C4B0144C930241EB5B8C43F997FAD19E443978AAB99CC77490B5A9BB0E |
| docs/windows-calendar-attendance.md | E1014EFF88A11EF87DA305EA9A3F47F59DCE0B8D74D2B21D93076FF253F6296E |

Contract hash: qa/contracts/umesh-calendar-attendance.md = 1821339B899CAD91F3D94A0B6A155044CE7F49D5D618BE67C2E3B31470F3A88A. Checker owns contract and verdict; this manifest is the final maker packet, superseding the preparatory NOT READY packet's proposed broad dependency list.

Source behavior: explicit --calendar-attendance-account umeshsugara@vidysea.com; otherwise the old webinar path. Fresh raw provider observations are matched to exact reconciled snapshot fingerprints, never persisted as fabricated fields. Primary account identity is checked before/after acquisition. Missing/conflicting/stale/declined/tentative observations refuse selection. A withdrawn attendance observation stops that same active occurrence through the existing cancellation control. Registration execution and existing send callbacks are bypassed in this mode. Native state/lock, source controls, isolated work database and live-proof gates stay required. The opted run/readiness additionally checks actual audio/video stream metadata with bounded ffprobe; stream metadata alone is not real-meeting, playback or silence acceptance.

CLI preview: scripts/webinar/run-pipeline.mjs --calendar-attendance-account umeshsugara@vidysea.com.
Nonmutating readiness: same plus --check-ready. Explicit capture/watch: same plus --run --watch. No real invocation, provider acquisition, scheduler registration or join was performed by this maker.

## Measured maker evidence

Cwd for all commands: C:/Users/product/Desktop/KnowledgeBase. Absolute Node: C:/Users/product/AppData/Local/OpenAI/Codex/runtimes/cua_node/3dd31cfff853001c/bin/node.exe. Its bin directory was prepended to PATH per command only. Node test/tsx subprocesses required approved sandbox escalation; no provider/browser/database calls occur in the test fixtures.

1. node --test --test-concurrency=1 scripts/webinar/calendar-attendance.test.mjs scripts/webinar/run-pipeline.test.mjs: exit 0, 52/52 passed, 0 failed/skipped/cancelled, 24207.7921 ms. This includes 22 unchanged default runner regressions bound to the final runner hash. A subsequent source-only readiness path/owner guard and two new tests were then applied; this earlier run is not presented as final source-helper evidence.
2. Final node --test --test-concurrency=1 scripts/webinar/calendar-attendance.test.mjs: exit 0, 32/32 passed, 0 failed/skipped/cancelled, 1465.328 ms. Native acquisition/reconciliation, exact snapshot mismatch refusal, absent/foreign/ambiguous account, stale-proof clearing, duplicate conflict, expired-token reset, declined active occurrence refusal, default-free preview, changed-tenant refusal, missing live gate, malformed stream refusal, actual runner record arguments consumed by recordingBackend, and processing failure remain failed. Registration/send callback counts are zero. All generated markers/media are expressly labeled isolated test doubles in temporary directories; no real proof marker was created.
3. python contracts/verify_contracts.py: exit 0, output "verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity". This is not release acceptance.
4. git diff --check -- scripts/webinar/run-pipeline.mjs docs/DECISIONS.md: exit 0.

Launcher sibling evidence (attributed): its six cases passed in 25845.7367 ms before one final TaskPreview serialization delta. The final source hash above must not inherit that old 6/6 claim; independent checker must rerun only the six focused launcher cases on current bytes. Final actual PowerShell -TaskPreview executed exit 0 with genuine ScheduledTasks cmdlets and reported registered=false, activationReady=false, current-user Interactive/Limited, IgnoreNew, restartCount 3, PT1M, PT0S, absolute action and working directory. No task mutation or activation.

Issue-fix corpus: none claimed. This is the directly requested additive account feature, not closure of a ledger issue. Security flags above remain uncapped; no non-security seam round extension is requested.

## Independent check request and remaining gates

Use skills/checker/SKILL.md and this packet, slug umesh-calendar-attendance, cycle 1. Independently check C1-C6/I1-I4 at the actual runner call sites and the launcher implementation portion of C7-C8. Verify final hashes before/after. Select necessary focused checks; the six final-byte launcher tests must run. Reuse attributed unchanged default runner evidence when appropriate. Record launch-to-verdict and individual command durations; target 120-180 seconds without abandoning required feasible evidence. Write qa/verdicts/umesh-calendar-attendance.md with Cycle checked: 1; do not edit maker implementation/manifest or other-owner QA.

Full attendance/live acceptance remains HOLD. OAuth and exact live account proof, accepted real meeting, signed-in managed browser, interactive Windows desktop/awake capacity, genuine playable audio/video with processing/index proof, and observed continuous-operation/restart behavior are not established by these controlled tests or task XML. A bounded implementation verdict must state those limits and cannot close full attendance, T-051 or product release. Parent owns live prerequisites/activation separately.

Independent cycle 1 reply: qa/verdicts/umesh-calendar-attendance.md VERDICT HOLD; ISSUES-WRITTEN none. All 38 focused implementation cases passed, including the six final-byte launcher cases; real-operation evidence remains incomplete. Dispatch-to-verdict took 295.029 seconds (target exceeded), focused tests 50.197 seconds. This manifest stays HOLD, never checked-PASS. Scoped Git publication is a reviewed WIP checkpoint, not activation or release acceptance.
