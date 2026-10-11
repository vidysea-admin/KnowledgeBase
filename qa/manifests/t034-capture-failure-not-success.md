# Manifest — t034-capture-failure-not-success

Status: ready-for-check
Fix cycle: 0

**Goal task:** T-034 (in-browser tab capture). T-034 stays OPEN (no real-browser run yet).
**Lane:** T034FIX, branch `lane/t034fix` from d27cf71. New issues: `qa/issues.t034fix.jsonl` (ISS-T034FIX-001, -002).
**Classification:** data-write + credential-handling class on the recording path. Full ceremony. NEVER round-capped (D-014 class rule: security class opens a unit at any round count; PASSed verdicts on this seam do not limit it).
**Tier:** 2 (open medium issues on the recording path whose consequence is a bad recording reported as good: ISS-T034EXT-002, -006; plus hardening -005, which the checker re-rated medium).

## Scope
In: `packages/meeting-bot/src/capture/tab-browser.ts` (+5 lines), `packages/meeting-bot/py/tab-capture/recorder.js`, `packages/meeting-bot/src/capture/record-commands.ts` (one-line propagation), `packages/meeting-bot/package.json` (test script), tests `recorder.test.mjs` and `tab-browser.test.ts` (existing files; no file added in `src/capture`, `lint-dirsize` OK), ledger shard, this manifest.
Untouched: `background.js` and `manifest.json` (hash-frozen by t052-executable-registration; verified below). `recorder.js` is NOT in that freeze list (frozen: sb_join.py, background.js, manifest.json). Also untouched: D-119 reserved files, `qa/contracts/`, `qa/verdicts/`, enforcement paths, and the ledger statuses of the T034EXT rows (the checker closes them).

## A. Failed stop is a failure (receiver + recorder)
Receiver (`tab-browser.ts`, onEvent): a `capture-stopped` with `failed === true` sets `failure` ("Recorder reported a failed stop; media is incomplete") and writes status `failed`, independent of any earlier `capture-error`. `failure` is never cleared, so a `capture-error` seen earlier stays a failure even if the later stop says `failed:false` (sticky). The error POST can be lost (006), so the `failed` flag alone suffices. `deps.stop()` then rejects with that reason (a typed message, which is how this file already surfaces capture failures) and `record-commands` already rethrows it for the tab backend (`if (backend === "tab") throw e`), so `finalizeRecording` is never reached. `record-commands.ts` onEvent also sets `captureFailure` on a failed stop (one line) so the record loop ends early instead of running to `--until`.
Partial media file rule: KEPT on disk next to `<handle>.webm.status.json` with `state:"failed"` and the error; never promoted. stop() throws before the normalise/finalize/index steps and writes `failed`, not `stopped`. This is the existing interrupted-recording treatment (status file + recoverable WebM), unchanged.
Recorder (`recorder.js`): a track `ended` event while no stop was requested (`finishing` false) now calls `fail(...)`: `capture-error` ("audio track ended unexpectedly" / "video ...") then `capture-stopped {failed:true}`. A stop requested by the bot (control poll `stop:true`) sets `finishing` first, so track ends after it stay clean (`failed:false`). MediaRecorder `onerror` already called `fail()` (unchanged, pinned by an existing test).

