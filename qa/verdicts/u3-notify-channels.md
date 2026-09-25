# Verdict — u3-notify-channels

**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** claude-sonnet-subagent (fresh context, Mode A unit check)
**Bound root:** D:/KnowledgeBase-lanes/u3-notify-channels (branch `wave/u3-notify-channels`, HEAD `b0dd070`)
**Contract graded against:** `D:/KnowledgeBase/qa/contracts/meeting-bot-live-capture.md` (T-024b) — C6 (credentials never in logs/errors/thrown strings) and C10 (no regression), per the dispatch. Approved scope: `C:\Users\Lenovo\.claude\plans\what-is-the-update-vivid-donut.md` §U3.
**Diff scope:** `git diff 361dd39...HEAD --stat` (merge-base of `master`↔`wave/u3-notify-channels`) — 12 files, all inside the manifest's "What changed": `.env.example`, `packages/meeting-bot/src/capture/{configured-notifier,notify-channels,telegram-alerts,telegram-channel,whatsapp-channel}.ts` + their `.test.ts`, `packages/meeting-bot/src/index.ts`, `qa/manifests/u3-notify-channels.md`. No file outside that list was touched; no existing export/function/test was deleted.

## 1. Backward compatibility

- `git diff 361dd39 -- packages/meeting-bot/src/capture/telegram-alerts.test.ts` → **empty**. The test file is byte-identical to base.
- Re-ran it in the bound tree and in a throwaway copy: **21/21 pass** (note: the manifest's prose says "20 pre-existing tests" — the file actually has 21 `test(...)` blocks both at base and at HEAD; the file itself is unmodified, so this is a documentation miscount, not a functional issue — not filed).
- `git diff 361dd39 --stat` for `record-commands.ts`, `record-finalize.ts`, `audio-watchdog.ts` → **empty** (all three untouched).
- `pnpm -r typecheck` clean across all 10 workspace projects, including `packages/meeting-bot`.

## 2. C6 — credentials never in logs/errors/thrown strings

- Grepped `TELEGRAM_BOT_TOKEN`/`token` across every new/changed file: the only real credential path is `telegram-channel.ts` (`redact()` at line 29-32, applied before the error ever leaves the channel at line 88). `notify-channels.ts` and `configured-notifier.ts` never reference a token at all (fan-out logs whatever error reaches it, trusting each channel to have pre-scrubbed its own secret — correct by construction, checked by reading both files in full).
- **Independently falsified** (own copy, not the manifest's pasted output): `telegram-channel.ts:88` `throw new Error(redact(msg, token))` → `throw new Error(msg)`. GREEN before (5/5), RED after — exactly the named assertion fired (`doesNotMatch /T-TOKEN-SECRET/` failed, token visible in `err.message`), restored, GREEN again (5/5), `.bak` removed, byte-diff clean.
- `.env.example` only ever writes the variable *name*, never a value.

## 3. Fan-out isolation

- **Independently falsified**: `notify-channels.ts:85` `for (const channel of channels)` → `channels.slice(0, 1)`. GREEN before (17/17), RED after with `actual: [], expected: ['hello']` on "fan-out isolation: one channel throwing never blocks or fails the others" — matches the manifest's pasted evidence exactly. Restored, GREEN again.
- Isolation from a **throwing** channel is proven and tested (`fakeChannel(..., "reject")` case, also read in source).
- Isolation from a **hanging** channel: `createNotifier`'s `send()` (notify-channels.ts:79-95) wraps each `channel.send(text)` in its own `Promise.resolve().then().catch()` per channel — sends are not chained/awaited against each other, so a channel that never settles does not block sibling channels or the synchronous fire-and-forget caller. But there is **no timeout wrapper in the generic primitive itself** — a future channel implementation that forgets its own bound would dangle forever (a resource leak, not a blocking bug). Today's two real channels are both safe (Telegram has its own 8s HTTPS timeout; WhatsApp resolves synchronously with no real I/O), so this does not fail any criterion today. Filed **ISS-U3-002** (low) as a forward-looking note — not a FAILURES item.

## 4. WhatsApp stub + env precedence

- Read `whatsapp-channel.ts` in full: `send()` only calls `log(...)` and resolves — no import of any HTTP/network client, no state beyond the log call.
- **Independently falsified**: dropped the `log(...)` call → GREEN before (4/4), RED after (`0 !== 1` on "send() logs the 'not configured' line every call") — matches the manifest exactly. Restored, GREEN again.
- Env precedence (`readNotifyEnvConfig`, notify-channels.ts:139-152): read in full — `settingsOverride?.[class] ?? envClass ?? base ?? default`, matches the claimed precedence (`settingsOverride > per-class env > blanket env > default ["telegram"]`) literally. Backed by 5 green precedence tests (all re-run, all pass) — not independently falsified due to the session's memory budget, but the logic is a single ternary chain with no branch left untested by the existing suite.
- Unset config → `DEFAULT_CHANNELS = ["telegram"]`, i.e. today's behaviour — confirmed by reading the constant and its one call site.

## 5. `truncateDigest` on real content

Ran independently (not the manifest's synthetic 3.5k `"x".repeat(...)` fixture) against `D:/KnowledgeBase/qa/watch/2026-09-25.md` (read-only, via a throwaway `tsx` script, cleaned up after, `git status` in the lane confirmed clean):
- Real file is 2860 chars (under the 3500 cap) → no-op, `output === input`.
- Doubled to 5722 chars to force truncation → output is exactly 3500 chars, ends `"… full digest: qa/watch/2026-09-25.md"`, and the retained head matches the real content's start. Matches the claimed budget math (`maxChars - suffix.length`).

## 6. C10 — no regression

All re-run myself in the bound tree (`D:/KnowledgeBase-lanes/u3-notify-channels`), one at a time, memory-constrained, no parallel runs:

| Command | Result |
|---|---|
| `pnpm --filter @lkb/meeting-bot test` | 177/177 pass, matches manifest exactly |
| `pnpm -r typecheck` | all 10 projects `Done`, clean |
| `pnpm -r test` (once) | exit 0; `apps/api` 175/175, `packages/meeting-bot` 177/177 |
| `pnpm gen:types --check` | `OK: 24 generated type file(s) + index.ts match schema/` |
| `python schema/validate.py` | `PASS: 24 collection schema(s) validated correctly.` |
| `pnpm lint:structure` | FAILS at `lint-root` — 16 loose files vs budget 15 (`AGENTS.md` the extra one) |

**ISS-248 pre-existing, verified myself, not trusted from the manifest**: built a throwaway `git worktree add --detach <tmp> 361dd39` (the branch's merge-base with master), ran `node scripts/lint-root.mjs` there directly — **identical failure**, same 16 files, same list, same violation text. Removed the worktree afterward (`git worktree remove --force`, confirmed via `git worktree list`). This is not this unit's regression.

## Capability coverage

7 rows claimed. 4 independently reproduced by the checker (own falsifying edit in a throwaway copy, GREEN-before → RED-after with the correct assertion → restored → GREEN-again, `.bak` removed each time); 3 verified by full-suite green + source read but not individually falsified (memory-constrained session — targeted tests only, nothing in parallel, per dispatch).

| # | capability | checker-reproduced? |
|---|---|---|
| 1 | fan-out sends to every channel | **YES** — `channels.slice(0,1)` edit, matches manifest's exact assertion |
| 2 | per-key throttle collapses | not independently falsified (read + full suite green) |
| 3 | Telegram channel redacts token before it leaves the channel | **YES** — dropped `redact()`, matches manifest's exact assertion |
| 4 | WhatsApp stub logs + never throws + sends nothing | **YES** — dropped the log call, matches manifest's exact assertion |
| 5 | `truncateDigest` never exceeds the cap | verified independently against REAL content (qa/watch/2026-09-25.md), stronger than the manifest's synthetic fixture — not falsified via mutation, but re-derived from first principles |
| 6 | config precedence (`settingsOverride` wins) | not independently falsified (read + full suite green) |
| 7 | `createTelegramNotifier`'s enabled-gate survives the refactor | **YES** — `chatId: undefined` edit; reddened 13/21 tests (broader than the manifest's single-test framing, but the SAME named test — "notifyJoined sends title and platform" — failed on the exact named assertion, `calls.length` 0 vs expected) |

Throwaway copy: full working-tree copy (robocopy, excluding `.git`/`node_modules`) with `node_modules` reused via Windows junctions to the bound tree's originals (read-only reuse, never written to). Confirmed GREEN in the copy before every edit. Copy deleted after use.

## Live browser evidence

Not UI-touching. Changed paths are all `packages/meeting-bot/src/capture/*.ts` (library), `packages/meeting-bot/src/index.ts` (package exports), `.env.example` (docs) — no UI-rendered surface. `LIVE-BROWSER: not-applicable`.

## Findings filed (both low severity, per this project's severity gate — ledger entry only, never a pulled unit)

- **ISS-U3-001** — the throttle log line's text changed (`[telegram] throttled` → `[notify] throttled`) after the refactor. Not the Telegram *message* text (which is byte-for-byte unchanged, as claimed) — an operational log line, untested, unreferenced anywhere else in the repo. Not a regression under C10 or the manifest's own claim as literally worded.
- **ISS-U3-002** — the generic fan-out (`notify-channels.ts`) has no timeout wrapper around a channel's `send()`; a future channel that never settles would dangle forever without blocking siblings or the caller. Both real channels today are safe. Worth a `Promise.race` wrapper before a third, possibly slower, channel is added.

Neither meets the >80% "would defend as a defect" bar for FAILURES — both are forward-looking notes on an otherwise correctly isolated, correctly redacted design.

---

```
VERDICT: PASS
SCOREBOARD: 8/8 criteria met (C6, C10, + 6 dispatch judge points), 0/0 invariants (none named beyond the criteria)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 4/7 rows reproduced by checker; 3/7 verified via source read + full-suite green (not independently falsified — memory-constrained session)
LIVE-BROWSER: not-applicable (changed paths: packages/meeting-bot/src/capture/*.ts library code, packages/meeting-bot/src/index.ts exports, .env.example docs — no UI surface)
ISSUES-WRITTEN: ISS-U3-001, ISS-U3-002 (both low; per project severity gate, ledger entry only, not blocking)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent) — self != executor, no ANTHROPIC_BASE_URL override
EXPLANATION: Refactor is a clean, byte-for-byte-compatible generalization of T-030's Telegram notifier onto shared multi-channel primitives. C6 (token redaction) and C10 (no regression, with ISS-248 independently re-verified as pre-existing on the base commit) both hold under re-derivation, not just re-reading the manifest's pasted output. Four of seven capability-coverage rows were independently falsified in a throwaway copy with byte-identical restores; the other three rest on source review plus a fully green re-run of the real suite. Two low-severity, non-blocking notes filed to the lane ledger (a cosmetic log-line text drift and a forward-looking timeout gap in the generic fan-out) — neither is a regression against this unit's own claims.
```
