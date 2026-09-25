# Manifest — u3-notify-channels
**Contract:** none yet (no `qa/contracts/notify-channels.md` — first unit on this seam; checker
adopts/drafts on first check, per convention for a new capability)
**Goal task:** none — ad-hoc plan unit U3, `C:/Users/Lenovo/.claude/plans/what-is-the-update-vivid-donut.md` §U3 ("notify-channels"), not yet a row in `TASKS.md`/`.goal/goal.json`
**Date:** 2026-09-25
**Fix cycle:** 0 of max 3
**Dual check:** no
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** in-worktree /maker build unit, dispatched by the orchestrating session; no external executor was evaluated or worth it for a package-internal refactor + new small modules.

## What changed

- `packages/meeting-bot/src/capture/notify-channels.ts` (NEW) — generic, channel-agnostic
  primitives: `NotifyChannel` interface, `createNotifier(channels, deps)` fan-out (per-key
  throttle, fire-and-forget, one channel's failure isolated from the others), `truncateDigest`
  (≤3500 chars, `"… full digest: <path>"` suffix), `EventClass` (`"digest" | "bot-status"`), and
  `readNotifyEnvConfig(env, settingsOverride)` (config precedence: `settingsOverride` >
  per-class env (`NOTIFY_CHANNELS_DIGEST`/`NOTIFY_CHANNELS_BOT_STATUS`) > blanket `NOTIFY_CHANNELS`
  > default `["telegram"]`).
- `packages/meeting-bot/src/capture/telegram-channel.ts` (NEW) — the ONE Telegram HTTPS transport
  (`defaultTelegramSend`, moved verbatim out of telegram-alerts.ts) + `createTelegramChannel(deps)`
  returning a `NotifyChannel | undefined` (undefined + one log line when token/chatId missing).
  Redacts its own token out of any thrown error before it ever reaches the generic fan-out's log.
- `packages/meeting-bot/src/capture/whatsapp-channel.ts` (NEW) — `createWhatsAppChannel(deps)`:
  config-gated stub. Always logs `"[whatsapp] channel not configured — message not sent"` and
  resolves without sending — the seam for a real WhatsApp provider later (plan §U3: "stub, config-
  gated, wired later").
- `packages/meeting-bot/src/capture/configured-notifier.ts` (NEW) — `buildChannels`,
  `createConfiguredNotifier(eventClass, deps)`, `notifyDigest(markdown, sourcePath, deps)`: the
  one place that knows both "which channel names exist" and "which config wins"; assembles a
  `Notifier` from `readNotifyEnvConfig` + the two channel factories. `notifyDigest` is the export
  U2's future `scripts/watch/run-watch.mjs` calls (not wired from this lane — see Known gaps).
- `packages/meeting-bot/src/capture/telegram-alerts.ts:1-163` (EDIT IN PLACE) — generalized:
  `createTelegramNotifier` now builds a single-channel `Notifier` over `createTelegramChannel` and
  routes every `notify*`/`onBotEvent` call through it, instead of its own private HTTPS/throttle/
  redact copy. Public API (`FinishedSummary`, `TelegramNotifierDeps`, `TelegramNotifier`,
  `createTelegramNotifier`, `readTurnCount`), message text, throttle keys, and the token-redaction
  guarantee are byte-for-byte unchanged — all 20 pre-existing tests in `telegram-alerts.test.ts`
  pass unmodified. `record-commands.ts` and `record-finalize.ts` (its only two callers) were NOT
  edited — they keep calling `createTelegramNotifier()` exactly as before, Telegram-only, for the
  bot-status alerts (joined/disconnected/recovered/silence/finished). `audio-watchdog.ts` was not
  touched either — it never called `createTelegramNotifier` directly (its `notifySilence` is an
  injected dep from `record-commands.ts`).
- `packages/meeting-bot/src/index.ts:19-31` — re-exports the four new U3 modules (this package's
  `main` is `src/index.ts`) so a future consumer (`@lkb/meeting-bot` workspace dependency) can
  `import { notifyDigest } from "@lkb/meeting-bot"`. `telegram-alerts.ts`'s own exports were never
  re-exported here pre-U3 and still aren't — its two callers import it by relative path within
  this package, unchanged.
- `.env.example` — added `NOTIFY_CHANNELS` / `NOTIFY_CHANNELS_DIGEST` / `NOTIFY_CHANNELS_BOT_STATUS`
  (all blank/optional; unset = today's Telegram-only behavior), documented with the same
  precedence and scope notes as the code.
- `packages/meeting-bot/src/capture/notify-channels.test.ts`,
  `packages/meeting-bot/src/capture/telegram-channel.test.ts`,
  `packages/meeting-bot/src/capture/whatsapp-channel.test.ts`,
  `packages/meeting-bot/src/capture/configured-notifier.test.ts` (all NEW) — 17 + 5 + 4 + 8 = 34
  new tests. `telegram-alerts.test.ts` unmodified (still 20 tests, all pass).

## Design decisions worth stating explicitly

1. **"file" and "dashboard" are not `NotifyChannel`s.** Umesh's own words ("file + dashboard of
   platform + telegram and later whatsapp too") name four destinations, but the build brief scopes
   this unit's channel interface to messaging transports (Telegram, WhatsApp) only — the digest
   *file* (`qa/watch/<date>.md`) and the Mongo `watch_reports` row the *dashboard* (U4) reads are
   both owned by U2, written directly by its runner, not sent through a `NotifyChannel`. Stated
   here so it isn't read as a gap.
2. **Bot-status alerts stay Telegram-only in this unit, by design.** The brief requires "every
   existing caller... must keep working unchanged." `createTelegramNotifier` is generalized
   in-place but its behavior and callers are untouched. The multi-channel/config-driven path
   (`createConfiguredNotifier`, class `"bot-status"`) exists and is tested, ready for a later unit
   to switch `record-commands.ts` onto it — not done here to keep this refactor's blast radius to
   zero for the live capture path.
3. **No web-settings-backed override is wired.** `qa/contracts/web-settings-keys.md` (T-010) and
   `apps/web/src/pages/SettingsPage.tsx` / `apps/api/src/routes/keys.ts` are API-key management
   only (list/create/revoke) — there is no generic settings key/value store in this repo for a
   dashboard to write `NOTIFY_CHANNELS` into. `readNotifyEnvConfig`'s `settingsOverride` parameter
   is the seam (tested in isolation — see coverage row 6) that a future settings read fills; env
   vars are the only real source of channel config today.
4. **Digest truncation length (3500 chars) is applied uniformly across channels** — a per-channel
   limit is a real future need (a real WhatsApp transport will have its own limit) but there is no
   real WhatsApp transport yet to size it against.
5. **Don't create a second Telegram client** — the HTTPS POST logic lives in exactly one place
   (`telegram-channel.ts`'s `defaultTelegramSend`), moved verbatim out of `telegram-alerts.ts`
   rather than duplicated.

## Known gaps

- `scripts/watch/run-watch.mjs` (U2) does not exist in this lane and is not edited here (per the
  brief — "don't edit U2's files, which are in another lane"). `notifyDigest` is exported and
  tested but has no real caller yet; wiring it is U2's job after merge.
- Root `package.json` does not list `@lkb/meeting-bot` as a dependency, so nothing outside this
  package can `import { notifyDigest } from "@lkb/meeting-bot"` yet — that one-line addition
  belongs to whichever unit (U2's own lane, most likely) first needs the import, not to this one
  (root `package.json` is shared config, out of this unit's blast radius).
- `NOTIFY_CHANNELS_BOT_STATUS` is parsed and tested but nothing reads it in production yet (see
  design decision 2).

## How to verify (commands + expected)

- `pnpm --filter @lkb/meeting-bot test` → expected: exit 0, all tests pass.
- `pnpm -r typecheck` → expected: exit 0, every workspace package `Done`.
- `pnpm -r test` (once) → expected: exit 0.
- `pnpm gen:types --check` → expected: `OK: ... match schema/`.
- `python schema/validate.py` → expected: `PASS: 24 collection schema(s) validated correctly.`
- `pnpm lint:structure` → expected: FAILS at `lint-root` on the pre-existing ISS-248 finding
  (root loose-file budget, `AGENTS.md`), reproduced identically on base — see Actual outputs.
  Every other step in the chain (`lint-loc`, `lint-dirsize`, `lint-dupes`, `lint-migrations`,
  `snapshot.mjs --check`, `lint.test.mjs`, `depcruise`), run individually since the chain stops at
  the first failure, is clean.

## Actual outputs (from maker's own run)

**`pnpm --filter @lkb/meeting-bot test`** (final run, after all mutation-restore cycles):
```
ℹ tests 177
ℹ suites 0
ℹ pass 177
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 123014.8333
[exited with code 0]
```
(34 of the 177 are new: 17 in notify-channels.test.ts, 5 in telegram-channel.test.ts, 4 in
whatsapp-channel.test.ts, 8 in configured-notifier.test.ts. All 20 pre-existing telegram-
alerts.test.ts tests pass unmodified, plus the pre-existing audio-watchdog/record-commands/
record-finalize/obs-windows/reconnect-gaps/controller-state/vexa-browser-system-joiners/live-
monitor/user-profile/platform/strategy suites in the same package — none touched by this unit.)

**`pnpm -r typecheck`:**
```
Scope: 10 of 11 workspace projects
packages/core typecheck: Done
apps/web typecheck: Done
packages/db typecheck: Done
packages/ai typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
packages/index typecheck: Done
packages/meeting-bot typecheck: Done
apps/api typecheck: Done
```

**`pnpm -r test`** (once, whole workspace):
```
apps/api test: ℹ tests 175 / pass 175 / fail 0
packages/meeting-bot test: ℹ tests 177 / pass 177 / fail 0
[exited with code 0]
```
(These are the only two workspace packages with a `test` script; every other package's `pnpm -r
typecheck` above is its own verification.)

**`pnpm gen:types --check`:**
```
OK: 24 generated type file(s) + index.ts match schema/
```

**`python schema/validate.py`:**
```
PASS: 24 collection schema(s) validated correctly.
```

**`pnpm lint:structure`:**
```
lint-loc: OK (332 file(s) within budget)
lint-dirsize: OK (83 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): ... AGENTS.md ...
 ELIFECYCLE  Command failed with exit code 1.
```
Pre-existing (ISS-248: a runtime-created, already-git-tracked `AGENTS.md` puts root at 16 loose
files against budget 15 — documented in `qa/contracts/meeting-bot-live-capture.md`'s 2026-09-25
adoption entry as unfixable-by-any-unit under the current budget). Confirmed pre-existing, not
introduced by this unit: `AGENTS.md` does not appear in `git status --porcelain` (already
committed, `e31065a`) and this unit added zero files to repo root. The remaining steps in the
`lint:structure` chain, run individually since a chained `&&` stops at the first failure:
```
lint-dupes: OK (394 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (1240 file(s) scanned)
snapshot --check: OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)
lint.test.mjs: ℹ tests 14 / pass 14 / fail 0
tracker-audit --gate g1,g4: 6 finding(s), all pre-existing (T-031/T-033 goal.json-vs-TASKS.md
  status drift, and old t-031/t-033/t-047 manifests citing bare ISS-001/ISS-002 before the D-019
  lane-shard convention existed) — none reference this unit's files
depcruise --config .dependency-cruiser.cjs packages apps workers:
  ✔ no dependency violations found (353 modules, 1101 dependencies cruised)
```

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `createNotifier` fans one send out to EVERY channel it was given | `notify-channels.test.ts`: "send() fans a single call out to every channel" | `notify-channels.ts:85` — `for (const channel of channels) {` → `for (const channel of channels.slice(0, 1)) {` | PASS before: `✔ send() fans a single call out to every channel (9.4939ms)`. FAIL after: `AssertionError ... actual: [], expected: [ 'hello' ]` at notify-channels.test.ts:45 (the second channel's own `deepEqual` assertion). |
| Per-key throttle: two sends for the same key inside the window collapse to one | `notify-channels.test.ts`: "throttle: two sends for the same key within the window collapse to one" | `notify-channels.ts:74` — `if (last !== undefined && t - last < throttleMs) return true;` → `if (false) return true;` | PASS before: `✔ throttle: two sends... collapse to one (17.7351ms)`. FAIL after: `AssertionError ... actual: [ 'one', 'two' ], expected: [ 'one' ]` at notify-channels.test.ts:82. |
| Telegram channel redacts its own token out of a thrown transport error before it leaves the channel | `telegram-channel.test.ts`: "a rejecting transport's error has the token redacted before it leaves the channel" | `telegram-channel.ts:88` — `throw new Error(redact(msg, token));` → `throw new Error(msg);` | PASS before: `✔ ... token redacted before it leaves the channel (4.0093ms)`. FAIL after: `AssertionError [ERR_ASSERTION]: The input was expected to not match /T-TOKEN-SECRET/. Input: 'boom token=T-TOKEN-SECRET'` at telegram-channel.test.ts:65. |
| WhatsApp stub always logs the "not configured" line and never throws — sends nothing | `whatsapp-channel.test.ts`: "send() logs the 'not configured' line every call" | `whatsapp-channel.ts:27` — `log("[whatsapp] channel not configured — message not sent");` → `// log dropped` | PASS before: `✔ send() logs the 'not configured' line every call (2.6054ms)`. FAIL after: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 0 !== 2` at whatsapp-channel.test.ts:30. |
| `truncateDigest` never exceeds `DIGEST_MAX_CHARS`, even after reserving room for the source-path suffix | `notify-channels.test.ts`: "truncateDigest: text over the limit is cut with a pointer to the source path" | `notify-channels.ts:111` — `const budget = Math.max(0, maxChars - suffix.length);` → `const budget = maxChars;` | PASS before: `✔ truncateDigest: text over the limit... (3.4331ms)`. FAIL after: `AssertionError: The expression evaluated to a falsy value: assert.ok(out.length <= DIGEST_MAX_CHARS)` at notify-channels.test.ts:113. |
| Config precedence: an explicit `settingsOverride[class]` wins over that class's own env var | `notify-channels.test.ts`: "readNotifyEnvConfig: settingsOverride wins over every env for its class, leaves the other class to env" | `notify-channels.ts:148` — `digest: settingsOverride?.digest ?? envDigest,` → `digest: envDigest ?? settingsOverride?.digest,` | PASS before: `✔ readNotifyEnvConfig: settingsOverride wins... (4.3018ms)`. FAIL after: `AssertionError ... actual: [ 'telegram', 'whatsapp' ], expected: [ 'whatsapp' ]` at notify-channels.test.ts:168. |
| `createTelegramNotifier`'s generalized internals still build a genuinely ENABLED channel from `deps.chatId` (the refactor didn't silently break the enabled-gate) | `telegram-alerts.test.ts`: "notifyJoined sends title and platform" (one of the 20 pre-existing, unmodified tests) | `telegram-alerts.ts:109` — `chatId: deps.chatId` → `chatId: undefined` | PASS before: `✔ notifyJoined sends title and platform (14.7609ms)`. FAIL after: `AssertionError ... 0 !== 1` (calls.length) at telegram-alerts.test.ts:63. |

Every falsifying edit above was applied and reverted via the D-020 protocol (byte backup, `trap`
on EXIT/INT/TERM/ERR restoring from it, `cmp` confirming byte-identical restore — printed
`RESTORE-VERIFIED-BYTE-IDENTICAL` after every one of the 7 cycles) inside this worktree, one at a
time, each wrapped in its own `timeout 120` targeted `node --test` run — never the whole suite,
never in parallel, per the memory constraint. `git status --short` after all 7 cycles showed only
the intended new/modified files, zero leftover `.bak` files, zero unintended diffs.

## Live browser evidence

Not UI-touching — no browser-rendered surface changed. This unit touches only
`packages/meeting-bot/src/capture/*.ts` (library code, no UI), `packages/meeting-bot/src/index.ts`
(package exports), and `.env.example` (documentation).

## Status: ready-for-check
