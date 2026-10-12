# Manifest — t034-tab-capture-extension-logic-tests

Status: checked-PASS (Checked: qa/verdicts/t034-tab-capture-extension-logic-tests.md, cycle 0, c085e05; logic tests with fakes, no real browser)
Fix cycle: 0

**Goal task:** T-034 (in-browser tab capture), roadmap tier 3 pull. TEST-ONLY. T-034 stays OPEN.
**Lane:** T034EXT, branch `lane/t034ext` from 04759f6. Ledger shard `qa/issues.t034ext.jsonl` (ISS-T034EXT-001..005).
**Files (new only):** `packages/meeting-bot/py/tab-capture/tab-capture-harness.mjs` (helper, 78 lines), `recorder.test.mjs` (200), `background.test.mjs` (77), `qa/issues.t034ext.jsonl`, this manifest. No production file changed: `git diff 04759f6 -- 'packages/meeting-bot/py/tab-capture/*.js' packages/meeting-bot/py/tab-capture/manifest.json` is empty.

## Stop conditions and how each was cleared
- (a) D-119: its Changes-authorized list names no path under `packages/meeting-bot/py/tab-capture/`; the HOLD is "U4.1/T-051/T-052 whole-task" and reserves no extension file. Caveat for the checker: `qa/manifests/t052-executable-registration.md` freezes SHA-256 of `tab-capture/background.js` and `manifest.json`. This unit never changes those files (only temporary mutations, restored byte-exact, `git hash-object` equals `git rev-parse HEAD:<file>` after the run: recorder.js 335fc97a..., background.js 37ec1ae5...). The registration-policy globals in background.js (T-052 territory) are deliberately NOT tested here.
- (b) Round cap. PASSed verdicts that verify the extension files: 0. `grep -rl "tab-capture|tabCapture|tab recorder" qa/verdicts` finds only `t039-send-now-command` and `obs-windows-bot-child-extraction`, which mention it in passing; the ~4 PASSes on the wider capture seam concern the Node receiver (`tab-browser.ts`) and OBS paths, not `recorder.js`/`background.js`. This unit is the FIRST test of two untested files, not a further finding on a capped seam. The rule relied on, from `.claude/CLAUDE.md` Round cap: "**Security class** — tenancy, auth, cross-tenant read, data write, credential handling | **Never capped.**" The extension writes the recording (data write) and handles the bearer token (credential handling), so it is never capped regardless of count.
- (c) Loadability: both scripts load unmodified in Node `vm` with fakes (see below). Nothing was edited.

## Tier
Tier 3 (next unblocked roadmap task, T-034); full ceremony because it touches the data-write/credential path.

## How the extension is loaded unmodified
`tab-capture-harness.mjs` reads `recorder.js` / `background.js` as text and runs them with `vm.runInContext` in a fresh context holding fake `chrome`, `fetch` (call log, scripted per-URL behaviour, runaway guard), `MediaRecorder` (emits a final chunk on stop, then `onstop`), `AudioContext`, `navigator.mediaDevices`, tracks with `ended` listeners, `AbortSignal.timeout`, and a fake `setInterval/clearInterval` with a manual `tick()`. Top-level `let` state (`sequence`, `queuedBytes`, `failed`) is read through a second `runInContext` in the same context. Files use CRLF; the byte-identical source is what runs.

