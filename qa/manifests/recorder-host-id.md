# Manifest — recorder-host-id
**Contract:** qa/contracts/recorder-host-id.md (commit ef054973; the criteria and invariants are on the Criteria line below; the joint check is the checker's); decisions D-227, D-233 item 6, D-243 item 2 (unit B3)
**Goal task:** none
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** required
dual-trigger: security packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.ts:68
dual-note: the unit changes what the person-signed slot acceptance comparison trusts (`receipt.hostId!==captureSlotHostId()` at capture-slot-acceptance.ts:68 for publishing, :109 for the acceptor, and the id inside `keyFor` at :30). The contract sets `Dual check: required`. The route tool printed `dual:false` for this diff (see Route line) because `capture-slot-acceptance.ts` itself is not in the diff (B3-I2); the requirement comes from the contract, not from the route tool.
**Persona walk:** skip (no screen, flow or user type changed; a library function behind the capture and scheduler processes, no UI, no route)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one spec-complete unit, one source file and two test files, one builder.

## What changed
Worktree `D:/KnowledgeBase/.worktrees/b3-host-id`, branch `wave/b3-host-id`, base `a64cb3ae108c61bd2c235609b96885f2c4827225` (`docs/cloud-run-golive`), head `e32ea0cad598162a5b93993ab7371bf021ac1d0a`. Exactly three files changed (`git diff --name-only a64cb3ae..HEAD`):
- packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts (edited in place, +26 -2 lines; no new file, no duplicate function):
  - `:14` `HOST_ID_SETTING = "LKB_CAPTURE_HOST_ID"`; `:15` module state for the once-per-process log; `:16` private helper `settingHostId(value, platform)` = `sha256(JSON.stringify(["lkb-capture-host-id", value, platform]))`.
  - `:18-27` new export `assertCaptureHostIdSetting(env = process.env): string | undefined` (the ONE validator, name per the contract [ASSUMPTION]). Absent (`env[name] === undefined`) returns `undefined`. Refusals, in this order, each `throw new Error("LKB_CAPTURE_HOST_ID refused: <class> (length N)")` at `:23`: `empty` (""), `blank` (only whitespace), `whitespace` (leading or trailing), `too long` (> 64), `bad character` (anything outside `^[A-Za-z0-9][A-Za-z0-9._-]*$`, which also covers a first character that is not a letter or digit). The message holds the setting name, the class and the length, never the value. No trim, no case fold, no truncation. A valid value logs ONE line `[capture-host-id] LKB_CAPTURE_HOST_ID=<value> hostId=<64 hex>` to stderr (`:25`), once per distinct resulting id per process.
  - `:28-33` `captureSlotHostId(env = process.env)`: calls the validator first (so the lazy refusal happens on first use anywhere the id is computed), returns `settingHostId(setting, process.platform)` when set, and otherwise the old expression `sha256(JSON.stringify([hostname(), process.platform]))` byte for byte.
  - `:72` `validateCaptureSlotReadiness` and `:82` `listCaptureSlotReadiness` now evaluate `const hostId = options.hostId ?? captureSlotHostId()` once, before reading any file (before: evaluated inside the comparison, after the receipt read, and never at all when no receipt exists). Without the setting the result is identical; with a bad setting they now refuse even when the directory holds no receipt (see "Differences from the contract").
  - `:92` `createCaptureSlotReadinessObserver` calls `assertCaptureHostIdSetting()` when `workspace.slot` is set, so the capture path (`tab-session-workspace.ts:95`) refuses a bad setting when it builds the observer, not later inside `publish`, whose `catch` would swallow it as "could not be persisted".
- packages/meeting-bot/src/capture/workspace/capture-slot-readiness.test.ts (tests added at the end, +195 lines; the only changed existing line is the `node:fs` import gaining `readdirSync`; no assertion edited or removed): `B3-C1`, `B3-C2 a/b`, `B3-C3`, `B3-C4`, `B3-C5`, `B3-C5/C6` (two), `B3-C7 d`, `B3-C8`.
- packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.test.ts (tests added at the end, +71 lines, imports only; no assertion edited or removed): `B3-C2 c`, `B3-C3`, `B3-C4`, `B3-C7`.
- Not edited: `capture-slot-acceptance.ts` (zero changed lines, B3-I2), `tab-session-workspace.ts`, `scripts/native-capture/server.ts`, `scripts/webinar/scheduler/deps-runtime.mjs`, `docker/meeting-bot/*`, `apps/api`, any consent file. No package added; no `.env` opened; no network.
- Test seam: hostname is stubbed by assigning `os.hostname` on the default `node:os` object and calling `syncBuiltinESMExports()` (the repo's existing pattern for `child_process`), platform by `Object.defineProperty(process, "platform", ...)`, restored in `finally`. No production parameter exists only for tests; the optional `env` parameter is the production default `process.env`. Golden ids are computed in the tests with `node:crypto` from the stated preimages, plus three literal golden values captured from the UNMODIFIED code before the change (below).
- Golden values from today's code, before any edit (script run against the unmodified `captureSlotHostId()` with `os.hostname` and `process.platform` stubbed): `host-a/linux 23c9d73eaf13650f7975ee1853b67150ce83e86be2f47934ad5ce86d2f721bef`, `cloudrun-7f3/linux 412f1091d1585c039dfe4e7214b319f6578a19d24bdcc3d113f524c0fb3ba7d7`, `DESKTOP-X/win32 823c17b3a957d5a7e1b713f7735b0c3767876fc154868109fc7a4dabaf7d8e06`. Test `B3-C3` asserts all three literally and passed on the unmodified formula before the code change (it is in the green-before column of the red run below).
- falsified (unchanged): none; every falsification ran in a throwaway COPY (a second git worktree, `D:/KnowledgeBase/.worktrees/b3-host-id-mut`, detached at the head, with its own `pnpm install --frozen-lockfile --offline`, no junction), one mutation at a time, byte backup taken just before each mutation and kept for that mutation only, test command under a 420 s timeout, restore in a `finally` that also fires on SIGINT and SIGTERM, a byte compare after each, and at the end `git hash-object` of both touched files equals `git rev-parse HEAD:<file>`.
- [ASSUMPTION] Approver question 1: the override may be operator-asserted. Built on the contract's default (accepted); the binding protects against accidental carry-over, not a determined holder of the profile tar. Not decided here. Reply words stay "B3: override accepted" or "B3: keep machine-derived, find another way".
- [ASSUMPTION] Approver question 2 (which process publishes the slot acceptance in the hosted layout) and 3 (the production value) are not this unit; no deployment file sets the variable.
- [ASSUMPTION] preimage `["lkb-capture-host-id", V, process.platform]`; accepted pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` implemented as the length check plus the pattern; validator name `assertCaptureHostIdSetting`; the optional `env` parameter; one start-time log line to stderr (console.error, so stdout JSON of a host process is never polluted). All are the contract's own [ASSUMPTION]s.
- [ASSUMPTION] "Absent" means `env[name] === undefined`, so a property explicitly set to `undefined` counts as absent; every string, including "", is present and judged.
- [ASSUMPTION] Reason-class order when a value fails several rules: empty, blank, whitespace, too long, bad character (a 65-character string with a bad character reports `too long`).

## Differences from the contract
- C6 asks that the start code of each process calls the validator. The call sites (`deps-runtime.mjs`, `scripts/native-capture/server.ts`, `tab-session-workspace.ts`, the API host) are in files this unit may not edit, so they are `CORE-REQUEST` lines below. In their place the validator also runs inside `captureSlotHostId()` (as the contract asks) and, in addition, at the top of `validateCaptureSlotReadiness`, `listCaptureSlotReadiness` and `createCaptureSlotReadinessObserver` (with a slot). Those three extra calls are the only logic added beyond the contract's literal text; they are there so a bad setting is refused even when no receipt is on disk (validate and list otherwise return "no evidence" or an empty list and never reach the id) and so the capture path cannot swallow the refusal inside `publish`.
- The start-time test (C5, "the process exits non-zero before it reads or writes any file") is shown with a real child process (`node --import tsx -e` importing the module and calling the validator, working directory an empty temp folder, which stays empty). The exit code is the unhandled throw of the validator; the real entry points are the CORE-REQUESTs.

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: L (security: the provenance comparison of the person-signed slot acceptance; `Dual check: required`)
Round: 3 files (1 source edited in place, 2 test files extended), 13 criteria and invariants, est 2 h
slow-plan: one test process at a time; the child-process start-time test spawns 8 node processes (about 8 s); the 9-mutant batch took about 4 minutes.
Criteria: `B3-C1`, `B3-C2`, `B3-C3`, `B3-C4`, `B3-C5`, `B3-C6`, `B3-C7`, `B3-C8`, `B3-I1`, `B3-I2`, `B3-I3`, `B3-I4`, `B3-I5` (B3-L1 is live-only, see NOT-MEASURED)
Owners: one builder owns `capture-slot-readiness.ts` and the two test files (no file has two owners).
Fan-out: none; SERIAL: one unit, one builder, one module whose test file and source share every helper.
Base / checked state: base a64cb3ae; head e32ea0c (e32ea0cad598162a5b93993ab7371bf021ac1d0a); worktree clean; blobs `capture-slot-readiness.ts:8979b77237702bd37b23924f95539c57b2f18fda`, `capture-slot-readiness.test.ts:f491cd1cdfcfc658d928ae77879a957b1c47a162`, `capture-slot-acceptance.test.ts:ed5b60069f54f83183c11fdafa1ef863187469b3`, `capture-slot-acceptance.ts:a8b66d394346932dfb6d9201b9851cde8af99225` (unchanged); each equals `git rev-parse HEAD:<file>`.
Route: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --route a64cb3ae..e32ea0ca --root "D:/KnowledgeBase/.worktrees/b3-host-id"` -> `{"floor":null,"dual":false,"rules_fired":[]}`; the dual requirement is the contract's (above).
Gate answers: none; consent is out of scope (D-210); no production write, no push, no deploy, no `.env` read, no network, no install beyond the offline frozen restore of the locked packages, no junction created, no process killed.
Affected tests / full-suite trigger: `capture-slot-readiness.test.ts`, `capture-slot-acceptance.test.ts`, plus `tab-session-workspace.test.ts`, `caller-failure-readiness.test.ts` (they build the observer) and `scripts/webinar/scheduler/deps-runtime.test.mjs` (the scheduler runtime that lists readiness). No builder runs a full suite; `suite_runs=0`; the full-suite trigger is the checker's.
Random tests and seeds: none; the tests are table-driven with fixed values.
Red-first (skeleton, then the tests, then the code): a no-op skeleton (`assertCaptureHostIdSetting` returning nothing, `captureSlotHostId(env)` ignoring `env`) was added first so the tests fail on their assertions, not on a missing export. Run on the skeleton: `readiness test file: tests 13, pass 6, fail 7` (green before: the 4 existing cases, `B3-C3` and `B3-C7 d`; red: `B3-C1`, `B3-C2 a/b`, `B3-C4`, `B3-C5`, `B3-C5/C6` x2, `B3-C8`, each for its own reason, for example `B3-C1` "Expected values to be strictly equal" on the id, `B3-C5` `value "" must throw`, `B3-C8` the log line count). `acceptance test file: tests 11, pass 8, fail 3` (red: `B3-C2 c` receipt hostId mismatch, `B3-C4` "acceptance under V1 refused under V2", `B3-C7` "positive control"; green: the 7 existing cases and `B3-C3`). Honesty on order: the first version of `B3-C3` also asserted that the setting orphans an old receipt, which is a C4 fact; it failed on the skeleton, was split so `B3-C3` holds only no-setting behaviour and is green on today's formula, and the orphan fact stays in `B3-C4`.
Pre-check[B3-C1]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts -> 13 passed, 0 failed (cwd packages/meeting-bot, worktree b3-host-id; includes "B3-C1") t=4 blobs=capture-slot-readiness.ts:8979b77,capture-slot-readiness.test.ts:f491cd1
Pre-check[B3-C2]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts src/capture/workspace/capture-slot-acceptance.test.ts -> 24 passed, 0 failed (13 + 11; "B3-C2 a/b" and "B3-C2 c" run the real observer, the real acceptor and the real registry files, hostname A then B) t=8 blobs=capture-slot-readiness.ts:8979b77,capture-slot-acceptance.test.ts:ed5b600
Pre-check[B3-C3]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts src/capture/workspace/capture-slot-acceptance.test.ts -> 24 passed, 0 failed (the 4 + 7 existing cases unchanged and green, plus both "B3-C3" cases) t=8 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-C4]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts src/capture/workspace/capture-slot-acceptance.test.ts -> 24 passed, 0 failed (both "B3-C4" cases) t=8 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-C5]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts -> 13 passed, 0 failed (18-value refusal table in-process, 8 values by a real child process that exits non-zero with an empty working directory) t=4 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-C6]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts -> 13 passed, 0 failed ("B3-C5/C6": observer, validate and list refuse a bad process setting with no receipt on disk and leave both directories empty) t=4 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-C7]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts src/capture/workspace/capture-slot-acceptance.test.ts -> 24 passed, 0 failed ("B3-C7" acceptor: other root, other issuer key, 8 tampered bindings, both tenants, media origin, newer marker; "B3-C7 d" raw or non-64-hex hostId) t=8 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-C8]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts -> 13 passed, 0 failed ("B3-C8" one log line holding name, value and id; "B3-C5" captures every console method for the whole refusal table and finds nothing) t=4 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-I1]: e32ea0c node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts -> 13 passed, 0 failed ("B3-C2 a/b" asserts 15 keys, version 1, 64-hex hostId and that the raw setting is absent from the receipt file) t=4 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-I1]: e32ea0c npx tsc --noEmit -p tsconfig.json -> exit 0, no output (cwd packages/meeting-bot) t=30 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-I2]: e32ea0c git diff --name-only a64cb3ae..HEAD -> ok, the three files listed above and not capture-slot-acceptance.ts (zero changed lines there) t=1 blobs=capture-slot-acceptance.ts:a8b66d3
Pre-check[B3-I3]: e32ea0c git diff --stat a64cb3ae..HEAD -> ok, 3 files changed, 288 insertions, 4 deletions (the 4 deleted lines: the old `captureSlotHostId` body (3 lines, replaced in place) and the `node:fs` import line gaining one name; no new file, no second id function) t=1 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-I4]: e32ea0c grep -c "capture/tiles" packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts -> ok, 0 matches (the sampler-clock `hostId` under `capture/tiles/` is not imported and not touched) t=1 blobs=capture-slot-readiness.ts:8979b77
Pre-check[B3-I5]: e32ea0c git diff a64cb3ae..HEAD --stat -- packages/meeting-bot/src/capture/record-consent -> ok, empty (no consent file touched) t=1 blobs=capture-slot-readiness.ts:8979b77
Pre-check[affected]: e32ea0c node --test --test-concurrency=1 --import tsx src/capture/workspace/tab-session-workspace.test.ts src/capture/workspace/caller-failure-readiness.test.ts -> 8 passed, 0 failed (cwd packages/meeting-bot) t=6
Pre-check[affected]: e32ea0c node --test --test-concurrency=1 --import tsx scripts/webinar/scheduler/deps-runtime.test.mjs -> 13 passed, 0 failed (cwd worktree root) t=8
Tests[B3-C1]: capture-slot-readiness.test.ts::"B3-C1" — four stubbed hostnames give one id equal to `sha256(["lkb-capture-host-id", V, platform])` computed in the test; it is 64 hex, is not V, differs from `sha256([V])` and `sha256([V, platform])`; linux and win32 give two ids; `Prod-1` and `prod-1` give two ids; the default `env` is `process.env`
Tests[B3-C2]: capture-slot-readiness.test.ts::"B3-C2 a/b" and capture-slot-acceptance.test.ts::"B3-C2 c" — (a) receipt written through `createCaptureSlotReadinessObserver` under hostname A and V is accepted by validate and list under hostname B and V; (b) refused under B with no setting (and under A with no setting); (c) a signed acceptance published under A and V is honoured by `createCaptureSlotEvidenceAcceptor` under B and V and under a third hostname for a later observation, and refused under B with no setting; real acceptor, real registry files (the existing fixture, which mocks only the Windows ACL probe)
Tests[B3-C3]: capture-slot-readiness.test.ts::"B3-C3" and capture-slot-acceptance.test.ts::"B3-C3" — absent variable (empty env, unrelated keys, `process.env`) gives `sha256([hostname, platform])` for four hostname/platform pairs, three of them also as literal golden values captured from the unmodified code; a receipt built by hand with the old formula is accepted by validate and list under the same hostname and refused under another; the acceptor and `publishCaptureSlotAcceptance` use the hostname id; all 4 + 7 existing cases pass with no assertion edited
Tests[B3-C4]: capture-slot-readiness.test.ts::"B3-C4" and capture-slot-acceptance.test.ts::"B3-C4" — V1 vs V2 ids differ, V vs no setting differ; a receipt or acceptance written under V1 is refused under V2 and with no setting (even on the writing host); a receipt or acceptance written with no setting is refused under V; `publishCaptureSlotAcceptance` refuses a receipt written under another id ("stale, foreign or synthetic")
Tests[B3-C5]: capture-slot-readiness.test.ts::"B3-C5" and "B3-C5/C6" (child process) — 18 refused values (`""`, `" "`, `"\t"`, `" prod"`, `"prod "`, 65 characters, `a/b`, `a\\b`, `.`, `..`, `../x`, `a<NUL>b`, `a<LF>b`, `prod:1`, `prod 1`, a non-ASCII string, `-prod`, `_prod`) throw from the validator and from `captureSlotHostId` with exactly `LKB_CAPTURE_HOST_ID refused: <class> (length N)`; 64 characters, `7`, `a.b_c-d`, `Prod-1`, `prod-1`, `0xAB` are accepted; 8 of the values start a real process that exits non-zero, prints no `STARTED` and leaves an empty working directory
Tests[B3-C6]: capture-slot-readiness.test.ts::"B3-C5/C6" (in-process) — with a bad process setting the validator, `createCaptureSlotReadinessObserver`, `validateCaptureSlotReadiness` and `listCaptureSlotReadiness` all throw (the last two with no receipt on disk) and neither directory gains a file; the call sites outside this unit are CORE-REQUESTs below
Tests[B3-C7]: capture-slot-acceptance.test.ts::"B3-C7" and capture-slot-readiness.test.ts::"B3-C7 d" — same V with another deployment's acceptor and with a replaced issuer key: false (restored key: true); each of tenant (receipt, verified, configured), slot, profileDir, recordDir, platform, fixture kind, raw-V hostId, other-V hostId, missing durable media origin, newer failure marker still refuses, with a positive control before each; a receipt whose `hostId` is the raw V, V padded to 64, upper-case hex or 63 hex is rejected by read, validate and list
Tests[B3-C8]: capture-slot-readiness.test.ts::"B3-C8" and "B3-C5" — one log line holding the name, the value and the id for repeated calls with the same V, none without a setting; for the whole refusal table, console log, info, warn, error and debug stay empty and the thrown message is exactly the fixed text (no echo, which also covers short values such as `.` that a substring test cannot judge)
Tests[B3-I1]: capture-slot-readiness.test.ts::"B3-C2 a/b" — 15 keys, `version: 1`, 64-hex `hostId`, raw V absent from the receipt file
Tests[B3-I2]: structural — `capture-slot-acceptance.ts` is not in the diff
Tests[B3-I3]: structural — the override and the validator are inside `capture-slot-readiness.ts`; no new file
Tests[B3-I4]: structural — the tiles `hostId` is neither imported nor touched
Tests[B3-I5]: structural — no consent file in the diff
Falsification[B3-C1]: copy-mutant `JSON.stringify(["lkb-capture-host-id",value,platform])` -> `JSON.stringify(["lkb-capture-host-id",value])` (platform dropped from the id) -> killed by "B3-C1", "B3-C2 a/b", "B3-C2 c", "B3-C5" (green before 24/0, restored, hash equals HEAD)
Falsification[B3-C2]: copy-mutant the id also hashes `hostname()` (`[hostname(),"lkb-capture-host-id",value,platform]`, so a restart changes it again) -> killed by "B3-C1", "B3-C2 a/b", "B3-C2 c", "B3-C5", "B3-C7"
Falsification[B3-C3]: copy-mutant the no-setting preimage gains a third element (`[hostname(),process.platform,0]`) -> killed by both "B3-C3" cases and the acceptance "B3-C4"
Falsification[B3-C4]: copy-mutant `listCaptureSlotReadiness` accepts the override id OR the hostname id -> killed by readiness "B3-C4" (exactly the either-or this criterion forbids)
Falsification[B3-C5]: copy-mutant the validator trims the value first (`env[...]?.trim()`) -> killed by "B3-C5" and the child-process test in "B3-C5/C6" (a padded value is no longer refused as padded)
Falsification[B3-C6]: copy-mutant the `assertCaptureHostIdSetting()` call in `createCaptureSlotReadinessObserver` removed -> killed by "B3-C5/C6" (in-process)
Falsification[B3-C7]: copy-mutant in `capture-slot-acceptance.ts` the `timingSafeEqual` signature comparison removed (the HMAC no longer checked) -> killed by "B3-C7" (different issuer key accepted) and the existing "fresh verified/configured tenant ... signed authority are mandatory"
Falsification[B3-C8]: copy-mutants (a) the once-per-process guard removed (`if(true)`) -> killed by "B3-C8"; (b) the refusal message echoes the raw value -> killed by "B3-C5" and the child-process test
Falsification[B3-I1]: none — structural plus "B3-C2 a/b" (15 keys, 64-hex, no raw V in the file)
Falsification[B3-I2]: none — structural: `capture-slot-acceptance.ts` absent from the diff (the C7 mutant above edits only the throwaway copy)
Falsification[B3-I3]: none — structural: no new file, no second id function
Falsification[B3-I4]: none — structural: the tiles module is not referenced
Falsification[B3-I5]: none — structural: no consent file in the diff
CORE-REQUEST: scripts/webinar/scheduler/deps-runtime.mjs call `assertCaptureHostIdSetting(env)` (dynamic import from `packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts`, next to the existing import at :12) once at runtime start, before `createCaptureSlotEvidenceAcceptor` at :33 and the first `listCaptureSlotReadiness` at :64, so a bad `LKB_CAPTURE_HOST_ID` stops the scheduler at boot with the one-line message instead of on first use
CORE-REQUEST: scripts/native-capture/server.ts call `assertCaptureHostIdSetting()` once at module start, before the first request can reach `captureSlotHostId()` at :39 and `publishCaptureSlotAcceptance` at :47 (it already imports `captureSlotHostId` from the same module at :13)
CORE-REQUEST: packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts call `assertCaptureHostIdSetting()` where the capture path starts (the readiness observer is built at :95); not needed for refusal, because `createCaptureSlotReadinessObserver` now validates when a slot is set, but it would make the refusal precede any profile or record file access in that process
CORE-REQUEST: apps/api (the host that runs the "roles:manage" acceptance step, whichever file calls `publishCaptureSlotAcceptance`; `apps/api/src/capture-readiness/host-connector.ts` exists only in the 2026-10-14 packet copy, not in this tree) call `assertCaptureHostIdSetting()` at process start; also the open Approver question 2 (which process publishes the acceptance in the hosted layout) decides whether that host needs the same setting at all
CORE-REQUEST: docker/meeting-bot/entrypoint.sh and docker/meeting-bot/Dockerfile (units B4 and P1) forward `LKB_CAPTURE_HOST_ID` into the container; nothing in this unit sets it, and the production value is chosen at B5
Mutation run integrity: each mutation had its own byte backup taken just before it, a restore in `finally` plus SIGINT and SIGTERM handlers, and a byte compare after each; 9 mutants (cap 10), one at a time, the previous run ended before the next began; at the end `git hash-object` in the copy of `capture-slot-readiness.ts` (8979b77237702bd37b23924f95539c57b2f18fda) and `capture-slot-acceptance.ts` (a8b66d394346932dfb6d9201b9851cde8af99225) equals `git rev-parse HEAD:<file>`; in the builder worktree all four touched or inspected files hash to their HEAD blobs. No mutation was run in the worktree. The throwaway copy `D:/KnowledgeBase/.worktrees/b3-host-id-mut` (detached, own node_modules) is left in place for the checker or the main session to remove with `git worktree remove`.
Metrics: start=2026-11-25T00:00:00Z end=unavailable wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=9 defects=0

