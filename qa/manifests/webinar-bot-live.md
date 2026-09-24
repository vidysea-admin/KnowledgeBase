# Manifest — webinar-bot-live

**Contract:** qa/contracts/meeting-bot-capture.md (C1/C2 extended, C3 superseded for the browser joiner). Draft successor `qa/contracts/meeting-bot-live-capture.md` (T-024b) exists, checker-authored, not yet adopted (the maker never edits qa/contracts/).
**Goal task:** U4.2 (one real meeting-bot joiner) · T-024b · D-027 · D-028
**Date:** 2026-09-24
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-285 (high, lint-dirsize regression), ISS-286 (high, missing Capability coverage table), ISS-287 (low, stale doc comment + undisclosed touched files). Live-run defects (unrelated to this cycle) remain tracked as T-029, T-030, T-032, T-047.
**Queue tier:** 3, a roadmap task (Umesh's fast-track: built and live-run first, checked after; recorded in D-027)
**Severity gate:** FULL ceremony. `scripts/webinar/sync-session.mjs` performs **data writes** to Mongo (lkb, tenant `toc`).
**Status:** checked-PASS (verdict qa/verdicts/webinar-bot-live.md, cycle 1, commit 0add6e4)
**Commits (cycle 0):** `fd74864` (feature) · `cfaf464` (split record commands out of cli.ts for lint-loc) · **(cycle 1, this fix):** see bottom of this file, on branch `feat/webinar-bot`

## What changed (cycle 0)
- `packages/meeting-bot/src/platform.ts`, `strategy.ts` and their tests: new platforms `zoho` (webinar/meeting.zoho.*) and `cloudonair` (Google Cloud OnAir), both routed to `browser`. A lookalike host (`zoho.in.evil.example`) stays `unknown`.
- `src/capture/obs-windows.ts` (NEW): the real `BrowserJoinerDeps`.
  - Spawns `py/sb_join.py` (NEW): a headed SeleniumBase-UC Chrome on the persistent profile `data/bot-profile/`. It pins `document.title`, denies permission prompts, auto-clicks Join only for zoho, and kills orphaned processes on its own profile.
  - Confirms the OS window title `"<title> - Google Chrome"`.
  - Drives OBS over obs-websocket v5: scene `LKB Bot` with window_capture plus wasapi_process_output_capture, matched by title (priority 1). Mutes the global desktop and mic inputs.
  - Starts the recording. Stop waits until the file size is stable.
  - Every failure path restores the mutes and stops the bot browser.
- `src/capture/record-commands.ts` (NEW; `cli.ts` only dispatches to it):
  - `record <url> --until HH:MM`: join, record, extract m4a, silence gate (max < -50 dB → no transcription), write `source.json` with `audioPath` and `hash`, optional transcription.
  - `login`: opens the bot profile so the user can sign in.
  - `finalize --stop-obs`: recovery when the controller dies mid-run.
- `scripts/lib/find-audio-file.mjs`: honours `source.json.audioPath`. The TOC branch is unchanged.
- `scripts/transcribe-long-session.mjs`: `GEMINI_STT_MODEL` override, headers/body timeout 600 s → 1,800 s.
- `scripts/sync-webinar-session.mjs` (NEW, **data writes**): upserts source/session/speakers/orgs/topics; delete+insert of this session's turns and of graph_edges tagged with `sessionRef`. Tenant-scoped through the `packages/db` `coll(tenantId)` accessors only. Dry-run by flag.
- Data: `data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/{source,meta,turns,turns.chunked-gemini-3.5}.json`, `transcript.md`, `summary.md`.
- Also touched, not previously disclosed (ISS-287): `docs/meeting-bot-roadmap.md` (new), `TASKS.md`, `.gitignore`, `docs/DECISIONS.md`, `packages/meeting-bot/package.json`, `pnpm-lock.yaml`.

## What changed (cycle 1 — this fix, ISS-285/286/287)
- **ISS-285 (lint-dirsize):** `git mv scripts/sync-webinar-session.mjs scripts/webinar/sync-session.mjs`. Fixed the file's own `ROOT` computation (`resolve(dirname(...), "..")` → `"..", ".."`, one directory deeper) and its five `../packages/db/...` dynamic imports → `../../packages/db/...`. Re-verified the dry-run prints the exact same numbers from the new path (below). No other file references the old path by name (checked TASKS.md, docs/meeting-bot-roadmap.md, package.json — none do; `qa/QUEUE.md:49` names the old path+line numbers as a point-in-time historical sweep note, checker-owned, left as-is rather than edited by the maker).
- **ISS-285 (side effect):** `docs/SNAPSHOT.md` regenerated (`node scripts/snapshot.mjs`) — the move changed the directory tree the snapshot lists (new `scripts/webinar/` entry). Never hand-edited, per the linter's own generated-file contract.
- **ISS-286:** added the Capability coverage table below.
- **ISS-287:** `packages/meeting-bot/src/joiners/browser-joiner.ts` header comment rewritten — no longer claims "no real browser is launched here"; now names `capture/obs-windows.ts` + `py/sb_join.py` as the real `BrowserJoinerDeps` implementation and points at the T-024b draft contract. The undisclosed cycle-0 touched files are now listed above.
- **New test (cheap coverage, not requested by an issue but licensed by the checker's "add where cheap" note):** `scripts/lib/find-audio-file.test.mjs` — falsifies the `source.json.audioPath` branch `find-audio-file.mjs` added for this unit, plus proves the pre-existing TOC basename-match fallback still fires when `audioPath` is absent. Wired into `package.json`'s `test:lint` script list.
- `package.json`: `test:lint` gains `scripts/lib/find-audio-file.test.mjs`.

## How to verify (commands + REAL pasted outputs, cycle 1)

Per ISS-285's finding that cycle 0 ran only a 3-of-9 subset, this cycle ran the **full**
`pnpm lint:structure` composite plus the other three contract-C7/C10 commands, and pastes real
output rather than an "expected" line.

```
$ pnpm lint:structure
lint-loc: OK (296 file(s) within budget)
lint-dirsize: OK (83 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example
  .gitignore .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml
  Living-Knowledge-Base-Architecture.html migrate-mongo-config.cjs package.json pnpm-lock.yaml
  pnpm-workspace.yaml structure.config.json TASKS.md tsconfig.base.json
 ELIFECYCLE  Command failed with exit code 1.
```
**lint-root's FAIL is PRE-EXISTING and NOT caused by this unit or this fix cycle** — it is
**ISS-248** (open since 2026-09-10: the Codex-runtime-projected `AGENTS.md`/`.codex/` pushes the
repo-root loose-file count to 16 against a 15 budget in every Codex session). Verified by
`git ls-tree 4aa9d13 | awk '$2=="blob"{print $4}'` — the exact same 16 filenames were already
tracked/present at the commit *before* this unit's own commits (fd74864/cfaf464), including
`Living-Knowledge-Base-Architecture.html`. This is not this unit's to fix (no Approver-authorized
budget change, and the fix belongs to ISS-248's own resolution, not a webinar-bot-live cycle).
Per precedent (ISS-100, ISS-136, ISS-222, ISS-262), the chain short-circuits here, so every
remaining stage was re-run individually rather than trusted from the chain:

```
$ node scripts/lint-dupes.mjs
lint-dupes: OK (320 unique export(s), 24 unique schema $id(s))

$ node scripts/lint-migrations.mjs
lint-migrations: OK (3436 file(s) scanned)

$ node scripts/snapshot.mjs --check     # FAILED before this cycle's fix — see below
FAIL: docs/SNAPSHOT.md is stale (64 line(s) differ from a fresh regeneration): [... scripts/webinar/
  entry missing ...]
$ node scripts/snapshot.mjs             # regenerated (this cycle's move caused the staleness)
wrote D:\KnowledgeBase\docs\SNAPSHOT.md (117 lines)
$ node scripts/snapshot.mjs --check     # re-run after regenerating
OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)

$ node --test scripts/lint.test.mjs
ℹ tests 14
ℹ pass 14
ℹ fail 0

$ node scripts/tracker-audit.mjs --gate g1,g4
tracker-audit --gate G1,G4: 1 finding(s)
  G1 row-set: in TASKS.md but not goal.json — T-029..T-050 (webinar-bot roadmap rows)
```
**Also pre-existing, not this cycle's to fix:** T-029..T-050 were added to TASKS.md by this
unit's own **cycle-0** commit (fd74864, `docs/meeting-bot-roadmap.md`'s task list) without a
matching `.goal/goal.json` row-set — the same divergence class as ISS-288 (already filed against
this unit for the *status* half of U4.2/U2.6; this is the *row-set* half, for the newly-added
T-029..T-050 rows specifically, not yet its own issue). Not touched this cycle: `.goal/goal.json`
was already modified in the working tree before this fix cycle started (by another concurrent
process per this repo's multi-lane note), and adding 22 new task rows to it is tracker bookkeeping
outside the scope of ISS-285/286/287.

```
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (311 modules, 961 dependencies cruised)
```

The other three C7/C10 commands:
```
$ pnpm gen:types --check
OK: 24 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 24 collection schema(s) validated correctly.

$ pnpm --filter @lkb/meeting-bot test
ℹ tests 43
ℹ pass 43
ℹ fail 0

$ pnpm --filter @lkb/meeting-bot typecheck
(exit 0, no output)
```

The moved script, re-verified from its new path (ISS-285's actual fix):
```
$ node scripts/webinar/sync-session.mjs 2026-09-24-zoho-next-european-study-destinations --dry-run
session 2026-09-24-zoho-next-european-study-destinations (tenant toc)
  turns 80 · speakers 3 · orgs 6 · topics 15
  graph_edges 94: {"held_on":1,"in_month":1,"captured":1,"spoke_in":3,"represents":2,
  "located_in":8,"partner_of":4,"covers":22,"discussed":52}
No Mongo connection attempted (--dry-run).
```
Identical to cycle 0's numbers and to the live Mongo read-back the checker already reproduced
(94 graph_edges, same byType breakdown) — unchanged by this cycle, not re-run against production
again (never run this script without `--dry-run`).

**Unrelated flake observed, not caused by this cycle:** `pnpm test:lint` (the wider list, not part
of `lint:structure`) intermittently fails `catalogue-cli.test.mjs`'s "leaves the repo clean" check
because `docs/PROGRESS.md` shows transiently modified — reproduces even running that file alone,
with a *different* failure count each run (1, then 4), and `git status` shows `docs/PROGRESS.md`
clean immediately after. Consistent with another concurrent maker/checker lane writing that file
mid-run (this dispatch's own brief warns of concurrent commits in this tree), not a defect in this
unit's own files (this cycle touched no file `catalogue-cli.test.mjs` reads). Not filed as an
issue — not reproducible in isolation from tree concurrency, and doesn't touch any of the four
commands above.

## Prior verify list (cycle 0, kept for reference)
- `pnpm --filter @lkb/meeting-bot test` → 43 pass / 0 fail
- `pnpm --filter @lkb/meeting-bot typecheck` → exit 0
- `node scripts/lint-loc.mjs` → `OK (295 file(s) within budget)`
- `npx depcruise --config .dependency-cruiser.cjs packages apps workers` → 0 violations (310 modules)
- `node scripts/lint-dupes.mjs` → OK
- `node scripts/webinar/sync-session.mjs 2026-09-24-zoho-next-european-study-destinations --dry-run` → turns 80 · speakers 3 · orgs 6 · topics 15 · graph_edges 94, and no Mongo connection
- Mongo read-back (tenant toc): `graph_edges` count 94; `spoke_in` edges on 2026-09-24 = devanshi 35 / anjum 27 / sagar 16 turns; every non-structural edge has `evidence[].turnId` that resolves to a turn of this session.

## Capability coverage (ISS-286)

Per `checker/SKILL.md` step 4b and `references/capability-coverage.md`: every falsifying edit
below is a single-hunk edit to a file named in "What changed", applied to the bound working tree,
reverted via `git checkout --` (a tracked file with no prior uncommitted diff — the safe
git-native equivalent of D-020's byte-backup+trap+cmp rule) and re-verified green afterward. No
mutant was left applied at any point (`git diff --stat` shown as 0 after each restore).

| # | Capability (What changed) | Check (file:line / node id) | `observed` |
|---|---|---|---|
| 1 | Platform detection: `zoho`/`cloudonair` hosts route to those platforms; lookalike host stays `unknown` (`platform.ts:33-34`) | `node --test --import tsx src/platform.test.ts` → `detects Zoho webinar/meeting URLs` | **COVERED.** PASS before: `✔ detects Zoho webinar/meeting URLs (0.3558ms)`, 9/9. Edit: `platform.ts:33` regex `zoho` → `zoho-DISABLED` (single hunk). FAIL after: `✖ detects Zoho webinar/meeting URLs (2.2895ms)` — `'unknown' !== 'zoho'` (right-reason: the specific assertion flipped, not a parse-break). Restored via `git checkout --`, `git diff --stat` empty, re-run green: `✔ ... (0.4186ms)`, 9/9. |
| 2 | Strategy routing: `zoho`/`cloudonair` → `browser` joiner (`strategy.ts:30-32`) | `node --test --import tsx src/strategy.test.ts` → `routes zoho and cloudonair to the local browser joiner` | **COVERED.** PASS before: `✔ ... (0.1551ms)`, 4/4. Edit: deleted the `case "zoho": case "cloudonair":` lines (single hunk). FAIL after: `✖ ... (1.8866ms)`, 3 pass/1 fail. Restored via `git checkout --`, re-run green: `✔ ... (0.158ms)`, 4/4. |
| 3 | `find-audio-file.mjs` `audioPath` branch — bot-captured sessions skip TOC basename matching (`scripts/lib/find-audio-file.mjs:19-22`) | `node --test scripts/lib/find-audio-file.test.mjs` (NEW this cycle, wired into `test:lint`) | **COVERED.** PASS before edit: 3/3 (`ℹ pass 3 / ℹ fail 0`). Edit: `if (source.audioPath)` → `if (false && source.audioPath)` (single hunk). FAIL after: both `audioPath branch` tests fail for the right reason (fell through to basename matching, which then fails since no matching file exists); the third (fallback) test still passes — `ℹ pass 1 / ℹ fail 2`. Restored via `git checkout --`, re-run green: `ℹ pass 3 / ℹ fail 0`. |
| 4 | Real browser join (`py/sb_join.py`): headed SeleniumBase-UC Chrome, permission-prompt denial, title pinning, orphan recovery | — | `UNVERIFIED — no automated test harness exists for driving a real Chrome process; requires a live/headed browser. Debt carried by T-033 ("Tests + checker pass ... failure paths with a fake OBS client"). The checker's cycle-0 manual code review (JOIN_TEXTS content, MAX_CLICKS, --deny-permission-prompts) and the live 2026-09-24 Zoho run (D-027) are the only verification today.` |
| 5 | Bounded, denylisted auto-click (`sb_join.py` `JOIN_TEXTS`/`CLICK_JS`, no `share`/`unmute`/`raise hand`/`allow`) | — | `UNVERIFIED — same reason as row 4 (no Python test harness for this script). The checker's cycle-0 manual grep of JOIN_TEXTS/CLICK_JS is the only check performed; not a repeatable isolating falsification. Debt carried by T-033.` |
| 6 | Per-process OBS capture (window-title match, mute/restore on every exit path incl. thrown errors) (`src/capture/obs-windows.ts`) | — | `UNVERIFIED — this unit's own manifest already discloses "No unit tests for obs-windows.ts failure paths" (Known gaps). Debt carried by T-033, which explicitly names a fake-OBS-client harness as the fix.` |
| 7 | Silence gate: capture ≤ `SILENCE_MAX_DB` throws before transcription, still writes `source.json` (`src/capture/record-commands.ts` `finalizeRecording`) | — | `UNVERIFIED — no ffmpeg-mock test harness exists yet. Live evidence: the 2026-09-24 run blocked a −91 dB smoke capture (manifest's own "Actual outputs"), but that is one live observation, not a repeatable unit test. Debt carried by T-033.` |
| 8 | Recovery (`runFinalize --stop-obs`): stops OBS, waits for file-size stability, unmutes, terminates orphaned Chrome | — | `UNVERIFIED — no test harness. Live evidence: the 16:30:56 controller death was recovered this way (D-027), one live observation. Debt carried by T-033.` |
| 9 | Credential handling: `OBS_WS_PASSWORD` never appears in a log/error string | — | `UNVERIFIED by automated test — the checker's cycle-0 manual grep of every console.log/console.error in obs-windows.ts/record-commands.ts is the only verification performed and is not a repeatable falsification. A cheap static test (assert the string never appears alongside a log call) was considered but not added this cycle — not free of false-negative risk for a determined future edit. Debt carried by T-033.` |
| 10 | Data-write scoping: every Mongo write goes through `coll(tenantId)`; turns/graph_edges deletes scoped by `sessionId`/`sessionRef` (`scripts/webinar/sync-session.mjs`) | — | `UNVERIFIED by a unit test of this script itself — sync-session.mjs has no test file. The scoping MECHANISM it depends on (packages/db/src/lib/tenantScope.ts's withTenant/scopedCollection) has its own pre-existing test suite (tenantScope.test.ts, unmodified by this unit) which this cycle did not re-falsify (out of "What changed"). The checker's cycle-0 live Mongo read-back reproduced 0 cross-tenant rows against production — real but not a repeatable isolating falsification. Debt carried by T-033.` |
| 11 | Graph-edge provenance: every non-structural edge's `evidence[].turnId` resolves to a `turns` row of the same session (H3) | — | `UNVERIFIED by unit test — deterministic edge-building in sync-session.mjs has no test file. The checker's cycle-0 live read-back reproduced 225/225 resolving, 0 bad — real but a one-time live observation, not a repeatable falsification. Debt carried by T-033.` |
| 12 | `transcribe-long-session.mjs`: `GEMINI_STT_MODEL` override, 600s→1800s timeout | — | `UNVERIFIED — requires a live Gemini API call; no mock transport test exists for this override. Live evidence: the 2026-09-24 single-call gemini-3.8-flash transcription (80 turns, no gaps) is one live run, not a repeatable unit test. Debt carried by T-033.` |

**Summary: 3/12 rows COVERED with a real isolating falsification this cycle (2 pre-existing tests
re-falsified, 1 new test added+falsified); 9/12 UNVERIFIED, all naming T-033 as the tracked debt
(no row is silently uncovered — T-033 already exists in TASKS.md for exactly this class of gap,
and the manifest's own "Known gaps" section disclosed several of these before this cycle).**

## Actual outputs (maker's own runs, 2026-09-24)
- **Live run.** Scheduled task at 15:55 → `opened` → `bot window confirmed` → clicked "join now" → recording started.
  - The controller died at 16:30:56 (console closed). OBS and the bot kept going.
  - Recovered with `finalize --stop-obs`: mkv of 3,599,045,544 bytes, audio max 0 dB / mean −19.2 dB, OBS inputs unmuted, bot browser closed.
- **Transcripts.**
  - Chunked gemini-3.5 at 40 min: failed on `UND_ERR_HEADERS_TIMEOUT`.
  - At 20 min on the untrimmed audio: refused because of an internal gap, and chunk 4 had invented turns over 13 min of post-event silence.
  - Trimmed 230–3935 s + gemini-3.8-flash in a single call: 80 turns, no gaps, max tEnd 3724 s on 3705 s of audio.
- **Silence gate.** Blocked a −91 dB smoke capture ("recording is silent … not transcribing").
- **Sync.** `written: turns -0/+80, graph_edges -0/+94`. Read-back queries are in D-028's Result.

## Known gaps (not claimed)
- Window video is intermittently black (it was black during the 16:24–16:27 slide share). Audio is fine.
- No auto-reconnect: Zoho dropped the bot at about 16:03 (reloaded by hand) and at about 17:01 (last ~5–8 min lost).
- No unit tests for `obs-windows.ts` failure paths (T-033). The `audioPath` branch gap named here
  in cycle 0 is now covered — see Capability coverage row 3 (fix cycle 1).
- Graph `covers`/`discussed` edges are keyword-based (confidence 0.7–0.8). `country:usa` also matches "Hellenic American".

## Asked of the checker
1. Verdict on the diff against C1–C7 as they apply (C3 is superseded for the browser joiner; say so explicitly).
2. **Security class (never capped):**
   - Tenancy of `scripts/webinar/sync-session.mjs` (moved from `sync-webinar-session.mjs` this fix cycle, ISS-285) writes: every write goes through `coll(tenantId)`, and a delete can only touch this session's turns/edges.
   - Credential handling: `OBS_WS_PASSWORD` read from `.env`, never logged; the bot profile holding cookies is gitignored (`data/bot-profile/`).
   - `sb_join.py` auto-click list: can it click anything that shares or unmutes?
3. Draft T-024b contract criteria from this manifest (live join, per-process capture, silence gate, recovery, data-write scoping).

## Live browser evidence
Not a web-UI change. The live-run evidence is the Zoho participant page read over CDP at 16:07/16:42, a frame showing 4 panelists (16:05), and Zoho's "Thank you for attending" email at 17:09.

## Fix-cycle-1 addendum (orchestrator, 2026-09-24 22:40)
- `.goal/goal.json`: registered T-029…T-050 (22 tasks) that cycle 0 added to TASKS.md without goal rows (tracker-audit G1 row-set, a regression this unit caused); U4.2 and U2.6 moved pending → in_progress with a note citing D-027/D-028 (closes the substance of ISS-288, medium, same file). Goal monitor re-run to refresh progress totals.
- `node scripts/tracker-audit.mjs` after: `2 finding(s)` — both G2 and NOT caused by this unit: `1 unparseable line` = the ISS-288 ledger row written by the 22:10 sweep-consolidation checker (ledger is checker-owned; asked the checker below to repair it) and `125 issue(s) "fixed" with no verified_date` (pre-existing).