Architecture as found (differs from the brief's guess): offscreen `recorder.js` posts HTTP to `config.endpoint` (`http://127.0.0.1:<port>` from `config.json`) with `Authorization: Bearer`, routes `/chunk?seq=N`, `/event`, `/control`; receiver is `packages/meeting-bot/src/capture/tab-browser.ts` (already tested in `tab-browser.test.ts`: not duplicated). Retry is 3 immediate attempts with NO backoff delay (each request has a 10 s abort timeout). Bound is 16 MiB queued / 8 MiB per chunk.

## Properties
| # | Code does | Result |
|---|---|---|
| 1 ordering/ack | seq from a counter, one chunk in flight, next waits for the previous ack; non-2xx is not an ack; empty chunks take no seq; on stop the final chunk is acked before `capture-stopped` | PASS (5 tests) |
| 2 retry/memory | same chunk retried up to 3x, later chunks wait; 4th failure -> fail(); 10,000 x 1 MiB stalled -> capture fails after 16 chunks (`sequence==16`); chunk > 8 MiB fails | PASS. No backoff delay exists (noted, not an issue). |
| 3 fail closed | dead receiver on /control, non-2xx on /control, meter event failure, retry exhaustion, MediaRecorder error: all call fail() -> `capture-error` then stop -> `capture-stopped {failed:true}`, timers cleared, tracks stopped, context closed, no unhandled rejection | PASS. Defects: queued chunks still sent after a loss (ISS-T034EXT-001, low, expected-failure test); track-end reported as clean stop (ISS-T034EXT-002, medium, expected-failure test) |
| 4 lifecycle | double start refused (sequential); repeated stop harmless; stop during pending send waits for ack then completes; timers/tracks/context released; start failure releases tracks | PASS. Defects: same-tick double start races (ISS-T034EXT-003, low); no reset so a 2nd capture in one offscreen doc is refused (ISS-T034EXT-004, low) — both expected-failure tests |
| 5 tabs | single-capture by design: background refuses when any captured tab is active; recorder refuses a second start (and nothing goes to a second endpoint). Two-tab isolation NOT supported | PASS (asserts refusal) |
| 6 input trust | recorder handler acts only on target=recorder,type=start; background registers no onMessage/onMessageExternal/onConnect; manifest has no externally_connectable, content_scripts or web_accessible_resources, host scope 127.0.0.1 only. The handler never checks `sender` nor validates `config.endpoint` | PASS for the reachable surface; ISS-T034EXT-005 filed LOW (not HIGH): a foreign-sender message or a non-loopback endpoint IS accepted if one ever reaches the handler (2 expected-failure tests), but Chrome cannot deliver a web page's or another extension's message with this manifest. Reasoned, not run in a browser. |
| 7 destination | every request URL starts with the configured endpoint; background error reports go only to `${endpoint}/event` with the bearer token | PASS |

Expected-failure convention: `node:test` `{todo: "ISS-T034EXT-00N"}` (a failing todo does not fail the run and is reported as `⚠ EXPECTED FAIL`). Known gap (documented in a passing test): unreadable `config.json` means no start and no report (no endpoint to report to).

## Issues filed (lane ledger)
ISS-T034EXT-001 low (post-failure sends) · 002 medium (unexpected track end reads as clean stop) · 003 low (start race) · 004 low (no state reset) · 005 low (no sender/endpoint check, defence in depth; no HIGH finding). Reproductions are in each ledger row and each is a todo test.

## CI
NOT discovered. Root `test:lint` lists explicit files; `packages/meeting-bot` `test` globs `src/**/*.test.ts`; nothing covers `py/tab-capture/`. Follow-up (not done: no package.json/CI edit allowed): add the two files to a script. Run now with:
`node --test --test-timeout=60000 packages/meeting-bot/py/tab-capture/recorder.test.mjs packages/meeting-bot/py/tab-capture/background.test.mjs`

## Evidence
(node = codex runtime; from the worktree root)
```
recorder.test.mjs:   ℹ pass 23 · ℹ fail 0 · ℹ todo 6   (6 x ⚠ EXPECTED FAIL: ISS-T034EXT-001, 002, 003, 004, 005 x2)
background.test.mjs: ℹ pass 10 · ℹ fail 0 · ℹ todo 0
node scripts/lint-dirsize.mjs -> lint-dirsize: OK (117 dir(s) within budget)
```
Tests ran one file at a time in the foreground, fake timers only, no browser/network.

## Mutations (production files, byte backup per mutation, restore in `finally`, hash = HEAD verified)
15 applied, 15 killed, 0 survived (an earlier "retry 3->4" mutant survived because it was equivalent: `attempt === 2` still throws; replaced by the real mutation below).
1 ack check removed: killed by "non-2xx is not an acknowledgement". 2 retry bound removed (`attempt === 99`): "retry is bounded at exactly 3". 3 `.catch(fail)` swallowed: "retry is bounded at exactly 3 attempts". 4 sequence += 2: "ordering", "retry", "memory bound". 5 final flush (`await queue`) removed: "stop flush: final chunk acknowledged BEFORE capture-stopped" + "stop during a pending send". 6 target check removed: "only target=recorder,type=start". 7 second start allowed: "double start refused", "single-capture". 8 timers not cleared: three P3 tests. 9 memory bound removed: "memory bound". 10 `failed` hidden in capture-stopped: two P3 tests. 11 bearer dropped: "destination ... bearer". 12 background re-entrancy guard removed: "re-entrancy". 13 background active-capture refusal removed: "single capture". 14 background recorder ack not required: three P3 tests. 15 background error report dropped: three P3 tests. A sender-check mutation is not possible (no sender check exists: ISS-T034EXT-005). Listeners are never removed by the code (track `ended` handlers stay on stopped tracks), so "listeners not removed" has no counterpart; the released-resource assertions are timers, tracks, audio context.

## NOT done
No real browser, MediaRecorder, tabCapture or offscreen document; no 60-minute run; no two-tab run; no live receiver integration (the receiver side is covered by `tab-browser.test.ts`). The fake MediaRecorder's stop/ondataavailable ordering is modelled from the spec, not observed. T-034 stays open.