## How to verify (commands + expected)
All from `D:/KnowledgeBase/.worktrees/b3-host-id`, test commands from `packages/meeting-bot`.
- `node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts` -> expected: 13 tests, 13 pass (the child-process start-time test spawns 8 node processes; allow 60 s).
- `node --test --import tsx src/capture/workspace/capture-slot-acceptance.test.ts` -> expected: 11 tests, 11 pass.
- `npx tsc --noEmit -p tsconfig.json` -> expected: no output, exit 0.
- `node --test --test-concurrency=1 --import tsx src/capture/workspace/tab-session-workspace.test.ts src/capture/workspace/caller-failure-readiness.test.ts` -> expected: 8 pass. From the worktree root: `node --test --test-concurrency=1 --import tsx scripts/webinar/scheduler/deps-runtime.test.mjs` -> expected: 13 pass.
- `git diff --name-only a64cb3ae..HEAD` -> expected: the three files above only; `git diff a64cb3ae..HEAD -- packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.ts` -> expected: empty.
- Mutants: each mutant in "Falsification" is a one-line edit; apply it in a COPY (not the worktree), run the two test files, expect the named tests red, then discard the copy.

## Actual outputs (from maker's own run)
On e32ea0c:
```
readiness test file          : ℹ tests 13  ℹ pass 13  ℹ fail 0
acceptance test file         : ℹ tests 11  ℹ pass 11  ℹ fail 0
tsc --noEmit                 : exit 0, no output
tab-session + caller-failure : ℹ tests 8   ℹ pass 8   ℹ fail 0
deps-runtime.test.mjs        : ℹ tests 13  ℹ pass 13  ℹ fail 0
mutation batch (copy)        : BASELINE 24/24 pass; 9 mutants each killed (fail 1 to 5); FINAL (restored) 24/24 pass;
                               hash-object == HEAD blob for capture-slot-readiness.ts and capture-slot-acceptance.ts
red run on the skeleton      : readiness 13 tests, 6 pass, 7 fail; acceptance 11 tests, 8 pass, 3 fail
```
Golden ids from the unmodified code: see "What changed".

