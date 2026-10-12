# iss-t050adapter-001-002-runner-tenant-refs-and-warning

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (T-050 adapter follow-up; open medium issues ISS-T050ADAPTER-001 and -002). Class: tenancy-adjacent test gap + before-wiring result field. Verdict by the checker only.
Lane: lane/t050fix (from lane/t050adapter d5254470). Ledger rows in `qa/issues.t050adapter.jsonl` NOT edited here.

## ISS-T050ADAPTER-001 finding
The queue DOES enforce tenant: `FileJobQueue` complete/fail/heartbeat refuse a ref whose `tenantId` does not own the job as `not-found` (file-job-queue.ts:104). So there is no cross-tenant write hole; the adapter code was already correct (`refOf` carries tenantId on every call). The gap was unasserted tests. No job-queue change.

## Changes (packages/core/src/pipeline-runner only)
- `pipeline-runner.ts`: `ok()` takes an optional warning; `mutate()` and `submit()` pass the store's `sv.warning` through.
- `runner-types.ts`: `RunnerResult` ok variant gains optional `warnings?: string[]` (absent when there is none). No other caller in core handles `warning` (only the store sets it), so this follows the store's own contract B8.
- `pipeline-runner.test.ts`: +4 tests (22 total).

## Reproductions replayed
- ISS-T050ADAPTER-001: 4/4 recorded mutants now killed (complete, fail run-missing, fail bad-payload, fail plan-invalid each drop tenantId). New tests: recording-queue spy over a complete run, a failed-terminal run, run-missing, tampered payload, plan-invalid (stored state with an extra stage); real-queue test where tenant B's complete and fail on A's leased job give not-found, queue file byte-identical, A can still complete.
- ISS-T050ADAPTER-002: 1/1. Store wrapper returning `{ok:true,warning}`: `warnings` present on submit, step, heartbeat, succeed, fail, skip; field absent when no warning.

## Evidence
```
node --test --import tsx src/pipeline-runner/pipeline-runner.test.ts : ℹ tests 22 ℹ pass 22 ℹ fail 0
15 consecutive runs of that file: 15/15 pass (single-process; there is no multi-process test in this unit)
tsc --noEmit -p packages/core/tsconfig.json: exit 0
Mutation (lane-unique harness, 90 s timeout, byte backup per mutation, restore in finally, deleted before commit): 7/7 killed
 complete drops tenant; fail run-missing drops tenant; fail bad-payload drops tenant; fail plan-invalid drops tenant;
 mutate drops warning; submit drops warning; wrong tenant on complete. File matched the intended edit after the run (git diff: 3 lines).
```

## Left as is (open owner question, not changed)
Failed-terminal semantics: a terminally failed run finishes its queue job as `done` (failure lives in run-state). Checker flagged this as an owner question for Umesh (queue `dead` vs `done`, and how a failed run is retried). Untouched.

## Not delivered
Warnings are returned, not logged; the graph wiring unit must log them. Runner still not wired or exported from the core index.
