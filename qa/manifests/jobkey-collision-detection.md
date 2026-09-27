# Manifest — jobkey-collision-detection

**Contract:** none of `qa/contracts/` covers this. `qa/contracts/calendar-auto-join.md` (T-025,
extended by `qa/manifests/u5-auto-record-scheduler.md` for scheduling) has no criterion naming
jobKey derivation, collision handling, or overwrite safety (`grep -in "jobkey\|collision" qa/contracts/calendar-auto-join.md`
matches nothing except an unrelated use of the word "scheduled"). This is a defect fix against
`qa/issues.jsonl`'s ISS-321 row, not a contract criterion.
**Issue:** ISS-321 (medium, `calendar-auto-join` feature)
**Fix cycle:** 0
**Backlog tier:** 4 (open medium; tiers 1–3 exhausted/gated at dispatch time per this repo's
Backlog priority override)
**Persona walk:** skip — scheduler/state-persistence unit, no new screen (same call as the parent
unit's own manifest, `qa/manifests/u5-auto-record-scheduler.md`: "skip (scheduler/CLI unit, no new
screen)").
**Date:** 2026-09-27
**Executor:** claude-opus-subagent (maker build subagent, this worktree)

## The defect (ISS-321)

`deriveJobKey` (`packages/meeting-bot/src/calendar/task-scheduler.ts`, pre-fix `:55-58`)
lower-cased and collapsed any run of non-`[a-z0-9]` characters to a single `-`. That collapse is
lossy: `deriveJobKey('gmail:abc_123')`, `deriveJobKey('gmail:abc-123')`, and
`deriveJobKey('GMAIL:ABC-123')` all produced the identical `'gmail-abc-123'`. Both
`writeScheduledJob` (`schedule-state.ts:92`, an unconditional `writeFileSync`) and `scheduleOnce`'s
`schtasks /create /f` then overwrote whatever was already scheduled under that jobKey with **no
detection, no warning, no error** — one webinar's scheduled recording could silently replace
another's.