## B. Endpoint and sender pinning (recorder.js)
- Endpoint: raw-string regex `^http://127\.0\.0\.1:([1-9]\d{0,4})$`, port <= 65535, token a non-empty string; checked FIRST in `start()`, before any fetch or getUserMedia; refusal replies `{ok:false,error}`. Decision: `localhost` and `[::1]` are NOT accepted. The receiver binds `127.0.0.1` only and builds its endpoint as `http://127.0.0.1:<port>`, and `manifest.json` host_permissions is only `http://127.0.0.1/*`, so any other form could never work. No userinfo, path, trailing slash, https, IPv4-mapped IPv6 or LAN address. (Deliberately stricter than the brief's "or localhost".)
- Sender: `sender.id === chrome.runtime.id && !sender.tab && (sender.url undefined or starts with chrome-extension://<own id>/)`. Chrome semantics: messages from extension pages and the service worker carry the extension id and no `tab`; content scripts carry `sender.tab`; web pages cannot reach `onMessage` at all (only `onMessageExternal` with externally_connectable, which the manifest lacks). background.js sends with `chrome.runtime.sendMessage` from the service worker (sender.url `chrome-extension://<id>/background.js`, no tab), which passes. Only `start` exists (there is no `stop` message). A foreign sender gets `{ok:false,error:"Sender refused"}` and nothing starts. The bearer token is only used after both checks (`config` is assigned after validation).

## C. CI discovery
`packages/meeting-bot/package.json` test script is now `node --test --import tsx "src/**/*.test.ts" "py/tab-capture/*.test.mjs"` (one-line change; neither package.json nor the CI workflow is an enforcement path; CI runs `pnpm -r test`). Proof: `node --test --import tsx "py/tab-capture/*.test.mjs"` (the new glob, run in packages/meeting-bot) reports tests 44, pass 43, todo 1 (ISS-T034EXT-004), fail 0, so both `recorder.test.mjs` and `background.test.mjs` are discovered. The full package suite was not run (CPU).

## D. Low items
- ISS-T034EXT-001: FIXED (`if (failed) return;` in the queue callback); its todo test now passes.
- ISS-T034EXT-003: FIXED (`starting` flag set synchronously; reset on a failed start before a recorder exists); todo test passes.
- ISS-T034EXT-007: FIXED test-side (double-start test asserts `ret === true` for a valid start).
- ISS-T034EXT-004: LEFT OPEN (todo test stays). Resetting module state across captures interacts with in-flight failure state and is a T-038 scheduler design decision; unreachable today (managed Chrome per capture).
New: ISS-T034FIX-001 (medium, unverified: a tab closed by the meeting before the bot's stop may now report failed; needs one live run), ISS-T034FIX-002 (low, no isolated test for the record-commands line).

## Existing assertions edited (old -> new)
1. recorder.test.mjs "P3 track ending ...": `capture-stopped failed:false` -> `failed:true` (title now says FAILED; this is the defect being fixed).
2. "P4 double start ...": extended (first start now sent explicitly and asserts `ret === true`); the original refusal assertions are kept.
3. `todo` markers removed from the 001/002/003/005 tests (they pass as normal tests). Nothing else edited; all pre-existing tab-browser tests are unchanged.

## D-015 counts (recorded reproductions, run as tests)
- ISS-T034EXT-002: 1/1 recorded reproduction (audio track ends mid-recording -> capture-error / failed:true), plus the video-track variant (existing test, edited) 1/1.
- ISS-T034EXT-006: 1/1 (stop `failed:true` arriving without its capture-error). The recorded chain is covered in two halves, not one end-to-end run: recorder side (chunk blip x3 -> stop with failed:true; existing P3 tests) and receiver side (fake extension sends only the failed:true stop).
- ISS-T034EXT-005: 2/2 (foreign sender with a web url; `https://evil.example` config with no call made), plus an endpoint table (28 refused forms including all the brief's, zero fetches asserted) and a sender table (8 refused, 2 accepted).
- ISS-T034EXT-001: 1/1. -003: 1/1. -007: 1/1 (assertion added). -004: 0/1 (left open, todo).

## Evidence (worktree, node v24.19.0)
- `node --test recorder.test.mjs background.test.mjs` (cwd py/tab-capture): `tests 44 / pass 43 / fail 0 / todo 1`.
- `node --test --import tsx src/capture/tab-browser.test.ts`: `tests 6 / pass 5 / fail 1`. The one failure is the PRE-EXISTING `owned status retains ...` test: `EPERM: operation not permitted, symlink` (this machine cannot create symlinks; environmental, not touched). The 3 new receiver tests pass.
- `node --test --import tsx src/capture/record-commands.test.ts`: `tests 19 / pass 18 / fail 0`.
- `tsc --noEmit -p tsconfig.json` (packages/meeting-bot): 1 error, `src/calendar/skip-describe.ts(9,14) TS2741 "unverified-link-source" missing`, in a file I did not touch (lane junctions resolve `@lkb/*` to the newer main tree); zero errors in the touched files.
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (117 dir(s) within budget)`.
- Non-blank sizes: tab-browser.ts 258 -> 263 (limit 300), recorder.js 85 -> 105, record-commands.ts 271 -> 272, recorder.test.mjs 230 -> 247 (limit 400), tab-browser.test.ts 87 -> 123.

## Mutations (16; per-mutation byte backup, restore in finally, 250 s hard timeout; lane-private harness deleted before commit)
All 16 KILLED by named tests, and after each the mutated file hashed equal to its pre-mutation blob:
M1 failed flag on stop ignored (006); M2 sticky removed, clean stop clears failure (002 sticky); M3 failed stop counts only if capture-error seen (006); M4 partial file promoted, status "stopped" despite failure (006, sticky); M5 stop() no longer throws on failure (006, sticky); M6 unexpected track end reported clean (002 tests, P3 track ending); M7 deliberate stop reported as failure (002 deliberate-stop test); M8 endpoint check = startsWith("http://127.0.0.1") (endpoint table); M9 userinfo accepted (endpoint table); M10 sender check removed (005 sender tests); M11 request carrying the token sent before the endpoint check (no-fetch assertions); M12 later chunks still sent (001); M13 double-start guard removed (003); M14 port range unchecked; M15 sender.tab not refused; M16 empty token accepted.

## Frozen files (untouched, equal HEAD)
background.js git blob `37ec1ae52771296e09146fcef314297551a00d43`, manifest.json git blob `3c49a487773b53cdb549d332542d509230f8f1fc`; each equals `git rev-parse HEAD:<file>` (bytes unchanged, so the t052 sha256 freeze holds).

## NOT done / unverified
- No real browser and no live tab-capture session. This MUST be exercised once live before T-034 is called done: normal end, tab closed by the meeting (ISS-T034FIX-001), controller stop, and that Chrome's real `sender` for the background-to-offscreen message satisfies the predicate (the harness fake sends only `{id}`).
- The fakes are more permissive than Chrome: `track.stop()` never fires `ended`, MediaRecorder never errors by itself, `respond` works without `return true` (007 asserted separately).
- Failed-stop handling is tested with a fake extension child process, not the real extension; the receiver half and recorder half are not joined end to end.
- ISS-T034EXT-004 stays open. T034EXT row statuses were not changed (checker's job).
