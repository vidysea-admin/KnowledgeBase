# Verdict — t034-tab-capture-extension-logic-tests

VERDICT: PASS
Cycle checked: 0
Commit checked: c1456df (branch lane/t034ext, from 04759f6)
Scope: logic tests with fakes; no real browser; T-034 stays open. Test-only unit; tests are NOT discovered by CI today.

## Evidence (re-derived)
- `git diff 04759f6 c1456df`: 5 new files only (3 test/harness .mjs, manifest, lane ledger). Extension files untouched: `git hash-object` = `git rev-parse HEAD:<file>` for recorder.js (335fc97a), background.js (37ec1ae5), manifest.json (3c49a487), before and after my mutations.
- `node --test` recorder.test.mjs: 29 tests, 23 pass, 0 fail, 6 todo. background.test.mjs: 10 pass. `lint-dirsize`: OK. Non-blank line counts: recorder.test 200, background.test 77, harness 78 (limit 400).
- `git merge-tree --write-tree HEAD codex/machine-migration-2026-10-09`: clean (no conflicts).

## 1. Cap ruling
0 prior PASSes verify recorder.js/background.js. Rule: "Security class — tenancy, auth, cross-tenant read, data write, credential handling | Never capped." The extension uploads the recording (data write) and carries the bearer token (credential handling); and the seam has zero PASSes, so even the 2-PASS cap on non-security findings is not reached. Ruling: unit admissible; not a capped seam.

## 2. Fidelity of the harness
The vm loader reads the production file text and evaluates it unmodified (CRLF preserved). Fakes MORE permissive than the real API: (a) returning `true` from onMessage is not required for respond() to work, so removing it survives all tests (real Chrome would close the port and every start would read "did not acknowledge"): ISS-T034EXT-007. (b) `AbortSignal.timeout` returns an inert object: a hung receiver is never timed out; tests only assert the signal is present. (c) the fake interval `tick()` runs timers sequentially; real 1 s control/meter timers can overlap an in-flight 5 s/10 s request. (d) `getUserMedia`/`getMediaStreamId`/`offscreen.createDocument` never reject (no NotAllowedError, no "tab already captured", no "invoked action" requirement). (e) the fake MediaRecorder does not auto-stop when all tracks end, and chunk `data` is a plain object, not a Blob. Stricter-than-real: none that makes a test meaningless. Non-vacuity: ack-ignored, parallel-send, final-flush, bearer, endpoint, failed-masked and second-start mutants are each killed (item 6), so those tests fail when the code is wrong.

## 3. Trust chain and ISS-T034EXT-005
Chain: the controller (tab-browser.ts) writes config.json {endpoint http://127.0.0.1:port, 32-byte token} into the unpacked extension dir (mode 0600) -> background.js fetches it from its own chrome-extension origin on an action click (sb_join.py drives the click) -> background sends the start message via chrome.runtime.sendMessage -> offscreen recorder.js uses message.config.endpoint. Config is NOT in a URL/query string. Manifest keys as they are: no externally_connectable, no content_scripts, no web_accessible_resources; permissions tabCapture, offscreen, activeTab, contentSettings, declarativeNetRequest (no `scripting`); host_permissions only http://127.0.0.1/*. No code calls executeScript or postMessage; no window "message" listener; background registers no onMessage/onMessageExternal/onConnect. By Chrome's rules a web page or another extension cannot deliver a message to recorder's onMessage, and config.json is not fetchable by pages. The receiver independently requires Origin `chrome-extension://[a-p]{32}` and the bearer token (timingSafeEqual). Exposure is unreachable today: LOW exposure is right. But the handler has no sender check and no loopback pin, and the harness confirms a foreign-sender start returns ok:true. Because this is credential/data-write class (never capped) I re-rated the row to MEDIUM as a hardening item for the next unit that may edit recorder.js (sender.id === chrome.runtime.id; endpoint must match ^http://127.0.0.1:\d+$). Constraint for the Approver: t052-executable-registration freezes background.js and manifest.json only; recorder.js is not in that freeze list, so the fix does not touch frozen files.

## 4. Receiver consequences
- ISS-002: tab-browser.ts:184 sets run.stopped on any capture-stopped and ignores `failed`; stop() later finds no failure and bytes>0 and records state "stopped" without throwing. The meter timer is cleared on stop, so the T-031 watchdog sees no levels and alerts after 120 s (detection, not prevention). Stays MEDIUM (not high).
- ISS-001: receiver returns 409 for any seq != nextSequence (tab-browser.ts:101), so chunk 1 after a lost chunk 0 is refused; no gapped file is written. Stays LOW.
- New ISS-T034EXT-006 (MEDIUM): fail() posts capture-error with errors swallowed; if that POST is lost and the later capture-stopped{failed:true} arrives, the receiver ignores `failed` and accepts a truncated recording. Reproduced in the harness (receiver-visible events: capture-started, capture-stopped{failed:true}); narrow window.

## 5. Expected-fail tests (6, node:test todo; each asserts the required behaviour)
ISS-T034EXT-002 track end reports failure; -001 no send after loss; -003 one getUserMedia on same-tick double start; -004 restart in same document; -005 foreign sender refused; -005 non-loopback endpoint refused. No unexplained failure hidden. Caveat: a todo test that begins passing is not flagged by node:test.

## 6. Mutations (own harness, per-mutation byte backup, restore in finally, process killed by timeout; deleted before commit)
17 run: 14 killed, 3 survived. Killed: ack ignored; parallel sends; retry exhaustion swallowed as success; control failure ignored; final chunk not flushed; failure reported as success; second start allowed; endpoint replaced; abort timeout removed; meter failure swallowed; track-ended listener removed; background bearer dropped; background error report to wrong host; empty chunk consuming a seq. Survived: `attempt < 1e9` (equivalent, the throw at attempt 2 still bounds it); `finishing` guard removed (equivalent, recorder state check covers it); `return true` removed (REAL gap, ISS-007). Killer test names were not captured (in-process reporter); kills are by non-zero exit. After the run recorder.js, background.js and manifest.json hashes equal HEAD.

## 7. CI discovery
Not discovered: root `test:lint` lists explicit files; packages/meeting-bot `test` globs `src/**/*.test.ts`; ci.yml runs `pnpm -r test` and `pnpm test:lint`. Neither package.json nor .github/workflows is an enforcement path listed in project CLAUDE.md. One-line change (packages/meeting-bot/package.json): `"test": "node --test --import tsx \"src/**/*.test.ts\" \"py/tab-capture/*.test.mjs\""` (the harness file does not match the glob). Gap rating: medium (process); without it the tests give no ongoing protection.

ISSUES-WRITTEN: ISS-T034EXT-006 (medium), ISS-T034EXT-007 (low); re-rated ISS-T034EXT-005 low->medium (hardening); notes on -001 (stays low) and -002 (stays medium) in qa/issues.t034ext.jsonl.

## Merge conditions
Merge the test-only unit; maker flips the manifest to checked-PASS; T-034 remains open. Orchestrator decides the one-line CI change. The next unit allowed to edit recorder.js should take ISS-005 and ISS-006 (receiver ignoring `failed`).
