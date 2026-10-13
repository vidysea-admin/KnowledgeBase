# Manifest: pidreuse
Status: ready-for-check
Fix cycle: 0
Lane: lane/pidreuse

## Problem
`packages/core/src/job-queue/file-job-queue.pid-reuse.test.ts` S4 (ISS-JOBQSTALL-002 recorded reproduction) was red intermittently: the real foreign-pid start-time probe (powershell on win32) costs 1-21 s on a loaded host; it exceeded the default 2000 ms lock wait and/or the 5000 ms probe timeout -> null ("cannot tell") -> holder protected -> `conflict`.

## Root cause
Test sensitivity to host load, plus a code limitation (probe timeout hard-coded). Not a logic bug in pid-reuse detection.

## Change
- `queue-lock.ts`: `defaultQueueStartTime(pid, probeTimeoutMs = 5000)` - optional second arg, default unchanged (behaviour byte-identical for existing callers).
- Test: when a calibration probe of the live child is slow (>=1 s), S4 passes `lockWaitMs` scaled to the measured probe cost and `lockStartTime` with a generous probe timeout (the queue option is `lockStartTime`, an earlier uncommitted draft used the non-existent `startTime` and so had no effect - fixed). Same assertions, still real probe on a real foreign pid; the genuine-holder (+31 s, +59 min) checks use the same probe. "default start-time source" test uses the generous timeout. No assertion weakened or removed.

## Evidence
`cd packages/core; node --test --import tsx src/job-queue/file-job-queue.pid-reuse.test.ts`
- Before fix (uncommitted draft with ineffective `startTime` option): 18/20 full-file passes, then 9/12; failures all S4 (`conflict` instead of enqueued, test took 29-35 s).
- After fix: 20/20 runs `ℹ pass 8 / ℹ fail 0`.
