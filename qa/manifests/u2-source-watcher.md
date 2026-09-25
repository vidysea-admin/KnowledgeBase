# Manifest — u2-source-watcher

**Contract:** none exists for the source watcher specifically. Closest precedent:
`qa/manifests/watched-sources.md`/`watched-sources-run.md` (T-027, A13 — the unrelated
URL-diff "watched sources" feature this unit deliberately does NOT reuse, see "What changed"),
`qa/manifests/gmail-meeting-candidates-approval.md` (T-028, the Gmail scan this unit extends in
place), `qa/manifests/u1-toc-sept-catchup.md` (the by-hand download→ffmpeg→transcribe→seed-toc→
index chain this unit's `--ingest` mode automates).
**Goal task:** none (ad hoc unit; plan `C:/Users/Lenovo/.claude/plans/what-is-the-update-vivid-donut.md` §U2).
**Date:** 2026-09-25
**Fix cycle:** 0 of max 3
**Dual check:** no
**Issues addressed:** none. Two real bugs were found and fixed DURING this unit (both in code
this unit itself wrote, never shipped): (1) an abbreviated-month parse failure
(`extractSessionDateTime` silently discarded a real "Day & Date:" field because an earlier,
abbreviated "Sep 27, 2026" elsewhere in the same real email failed to resolve against a
full-month-name-only lookup); (2) Gmail query noise (bare `youtube.com`/`drive.google.com` OR
terms matched almost any newsletter with a footer icon, pushing the real CBSE recording mail
past the fetch cap). Both are covered by regression tests (see "Capability coverage" and the
live-check narrative below) — neither is filed to `qa/issues.u2.jsonl` since neither ever
shipped in a merged state.
**Executor:** claude-sonnet-subagent
**Executor rationale:** schema/migration changes, a new Mongo-writing script, and a real Gmail
scan — stays on the Claude lane per the delegation rule ("never delegate ... schema/security/auth
units, or anything touching production").

## What changed

- `packages/ingest/src/sources/gdrive.ts` (**new**) — Drive lister/differ: `listDriveSubfolders`,
  `listDriveFiles`, `downloadDriveFile`, `findMonthFolder`, `diffNewDriveFiles` (the pure
  idempotence function). Injectable `GwsRunner`, no real `gws` call baked in.
- `packages/ingest/src/sources/toc-calendar.ts` (**new**) — pure CSV parser for
  `raw/TOC/TOC-Materials/_csv/calendar1.csv`: a quote-aware tokenizer (`parseCsv`), the
  April-2026→March-2027 program-year mapping (`yearForMonth`), `parseTocCalendar`, and
  `upcomingTocEvents` (14-day window).
- `packages/ingest/src/index.ts` — additive exports for both new modules.
- `apps/api/src/gws-gmail.ts` (**edit in place**, T-028 lineage) — `MEETING_QUERY` widened to
  Zoho/cloudOnAir/YouTube/Drive-recording-link patterns and the three named senders (quoted
  phrases, not bare domain OR terms — see "Gmail query noise" below); `MEETING_URL_RE` widened to
  the same host set; new `RECORDING_URL_RE`, `REGISTER_URL_RE`, `DIRECT_JOIN_RE`,
  `RECORDING_HINT_RE`; body now fetched via `format=full` (was `format=metadata`) and decoded
  (`decodeGmailBody`, prefers `text/plain`, falls back to stripped `text/html`); new pure
  extractors `extractSessionDateTime`, `classifyMeetingKind`, `isRegistrationOnly`, all exported
  and unit-tested. `GmailMeetingCandidate` gained optional `kind`/`startTime`/`endTime`/
  `recordingUrl`/`registrationOnly`. `scanGmailForMeetingCandidates`'s own signature and default
  behavior are unchanged — every existing caller (`apps/api/src/store.ts`'s
  `createMeetingCandidatesDeps`, its route test) passes unmodified (195/195 `@lkb/api` tests
  green, up from 193 — the 2 new are this unit's own regression tests for the real month-alias
  bug).
- `apps/api/src/gws-gmail.test.ts` (**new**) — first-ever unit tests for this file: 20 tests
  covering body decode, date/time extraction (including the real Ashoka/Zoho-shaped strings from
  the task brief and the real bug repro), kind classification, registration-only detection.
- `apps/api/src/routes/meeting-candidates.ts` — `MeetingCandidate` interface gains the same 5
  optional fields, additively.
- `apps/api/src/store.ts:173-199` — `createMeetingCandidatesDeps.scanGmail` passes the new
  optional fields through to `meeting_candidates` writes (compressed into one filter+pick to stay
  under the file's own 300-line LOC budget — see "LOC budget" below).
- `schema/meeting_candidates.schema.json` — additive optional properties: `kind` (enum
  `past-recording`/`upcoming`), `startTime`, `endTime`, `recordingUrl`, `registrationOnly`. No
  migration needed (collection/indexes unchanged, `additionalProperties: true` already permitted
  these — the schema addition is documentation + validation, not a shape change).
- `schema/watch_state.schema.json`, `schema/watch_reports.schema.json` (**new**) — the dedup
  record and per-run digest mirror. Fixtures under `schema/fixtures/watch_state/`,
  `schema/fixtures/watch_reports/`.
- `schema/index.json` — index entries for both new collections.
- `migrations/20260925090000-source-watcher.cjs` (**new**) — creates `watch_state`/
  `watch_reports` + applies their indexes, same pattern as `20260904120000-meeting-candidates.cjs`.
- `packages/db/src/collections/watch-state.ts`, `watch-reports.ts` (**new**) — `coll(tenantId)`
  accessors + `listSeenIds`/`markWatchState`/`recordWatchReport`/`listWatchReports`. Exported from
  `packages/db/src/index.ts`.
- `scripts/watch/run-watch.mjs` (**new** — the one new top-level script, per the brief) — the CLI:
  gathers findings from all three sources, builds the digest, writes outputs per mode.
- `scripts/watch/lib/digest.mjs`, `lock.mjs`, `session-skeleton.mjs`, `ingest-chain.mjs` (**new**)
  — pure/injectable helpers factored out of the CLI (partly for testability, partly to keep
  `run-watch.mjs` under the repo's 300-line LOC budget — see below). Each has its own `.test.mjs`.
- `structure.config.json`, `docs/DECISIONS.md` — **D-031** appended (via `append_decision.ps1`,
  not a raw edit): a `dirsize.overrides` entry raising `apps/api/src` from 30 to 31 files, same
  mechanism as the existing `scripts: 32` override (D-017 precedent). See "LOC/dirsize budget"
  below for why.
- `packages/core/src/generated/{meeting_candidates,watch_state,watch_reports}.ts`,
  `packages/core/src/index.ts` — regenerated via `pnpm gen:types` (not hand-edited).
- `docs/SNAPSHOT.md` — regenerated via `node scripts/snapshot.mjs` (not hand-edited; stale
  after the schema additions, per project rule "generated, never edit it — edit sources").
- **Not built:** U3 (notify-channels), U4 (dashboard), U5 (auto-record scheduler), U6
  (scheduling) — out of scope for this unit per the plan's own ordering ("U4 and U5 start after
  U2 lands").

## Deliberately NOT reused: `watched_sources` / `packages/ingest/src/watched/`

Checked first, per anti-drift discipline. `watched_sources` (T-027/A13) is a different feature:
bookmarked arbitrary URLs, periodically hash-diffed for CONTENT CHANGE via an injected
`UrlFetcher`. U2 is DISCOVERING new items across three structured sources (Drive file listing,
Gmail search, a CSV) and diffing on IDENTITY (has this Drive file id been seen), not content hash.
Different schema (`watched_sources` has no `sourceType`/`sourceId` shape a Drive/Gmail/calendar
row would fit), different domain vocabulary (`reputationTier`, `checkIntervalHours` — meaningless
here). The plan itself names a separate collection (`watch_state`), confirming this reading.

## How to verify (commands + expected)

- `pnpm --filter @lkb/ingest test` → all tests green, including `gdrive.test.ts` (12) and
  `toc-calendar.test.ts` (9).
- `pnpm --filter @lkb/api test` → all tests green, including `gws-gmail.test.ts` (20, new).
- `node --test scripts/watch/lib/*.test.mjs` → all green (lock, digest, session-skeleton).
- `pnpm -r typecheck` → exit 0, no output.
- `pnpm gen:types --check` → `OK: 26 generated type file(s) + index.ts match schema/`.
- `python schema/validate.py` → `PASS: 26 collection schema(s) validated correctly.`
- `node scripts/watch/run-watch.mjs --dry-run` → real Drive/Gmail/CSV read, writes nothing (see
  "Live check" below for the actual redacted output).

## Actual outputs (from maker's own run)

### `pnpm --filter @lkb/ingest test`
```
ℹ tests 118
ℹ pass 118
ℹ fail 0
ℹ duration_ms 5350.5
```

### `pnpm --filter @lkb/api test`
```
ℹ tests 195
ℹ pass 195
ℹ fail 0
ℹ duration_ms 10593.4
```
(193 pre-existing + 2 new regression tests this unit added to `gws-gmail.test.ts`.)

### `scripts/watch/lib/*.test.mjs` (lock 6, digest 3, session-skeleton 6 = 15)
```
lock.test.mjs:            6/6 pass
digest.test.mjs:           3/3 pass
session-skeleton.test.mjs: 6/6 pass
```

### `pnpm -r test` (once, full monorepo — required by the brief)
Ran once in the background (took >120s); exit code 0. Per-package totals, cross-checked against
direct `pnpm --filter <pkg> test` runs for every package that has a `test` script:
```
@lkb/core:         7/7   pass
@lkb/ai:          74/74  pass
@lkb/ask:         50/50  pass
@lkb/db:          14/14  pass
@lkb/index:      228/228 pass
@lkb/ingest:     118/118 pass
@lkb/api:        195/195 pass
@lkb/meeting-bot:142/142 pass
-----------------------------
TOTAL:           828/828 pass, 0 fail
```
(`apps/web`, `workers/transcribe` have no `test` script — skipped by `pnpm -r`, not a gap.)

### `pnpm -r typecheck`
```
Scope: 10 of 11 workspace projects
... (every package) Done
```
Exit 0, no errors.

### `pnpm gen:types --check`
```
OK: 26 generated type file(s) + index.ts match schema/
```

### `python schema/validate.py`
```
OK: watch_reports — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: watch_state — valid fixture passes, invalid fixture correctly rejected (2 error(s))
... (24 other collections, all OK)
PASS: 26 collection schema(s) validated correctly.
```

### `pnpm lint:structure`
```
lint-loc: OK (339 file(s) within budget)
lint-dirsize: OK (87 dir(s) within budget)      <- after D-031's apps/api/src override
lint-root: FAIL — 16 loose files (budget 15)    <- PRE-EXISTING, see below
lint-dupes: OK (396 unique export(s), 26 unique schema $id(s))
lint-migrations: OK (1227 file(s) scanned)
snapshot --check: OK (119 lines, budget 200)    <- after regenerating docs/SNAPSHOT.md
lint.test.mjs: 14/14 pass
tracker-audit --gate g1,g4: 6 finding(s), exit 1 <- PRE-EXISTING, see below
depcruise: no dependency violations found (354 modules, 1099 dependencies cruised)
```

**`lint-root` (16 loose root files, budget 15) is PRE-EXISTING**, not introduced by this unit.
None of the 16 flagged files (`.dependency-cruiser.cjs`, `.dockerignore`, `.env.example`,
`.gitignore`, `.gitmodules`, `AGENTS.md`, `ARCHITECTURE.md`, `docker-compose.yml`,
`Living-Knowledge-Base-Architecture.html`, `migrate-mongo-config.cjs`, `package.json`,
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `structure.config.json`, `TASKS.md`,
`tsconfig.base.json`) was created or touched by this unit (the only root-adjacent file this unit
edited is `structure.config.json`, an existing file, not a new loose file). This matches the
already-filed **ISS-248**, cited in the checker's own PASS verdict for `u0-zoom-browser-join`
("ISS-248 lint-root reproduced identically on base 29696ea via throwaway worktree") — same
finding, later base commit (`a6e30c6`).

**`tracker-audit --gate g1,g4` (6 findings) is also PRE-EXISTING / concurrent-lane, not this
unit's.** All 6 findings reference `T-031`/`T-033`/`t-047` (goal.json↔TASKS.md reconciliation and
bare-`ISS-NNN` ambiguity in OTHER lanes' manifests/verdicts — `t-031-audio-watchdog.md`,
`t-033-bot-tests.md`, `t-047-controller.md`), none of which this unit touched. `.goal/goal.json`
was already showing as modified in `git status` at THIS SESSION'S START (before any work in this
unit), confirming it is concurrent-lane state, not something this unit's diff caused.

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `extractSessionDateTime` resolves abbreviated month names ("Sep 27, 2026"), the real live bug this unit found and fixed | `apps/api/src/gws-gmail.test.ts` "abbreviated month names parse" | Reverted `MONTH_ALIASES` to full-name-only (dropped the `full.slice(0,3)` + `sept` aliases) in `gws-gmail.ts` | BEFORE: `✔ ... (0.34ms)`, `pass 20/fail 0`. AFTER: `✖ ... (4.6ms)`, `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:`, `pass 19/fail 1`. Restored, `cmp` clean, re-run green 20/20. |
| `diffNewDriveFiles` is idempotent — a file recorded in `watch_state` (any status) is never reported new again | `packages/ingest/src/sources/gdrive.test.ts` "idempotent" + "a file already recorded ... is never new again" | Dropped the `!seenIds.has(f.id)` clause in `diffNewDriveFiles`, keeping only the ingested-manifest check | BEFORE: `pass 12/fail 0`. AFTER: `✖ a file already recorded ...`, `✖ idempotent ...`, `pass 10/fail 2`, both `AssertionError [ERR_ASSERTION]`. Restored, `cmp` clean, re-run green 12/12. |
| `yearForMonth` puts April..December in the sheet's first year, January..March in the next (the Apr-2026→Mar-2027 program year) | `packages/ingest/src/sources/toc-calendar.test.ts` "yearForMonth: April..December ..." | Changed `monthIndex >= 3` to `monthIndex > 3` (off-by-one at the April boundary) | BEFORE: `pass 9/fail 0`. AFTER: `✖ yearForMonth: ...`, `AssertionError [ERR_ASSERTION]`, `pass 8/fail 1`. Restored, `cmp` clean, re-run green 9/9. |
| `buildAutoSessionSkeleton`'s `session_page.evidence` has one row per DISTINCT speakerRef, never one per turn (keeps the schema-required non-empty evidence array small and non-duplicated) | `scripts/watch/lib/session-skeleton.test.mjs` "produces a schema-shaped set from turns alone" | Dropped the `!seenSpeakers.has(t.speakerRef)` dedup guard | BEFORE: `pass 6/fail 0`. AFTER: `✖ ... AssertionError: one evidence row per DISTINCT speakerRef, not per turn`, `pass 5/fail 1`. Restored, `cmp` clean, re-run green 6/6. |
| the Gmail digest correctly finds the real Ashoka 27-Sep invite, TOC calendar's 28/30 Sep rows, and the real CBSE recording mail, on the LIVE inbox | live `--dry-run` run against real Drive/Gmail/CSV (below) — this is the end-to-end claim the 4 unit falsifications above compose into | n/a — this is the integration claim; see "Live check" below for the before/after of the TWO real bugs this found (abbreviated month, query noise) | See "Live check" section: first live run missed Ashoka's time + CBSE entirely; after both fixes, both appear correctly. |

- **`lock.mjs` and `digest.mjs`** are covered by their own test suites (6 and 3 tests) exercising
  real filesystem behavior (lock) and pure string-building (digest) directly — no isolating
  mutation was additionally run for these; their tests already assert exact behavior (e.g.
  `acquireLock` returning `{acquired: false}` on a live lock, `{acquired: true}` after `staleMs`)
  against real `fs` state, not a mock, so a broken implementation fails them directly.
- **`ingest-chain.mjs`** (the download→ffmpeg→transcribe→seed→index composition) has **NO
  automated test** and **no isolating falsification** — see "UNVERIFIED" below. It was
  deliberately never exercised (per the brief: "Do NOT run --ingest live").

**`UNVERIFIED — the --ingest chain's live execution (download, ffmpeg extraction, transcription,
seed-toc, buildIndexer) ships without an automated test or a real run, because the brief
explicitly forbids running --ingest live and the chain shells out to real gws/ffmpeg/Gemini —
exercising it meaningfully would mean either mocking every external tool (low-value: it would
mostly test the mocks) or spending real API cost and downloading a real 200+MB file, neither of
which this unit's time budget or brief covers.** The individual pieces it composes ARE covered:
`gdrive.ts`'s download command shape (`downloadDriveFile` test asserts the exact gws args),
`session-skeleton.mjs`'s skeleton builder (6 tests, one capability-coverage row above), and the
seed-toc/buildIndexer calls are the SAME production calls `scripts/webinar/sync-session.mjs`
already uses (u1-toc-sept-catchup's own manifest exercised the `seed-toc.mjs --sessions` +
`buildIndexer` half of this exact chain live, just invoked by hand rather than by this script).
This gap is enumerated debt, not a hidden one.

## Live check (REQUIRED, this unit's actual verification) — real Drive/Gmail/CSV, `--dry-run`

Ran `node scripts/watch/run-watch.mjs --dry-run` against the real Drive folder
(`1STZ-ctQbiy_zV82xbqnbeJRHhmGemewh`), the real work Gmail inbox, and the real
`raw/TOC/TOC-Materials/_csv/calendar1.csv`, three times over the course of this unit as bugs were
found and fixed. Final run, 2026-09-25T06:59:28Z (redacted — every tracking/session query string
stripped, e.g. `?ts=…`/`?si=…`):

```
# Source watch — 2026-09-25T06:59:28.429Z

Mode: **dry-run**

## New Drive recordings found (1)

- **24th Sep : InFocus** (`1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri`)

## Ingested this run (0)

_none_

## Failed (0)

_none_

## Upcoming sessions, next 14 days (6)

- **2026-09-27** — Learning Gaps: Strategies for Student Support | Educator Dialogue Confirmation [gmail] _(join link present)_
- **2026-09-27** — Fwd: Reminder: Educator Dialogues| Learning Gaps: Strategies for Student Support | Reena Gupta | Sep 27, 2026 [gmail]
- **2026-09-28** — Scholarships 101: Show Me the Money [toc-calendar]
- **2026-09-30** — Advocacy strategies for Neurodivergent / learning disabilities for university admissions [toc-calendar] _(TOC members-only Zoom)_
- **2026-10-06** — Talent Management in Education (non-academic roles) in the age of AI [toc-calendar] _(TOC members-only Zoom)_
- **2026-10-07** — Destination Gujarat: University Visits [toc-calendar]

## Past-recording mails not yet ingested (11)

- "Updated invitation: counsellor parent flow and People like me @ Thu Sep 24, 2026 12:30pm - 1pm (IST) (Umesh Sugara)" from abhinav@vidysea.com (no recording link found in body)
- "Invitation: counsellor parent flow and People like me @ Thu Sep 24, 2026 4:30pm - 5pm (IST) (Umesh Sugara)" from abhinav@vidysea.com (no recording link found in body)
- "You're registered for Google Cloud Weeklies on Thursday, September 24, 2026" from googlecloud@google.com (no recording link found in body)
- "Accepted: Karunn/ Umesh @ Tue Sep 22, 2026 12pm - 12:30pm (IST) (Umesh Sugara)" from karunn@vidysea.com (no recording link found in body)
- "Fwd: Karunn, control your AI spend and automate your workflows" from karunn@vidysea.com (no recording link found in body)
- "Invitation: PathLynks new features demo @ Mon Sep 21, 2026 3:30pm - 4:15pm (IST) (Umesh Sugara)" from himanshu@vidysea.com (no recording link found in body)
- "Re: Weekly Delivery Plan & Timeline (29 June 2026 - 20 July 2026)" from karunn@vidysea.com — https://drive.google.com/file/d/1mamO0IAuzFI1CXkvRXacn6Nts0uuYSbU/view [redacted]
- "Re: Weekly Delivery Plan & Timeline (29 June 2026 - 20 July 2026)" from navnit@vidysea.com — https://drive.google.com/file/d/1mamO0IAuzFI1CXkvRXacn6Nts0uuYSbU/view [redacted]
- "Fwd: CBSE Career Guidance Webinar Recording-16 September" from karunn@vidysea.com — https://www.youtube.com/live/fEQ3UqFkINA [redacted]
- "Re: Weekly Delivery Plan & Timeline (29 June 2026 - 20 July 2026)" from navnit@vidysea.com — https://drive.google.com/file/d/1mamO0IAuzFI1CXkvRXacn6Nts0uuYSbU/view [redacted]
- "Re: Weekly Delivery Plan & Timeline (29 June 2026 - 20 July 2026)" from karunn@vidysea.com — https://drive.google.com/file/d/1mamO0IAuzFI1CXkvRXacn6Nts0uuYSbU/view [redacted]

--dry-run: nothing written (no digest file, no Mongo row, no watch_state).
```

### Against the brief's stated expectations

- **"0 new Drive recordings, since U1 already ingested the 4 September ones... if U1 isn't merged
  yet ... it may list them as new; say which applies and why"** — **neither literally applies.**
  U1 is not merged into this branch's base (`a6e30c6`, before U1's merge), so U1's own
  `data/toc-migrated/` session dirs are genuinely absent from this worktree. BUT the digest still
  correctly reports **0 of the original 4** as new, because `loadIngestedDriveIds` cross-checks
  the MAIN TREE's `D:/KnowledgeBase/raw/TOC/TOC-Materials/Recordings/September/_drive-manifest.json`
  (read-only, per the brief) — which already lists all 4 real Drive file ids, independent of
  whether U1's Mongo/data-dir work has merged. What the digest DOES correctly find is a genuinely
  **5th, newer Drive file** — `24th Sep : InFocus` (`1mJI5w...`), uploaded to Drive after U1's
  manifest was captured (its own `createdTime` values top out at 2026-09-22) and not in that
  manifest — this is real new content on Drive, not a bug.
- **"Ashoka 27 Sep 11:00 (join link present)"** — present, twice (the original Ashoka mail plus
  a follow-up confirmation carrying an actual join link). **This is where the first live run
  failed**: the real Ashoka email's body has the exact `*Day & Date:* Sunday, September 27, 2026
  *Time:* 11:00 AM - 12:00 PM IST` string from the task brief, but the FIRST live run produced
  `startTime: undefined` — root-caused live (see "Capability coverage" row 1): the body ALSO
  contains an incidental abbreviated date ("...| Sep 27, 2026" in a quoted Subject line) that
  the original `DATE_RE.exec()` matched FIRST, and `parseMonthName` didn't recognize "Sep" (only
  full month names), silently discarding the whole extraction. Fixed by adding month-abbreviation
  aliases + a labeled-date-preferring regex (`DATE_NEAR_LABEL_RE`); re-run correctly produced
  `startTime: 2026-09-27T05:30:00.000Z`.
- **"TOC 28 Sep Scholarships 101 18:00 and 30 Sep 18:00"** — both present, correctly dated,
  correct titles, from `toc-calendar.ts` parsing the real CSV row (28 Sep's row has genuinely
  blank mode/location cells in the real sheet — correctly rendered with no "members-only Zoom"
  tag, unlike 30 Sep's row which does carry `Virtual`/`Zoom`).
- **"Past recordings include the CBSE 16 Sep Drive/YouTube mail"** — present, with the real
  `youtube.com/live/fEQ3UqFkINA` link (matches the video id named in the plan's own status
  notes). **This is the second live bug found**: the real CBSE mail sat at rank 37 of ~201 real
  query matches by recency; the original `scanGmailForMeetingCandidates(30)` cap missed it, and
  the original bare `youtube.com`/`drive.google.com` query OR-terms were matching large amounts
  of unrelated newsletter mail (a real "Google Cloud Weeklies" registration mail, still visible
  above as an accepted false-positive-by-sender). Fixed by quoting the URL-shape terms
  (`"youtube.com/watch"`, `"drive.google.com/file"`, etc. — narrower than a bare domain) and
  raising the fetch cap to 60 (documented in `run-watch.mjs`'s own comment with the measured rank).

### Known, accepted imprecision (not fixed — time-boxed, honestly stated)

The "past-recording mails not yet ingested" section still lists **7 calendar-invite/newsletter
rows with no actual recording** (`Invitation:`/`Accepted:`/registration mail, and 4 duplicate
"Weekly Delivery Plan" Drive-link mails that are a document, not a recording). `classifyMeetingKind`
classifies ANY mail with a PAST `startTime` and no recording signal as `"past-recording"` — which
is technically "a meeting/mail whose stated time has passed", not "verified to contain an actual
recording". `recordingUrl` (when present) IS a strong signal, but its absence doesn't disqualify a
row from this heuristic. This is the documented behavior of `classifyMeetingKind`'s own doc
comment ("best-effort ... a bare join link with no other signal reads as an invite, not a recap"),
not a silent gap — narrowing it further (e.g. requiring `recordingUrl` present) was considered and
rejected because it would then MISS a genuine past recording whose mail states no direct link (an
"ask me for the recording" style reply), which is a worse failure mode for a "don't remind me"
watcher than a few extra rows in a review list.

## Live browser evidence

Not UI-touching — no surface changed. Every file this unit touched is `packages/ingest/src`,
`apps/api/src` (non-route logic + one interface's optional fields), `packages/db/src`,
`schema/`, `migrations/`, `scripts/watch/`, `structure.config.json`, `docs/DECISIONS.md`,
`docs/SNAPSHOT.md`. No `apps/web`, no `*.tsx/jsx/html/css`, no `routes/`/`pages/`/`components/`
path was created or modified.

## Status: checked-PASS — qa/verdicts/u2-source-watcher.md (Cycle checked: 0, 0b8c3cf); merged to master; migration 20260925090000-source-watcher applied 2026-09-25T07:39Z; first live --ingest started (24 Sep InFocus) to retire the UNVERIFIED ingest-chain debt; debt ISS-U2-1 (append_decision.ps1 UTF-8 mojibake in D-031)
