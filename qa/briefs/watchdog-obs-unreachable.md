# Brief — watchdog-obs-unreachable (fixes ISS-T-047-CONTROLLER-001, severity high)

Work ONLY inside this worktree. Do not run git. Do not dispatch any checker. ADD what is asked; never delete or rename existing code, tests or config this brief does not name.

## The defect (verbatim from the issue ledger)
`packages/meeting-bot/src/capture/watchdog.ts` `runWatchdog`'s `isObsRecording` probe (around lines 96-106):
`try { await obs.connect(...); const status = await obs.call("GetRecordStatus"); return status.outputActive; } catch { return false; }`
When a recovery state file exists and the controller pid is dead, and OBS's websocket is transiently unreachable (down / timed out / restarting while OBS may still be recording), the catch returns `false` = "confirmed not recording". `decideWatchdogAction` (around lines 33-40) then returns `'stale-cleanup'`, and `tickWatchdog` (around lines 73-75) calls `probes.clearState()` WITHOUT finalizing. The state file — the one artifact recovery depends on — is gone; later ticks see no state and no-op forever.

## Required behaviour
1. The OBS probe must distinguish three outcomes: recording (true), confirmed not recording (false), and UNKNOWN (connect/call failed). Model it e.g. as `boolean | "unknown"` (or a small union type) — keep existing exported names working.
2. `decideWatchdogAction`: when state exists, controller is dead, and OBS status is UNKNOWN, it must NOT return `'stale-cleanup'`. Return a non-destructive action (e.g. a new `'retry-later'` / keep-state noop) so the state file survives to the next tick. Existing decisions for true/false inputs must stay byte-identical.
3. `tickWatchdog` must never call `clearState()` for the UNKNOWN case.
4. Add tests in `packages/meeting-bot/src/capture/watchdog.test.ts`:
   - decideWatchdogAction(state present, pid dead, obs unknown) → not stale-cleanup;
   - tickWatchdog with a probe whose OBS check reports unknown → clearState NOT called, finalize NOT called;
   - a test that exercises runWatchdog's real isObsRecording wiring with an injected/fake OBS client whose connect throws → reports unknown (make the OBS client injectable if it isn't; default stays the real one).
   All existing tests must still pass.

## Verify (must exit 0)
node --test --import tsx packages/meeting-bot/src/capture/watchdog.test.ts
