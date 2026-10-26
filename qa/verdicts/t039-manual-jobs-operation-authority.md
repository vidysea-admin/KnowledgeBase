# T039 manual-jobs operation authority - Mode A RE-CHECK (same cycle 1; prior HOLD archived as .r1-1.md)

Resume: none (re-check, not CONTINUE-NEEDED). Bound to D:/KnowledgeBase. Checker: claude-sonnet-subagent.
Reviewed HEAD: 7eb2b3582920563f07558ed649219d989cdef9ff (working tree equals HEAD for scripts/ packages/ apps/; git diff empty).
Policy-Version: proportional-verification/2026-10-19.17 (dispatch pin; manifest carries no pin line, so no format gap raised).

## Check plan
Logic changed (canonical operation authority, tenancy-adjacent reads): affected tests plus the .8-4 floor. No UI, data artifact or prompt. The six-node receipt verification-t039-operation-six-20261015T1118.json and the 20261015 current-six receipt are INVALIDATED evidence (schedule-state.ts hash drift; host moved to scripts/webinar/send-now/ by d4f3c5c8, an imports-only edit). Not relied on; own runs below.

## Evidence (own runs, current HEAD bytes, node v24.13.1)
- Six receipt nodes, same name filter, host path updated: exit 0, 6/6 pass, about 6 s. qa/evidence/t039-manual-jobs-operation-authority/recheck-six-node-fallback.out.txt
- Whole send-now-command.test.ts plus send-now/send-now-host.test.ts: 28/28 pass. recheck-two-files-full.out.txt
- Frozen validator `python contracts/verify_contracts.py`: exit 0 ("no frozen contracts yet", PASS by vacuity; empty-registry limitation retained, no coverage inferred).
- Environment: D:/KnowledgeBase node_modules lacks ajv, ajv-formats, pdfjs-dist (lockfile 8.20.0 / 3.0.1 / 6.4.299). First run failed ERR_MODULE_NOT_FOUND (recheck-six-node.out.txt; environment, not product). I supplied those exact versions from a scratch dir outside the repo via a resolve hook plus NODE_PATH; the bound tree was not touched. Filed ISS-396 (process, low).
- Independent orphan probe (real readLiveJobs and runSendNow, stubbed ops and aliases, no I/O) in recheck-orphan-probe.out.txt: active recording or queued op with no alias or no source gives exit 1, launched=0, "cannot tell ... nothing was launched"; mapped same meeting gives exit 1, launched=0; mapped different meeting gives exit 0, launched=1.

## Falsification (one per changed criterion; throwaway copies outside the repo; green-before 6/6, red-after, bound tree never edited)
| Criterion | Mutant | Result |
|---|---|---|
| goal-t039 5, send-now-command 2/4: active op without scheduled file blocks its meeting | send-now-command.ts supplement loop skipped (continue) | RED 4/6 pass: canonical queued/recording and default-authority tests fail |
| goal-t039 5: unmapped or unreadable state is not "no jobs" | unmapped active op: throw changed to continue (fail-open) | RED 4/6 pass: same two tests fail |
| goal-t039 3,5: host authority is raw/webinars/operations.json | send-now-host.ts path changed to data/webinar-release | RED 5/6 pass: "default authority is canonical operations" fails |
3 mutants (S/M cap). An unmutated copy was 6/6 green first, so these are not setup failures.

## Contract judgement
- goal-t039 3 (tenant-bound host, scope): "all durable routes require exact scope and owning tenant" and the managed-adapter test pass on current bytes. MET for this unit's seam.
- goal-t039 4 (no secrets or internal paths in refusals): redaction node and the send-now-command refusal tests pass. MET.
- goal-t039 5 (duplicate, restart, unreadable is not no-jobs, distinct meetings allowed): canonical queued/recording node (no scheduled file), real-reader 409/503 node, orphan probe, three mutants. MET for the operation-store authority seam. Concurrent-request atomicity of the process/claim boundary is not changed by this diff (live-recording claim code untouched) and is not re-judged.
- t039-send-now-command 1-6: all 28 tests pass; diff read shows only the readLiveJobs source/status model, the defaultSendNowDeps path and a type import. runRecord, URL normalisation, --until and redaction paths unchanged.
- ISS-T039CMD-002 original reproduction (recording op, no scheduled file): refused 1/1 (canonical node plus probe).
- HOLD-live (needs a live account or deploy, not judged): goal-t039 1-2 (real admission within 60 s, shipped entrypoint), 6 (UI lifecycle), 8 (downstream media), 9 (closure). Parent T-039 stays in_progress; this verdict closes no parent criterion.

VERDICT: PASS
SCOREBOARD: 3/3 unit-scoped criteria met (goal-t039 3,4,5 operation-authority seam), 0 invariants broken; live criteria HOLD-live, not counted
TIER: M (multi-file behaviour in a shared reader; tenancy-adjacent but no dual-trigger line and no auth or prod-write change, so one checker)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api/cli, no UI)
LIVE-BROWSER: not-applicable (changed paths are packages/meeting-bot and scripts/webinar, no rendered output)
ISSUES-WRITTEN: ISS-396 (low, process)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The prior HOLD was a stale-receipt readiness stop; under .8-2/.11 that means RERUN, done on current bytes: 6/6 receipt nodes, 28/28 file tests, validator exit 0, orphan probe and three killed mutants. Live admission, media and UI criteria remain HOLD-live for the parent.
Metrics: start=2026-10-26T16:43:30Z end=2026-10-26T16:57:00Z wall_min=14 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=810 mutants=3 defects_unit=0 defects_6c=0 slow: env-repair 8 min (node_modules missing ajv/ajv-formats/pdfjs-dist, scratch-dir workaround)
