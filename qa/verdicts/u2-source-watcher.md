# Verdict — u2-source-watcher

**Cycle checked:** 0

**Date:** 2026-09-25

**Bound to:** `D:/KnowledgeBase-lanes/u2-source-watcher` (branch `wave/u2-source-watcher`, HEAD
`7616beb`, base `a6e30c6`). No formal contract exists for this ad hoc unit (plan
`C:/Users/Lenovo/.claude/plans/what-is-the-update-vivid-donut.md` §U2) — judged against the
plan's own U2 bullets/verification line, the manifest's own claimed capabilities, and the
adjacent contracts named in the dispatch (`gmail-meeting-candidates-approval.md`,
`ingest-indexing-pipeline.md`).

## What I re-ran myself (fresh, not pasted)

- `pnpm --filter @lkb/ingest test` → **118/118**, matches manifest.
- `pnpm --filter @lkb/api test` → **195/195**, matches manifest.
- `node --test scripts/watch/lib/*.test.mjs` → **15/15** (lock 6, digest 3, session-skeleton 6),
  matches manifest.
- `pnpm -r typecheck` → exit 0, all 10 typechecked projects Done.
- `pnpm gen:types --check` → `OK: 26 generated type file(s) + index.ts match schema/`.
- `python schema/validate.py` → `PASS: 26 collection schema(s) validated correctly`, including
  `watch_state`/`watch_reports` fixtures.
