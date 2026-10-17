# T-034 failed-stop owned cleanup

**Handshake status:** in_progress
**Status:** in_progress
**Fix cycle:** 0
**Task:** T-034; ISS-CAPTUREMAKER-003.
**Priority tier:** 2 — high uncapped process/credential/write boundary.
**Authority:** root explicit stop-repair approval and integration_control exact lease: capture/tab-browser.ts stop branch plus new tab-stop-cleanup.test.ts only; own QA shard/manifest. No other source edited. No pre-READY checker dispatched.
**Contract:** qa/contracts/goal-t034.md criteria4/5/7; scoped failure cleanup only, no parent acceptance.
**Base:** previous tab-browser.ts SHA256FED87C5A4A64A735F484D435CFD72F5C0CB2D40761E53EC419AEDC860B7E7112 as preserved in prior startup receipts; HEAD5c4cbade2d1a8aa4815de13d587db8de3b01cc4a plus preexisting working tree. New test has no base.
**Measured maker source phase:**10:25:25→10:26:22UTC2026-10-15,57seconds wall; CPU time unmeasured. QA packet preparation follows separately. No maker tests/browser/media/provider/host activation.

## Exact frozen candidate

- packages/meeting-bot/src/capture/tab-browser.ts SHA256F2452F3279F186C46DF6B5FED311605098089830417929F723A5D00D9FC0A3A3. Only deps.stop(handle) changed. Primary stop requests flush and preserves its first thrown error. Finally independently attempts owned child shutdown, receiver close, guarded existing remux recovery, own lock/stop/reload/token-extension cleanup and status persistence; every cleanup failure remains a rejection, with generic credential-free diagnostic. active resets even when status refuses. Lock remains if exact owned child termination cannot be confirmed. Existing protocol failures and no-media refusal remain sticky; no successful finalization after cleanup failure.
- packages/meeting-bot/src/capture/tab-stop-cleanup.test.ts (new),SHA256203DEE2ED858ADEE487159E4ABC893C7072D3041916F37B2BFA10F5106834554. Three exact ledger cases at the real deps.launch/stop HTTP+child boundary. Every case launches independent owned/peer Node fixture adapters, verifies distinct credentials without printing values, causes own stop-file/status refusal, asserts original error class/reason, awaited child exit, closed receiver, removed own lock/credential extension, retained raw media and unchanged foreign/corrupt evidence. Replacement directory is preserved. Same adapter launches/stops a new capture while peer control stays stop:false; peer later stops normally with correct media. No real browser/audio/video/media tools.
- qa/issues.capturemaker.jsonl adds ISS-CAPTUREMAKER-003; this manifest. Historical startup and EOF evidence remain intact. The old startup source pin is historical for those bytes; fresh broker results must name this new epoch.

Caller/consumer: createBrowserJoiner.stop via runRecord finally awaits this method before normalization/finalization; rejected stop prevents downstream promotion. runRecord's injected fake-child four-case regression suite remains the immediate consumer check. Security flags: credential token extension/receiver lifecycle, owned child/profile locks, evidence writes, foreign-status preservation; no new tenant authority. Evidence covers actual thrown stopFile/status cases; receiver-close/remux failure branches are source-reviewed defensive attempts, not injected runtime proof. Original source failure control flow is a static finding; no fabricated pre-fix RED execution.

## Sole broker request

Bundled node C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe, cwd packages/meeting-bot:

`node --test --test-concurrency=1 --test-timeout=25000 --import tsx src/capture/tab-startup-cleanup.test.ts src/capture/tab-stop-cleanup.test.ts src/capture/workspace/record-stop-regression.test.ts`

Outer75seconds. Expected9cases: unchanged ledger ISS-CAPTUREMAKER-0012, new ISS-CAPTUREMAKER-0033 and existing ISS-T034FIX-004 four caller cases. Exact recorded cases are retained, not substituted. Required direct startup/stop dependencies must be pinned before/after, resolving old startup receipt's missing-pin history with actual fresh evidence. No FFmpeg/EOF replay: that separate source/consumer is unchanged. No secrets/env key required. Child subprocess sandbox facts handled by sole broker under existing approval; maker does not launch execution.

Pending broker exit/count/duration/current hashes and independent current-cycle verdict. Shared contracts-verifier receipt is separately supplied by root, not invented. Full real60minute/two-tab capture, private timeline calibration, real downstream provider/OBS/host and operational acceptance remain NOT VERIFIED. No parent/task tracker closed.
