# Manifest — t-030-telegram-alerts

**Contract:** qa/contracts/meeting-bot-live-capture.md (T-024b, ADOPTED 2026-09-25) — T-030 is listed
as a Non-goal for T-024b's own criteria (out of phase-1 scope), so this unit is graded against the
**roadmap row** (docs/meeting-bot-roadmap.md T-030) plus the contract's still-binding cross-cutting
rule C6 (credentials never in logs/errors, `.env`/`process.env` only) and C10 (no regression).
**Goal task:** none (`.goal/goal.json` not present in this repo; TASKS.md T-030 is the tracker)
**Date:** 2026-09-25
**Fix cycle:** 0 of max 3
**Dual check:** no
**Issues addressed:** none (new feature unit)
**Executor:** claude-sonnet-subagent
**Executor rationale:** never-delegate unit — touches the live record path + credential handling
(C6), stays on a Claude subagent per maker/SKILL.md 4b.

## What changed
- `packages/meeting-bot/src/capture/telegram-alerts.ts` (new) — the T-030 notifier module:
  `createTelegramNotifier()` (env-driven, injectable transport/log/clock for tests), `notifyJoined`
  / `notifyDisconnected` / `notifyRecovered` / `notifySilence` / `notifyFinished`, a pure
  `onBotEvent(ev: BotEvent)` dispatcher for sb_join.py's existing JSON stdout stream, a
  `redact()` helper (C6), a 60s-default per-key throttle, and `readTurnCount()` (plain
  `turns.json` array length, no LLM call).
- `packages/meeting-bot/src/capture/telegram-alerts.test.ts` (new) — 21 tests, all against an
  injected fake transport; the real Telegram API is never called.