## Capability coverage (each new claim -> its isolating falsification)
| Claim | Test | Falsification |
|---|---|---|
| One stable, domain-separated, platform-bound id under the setting | B3-C1 | platform dropped |
| A receipt and a signed acceptance survive a hostname change | B3-C2 a/b, c | hostname mixed back into the id |
| Without the setting the id is today's | B3-C3 (x2) | third element in the preimage |
| One id per process, no fallback | B3-C4 (x2) | list accepts either id |
| Bad value refused, not trimmed, not echoed | B3-C5, B3-C5/C6 | trim; echo of the value |
| Refusal on first use, even with no receipt | B3-C5/C6 | observer call removed |
| The override does not widen the acceptance gate | B3-C7, B3-C7 d | signature check removed |
| One log line, nothing for a refused value | B3-C8 | once-guard removed; echo |

## Live browser evidence
Not UI-touching. No browser, no meeting.

## NOT-MEASURED
- B3-L1: after a real Cloud Run restart that changes the hostname, the restored slot is still ready and counted by the scheduler with no person step. Live-only, owned by units B9 and P1; this unit supplies the mechanism.
- That Cloud Run changes the hostname per instance is a platform fact taken from D-233; not verified here.
- The five CORE-REQUEST call sites run no start-time validator yet; only the lazy refusal (first use) and the observer-constructor refusal are measured. The real entry points of the scheduler, the native-capture host and the API host were not started.
- The acceptance test harness mocks the Windows ACL probe (`spawnSync`), as the existing 7 acceptance tests do; the private-directory ACL itself is not measured by this unit. C2 c ran in this shell (Windows 11) with the real acceptor and real registry files, so it is a PASS-eligible measurement, not NOT-MEASURED.
- The macOS and Linux variants of the physical-path check inside `capture-slot-readiness.ts` were not run (platform is stubbed only for the id; the file-system calls run on the real Windows host).
- A NUL byte inside a real process environment cannot be set (the operating system refuses it), so the NUL value is shown in-process only; the other 7 child-process values cover the same refusal path.

## Filed, not built
- `tab-session-workspace.ts`, `scripts/native-capture/server.ts`, `scripts/webinar/scheduler/deps-runtime.mjs` and the API host start-time calls (CORE-REQUEST lines above).
- `createCaptureSlotReadinessObserver.publish` swallows every error as "Capture readiness observation could not be persisted" (pre-existing); the observer-constructor check added here avoids it for this setting only. Other causes still lose their message. Not changed.
- The start-time log line goes to stderr with `console.error` (assumption); if a host wants structured logging the CORE-REQUEST owners can wrap the call.
- `LKB_CAPTURE_HOST_ID` set to the same value on staging, production and a laptop would make a copied profile pass the host comparison (Approver question 1); the HMAC issuer key still blocks a registry the signing never saw (tested), but not a holder of the whole profile tar.

## Status: checked-PASS
