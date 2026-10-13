# t034next

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap T-034). Class: data write path (receiver) + path validation. Lane: lane/t034next.

## Survey result
Both items of the earlier plan were already merged: (a) the extension tests are in the package `test` script (709038c, guard test in `tab-receiver-integration.test.ts`); (b) the receiver `createTabCaptureReceiver` / `createTabBrowserDeps` exists, is loopback-only (`listen(0,"127.0.0.1")`), token + chrome-extension-origin authenticated, ordered/fsynced, per-chunk capped at 8 MiB, and `recordingBackend` already defaults to `tab`. The real gaps were: no TOTAL size cap, no validation of tenant/session ids or output filename/dir containment, and no operator-tunable chunk cap.

## Built (flag `LKB_TAB_RECEIVER_GUARD=1`, OFF by default)
- New `packages/meeting-bot/src/capture/tab-receiver-guard.ts`: `tabReceiverGuardFromEnv` (undefined unless env is exactly `1`; `LKB_TAB_MAX_CHUNK_MB` can only lower 8 MiB; `LKB_TAB_MAX_TOTAL_MB`, default 8 GiB; bad values throw), `assertSafeCaptureId`, `assertSafeCaptureFileName`, `assertInsideDir`.
- `tab-browser.ts`: optional `guard` (3rd arg of `createTabCaptureReceiver`, `TabBrowserConfig.guard`). With guard: oversize chunk -> 413 and nothing written; total-cap exceed -> 413 + `capture-error` (status goes failed, never success); `launch` refuses unsafe/missing tenant or session id before creating any file/lock/process, and asserts output is a safe name inside recordDir. Without guard the code path is the same as before (only added `guard &&` conditions).
- `record-commands.ts`: passes `guard` only when the env flag is set.
- Tenant/session scoping already existed (per-receiver random token, identity bound into status.json); unchanged. Extension side (`py/`) untouched, so no new seq/session query param.

## Evidence (node on PATH; no browser; 127.0.0.1 only)
- `node --test --import tsx src/capture/tab-receiver-guard.test.ts` -> tests 6, pass 6, fail 0; 15 consecutive runs: fail 0 in 15/15.
- Full: `node --test --import tsx "src/**/*.test.ts" "py/tab-capture/*.test.mjs"` -> tests 869, pass 865, fail 2, todo 1 (ISS-T034EXT-004 expected todo).
- The 2 failures are pre-existing Windows `symlinkSync` EPERM: `record-backend.test.ts` "interrupted recovery binds owned sidecars..." and `tab-browser.test.ts` "owned status retains deduplicated durable control gaps...". `getProcessStartTime` tests passed this run (not failing here; known timing-sensitive).
- `tsc --noEmit -p tsconfig.json` in packages/meeting-bot -> exit 0. `node scripts/lint-loc.mjs --all` -> "lint:structure: OK (10 stages, 0 failed)".
- Flag-off identity: test "receiver without guard: unchanged" (100 KB chunk 200, bad seq 400, 127.0.0.1 endpoint) and env table (unset/""/0/true -> no guard).

## NOT covered
- No mutation run. No real Chrome / extension / 60-minute two-tab run (roadmap exit criterion). The guard is not exercised through `runRecord` end to end. Receiver cannot reject by filename/session in the request itself because the extension sends neither; validation is on the controller-supplied ids and path.
- Did not touch record-backend.ts, lean-video-obs*, py/.