Practical risk today is low (the row's own honest caveat, unchanged by this fix): Gmail
sessionKeys are Mongo ObjectIds (`gmail:<24-hex>`), which don't collide under the old transform,
and `loadCalendarEvents` is still stubbed to `[]`. This is a latent structural hazard that becomes
reachable once Calendar OAuth lands (real Google Calendar event ids are more likely to contain
punctuation/casing that collapses). Per the row's own `fix_direction`, this is fixed now as a
correctness guard, narrowly — the scheduler itself is not refactored and the fix does not widen
into the calendar flow.

## What changed

1. **`packages/meeting-bot/src/calendar/task-scheduler.ts:37-70`** — `deriveJobKey` no longer
   derives the jobKey from the collapsed prefix alone. It now computes `hash =
   sha256(sessionKey).hex.slice(0, 10)` — a SHA-256 digest of the **full, un-collapsed**
   `sessionKey` — and returns `<collapsed-prefix>-<hash>` (or just `<hash>` if the prefix collapses
   to nothing, e.g. an all-punctuation input). Because the hash is taken over the raw sessionKey
   before any collapsing happens, two sessionKeys that used to collapse onto the same prefix now
   almost certainly hash differently, so the collapse can no longer be the source of a collision.
   Same input still always derives the same jobKey (`JOB_KEY_HASH_HEX_LEN = 10` constant at `:41`).
   `deriveJobKey('')` still returns `null` (a truly empty sessionKey has nothing to identify);
   whitespace-only/all-punctuation/over-length input now derives a valid hash-based key instead of
   refusing, since the hash no longer depends on a readable prefix surviving collapse — see
   "Declared behavior change" below.
2. **`packages/meeting-bot/src/calendar/schedule-state.ts:91-110`** — `writeScheduledJob` now reads
   whatever job file already exists at `scheduledJobFilePath(stateDir, jobKey)` before writing. If
   one exists and its `sessionId` differs from the `job.sessionId` being written, it **throws**
   (`refusing to schedule '<new sessionId>': jobKey '<jobKey>' is already scheduled for a different
   session '<existing sessionId>' (ISS-321 collision guard) — job file: <path>`) instead of
   overwriting. Rewriting the file for the **same** sessionId (a corrective tick, a retry) still
   succeeds — the guard is keyed on `sessionId` equality, not "a file already exists."
3. **`packages/meeting-bot/src/calendar/schedule-tick.ts:180-208`** — the real-schedule loop now
   wraps the `writeScheduledJob` call in a `try/catch`. On the ISS-321 refusal it logs the error
   message loudly (`  refused to schedule <sessionKey> (job <jobKey>): <message>`) and `continue`s
   to the next item, rather than letting the thrown error propagate and abort the whole tick's
   remaining items — matching this file's existing "never crash a poller tick" contract (the
   `!jobKey` null-refusal path just above it, and `createHttpCandidateLoader`'s failure contract).
   `scheduler.scheduleOnce`'s own pre-existing (untouched) failure behavior is unaffected — only the
   new collision throw is caught here.

Tests updated/added (all in the same three files' co-located `*.test.ts` siblings — no new source
file, no new test file):
- `task-scheduler.test.ts` — updated the two tests that hardcoded the old lossy-collapse literal
  output (`deriveJobKey('gmail:664f...') === 'gmail-664f...'`) to assert the new
  `<prefix>-<hash>` shape via regex instead; updated the empty/whitespace/too-long test to reflect
  the declared behavior change (only `''` refuses now); added the ISS-321 4-pair collision-fixed
  test, an idempotency test, and a same-collapsed-prefix/different-raw-input test documenting the
  hash's pre-image is the raw sessionKey, not the collapsed prefix.
- `schedule-state.test.ts` — added 3 new tests directly against `writeScheduledJob`: first-write
  succeeds, same-sessionId rewrite succeeds, different-sessionId at the same jobKey throws and
  leaves the original file untouched.
- `schedule-tick.test.ts` — replaced 3 hardcoded jobKey literals (`"gmail-c1"`,
  `"gmail-c-midnight"`) with `deriveJobKey(...)` calls against the real function (they'd otherwise
  have silently gone stale against the new format); added 2 integration-level tests: a collision
  with a different session refuses loudly, skips only that item, and leaves the pre-existing job
  file untouched; a same-session rewrite still reaches the scheduler and updates the job file.

## Declared behavior change (not a regression, disclosed)

The old `deriveJobKey` refused (`null`) on whitespace-only, all-punctuation, and over-64-char
input, because those inputs had nothing left after the lossy collapse. The new hash-based
derivation always has a valid hash component regardless of what survives collapsing, so those three
input shapes now derive a real (if unreadable-prefix) jobKey instead of refusing. This only matters
for the previously-untested "keyword-soup" edge case, not for any sessionKey this codebase actually
constructs (`gmail:<id>` / `cal:<id>`, per `auto-join.ts`'s `normalizeCandidate`/
`normalizeCalendarEvent` — never attacker-authored free text). `deriveJobKey('')` (truly empty)
still returns `null`, and `scheduleOnce`/`schedule-tick.ts`'s own `if (!jobKey)` refusal path is
unchanged and still exercised.

## Migration note

This changes the jobKey format for **every** sessionKey (old: `<collapsed-prefix>`; new:
`<collapsed-prefix>-<hash>` or `<hash>`). Any already-scheduled Windows Task (`lkb-autorecord-
<old-jobKey>`) or `raw/webinars/scheduled/<old-jobKey>.json` file written before this fix is
**orphaned**, not renamed or migrated:
- The old Windows Scheduled Task keeps running under its old name until it fires or is manually
  removed — it is not deleted or renamed by this change.
- The old `scheduled/<old-jobKey>.json` file is simply never read again (nothing derives the old
  jobKey format any more), and is not cleaned up automatically.
- `schedule-state.json`'s dedup index is keyed by raw `sessionKey`, not by jobKey, so dedup-across-
  ticks behavior (a session already recorded via `recordScheduled`) is **unaffected** by this
  change.

This is acceptable here because (a) no real Windows Scheduled Task has ever been created against
production `schtasks.exe` in this codebase's history yet (per `qa/manifests/
u5-auto-record-scheduler.md`'s own disclosed "Known gaps" — every run to date used a fake
`execFileFn`), so there is nothing live to strand, and (b) the row's own evidence establishes
today's only real jobKey source (`gmail:<24-hex-ObjectId>`) never collided under either the old or
new scheme, so no in-flight session's identity changes in a way that matters before Calendar OAuth
lands. If a real Scheduled Task or job file exists in `raw/webinars/` by the time this merges, it
should be inspected/cleared manually — not assumed cleaned up by this fix.

## How to verify

```
cd packages/meeting-bot && node --test --import tsx src/calendar/task-scheduler.test.ts src/calendar/schedule-state.test.ts src/calendar/schedule-tick.test.ts
cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json
node scripts/lint-loc.mjs   (repo root)
node scripts/lint-dirsize.mjs   (repo root)
```

## Actual outputs (this session's own runs)

```
$ cd packages/meeting-bot && node --test --import tsx src/calendar/task-scheduler.test.ts src/calendar/schedule-state.test.ts src/calendar/schedule-tick.test.ts
ℹ tests 47
ℹ pass 47
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0

$ cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json
(17 pre-existing errors, all @lkb/core|@lkb/ingest|obs-websocket-js module-resolution failures in
src/capture*.ts, src/cli.ts, src/live-monitor*.ts, src/testUtils.ts — confirmed identical, same 17
lines, by stashing this unit's changes and re-running against HEAD before this fix; zero errors in
any calendar/*.ts file before or after)

$ node scripts/lint-loc.mjs
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:352 (budget 300)
  scripts/watch/run-watch.mjs:447 (budget 300)
(identical before and after this unit's changes — repo-wide count unchanged at 4, no calendar/*.ts
file named, no 5th violation introduced)

$ node scripts/lint-dirsize.mjs
lint-dirsize: OK (88 dir(s) within budget)
```

**LOC before -> after (non-blank lines, `grep -cv '^\s*$'`):**
| File | Before | After |
|---|---|---|
| `task-scheduler.ts` | 141 | 170 |
| `task-scheduler.test.ts` | 198 | 245 |
| `schedule-state.ts` | 96 | 115 |
| `schedule-state.test.ts` | 56 | 114 |
| `schedule-tick.ts` | 201 | 211 |
| `schedule-tick.test.ts` | 228 | 275 |

All six files remain well under the 300-line `lint-loc` budget (C1). No file in `scripts/` was
added or touched (C2 — `scripts/` stays at 32/32 per ISS-345).

## Measurement against the ledger (D-015)

ISS-321's row has **no `reproductions` key** — its `evidence` field is the only recorded
reproduction data. Per D-015, those four pairs are the ledger's floor, re-run verbatim as tests
(not a corpus this cycle chose itself):

| # | Pair (from ISS-321's `evidence`) | Old (lossy) result | New result | Refused? |
|---|---|---|---|---|
| 1 | `gmail:abc_123` vs `gmail:abc-123` | both `gmail-abc-123` | different (hash differs) | collision eliminated |
| 2 | `cal:ABC_DEF` vs `cal:abc-def` | both `cal-abc-def` | different | collision eliminated |
| 3 | `gmail:ABC` vs `GMAIL:ABC` | both `gmail-abc` | different | collision eliminated |
| 4 | `gmail:a.b.c` vs `gmail:a-b-c` | both `gmail-a-b-c` | different | collision eliminated |

**ISS-321: 4/4** — all four of the row's recorded evidence pairs now derive distinct jobKeys
(`ISS-321: sessionKeys that used to collapse onto the same jobKey now derive DIFFERENT jobKeys`
test, `task-scheduler.test.ts`). No reproduction was left open.

Additions beyond the ledger's four (as instructed, not substituting for them):
- Same-sessionKey rewrite still succeeds (`writeScheduledJob`-level and `schedule-tick`-level).
- A genuine collision (different sessionId at the same jobKey, forced by pre-seeding a job file
  rather than by finding a real SHA-256 collision) is refused, loudly, and does not crash the tick.

## Capability coverage — falsification (D-020)

| Capability | Covering check | Mutation | Result |
|---|---|---|---|
| `deriveJobKey` hashes the full raw sessionKey (non-lossy) | `ISS-321: sessionKeys … now derive DIFFERENT jobKeys` + 3 other `deriveJobKey` tests | Reverted `deriveJobKey` to `candidate = prefix` (dropped the hash suffix) | RED — 4/26 tests failed, including the ISS-321 4-pair test |
| `writeScheduledJob` refuses on a different-sessionId collision | `writeScheduledJob: a DIFFERENT sessionId … is refused` + `ISS-321: a jobKey collision … refuses loudly …` | Removed the `if (existing && existing.sessionId !== job.sessionId) throw` guard entirely (back to unconditional write) | RED — 2/21 tests failed (unit-level + integration-level) |
| `writeScheduledJob` still allows a same-sessionId rewrite | `writeScheduledJob: rewriting the SAME sessionId … succeeds` + `ISS-321: re-scheduling the SAME session is still allowed` | Widened the guard to `if (existing) throw` (refuses ANY existing file, even same-session) | RED — 2/21 tests failed |
| `schedule-tick.ts` catches the refusal and skips only that item (doesn't crash the tick) | `ISS-321: a jobKey collision … refuses loudly, skips only that item, and never overwrites … or crashes the tick` | Removed the `try/catch` around `writeScheduledJob` in `schedule-tick.ts`, letting the throw propagate uncaught | RED — 1/13 tests failed |

A test that supplies the very value the fix computes proves nothing — all four falsifications above
assert against the real computed `jobKey`/thrown error, never a value the test hands in itself
(the `schedule-tick.test.ts` literal-jobKey assertions were replaced with `deriveJobKey(...)` calls
against the real function specifically to avoid this).

**D-020 procedure (all four mutations):** `node scripts/lib/mutate.mjs apply <file>` (refuses
unless the file is byte-identical to HEAD — the commit below made all three source files
`committed` first) armed each mutation; each test command ran under `timeout 60`; `node
scripts/lib/mutate.mjs restore <file>` ran immediately after capturing the RED output, which
performs `git checkout -- <file>` and independently re-verifies the file is `committed` again
before returning — printed `RESTORED: <file> (verified identical to HEAD)` for all four. Final
`node scripts/lib/mutate.mjs list` → `no outstanding mutations`; final `node scripts/lib/mutate.mjs
assert-clean` → `MUTATIONS CLEAN: none outstanding`; final `git status --short` → empty (clean
working tree). Nothing mutated was ever committed.

## Live browser evidence

Not UI-touching. This is a Node/TypeScript scheduler-and-state-persistence fix with no screen —
same call as the parent unit's own manifest ("Persona walk: skip"). No browser session was opened.

## Known gaps / not done

- Did not touch `scheduleOnce`'s own pre-existing failure handling (a real `schtasks` failure still
  propagates uncaught out of `runScheduleTickOnce`, same as before this fix) — out of scope for
  ISS-321, which is specifically about the silent-overwrite collision, not about scheduler-call
  error handling in general. Widening that would be scope creep beyond the row's `fix_direction`.
- Did not add a background cleanup for orphaned old-format `scheduled/<jobKey>.json` files or
  Windows Tasks — see "Migration note" for why that's acceptable given nothing real has been
  scheduled with the old format yet.
- Did not create a real Windows Scheduled Task or invoke real `schtasks.exe` at any point (every
  test in this unit and its predecessors injects a fake `execFileFn` — unchanged constraint from
  `qa/manifests/u5-auto-record-scheduler.md`).

## Status: ready-for-check
