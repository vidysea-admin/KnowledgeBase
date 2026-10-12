# t034-tab-capture-tests-in-suite-and-receiver

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap T-034 in-browser tab capture; follows merged t034-capture-failure-not-success and t034-tab-capture-extension-logic-tests). Class: data write path (receiver), test-only unit: no production source changed.
Lane: lane/tabcapture. Lane ledger `qa/issues.tabcapture.jsonl`: ISS-TABCAPTURE-001 (low), -002 (low). Existing ledger row statuses untouched.

## Scope
New: `packages/meeting-bot/src/capture/tab-receiver-integration.test.ts` (12 tests). `package.json` NOT changed: finding below.

## 1. Extension logic tests in CI
Already wired at 709038c (`"test": "node --test --import tsx \"src/**/*.test.ts\" \"py/tab-capture/*.test.mjs\""`); CI runs `pnpm -r test` on Node 24 (glob support). The extension verdict's "not discovered" note is stale. Added a guard test that fails if the glob leaves the script, if a new `*.test.mjs` appears unlisted, or if ci.yml stops running `pnpm -r test`. `node --test "py/tab-capture/*.test.mjs"` -> tests 47, pass 46, fail 0, todo 1 (ISS-T034EXT-004 stays a todo).

## 2. Receiver integration tests (real `createTabCaptureReceiver` / `createTabBrowserDeps`, ephemeral 127.0.0.1 port, fake extension = fetch client or child node process)
- Ordering: 25 in-order chunks byte-exact; gap/far/old/different-bytes replay -> 409; bad seq (`""`,`-1`,`1.5`,`0x1`,`abc`,`1e3`) and empty chunk -> 400; lost-ack retry of last chunk idempotent; a 12-way simultaneous burst leaves a gapless in-order prefix.
- Foreign origin: 11 hostile/malformed origins (https://evil.example, null, missing, look-alike chrome-extension, uppercase, wrong length...) x 4 routes -> 403, zero bytes, zero events; wrong/short/long/missing token -> 403. Listener refuses connection on non-loopback interface addresses (this machine's external IPv4s).
- Two tabs, receiver level: two receivers, interleaved 30 chunks each + 20 cross-session requests (A's token into B's endpoint and the reverse) -> all 403; each file holds only its own bytes; events not mixed.
- Two tabs, deps level: two `createTabBrowserDeps` with two fake extension processes running at once -> own bytes only (20 chunks each), both status `stopped`; one deps instance refuses a second overlapping capture.
- Failed never success: failed-stop, capture-error then failed:false stop (sticky), and ISS-T034FIX-005 exit-code-only (child dies exit 7 after chunks, never posts capture-stopped) -> stop() rejects, status.json `failed` with reason, partial kept. Child that exits before capture-started -> launch rejects, no lock/extension copy left.

## Evidence (node off PATH; `timeout` on every command; no browser)
- `node --test --import tsx src/capture/tab-receiver-integration.test.ts` -> tests 12, pass 12, fail 0. 15 consecutive runs: `15/15` green.
- ISS-T034FIX-003: the seven-value table (false,true,"true","false",1,null,missing) is already covered verbatim in `tab-browser.test.ts` (runFake table, unchanged, fail-closed on current HEAD). I did not duplicate it. Count: ISS-T034FIX-003: 7/7 (existing test, run).
- ISS-T034FIX-005: row is OPEN and stays open: only the exit-code/status.json/stop()-rejects half is asserted; the missing failure alert and finalize-of-failed-partial route are NOT built (policy/design, not in the recorded reproduction). Count: ISS-T034FIX-005: 1/1 reproduction scenario (exit-code-only) asserted; alert half not addressed.
- `tab-browser.test.ts`: 12 pass, 1 fail twice: pre-existing `symlinkSync` EPERM on Windows (ISS-TABCAPTURE-002); not mine.
- Typecheck `tsc --noEmit -p tsconfig.json` in packages/meeting-bot -> exit 0.
- Mutations: not run.

## Findings
ISS-TABCAPTURE-001 (low): receiver accepts a bare token without `Bearer ` (leniency; not fixed; outside the recorded reproductions). ISS-TABCAPTURE-002 (low): Windows symlink EPERM in existing test.

## NOT covered
- The 60-minute live run with no OBS and two tabs in parallel (roadmap exit criterion) is NOT part of this lane and was not run. No real Chrome, extension load or tabCapture was exercised; the extension side is fakes only.
- Two-tab parallelism is proven at the receiver/deps level with fake processes, not two real tabs in one browser (the controller itself allows one active capture per deps instance).
- ISS-T034FIX-001 (live behaviour of track end), ISS-T034EXT-001/-002/-003/-004/-006/-007 untouched.
