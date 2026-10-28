# T035 OBS restore-state security unit — cycle 2

Status: awaiting-broker; no checker verdict requested yet.
Root: `C:/Users/product/Desktop/KnowledgeBase`.
Base commit: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`.
Base Git blobs: source `45e7f5405c22313f79bdc8729ba84f102d283d83`; test `b8f62c71636e2df7a88af9a67ba7687715d3bd2b`.
Actual pre-edit source SHA256 was not captured and is unknown; existing test pre-edit SHA256 `70a3ffb071455590ff9058e68b52685d2c62ad14ff7b95705ea51007baf1ea92`.
Only leased tracked paths: `packages/meeting-bot/src/lean-video-obs.ts`, `packages/meeting-bot/src/lean-video-obs.test.ts`. Both modified; no new production paths. No central manifest/tracker edits. Review actual complete working diff, including any unrelated pre-existing diff, against the base.

Final frozen SHA256:
- Source `02c18b7ae5e13deffac856ddfe0aed22a326a5d63d0d0bc07db8da0dc2f51c01`.
- Test `1b9fb80f478e61b9db21e992fdd22c1a725ad9e4ba558b490510bf57fa81e5fa`.

Authorization: coordinator exact two-file lease, security/data-write seam; tier 3 T035 roadmap C4 (operator/source safety), not another nonsecurity polish round. Parent `qa/contracts/goal-t035.md` stays authoritative and unchanged. No existing ledger issue assigned to this newly observed source finding; no runtime reproduction claimed yet. Read `AGENTS.md`, `skills/maker/SKILL.md`, prior T035 helper manifest/verdict and parent contract. Relevant existing shard `qa/issues.leanwire.jsonl` has prior restore/wiring issues; their historical cases remain existing tests, not replaced by the new cases.

Concrete prior logic: `readState` accepted arbitrary parameterCategory/parameterName strings and restored all using SetProfileParameter. Valid video plus SimpleOutput/FilePath could redirect later recording output. Plain writeFileSync(stateFile) followed aliases; cleanup removed whatever path was present after asynchronous OBS requests. These are static source facts; actual OBS has not been contacted.

Change: bounded 64KiB fd read; exact BigInt dev/ino/size/mtimeNs plus bytes; reject local-file/ancestor aliases, hardlinks, nonregular files; fresh exclusive-create snapshots; retain existing valid snapshot bytes unchanged; only distinct SimpleOutput VBitrate/ABitrate restore keys (null/string values retained exactly), positive bounded integer video settings with exact known keys; recheck ownership before each apply/restore Set and before cleanup. Missing snapshot keys on a stale state now refuse another apply rather than rewrite old originals. Active-recording behavior and retryable failure state remain. Crash/host ACL/fully adversarial nanosecond path races are not claimed proven by these source checks.

Immediate consumers (read-only): `capture/obs/obs-windows.ts` apply/start/stop/failure restore; `capture/record-commands.ts` crash finalize --stop-obs. Their behavior cases already live in the leased test. No caller signature changes.

Broker exact check from root (outer timeout 60s, no shell-native OBS/browser/provider/encoder/network calls):
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 --import tsx packages/meeting-bot/src/lean-video-obs.test.ts`

This one file includes fake-client apply/restore, new arbitrary-key/invalid/duplicate/hardlink/same-byte-replacement/foreign-cleanup cases, valid operator/null/stale/retry/active-output preservation and immediate caller tests. Existing caller fixtures may spawn only the tiny local Node fake-join child; broker must retain skip/failure details and exact final pins. Windows hardlink refusal test does not silently skip unsupported host capability; an inability to create its fixture is an explicit failed prerequisite. No local test run, compilation, FFmpeg, OBS, browser, provider, native DB or network action was performed. Required validator/typecheck applicability remains for root/checker admission; no PASS or full T035 completion claim.

Maker usage: active time, tokens and monetary cost unknown (tool wall time includes shared CPU delays); do not report measured efficiency. Checker bootstrap scope, assessment gate and independent verdict belong to root after broker evidence. Genuine >=60min live size, intelligible speech/slides and actual host restoration remain HOLD.

## Cycle 1 broker failure and cycle 2 fixture-only correction

Actual broker receipt `qa/goal-vectorless-2026-10-15/verification-t035-obs-security-20261015T1200.json`: exit 1, 25 cases/23 PASS/2 FAIL, elapsed 16700ms, no source/test pin drift. All four new security tests passed. Existing runRecord OBS ordering and restore-notifier tests rejected the old fixture before intended assertions: `Invalid or mismatched live capture consent receipt` at record-consent/context.ts:61. This receipt remains preserved and is not recast as success.

Only cycle-2 source change is the test fixture's runRecord CLI arguments: explicit fixture operational approval/reference, organizer consent `given`, recorded-by attribution and confirmed-no-alternative. The real createRecordConsent/validateRecordConsent guard still executes unchanged; no product consent source, environment-global bypass or production permission is added. Source SHA stays unchanged; test current SHA above replaces cycle-1 `d1894f33065730b3d70bc71ac464d582cb03e029a61a8ec4661bc0a8808cc065`. Resubmitted exact same bounded whole-file command; no local tests run.