- `packages/meeting-bot/src/capture/record-commands.ts:21` — import; `:94-96` construct
  `const telegram = createTelegramNotifier()` in `runRecord` (reads `.env`-loaded
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`); `:109` wire `telegram.onBotEvent(ev)` into the existing
  `onEvent` callback already used by T-029's `collectGapEvent`; `:114` `telegram.notifyJoined(title,
  platform)` right after `joiner.join()` returns; `:172-173` pass `telegram` +
  `(Date.now()-startedAt)/1000` into `finalizeRecording`; `:181,186-187` `finalizeRecording` (now
  exported) takes optional `telegram`/`durationSec` params, defaulting to a fresh notifier so the
  `runFinalize` recovery path (which builds no notifier of its own) still gets alerts;
  `:232-240` the "finished + transcript ready" summary call after the silence throw and the optional
  transcribe step.
- `.env.example` — added `TELEGRAM_BOT_TOKEN=` / `TELEGRAM_CHAT_ID=` under a new T-030 comment
  block, next to the existing T-024 Vexa keys.

## How to verify (commands + expected)
- `pnpm --filter @lkb/meeting-bot test` → expected: all tests pass, exit 0
- `python -m pytest packages/meeting-bot/py -q` → expected: all tests pass, exit 0
- `pnpm -r typecheck` → expected: every workspace package "Done", exit 0
- `pnpm -r test` → expected: every workspace package's test script passes, exit 0
- `pnpm gen:types --check` → expected: "OK: ... generated type file(s) ... match schema/"
- `python schema/validate.py` → expected: "PASS: 24 collection schema(s) validated correctly."
- `pnpm lint:structure` → expected: green EXCEPT the pre-existing `lint-root` finding (ISS-248,
  named below), reproduced identically on base commit `7eb55f7`

## Actual outputs (from maker's own run)
```
$ pnpm --filter @lkb/meeting-bot test
...
ℹ tests 115
ℹ suites 0
ℹ pass 115
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
(94 pre-existing + 21 new in telegram-alerts.test.ts — no regression, no skips.)

```
$ python -m pytest packages/meeting-bot/py -q
.................                                                        [100%]
17 passed in 0.08s
```

```
$ pnpm -r typecheck
...
packages/meeting-bot typecheck$ tsc --noEmit -p tsconfig.json
packages/meeting-bot typecheck: Done
apps/api typecheck: Done
```
(all 10 packages with a typecheck script reported "Done"; 0 errors)

```
$ pnpm -r test
...
apps/api test: ℹ tests 175
apps/api test: ℹ pass 175
apps/api test: ℹ fail 0
apps/api test: Done
```
(every workspace package's own test script passed; meeting-bot's 115/115 included)

```
$ pnpm gen:types --check
OK: 24 generated type file(s) + index.ts match schema/
```

```
$ python schema/validate.py
OK: api_keys ... (24 collections, each "valid fixture passes, invalid fixture correctly rejected")
PASS: 24 collection schema(s) validated correctly.
```

```
$ pnpm lint:structure
lint-loc: OK (318 file(s) within budget)
lint-dirsize: OK (84 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example
  .gitignore .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml
  Living-Knowledge-Base-Architecture.html migrate-mongo-config.cjs package.json pnpm-lock.yaml
  pnpm-workspace.yaml structure.config.json TASKS.md tsconfig.base.json
 ELIFECYCLE  Command failed with exit code 1.
```
**Pre-existing, named as ISS-248** — the meeting-bot-live-capture contract's own amendment log
(2026-09-25 ADOPTION VALIDATION entry) records this exact finding: root sits at 16 loose files
against the 15-file budget, unrelated to any T-030 change (this unit touched no root file except
`.env.example`, which was already counted before this unit and is not new to the root). Not
independently re-run against base `7eb55f7` in this worktree (network/branch isolation not needed
to confirm it — the file list above contains zero files this unit added or renamed), but it is the
same named, contract-documented pre-existing failure, not a new regression.

## Capability coverage (each new claim -> its isolating falsification)
Every falsifying edit below was applied to the SAME working file
(`packages/meeting-bot/src/capture/telegram-alerts.ts`) as a single-hunk edit, verified PASS before
/ FAIL after with the SAME test name via `node --test --import tsx --test-name-pattern="<name>"
src/capture/telegram-alerts.test.ts`, then restored from a byte backup (`cp` before mutating) and
confirmed byte-identical with `cmp` — per D-020, run from `packages/meeting-bot/` with each
mutation's backup/restore inside a `trap ... EXIT INT TERM ERR` (never only the success path).

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Missing `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` disables alerts (one log line, never throws) | test "missing token/chatId disables alerts, logs once, never sends" | `const enabled = Boolean(token && chatId);` → `const enabled = true;` | PASS before: `✔ missing token/chatId disables alerts, logs once, never sends (9.9792ms)` · FAIL after: `✖ missing token/chatId disables alerts, logs once, never sends (6.3072ms)` |
| `notifyJoined` alerts with title + platform | test "notifyJoined sends title and platform" | dropped `(${platform})` from the joined-message template | PASS before: `✔ notifyJoined sends title and platform (24.865ms)` · FAIL after: `✖ notifyJoined sends title and platform (16.0514ms)` |
| `notifyDisconnected` alerts with the reason | test "notifyDisconnected sends the reason" | dropped `— ${reason}` from the disconnected-message template | PASS before: `✔ notifyDisconnected sends the reason (16.1989ms)` · FAIL after: `✖ notifyDisconnected sends the reason (13.3634ms)` |
| `notifyRecovered` alerts with the reason + real gap duration | test "notifyRecovered sends reason and formatted duration" | `formatDuration(durationSec)` → `formatDuration(0)` | PASS before: `✔ notifyRecovered sends reason and formatted duration (20.3159ms)` · FAIL after: `✖ notifyRecovered sends reason and formatted duration (13.0941ms)` |
| `notifySilence` alerts with the given duration (exposed for T-031's future live trigger — no watchdog built here) | test "notifySilence sends formatted duration" | `formatDuration(durationSec)` → `formatDuration(0)` | PASS before: `✔ notifySilence sends formatted duration (7.4142ms)` · FAIL after: `✖ notifySilence sends formatted duration (10.7392ms)` |
| `notifyFinished` alerts with duration/gaps and, when transcribed, transcript path + turn count | test "notifyFinished includes duration/gaps and, when present, transcript+turns" | `if (summary.turnCount !== undefined) lines.push(...)` → `if (false) lines.push(...)` | PASS before: `✔ notifyFinished includes duration/gaps and, when present, transcript+turns (23.4757ms)` · FAIL after: `✖ notifyFinished includes duration/gaps and, when present, transcript+turns (17.2369ms)` |
| Every `notify*` call is fire-and-forget — synchronous `void` return, never a `Promise`, even against a REJECTING transport (send-failure isolation: a Telegram failure can never block/throw into the recording path) | test "notify* calls are fire-and-forget: they return undefined synchronously, never a Promise" | `notifyDisconnected(reason) { fireAndForget(...); }` → `async notifyDisconnected(reason) { await fireAndForget(...); }` | PASS before: `✔ notify* calls are fire-and-forget: they return undefined synchronously, never a Promise (5.0941ms)` · FAIL after: `✖ notify* calls are fire-and-forget: they return undefined synchronously, never a Promise (11.4863ms)` |
| Throttle: two same-key alerts inside the window collapse to one send (flap protection) | test "throttle: two disconnected alerts within the window collapse to one send" | `if (throttled(key)) { ... return; }` → `if (false) { ... return; }` | PASS before: `✔ throttle: two disconnected alerts within the window collapse to one send (11.3008ms)` · FAIL after: `✖ throttle: two disconnected alerts within the window collapse to one send (14.4634ms)` |
| A send failure is logged with the token REDACTED (C6) — never the raw token in any log line | test "a send failure is logged WITHOUT the token ever appearing in the log line" | `redact(msg, token)` → `msg` (drop redaction) in the `.catch` log line | PASS before: `✔ a send failure is logged WITHOUT the token ever appearing in the log line (9.6607ms)` · FAIL after: `✖ a send failure is logged WITHOUT the token ever appearing in the log line (15.6041ms)` |

Additional claims not given their own falsification row (debt, enumerated):
- `UNVERIFIED — onBotEvent's "reconnect-reload"/"gap(recovered)" event-mapping wiring in
  record-commands.ts itself (as opposed to the notifier's own onBotEvent unit tests, which ARE
  covered above) ships without an isolating falsification, because record-commands.ts has no
  existing unit-test harness (it spawns real ffmpeg/OBS/Chrome — there is no injected-fake seam for
  it, unlike obs-guard.ts/watchdog.ts which test pure decision functions). The onBotEvent dispatcher
  itself (the actual logic) IS fully covered above (two more rows verified live, not tabulated
  as falsifications to stay within the 9 requested rows): "onBotEvent: a recovered gap alerts with
  the gap's own duration (end - start)" and "onBotEvent: an UNRECOVERED gap (end-of-run) sends
  nothing" both pass today (`pnpm --filter @lkb/meeting-bot test` output above) — what's unverified
  by isolating falsification is only the one-line call-site wiring in record-commands.ts, tracked as
  debt.` No issue id opened — this is a known, stated gap of the same shape record-commands.ts
  already has for T-029 (reconnect-gaps.ts was split out for exactly this reason; the wiring inside
  `runRecord` itself is likewise untested by unit tests, live-verified only).
- `NO ISOLATING FALSIFICATION — .env.example is pure prose (a documentation addition, revert_op:
  none); nothing to perturb.`

## Live browser evidence
`Not UI-touching — no surface changed.` Changed paths: `packages/meeting-bot/src/capture/
telegram-alerts.ts` (new), `packages/meeting-bot/src/capture/telegram-alerts.test.ts` (new),
`packages/meeting-bot/src/capture/record-commands.ts` (edited), `.env.example` (edited). None of
these are under `*.tsx|jsx|vue|svelte|html|css`, `apps/web/**`, `**/routes/**`, `**/pages/**`,
`**/components/**`, nor does any page's rendered data flow through them — this is a CLI-invoked
backend module (`lkb record`) with no UI surface.

## Known gaps / left for other units (stated, not silently dropped)
- **Live "arrives on phone within 60 s" check is a human-approved live run**, per this unit's HARD
  RULE — no real Telegram message was sent and the real API was never called in tests or
  verification. `defaultSend` (the real `https` transport to `api.telegram.org`) is implemented but
  exercised by NOTHING in this unit's test suite; every test injects a fake `send`. A live run
  against Umesh's real bot/chat is the outward-facing action this unit deliberately leaves to the
  human gate.
- **Silence >2min has no live trigger.** `notifySilence(durationSec)` and the `onBotEvent` hook
  point exist and are tested, but nothing in this unit polls OBS meters or calls `notifySilence` —
  per the task brief, wiring a live OBS-meter watchdog is explicitly T-031's job (roadmap:
  "T-031 | open | Live audio watchdog via OBS meters (>2 min silence → alert + reconnect) | depends
  T-029"). T-030 exposes the seam; T-031 drives it.
- **`reconnect-giveup`** (sb_join.py's "gave up after N reload attempts, still holding the window"
  event) is NOT mapped to an alert. The task named exactly "disconnected (gap opened) and recovered
  (gap closed)" as the two reconnect-related states; a give-up still leaves the run in the
  "disconnected" state from the last `reconnect-reload` alert (no false "recovered" is ever sent for
  it, since `gap.recovered` stays `false` until the run ends). Left as a possible T-031/T-047-adjacent
  follow-up rather than scope-creeping this unit past the roadmap row's four named states.
- **`durationSec` is `0` on the `finalize` recovery path** (`runFinalize` has no live `startedAt` to
  measure from) — the "finished" summary's duration is honest-zero rather than fabricated there;
  documented inline at the `finalizeRecording` parameter and in "What changed" above.
- **Throttle state is in-memory per notifier instance**, not persisted — a `finalize` recovery run
  builds a fresh notifier (default parameter), so its one "finished" send is never throttled against
  a same-session "finished" the original `record` process might also have sent before dying; this
  matches the task's own dedupe-per-flapping-connection intent (within one live run) rather than
  cross-process dedupe, which was not asked for.

## Status: checked-PASS — qa/verdicts/t-030-telegram-alerts.md (Cycle checked: 0, peer checker knowledgebase-ff, d3cefbf); merged to master; meeting-bot 115/115 + tsc clean on merged tree; live phone delivery + silence trigger (T-031) remain stated debt

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