- `pnpm lint:structure` (run stage-by-stage since the `&&` chain stops at the first failure):
  `lint-loc` OK, `lint-dirsize` OK (87 dirs, `apps/api/src` at 31 under D-031's override),
  `lint-dupes` OK, `lint-migrations` OK, `snapshot --check` OK, `depcruise` (via
  `node_modules/.bin/depcruise`) — no violations (354 modules, 1099 deps). `lint-root` FAILs (16
  loose root files, budget 15) and `tracker-audit --gate g1,g4` reports 6 findings — **both
  confirmed genuinely pre-existing**, not this unit's: I reproduced `lint-root` against base
  `a6e30c6` in a throwaway `git worktree add --detach`, byte-identical 16-file list, then removed
  the worktree; `tracker-audit`'s 6 findings all cite `T-031`/`T-033`/`t-047` manifests/verdicts in
  other lanes, none touched by this diff.
- `pnpm -r test` (once, full monorepo, run in background per the memory-tight instruction) → exit
  code **0**. Tail visible: `packages/meeting-bot test: 142/142 pass`, matching the manifest's
  claimed per-package total exactly. Earlier packages' individual counts were not visible in the
  captured tail, but a `pnpm -r` run fails non-zero on any workspace test failure, so exit 0 is
  real evidence of the claimed 828/828, not merely consistent with it.
- `node scripts/watch/run-watch.mjs --dry-run` (real Drive/Gmail/CSV, read-only) — reproduced
  exactly: the new Drive file "24th Sep : InFocus" listed as new; Ashoka 27 Sep entries present
  (with `(join link present)`); TOC calendar 28 Sep (no Zoom tag, matches the real sheet's blank
  cells) and 30 Sep (`members-only Zoom`) both present and correctly dated; the real CBSE 16-Sep
  `youtube.com/live/fEQ3UqFkINA` recording mail present. `--dry-run` wrote nothing (verified: no
  new file under `qa/watch/`, no digest, no Mongo state — matches the mode's own contract).
- Credential grep across committed files (manifest, `gws-gmail.test.ts`, `gdrive.test.ts`,
  `toc-calendar.test.ts`, `scripts/watch/lib/*.test.mjs`, schema fixtures) for `tk=`,
  `registerKey=`, `access_token=`, bearer tokens — **no hits**. The one `?ts=…`/`?si=…` mention in
  the manifest is prose describing the redaction convention, not a leaked token.

## Capability coverage — reproduced in a THROWAWAY COPY outside the bound root

Copy made via `robocopy` (excl. `.git`) to `D:\tmp\checker-scratch-u2\row1`, with `node_modules`
directories re-attached as NTFS junctions (not modified by any falsifying edit) — confirmed green
BEFORE each edit, in the copy itself, not reusing step-3's bound-tree run:

| capability | check | green-before (copy) | red-after (isolating edit) | restored |
|---|---|---|---|---|
| `diffNewDriveFiles` idempotence | `gdrive.test.ts` | 118/118 | dropped `!seenIds.has(f.id)` → 116/118, the 2 named idempotence tests fail with the exact assertion (`4 !== 0`) | `cmp`-equivalent restore (re-fetched from `git show HEAD:...`), re-run 118/118 |
| `extractSessionDateTime` abbreviated-month parse | `gws-gmail.test.ts` | 195/195 | dropped the `full.slice(0,3)`/`sept` aliases → 194/195, only "abbreviated month names parse" fails | restored, re-run 195/195 |
| `yearForMonth` April boundary | `toc-calendar.test.ts` | 118/118 | `monthIndex >= 3` → `> 3` → 117/118, only the named boundary test fails | restored, re-run 118/118 |
| `buildAutoSessionSkeleton` per-speaker dedup | `session-skeleton.test.mjs` | 6/6 | dropped the `!seenSpeakers.has(...)` guard → 5/6, only the named test fails | restored, re-run 6/6 |
| live-integration (Ashoka/TOC/CBSE/new-Drive-file, real inbox) | my own `--dry-run` above | n/a (integration claim) | n/a — independently reproduced end-to-end, not mutation-falsified | n/a |

`lock.mjs`/`digest.mjs`: accepted without an additional isolating mutation, per the manifest's own
disclosed rationale — their 9 tests already assert against real `fs` state / exact string output
directly, and I re-ran them green in step 3 (part of the 15/15 lib total).

`ingest-chain.mjs` (the `--ingest` download→ffmpeg→transcribe→seed→index composition): **no
automated test, no falsification — matches the manifest's own `UNVERIFIED` disclosure.** I did not
run `--ingest` live (per the dispatch's explicit prohibition). Independently confirmed via
`git merge-tree $(git merge-base HEAD master) HEAD master` (read-only) that this branch merges
cleanly with master's `361dd39` (U1 merged) with **no conflicts anywhere in the tree**, including
`scripts/seed-toc.mjs` (this branch never touches that file, so master's `--sessions` flag support
lands untouched) — so `ingest-chain.mjs`'s `seed-toc.mjs --sessions <id>` call will work correctly
once this branch is merged. Noted but not filed as a defect: **today, on this branch, before
merge**, `seed-toc.mjs` does not yet understand `--sessions` (verified: `grep -n sessions
scripts/seed-toc.mjs` on this branch shows no arg-parsing for it, only on master) — so running
`--ingest` on this branch right now would silently re-seed the WHOLE `data/toc-migrated/`
directory rather than just the new session, likely throwing on a duplicate `_id` for
already-seeded sessions (`seed-toc.mjs` uses plain `insertOne`, no upsert). This is subsumed under
the manifest's own disclosed `--ingest`-chain `UNVERIFIED` debt, not a new gap, and does not
recur once merged.

**Capability-coverage: 4/4 falsifiable rows reproduced + 1/1 integration row independently
reproduced live = 5/5.**

## Judgment against the 6 numbered points in the dispatch

1. **Backward compatibility** — confirmed. `scanGmailForMeetingCandidates()`'s signature and
   default behavior are unchanged (still called with no args from `store.ts`); existing callers/
   tests pass unmodified (195/195, +2 new). `meeting_candidates.schema.json`'s 5 new fields are
   optional, `additionalProperties: true` was already permissive, no migration needed — confirmed
   additive, not a shape change. One thing flagged and **resolved during this check**: the
   original contract's [C5] said the Gmail fetch is `format=metadata` "Subject/From only, never
   full body" — this unit changes that to `format=full`, a genuine widening of what real Gmail
   content the scan reads (still the same already-authorized `umeshsugara@vidysea.com` /
   `gmail.readonly` account, still local, no new transmission). This is disclosed plainly in the
   manifest's "What changed", and was Umesh's own explicit direction in the authorizing plan ("Read
   the body, not just the snippet" — plan §U2), not a maker-chosen scope creep — but the written
   contract was never formally amended to match. I amended `qa/contracts/gmail-meeting-candidates-
   approval.md` [C5] myself (checker is the sole writer of `qa/contracts/`, and this contract's own
   preamble invites "/checker adopts or amends on first check") with a dated amendment-log entry
   citing the plan as authorization. Not filed as an open issue since it's now resolved by the
   amendment, not outstanding.

2. **`watch_state`/`watch_reports`** — schema, migration, and `packages/db` accessors all confirmed:
   both collections use `scopedCollection(...)(tenantId)` (`watch-state.ts`, `watch-reports.ts`),
   no raw driver handle anywhere in either file. Idempotence confirmed both by direct code read
   (`listSeenIds` has no `status` filter — a row in ANY status counts as seen, matching the
   schema's own doc comment) and by the falsifying-edit row above. The lock (`lock.mjs`) correctly
   uses an atomic `wx`-flag create, and stale-lock handling (6h default, tested: "a stale lock ...
   is stolen rather than blocking forever" / "a fresh lock ... is NOT stolen") is real and covered.

3. **`--ingest` chain composition** — confirmed it mirrors U1's exact by-hand sequence
   (download → ffmpeg → skeleton → `seed-toc.mjs --sessions` → `buildIndexer`, the same production
   calls). A failed step throws (never a silent skip): `ingestOneDriveFile` throws on any failure,
   and `run-watch.mjs`'s per-file `try/catch` around it records `watch_state` status `"failed"`
   with the reason and reports it in the digest, never swallowed. `TENANT = "toc"` is hardcoded in
   both `run-watch.mjs` and passed through to `ingestOneDriveFile`'s deps — confirmed writes only
   ever target the `toc` tenant. Merge-compatibility with master's U1 (`361dd39`, which adds
   `seed-toc.mjs --sessions`) confirmed clean via `git merge-tree`, read-only, no conflicts. See the
   capability-coverage table above for the one caveat (pre-merge-only, already-enumerated debt).

4. **Lab Protocol / D-031** — sequential id correct (D-030 → D-031), structurally matches
   `append_decision.ps1`'s output format (header shape, required `**What/Why/Result/Links:**`
   fields present). **`structure.config.json` is correctly judged as NOT an enforcement path**:
   neither the project CLAUDE.md's explicit list (`.claude/hooks/*`, `scripts/append_decision.ps1`,
   `.claude/settings.json`) nor `append_decision.ps1`'s own V7 check (`enforcementSignals` = the
   same three) names it, and the precedent this entry mirrors (D-017/D-018, the `scripts: 32`
   override) also carries no `Approved-by`. So the missing `Approved-by`/`Changes-authorized` on
   D-031 is correct, not a gap. The override itself is minimal — confirmed via diff: exactly one
   key added (`"apps/api/src": 31`) to the existing `overrides` map, global `maxFiles` untouched, no
   other directory's budget changed.
   **Genuine defect found and filed (ISS-U2-1, medium):** D-031's entry text is **corrupted** —
   verified byte-for-byte that `docs/DECISIONS.md` at base `a6e30c6` has **zero** occurrences of a
   specific mojibake byte sequence, and HEAD has **five**, all inside the D-031 entry (a real
   Unicode em-dash double-encoded via a CP1252 misread). Root-caused to
   `append_decision.ps1`'s `Get-Content -LiteralPath $EntryFile -Raw` call having no `-Encoding`
   argument — on PowerShell 5.1 this defaults to the system ANSI codepage for a BOM-less UTF-8
   file, garbling any non-ASCII character in the entry text before it gets correctly UTF-8-written
   back. This is a defect in the **shared** `append_decision.ps1` tool, not this unit's own code
   (u2-source-watcher never touches that script) — filed, not blocking this unit's PASS per the
   project's own severity gate (medium = ledger entry, never a blocker).

5. **Live parsers on real inputs** — see "What I re-ran" above: all four named claims (Ashoka time,
   TOC 28/30 Sep from the CSV, new Drive file, CBSE mail) reproduced exactly on a fresh run.
   Credential grep clean. On "the 7 internal calendar-invite/newsletter rows" imprecision: my own
   fresh count of the reproduced digest's "Past-recording mails not yet ingested" section is **6**
   no-recording-link rows + 4 duplicate "Weekly Delivery Plan" Drive-link rows + 1 real CBSE
   recording = 11 total — the manifest's own prose says "7" where the reproducible output shows 6;
   a trivial narrative miscount in the manifest's writeup, not a functional defect (not worth a
   ledger entry per this project's severity gate on cosmetic/low items). On whether the underlying
   imprecision itself (any past-tense mail with no recording signal still shows up as a
   "past-recording" row) is acceptable debt: **yes** — I independently agree with the manifest's own
   reasoning. Nothing auto-acts on these rows (they only ever populate a review list, never an
   auto-ingest or auto-join), and the documented alternative (requiring `recordingUrl`) would create
   a worse silent-miss failure mode for a "don't remind me" digest than a few extra review rows.

6. **C10 checks** — all reproduced fresh (see "What I re-ran"); pre-existing failures independently
   confirmed byte-identical against base `a6e30c6` via a throwaway detached worktree (removed after).

## Diff scope (step 4c)

`git diff a6e30c6..HEAD --stat` = 37 files, matches the manifest's "What changed" list exactly (I
cross-checked every path). No existing function/export/route/test/config key was deleted or
renamed — every touched pre-existing file (`gws-gmail.ts`, `store.ts`,
`meeting-candidates.ts`, `meeting_candidates.schema.json`, `structure.config.json`,
`docs/DECISIONS.md`, generated `packages/core` files, `docs/SNAPSHOT.md`) shows purely additive
changes on inspection. No file outside the manifest's "What changed" list was touched.

## Live browser

Not UI-touching — confirmed via diff scope: no `apps/web`, no `*.tsx/jsx/html/css`, no
`routes/pages/components` path in the 37-file diff. `LIVE-BROWSER: not-applicable`.

---

```
VERDICT: PASS
SCOREBOARD: 6/6 dispatch judgment points evidenced, 5/5 capability-coverage rows reproduced
FAILURES (if any):
- none at >80% confidence severe enough to block. One medium finding filed (ISS-U2-1, shared
  append_decision.ps1 encoding defect — not this unit's own code, not blocking).
CAPABILITY-COVERAGE: 5/5 rows reproduced (4 falsifying-edit rows in a throwaway copy + 1 live
  integration row independently reproduced against the real Drive/Gmail/CSV)
LIVE-BROWSER: not-applicable (no apps/web, no .tsx/.jsx/.html/.css, no routes/pages/components path
  touched — 37-file diff confirmed)
ISSUES-WRITTEN: ISS-U2-1
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All re-run test suites (118+195+15 targeted, plus a full pnpm -r test exit 0) match
  the manifest exactly; typecheck/gen:types/schema-validate/lint:structure all reproduce, with the
  two claimed pre-existing failures (lint-root, tracker-audit g1/g4) independently confirmed
  byte-identical on base a6e30c6 via a throwaway worktree. The live --dry-run against the real
  Drive/Gmail/CSV reproduced every named claim exactly, and a credential grep of committed files
  found nothing. Backward compatibility holds; watch_state/watch_reports are correctly
  tenant-scoped and idempotent with working stale-lock handling; the --ingest chain composition is
  sound and merges cleanly with master's U1 per a read-only git merge-tree check. Two things were
  actively resolved rather than left as gaps: the Gmail format=metadata→format=full widening was
  disclosed but the written contract hadn't caught up, so I amended
  qa/contracts/gmail-meeting-candidates-approval.md [C5] with a dated log entry citing the plan's
  own explicit authorization; and D-031's Approved-by question was judged and confirmed correct
  (structure.config.json is genuinely not on the enforcement-path list, matching the D-017/D-018
  precedent it mirrors). One real, evidenced defect was found and filed: D-031's own entry text is
  byte-level corrupted (5 mojibake sequences, 0 on base) due to append_decision.ps1 reading a
  UTF-8 entry file without specifying an encoding — a shared-tooling bug, not this unit's code,
  filed at medium severity per the project's own gate and not a blocker.
```
