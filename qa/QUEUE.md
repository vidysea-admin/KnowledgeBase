# QUEUE — checker Mode B sweep 2026-09-26T23:0x+05:30 (3-shard wave, consolidated)

> Bound to `D:/KnowledgeBase`, range `c9959bf..802c52c` (HEAD `802c52c`) at dispatch; sweep writer
> runs solo (a parallel `/maker` session may be live in the same tree — this consolidation re-read
> every writable surface immediately before each edit and touched only checker surfaces + a narrow
> commit). **Terminal state: FINDINGS: 3 new (ISS-308 medium ledger-schema: 210 fixed/verified
> ledger rows across the union — 137 fixed + 73 verified, re-derived by direct grep — carry no
> `regression_check` field at all; ISS-309 medium delegation-health: `qa/delegation-ledger.jsonl`
> absent while `qa/manifests/` has had 9 units built since 2026-09-22; ISS-310 medium
> plan-gate-uninitialised: `qa/gates/plan-approved.md` absent, one finding per SKILL 1d rather than
> a per-manifest check) + evidence appended to 2 existing open rows rather than minting new ids
> (ISS-054 RECURRENCE: the maker heartbeat went silent ~33h after the u2-live-repair HUMAN_GATE
> with ZERO `MISSED_WAKEUP` lines — vs 5 for the prior gate — though re-derived that every
> reachable unit is currently gated, so this reads closer to correctly-idle than asleep-with-work-
> waiting; ISS-276 NEW INSTANCE: the vivid-donut plan's U0-U3 units shipped+merged
> (e6f0b72/9c52a27/0b8c3cf/a21bc16, all confirmed present) with no TASKS.md/goal.json id at all —
> a different divergence shape than ISS-276's original status-mismatch — and U4-U6 remain equally
> untracked) + 2 `.goal/goal.json` tasks closed via `goal_cli.py done` (T-031, T-033 — re-derived
> against PASS/merge commits `4c87be0`/`bf653fe` and `f0b9c91`/`5262deb`, both already `done` in
> TASKS.md at :121/:123 before this sweep touched goal.json) + 1 feedback-inbox entry marked
> folded (the 2026-09-25T11:3x Umesh source-watcher request — addressed by the U0-U3 build; U4-U6
> remain open per the ISS-276 note above; the fresh 2026-09-26 /rlcd suggestion is left unfolded,
> a maker-owned decision, not a build item yet).**
>
> **Verified, not filed:** no new bypass in `c9959bf..802c52c`; `qa/adapter.json` still absent
> (data-boundary check out of scope by design); no fix-cycle reached 3 in this window; no new
> silent-failure/erosion finding beyond what shard 3 already had on file (`ingest-chain.mjs:87`
> unchecked indexer return = ISS-305's root cause, fix `87df8e8` unmerged pending u2-live-repair;
> `notify-channels` fire-and-forget is documented design, not a defect). ISS-301 (opus share)
> gets a fresh evidence note only: `opus_sub_share` 0.0 this window, improved from 0.409 — not
> closed, its criteria don't ask for a single-window read. Gates confirmed still unanswered:
> `d023-supersede` (17d), `mc-hooks-manifest-blindness` (17d), `u2-live-repair` (1.5d),
> `zoom-bot-signin` (URGENT — Ashoka Educator Dialogues webinar, deadline Sun 2026-09-27 ~10:00
> IST). `qa/gates/ram-for-t-031.md` and `qa/gates/meeting-bot-phase-2-start.md` both already carry
> `Answered:` lines — no off-disk-answer action needed there. Token line appended verbatim from
> shard 3 (`opus_sub_share` 0.0, `sub_agents` 3, 0 classifier outages, 2 auto-compactions).

## Prior sweep header (2026-09-25T04:4x+05:30, 3-shard wave, superseded as routing; kept for its own findings below)

> Bound to `D:/KnowledgeBase`, master @ `7eb55f7` at dispatch; sweep writer runs solo (a parallel
> `/maker` session, knowledgebase-b6, is live in the same tree, and a Mode A checker for t-030 may
> run goal_cli.py on `.goal/goal.json` concurrently — this consolidation touched only checker
> surfaces + a narrow commit). **Terminal state: FINDINGS: 2 new (ISS-302 medium: u2-4 live-eval
> pause has no durable per-unit marker; ISS-303 low, file-dont-fix: `reconnect-gaps.ts` bare
> `Number()` coercion, dormant) + evidence added to 3 existing rows (ISS-178 recurrence on
> t-030-telegram-alerts; ISS-300 worsening with an in-progress fix; ISS-301 refreshed
> `opus_sub_share` 0.409, down from 0.53) + 1 row moved `open → verified`** (ISS-299 — T-047 now
> reads `done` in both `TASKS.md:137` and `.goal/goal.json`) + `.goal/goal.json` **T-029 closed**
> via `goal_cli.py done` (re-derived: PASS `9eb5307`, merge `dd07aa2`, close-out `2299de5`, TASKS.md
> flip `7eb55f7` — all four already on disk before this sweep touched anything).
>
> **Concurrency note, RESOLVED while writing this sweep:** `.goal/goal.json` picked up a
> **T-030 → done** close (`completed: 2026-09-25T04:41:17`) mid-sweep that this sweep did **not**
> make. At first observation `qa/verdicts/` had no `t-030-telegram-alerts.md` and `TASKS.md:120`
> still read `open`, so this sweep correctly declined to reopen it (a live Mode A checker
> mid-committing is not a bypass, and the setup note explicitly anticipated the race) rather than
> risk a write-collision. HEAD then moved `7eb55f7 → c9959bf` before this sweep's own commit:
> `d3cefbf` (checker PASS t-030-telegram-alerts cycle 0, 9/9 capability rows re-verified, C6/C10
> held), `1649da9` (merge), `c9959bf` (close-out, TASKS.md:120 now `done`). The earlier flag is
> now moot — the close was earned, not premature. **The dead-checker evidence added to ISS-178
> still stands on its own facts** (a real checker attempt on this unit did die with no verdict and
> no dispatch marker, per the shard's own re-derivation before this later checker was dispatched
> to replace it) and is left as a recurrence record, not retracted.
>
> **Verified and closed, re-derived from disk:**
> - **T-029** — cycle-0 PASS (`9eb5307`), merge (`dd07aa2`), close-out (`2299de5`), TASKS.md flip
>   (`7eb55f7`) all present at HEAD. `.goal/goal.json` T-029 still read `pending`. Closed by this
>   sweep via `goal_cli.py done --task-id T-029`.
> - **ISS-299** — T-047's tracker gap (the prior sweep's own finding) is now fully closed:
>   `TASKS.md:137` reads `done` (maker commit `5842d1f`) and `.goal/goal.json` T-047 already read
>   `done` (closed by the prior sweep). Moved `open → verified`.
>
> **Shard findings verified and folded (not filed as new ids):**
> - **(a) t-030-telegram-alerts dispatch gap** — real: manifest committed to
>   `wave/t-030-telegram-alerts` (`883c7b2`, Fix cycle 0, `Status: ready-for-check`), no verdict
>   file at any cycle, no `qa/dispatch/` marker (only `golden-set-sibling-ambiguity.json` present),
>   `TASKS.md:120` still `open`. Added as a `RECURRENCE` note directly on **ISS-178** (the row this
>   defect class already owns), not a new id.
> - **(b) u2-4 fix-cycle-2 live-eval pause durability** — real: `qa/.last-tick` records the pause
>   in prose only (lines 31/33/35), no `qa/.paused.<unit>` marker exists (the only pause-shaped file
>   on disk, `qa/.paused.lifted-2026-09-24`, is unrelated — 0 bytes, a different already-lifted
>   repo-wide pause). Filed as **new medium ISS-302**, not appended to ISS-250: ISS-250 is
>   specifically a HUMAN_GATE-decision durability defect (needs an `Answered` field); this is
>   operational pause-state durability (needs a resume-condition marker) — same class, different
>   fix shape, and this ledger's own precedent (ISS-276/288/299) is to file same-class instances
>   as separate ids rather than conflate them.
> - **Clean, verified:** bypass — none in `aa220b4..7eb55f7` (9 commits, all covered by
>   PASS/merge/close-out or the prior sweep's own consolidation commit); t-029/t-032 cycle stamps
>   consistent; feedback-inbox has 0 fresh unfolded entries (last folded 2026-09-25, the D-030
>   c4-heading-form note); contracts unchanged in range; `qa/.last-tick` liveness current (last
>   line 2026-09-25T04:33:39, ADVANCED).
> - **135 fixed vs 72 verified, judged NOT worsening** — re-derived at `aa220b4` (prior sweep) the
>   union was 136 fixed / 64 verified (gap 72); at `7eb55f7` (this sweep, before its own edits) it
>   was 135 fixed / 72 verified (gap 63). The gap shrank by 9 as this sweep's own re-verifications
>   (ISS-288 and 7 others → `verified` at the prior sweep, ISS-299 → `verified` at this one) moved
>   through it. No low row filed.
>
> **Structural + spend signals (never a blocker):**
> - **ISS-300 (medium, structural-erosion), WORSENING** — `record-commands.ts` gained two more
>   touching units since the prior sweep (t-029 `+6/-1`, t-030 `+20/-2`, both untested) but a fix is
>   now in flight: the t-033 lane (uncommitted, `wave/t-033-bot-tests`) has added a 147-line
>   `record-commands.test.ts` naming ISS-300 in its own header.
> - **ISS-301 (low, token-spend)** — `opus_sub_share` improved to 0.409 (from 0.53), still over the
>   25% signal threshold; `sub_agents` up to 50.
> - **ISS-303 (low, file-dont-fix)** — `reconnect-gaps.ts` `collectGapEvent`'s bare `Number()`
>   coercion on a gap event's start/end silently produces `NaN`, which later throws inside
>   `finalizeRecording` rather than failing at the source. Dormant today: the only emitter
>   (`sb_join.py`) always sets both fields.
>
> Token line appended 04:35:20 (main 564.6M / sub 526.4M, `opus_sub_share` 0.409, `sub_agents` 50,
> compactions 2, outages 0). `.last-sweep` stamped at HEAD `c9959bf` (the true tip at write time,
> after the concurrent t-030-telegram-alerts PASS/merge/close-out landed — this sweep's own commit
> touched only checker surfaces + `.goal/goal.json`'s T-029 close, no code).

## Current top 3 (backlog-priority order, refreshed 2026-09-26T23:0x sweep)

1. **[HUMAN_GATE, URGENT]** `zoom-bot-signin` — the Ashoka Educator Dialogues Zoom webinar
   (2026-09-27 ~10:00 IST) requires an authenticated Zoom account to join past the web-client wall
   (ISS-U0-2); the bot has no Zoom credentials anywhere. Only Umesh can resolve (sign the bot's
   profile in, or ask the host to disable the auth requirement) — deadline is tomorrow morning.
2. **[HUMAN_GATE]** `u2-live-repair` — classifier refused live repair on the u2-4-phase3-fix seam;
   root causes of ISS-304/305/306 (source-watcher truncated-transcript, unindexed-session,
   session-id derivation bugs) are already found and a fix (`87df8e8`) exists unmerged. This gate
   also blocks the U4 dashboard and U6 units of the vivid-donut plan. Unanswered 1.5 days.
3. **[tier 2 — open critical ledger issue] ISS-104** — speaker-resolution-llm, critical, still
   `open`, HELD behind the paused `u2-4-phase3-fix` (needs ≥8 GB RAM per the user's standing
   request) — same seam as the U5 auto-record classifier block, also awaiting Umesh.

**Also open, not in the top 3:** two long-standing Approver gates remain unanswered —
`d023-supersede` (17 days) and `mc-hooks-manifest-blindness` (17 days) — both pre-date this
sweep's window and are re-confirmed still open, not re-filed. `u2-4-phase3-fix` cycle 2's live
eval remains **paused by the user** (RAM ceiling; durability tracked as **ISS-302**) — resume is
a maker/human call, not a checker action. Tier-3 roadmap (`T-031`/`T-033`) is now closed —
see the goal.json closes above; next roadmap item is whatever `qa/QUEUE.md`'s maker-owned
TODO rows or the T-047→T-029→T-030→T-032→T-033 sequence's successor names.

## Prior sweep header (2026-09-25T02:xx+05:30, 3-shard wave, superseded as routing; kept for its own findings below)

> Bound to `D:/KnowledgeBase`, master @ `b60b9fc` at dispatch; sweep writer runs solo (a parallel
> `/maker` session, knowledgebase-ef, is live in the same tree — this consolidation touched only
> checker surfaces + a narrow commit). **Terminal state: FINDINGS: 5 new (ISS-299 medium, ISS-300
> medium, ISS-301 low) + 8 ledger rows moved to `verified` on re-derived evidence** (ISS-288,
> ISS-291, ISS-292, ISS-293, ISS-294, ISS-295, ISS-296, ISS-297) + 3 `.goal/goal.json` tasks closed
> (T-047, U4.2, U2.6) via `goal_cli.py done`.
>
> **Verified and closed, re-derived from disk (not from the shard reports' say-so):**
> - **T-047** — cycle 1 PASSed (`8c1cfc1`) and merged (`784df67`) 2026-09-25T00:31; `.goal/goal.json`
>   still read `pending`. Closed. **ISS-299 (medium, tracker-integrity)** filed for the tracker gap
>   itself, since goal.json and TASKS.md do not self-update on merge.
> - **U4.2** — "ONE real meeting-bot joiner; quarantine the other two." `webinar-bot-live` cycle 2
>   PASS (`c21355e`, merged `856d31b`) confirms one live browser joiner (Zoho webinar, OBS-recorded)
>   and the Vexa/system-audio stub language correctly re-scoped to those two only. Closed. ISS-294/
>   296/297/291 (all COVERED per the cycle-2 verdict's own capability table) moved `open → verified`.
> - **U2.6** — "Real graph_edges rows + merge at the route boundary." Re-derived independently
>   against `qa/contracts/brain-knowledge-graph.md` [C1] and the U-BRAIN verdict (`a264c49`): `/graph`
>   now unions `tree_index` + `graph_edges`, and `apps/api/src/routes/graph.ts`'s stale "ZERO real
>   rows" disclosure is corrected in the same change. Closed. ISS-295 moved `open → verified`; ISS-292
>   (brain-knowledge-graph, 7/8 criteria MET) and ISS-293 (calendar-grid-ui, 8/9 MET) also moved
>   `open → verified` — both manifests read `checked-PASS`, closed out by the maker 2026-09-25, and
>   neither had been reflected in the ledger yet.
> - **ISS-288** (the prior sweep's tracker-divergence finding for U4.2/U2.6) moved `fixed → verified`
>   — its fix_direction asked only for `pending → in_progress`; this sweep verified the underlying
>   work and closed both tasks outright, which is a strict superset.
>
> **Shard findings NOT filed, verified against disk:**
> - **t-029-reconnect stale-builder state** — real (`sb_join.py`/`test_sb_join.py` modified,
>   uncommitted, mtimes 01:02/02:11), but `qa/.last-tick`'s own most recent line already documents
>   "t-029 dead amendment builder re-dispatched" — known and in hand, not filed.
> - **u2-4-phase3-fix cycle 1** — `ready-for-check` (`6256e94`) with the maker's own checker already
>   dispatched. Not a gap.
> - **Untracked `qa/manifests/u2-4-phase3-precision-regate.md`** — confirmed a stale cycle-0 copy
>   (`Status: ready-for-check` at Fix cycle 0, superseded by the cycle-1 rework on
>   `u2-4-phase3-fix`). Low-severity leftover, not an issue; left untouched (not a checker-owned
>   surface to clean up).
> - **Six standing HUMAN_GATE files remain unanswered** (only Umesh can close these — not filed,
>   per dispatch): `enforcement-hooks-unauthorized-and-live-regressed.md`,
>   `d015-generalisation-scope.md`, `d023-supersede.md`, `ledger-shard-union-hook.md`,
>   `mc-hooks-manifest-blindness.md`, `ui-surfaces-test-file-exclusion.md`.
> - **`lane-data-isolation` contract** — status `proposed` (encodes Umesh's option-D answer on
>   `qa/gates/lane-writes-shared-database.md`); the maker has not yet built to it. Not a sweep
>   finding — noted for the maker's own backlog.
>
> **Structural + spend signals (never a blocker):**
> - **ISS-300 (medium, structural-erosion)** — `packages/meeting-bot/src/capture/record-commands.ts`
>   (270 lines) rewritten across 5 units (`21a2efe`, `fd74864`, `cfaf464`, `1e1a84e`, `b303a5f`); its
>   siblings `controller-state.ts`/`watchdog.ts` each got a dedicated `.test.ts`, it did not.
> - **ISS-301 (low, token-spend)** — 2026-09-24 `opus_sub_share` 0.53 (38 subagents, 11 Opus),
>   driven by wave concurrency (peak 5), not any single fix-cycle-3 manifest.
>
> **Top-3 recommended next units** (project tier order — tier 3 roadmap is not optional):
> 1. **[tier 3 — roadmap, mandatory]** `T-033` — "Tests (fake OBS client failure paths, audioPath) +
>    /checker PASS for the phase-0 bot." Unblocked: its stated dependency `T-032` now reads `done` in
>    goal.json (peer-checker PASSed since the last sweep). Continues the user's standing P1 sequence
>    (T-047 → T-029 → T-030 → T-032 → **T-033**). TASKS.md:123 already notes "closes U4.2" — verify
>    that framing still holds now that U4.2 closed via the webinar-bot-live route instead; if T-033's
>    own scope is already subsumed, say so in its manifest rather than silently dropping it.
> 2. **[tier 2 — open critical ledger issue]** `ISS-104` — speaker-resolution-llm, critical,
>    2026-09-08, still `open`: the cycle-2 naming-cue rule does not close C2b (a cue phrase adjacent
>    to any capitalised non-name still ships a fabricated person). Related to but distinct from the
>    in-flight `u2-4-phase3-fix` cycle (that unit targets the phase-3 precision re-gate bars; ISS-104
>    targets the underlying cue-rule false-positive class). Pick up once `u2-4-phase3-fix` cycle 1's
>    verdict lands, on the same files, to avoid a collision.
> 3. **[tier 3 — roadmap]** `T-031` — "Live audio watchdog via OBS meters (>2 min silence → alert +
>    reconnect)." Unblocked (no deps in goal.json), not yet started, next in the meeting-bot roadmap
>    sequence after the T-029/T-030/T-032/T-033 SERIAL chain clears.
> 4. **[maker-owned, not a checker surface]** Flip `TASKS.md` trackers to match the goal.json closes
>    this sweep made: `T-047` (line 137, open → done, cite `784df67`/`8c1cfc1`), `U2.6` (line 110,
>    open → done, cite `a264c49`), `U4.2` (line 113, in_progress → done, cite `c21355e`/`856d31b`).
>    Per project CLAUDE.md, TASKS.md is not checker-writable — queued for the maker.
>
> Token line appended 02:06:45 (main 520.2M / sub 405.9M, opus_sub_share 0.53, sub_agents 38,
> compactions 2, outages 0). `.last-sweep` stamped at HEAD `b60b9fc` (unchanged by this sweep — no
> code commit made; ledger/inbox/queue/goal changes only).

---

## Prior sweep header (2026-09-24T22:1x+05:30, 3-shard wave, superseded as routing; kept for its own findings below)

> Range: `3ca44fb..HEAD` (HEAD `b1c9d01`) + working tree. **Terminal state: FINDINGS: 1 new (ISS-288,
> medium)** — everything else this sweep's shards proposed either duplicated live checker output
> that landed mid-sweep, was already authorized/disclosed, or did not hold up on verification.
> Concurrency note: this sweep ran WHILE two Mode A checkers were active on the same tree —
> `u2-4-phase3-precision-regate` (FAILed cycle 0 at `b1c9d01`, minted ISS-282..284, fix cycle 1
> since dispatched) and `webinar-bot-live` (FAILed cycle 0, committed `97674cb` during this sweep,
> minted ISS-285..287, drafted `qa/contracts/meeting-bot-live-capture.md` T-024b DRAFT). Both are
> folded in below rather than re-derived. HEAD moved `b1c9d01`→`97674cb` mid-sweep; `.last-sweep`
> is stamped at the true tip.
>
> **Shard findings, verified against disk:**
> - **(a) bypass, disclosed** — `fd74864`/`cfaf464` (feature commits) landed before the
>   `webinar-bot-live` manifest (`2657bee`). This is D-027's explicit fast-track ("Umesh chose
>   build + live run today, manifest and /checker afterwards"), stated in the manifest's own Queue
>   tier line. Not a process violation; no ISS.
> - **(b) pair-state, resolved live** — both units flagged as ready-for-check with no verdict are
>   now answered: `u2-4-phase3-precision-regate` FAIL (`b1c9d01`) and `webinar-bot-live` FAIL
>   (verdict landed mid-sweep, `qa/verdicts/webinar-bot-live.md`, cycle 0, ISSUES-WRITTEN ISS-285,
>   ISS-286, ISS-287). No dispatch gap remains.
> - **(c) maker-liveness, NOT an ISS-054 recurrence** — `qa/.last-tick`'s prior history
>   (2026-09-10..09-21 entries) was replaced by a single 2026-09-24T21:56 line, and shard 1 read
>   this as a possible asleep-loop gap. Checked against `git log`: **zero commits exist between
>   `4aa9d13` (2026-09-22T16:28) and `fd74864` (2026-09-24T18:26)** — a ~50h gap with no maker
>   activity at all, not a live-but-unstamped session (ISS-054's defining trait is "real maker work
>   HAS happened since" the stale stamp). No work happened, so there is nothing for the tick file to
>   have missed; ruled EXPLAINED, no ISS. The `.last-tick` history truncation itself is cosmetic —
>   every prior tick's content survives in its own commit message.
> - **(d)** `.codex/` = ISS-268 (already tracked). No new.
> - **(e) inbox fold** — both named entries folded in `qa/feedback-inbox.md` this sweep (Gemini-vs-
>   qwen tracked via ISS-215 refresh; the 21:56 "/maker only" role reminder is process-only). ISS-215
>   refreshed: 0 fresh unfolded entries remain; its own open reason (6 unanswered Approver gates)
>   stands.
> - **(f) contract staleness, resolved live** — `qa/contracts/meeting-bot-capture.md` C3 vs the
>   shipped browser joiner: the `webinar-bot-live` Mode A checker drafted
>   `qa/contracts/meeting-bot-live-capture.md` (T-024b, DRAFT, supersedes C3 for the browser joiner)
>   during this sweep's window. No duplicate drafted; nothing further to file.
> - **shard 2(a) tracker-divergence, CONFIRMED, minted** — `.goal/goal.json` U4.2 and U2.6 both still
>   `pending` despite D-027/D-028 recording live, verified progress on both (U4.2 already reads
>   `in_progress` in TASKS.md — one status ahead of goal.json). Same class as ISS-276. **ISS-288,
>   medium** (tracker bookkeeping only, no auth/data-write surface, so not full-ceremony).
> - **shard 2(c) gate staleness** — `qa/gates/mongo-host-unreachable.md` appended: the `lkb` scope
>   answered per D-028's live write-and-read round trip; WhatsApp/T-007 persistence kept explicitly
>   open (endpoint reachable, database empty on 2026-09-24 — no linked account, a different blocker
>   than host reachability). `delivery-gate-manifest-blindness` remains STALLED (HUMAN_GATE), has its
>   own `qa/debug` report; enforcement liveness CLEAN.
> - **shard 3, check 7** — no scope (no PASSed units in range `3ca44fb..HEAD`). Informational:
>   `scripts/sync-webinar-session.mjs:167,178` (deleteMany-then-insert, no transaction) is left to
>   the `webinar-bot-live` Mode A checker's own fix-cycle scope, not filed here — none of its three
>   issued findings (ISS-285/286/287: lint-dirsize budget, missing capability-coverage table, undis-
>   closed touched files) cover it, so it is still open for that unit's next cycle to pick up or a
>   future sweep to file if it does not land.
>
> Token line appended 21:59:51 (main 188.6M / sub 24.6M, opus_sub_share 0.108, sub_agents 10,
> compactions 1, outages 0). `.last-sweep` restamped HEAD=`b1c9d01`.

---

## Prior sweep header (2026-09-22T16:05+05:30, superseded as routing; kept for its own findings below)

> Range: `5fab76e..HEAD` (4 commits; prior sweep stopped at HEAD `5fab76e`). **Terminal state: FINDINGS: 10**
> — ISS-266/267/268 (pair-state + mirror) · ISS-269..272 (silent-failure, high, filed-don't-fix under the D-014
> class cap) · ISS-273 (erosion signals) · ISS-274 (goal-drift → GRILL row) · ISS-275 (loop-design).
> Bypass: **none** (4 commits in range, all covered or process-surface).
> Pair-state: the SessionStart hook's "Checks pending: 1 [delivery-gate-manifest-blindness]" is ruled a
> **FALSE POSITIVE of the gated ISS-183 defect** (unanchored prose match at manifest :35/:47/:208 +
> `Select-Object -First 1` reading the 3-cycle verdict's first stamp as 1). True state: **pend=0 dispatch
> gaps; 1 fix-gap** (delivery-gate-stamp-adoption, 13 days — ISS-266). PASS-not-closed 0 and Queue-TODO 0
> are disk-true.
> Maker liveness: the maker-checker loop is **asleep ~15.5 h** (last tick 2026-09-22T00:30 HEARTBEAT-ARMED;
> no `qa/.paused`; ISS-054 recurrence, deduped). The /goal monitor ticks (last_deterministic_tick
> 2026-09-22T15:31) — the maker's ScheduleWakeup chain died with its session. Resume = `/maker continue`.
> **Correction 16:10:** the maker WOKE mid-sweep — `qa/gates/write-guard-contract-contradiction.md`
> (15:45, STALL reconciliation for write-guard-enforcement-gaps, options A/B/C) and
> `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/` (15:45–15:53, QUEUE item 2 in progress) appeared
> during this sweep. The 00:30→15:45 asleep gap is real; the loop is running again. No manifest at
> ready-for-check yet — no check raced.
>
> **2nd consolidation pass 16:19 (duplicate dispatch resolved):** a second consolidation landed over the
> same range and DEDUPED against the minted ten. Dropped as already minted/remedied: the "two manifests
> without Status" residue (both now carry `## Status: superseded-by …` from this sweep's marker-only
> folds), the asleep-gap row (deduped to the ISS-054-class record + correction above), and the .codex/
> row (= ISS-268). preflight.json mtime anomaly ruled EXPLAINED (last commit 16af160 is the ISS-256
> restore itself; content matches HEAD; index-stat noise). **6 new ids minted: ISS-276/281 (medium) ·
> ISS-277/278/279/280 (low)** — tracker-integrity residue (goal.json vs TASKS.md on T-021/U0.10, stale
> completed ts, stale T-008 dep, T-021/U0.10 dual-scope), superseded-contract markers, and client.ts
> churn-erosion with the auth-repair gate still unanswered. ISS-215 refreshed (the 16:05 Umesh
> Gemini-vs-qwen entry is the one fresh unfolded inbox item). Consolidation hint (extends ISS-214):
> three pending asks resolve to edits of `.claude/hooks/mc-sessionstart.ps1` — ledger-shard-union-hook,
> mc-hooks-manifest-blindness, and ISS-267's fix-gap branch — ONE combined Approver ask could settle all
> three. Gate count now 20 with the maker's new `write-guard-contract-contradiction.md` (Answered:
> \<pending\>). Token line re-scanned 16:19:22 (outages 10, Agent blocked 8; opus share 0.0).

- GRILL: web-fallback vs Phase-1 exit — ask-web-fallback-tavily records the unwired seam as production
  default while the north star's Phase-1 exit requires off-corpus web fallback; wire-it-or-sign-the-honest-limit
  is an Approver amendment (ISS-274)

## Prior top 3 (backlog-priority order, refreshed 2026-09-24 sweep; superseded by the 2026-09-25T04:4x list above)

1. **Maker duty — handshake, u2-4-phase3-precision-regate FAIL (cycle 0, same day)** — respond to
   ISS-282 (critical: gate's own precision/wrong-link/addition bars all fail on re-run), ISS-283
   (high: D-015 stability claim false, outer run 3 never executed), ISS-284 (medium: undisclosed
   evidence files + no-longer-reproducing corpus numbers). A FAIL verdict outranks every backlog
   tier. *(In progress: fix cycle 1 already dispatched per `qa/.last-tick` 22:04 — opus, lane
   `a-speakers`, experiment detached.)*
2. **Maker duty — handshake, webinar-bot-live FAIL (cycle 0, landed mid-this-sweep)** — respond to
   ISS-285 (high: `scripts/` dirsize budget breach, 32→33 files, the manifest's verify subset never
   ran the full `pnpm lint:structure`), ISS-286 (high: no Capability coverage table on a full-
   ceremony data-write unit), ISS-287 (low: untracked touched files + a stale STUB comment in
   `browser-joiner.ts`). Also closes T-033 once it PASSes. *(Not yet dispatched as of this sweep —
   verdict just landed; next maker tick should pick this up alongside #1.)*
3. **Tier 3 (roadmap, user's standing choice 2026-09-24) — webinar-bot P1 reliability**: T-047
   (record controller must survive console close + finalize-on-restart watchdog — today's own
   16:30:56 controller-death incident), then T-029 (auto-reconnect on connection-interrupted), T-030
   (Telegram status alerts), T-032 (OBS Safe-Mode/websocket-down guard), T-033 (folds into #2 above
   once that FAIL is answered). Both FAILs in #1/#2 are same-seam prerequisites for this tier, not a
   substitute for it — pull #3 once #1/#2 are answered, per the user's explicit ordering.

**Filed-don't-fix (D-014 class cap — non-security seam with ≥2 PASSes):** ISS-269/270 (speaker seam:
speaker-llm-windows, iss-255-handover-direction, speaker-run-agreement) · ISS-271/272 (golden-set/eval seam:
golden-set-semantic-leg, golden-set-regeneration, eval-baseline-control). A human may still pull them;
ISS-269/270 fold naturally into any future unit touching `speakers-llm.ts`. **ISS-104** (critical,
speaker naming-cue) is the only open critical besides today's ISS-282 and sits on the same capped
speaker seam per this repo's own precedent — pull decision belongs to a human; the u2-4-phase3 fix
cycle 1 already in flight is the natural venue if pulled alongside it.

## Umesh live requests, 2026-09-24 — product UI epic (checker-authored contracts, added by /checker)

Two direct user instructions this session, both grounded in a visible-browser validation run by the
checker the same evening. **These are independent of the two open FAILs above** — they touch
`apps/web/src/pages/BrainPage.tsx`, `CalendarPage.tsx` and `apps/api/src/routes/graph.ts`, no file
shared with the speaker seam or the webinar-bot seam, so they may run concurrently rather than
waiting on #1/#2.

4. **U-BRAIN — rebuild /brain as a real, drill-down, self-refreshing knowledge graph.**
   Contract `qa/contracts/brain-knowledge-graph.md` (proposed, checker-authored). Issue **ISS-292**
   (high). Umesh: *"it should look like a knowledgegraph aur like click krne mai we should get
   further details like drill down ... isko update bhi krte rhna hai along with new sessions."*
   Measured now: **0 rendered node labels** against 13 node shapes; `GET /graph` = 164 nodes/526
   edges from `tree_index` only; the 94 real `graph_edges` rows are read by **no route**; the
   2026-09-24 session has `chunks=0`, `session_pages=0` and is absent from `tree_index`, so it never
   reaches the graph. Full ceremony: it changes a read path, so [I1] requires the cross-tenant probe
   set to still pass.

5. **U-CAL — rebuild /calendar as a Google-Calendar-shaped grid with filters.**
   Contract `qa/contracts/calendar-grid-ui.md` (proposed, checker-authored). Issue **ISS-293**
   (high). Umesh: *"this calendar should and must look like google calendar along with filters and
   all."* Measured now: `CalendarPage.tsx` (191 LOC) renders `groupByMonth()` as stacked cards —
   no month/week/day grid, no hour axis, no overlap handling, no filter control, and past sessions
   and upcoming meetings sit in two disjoint lists. Renders the existing API only ([I1]); the
   timezone criterion [C9] is an automatic FAIL if a row shifts.

**Checker note on sequencing.** These are UI-surface units, so D-024 applies: each needs live
visible-browser evidence, and per the standing rule the live check is run by a CHECKER writing its
own script, never by the maker re-running its own. Both contracts name their verification probes.

## Checker note, 2026-09-24 — id-citation defect across concurrent lanes (NOT yet a ledger row, deliberately)

Two orchestrator sessions and several worktree lanes were appending to `qa/issues.jsonl` at once
this evening. Measured state at the time of writing: **zero duplicate ids, no row lost or altered**
— the ledger itself is intact. But `qa/verdicts/webinar-bot-live.md` carries
`ISSUES-WRITTEN: ISS-289, ISS-290, ISS-291, ISS-292`, and against the ledger union three of those
four resolve to **other units' rows**:

| cited | actually resolves to |
|---|---|
| ISS-289 | `speaker-resolution-llm` — circular citation-validity in `05-score.mjs` |
| ISS-290 | `speaker-resolution-llm` — no corpus pin |
| ISS-291 | `meeting-bot-live-capture` — correct, genuinely that unit's |
| ISS-292 | `brain-knowledge-graph` — filed by the checker for Umesh's /brain request |

**Why this is worse than a miscount.** D-015 requires a fix to be measured against its issue's OWN
recorded reproductions. webinar-bot-live fix cycle 2 is about to perform exactly that measurement;
if it resolves ISS-289 it will read the phase-3 scorer's row and measure the wrong thing. D-019
already named this: *"an audit trail whose references silently repoint is worse than an incomplete
one, because it still looks correct."*

**Root cause, stated for whoever builds the fix:** ids are chosen at READ time and written at APPEND
time, and everything bad happens in that window. The durable fix is to compute max-id over the union
and append in the SAME operation. Renumbering existing rows is forbidden (D-019).

**Why no ISS row yet, on purpose:** filing one now means allocating from the very counter that is
being contested by two live agents — the defect reproducing itself inside its own bug report. Both
owning sessions have been notified in writing and told to re-allocate from the current max and to
record their old→new mapping rather than hide it. **This row gets filed once the lanes settle**, and
until then this note is the record.

## State summary

- **2026-09-24 sweep update:** ids now run through ISS-288 (main ledger only in this repo; no
  `qa/issues.*.jsonl` lane shards exist — single-tree work). This sweep minted 1 (ISS-288, medium,
  tracker-divergence); the two concurrent Mode A checkers minted 6 more independently (ISS-282..284,
  ISS-285..287) — both folded above, not re-derived. Token-ledger line appended 21:59:51.
- Union ledger: 295 rows (273 main + 22 c-unrun-writers), ids ISS-001..ISS-275 + ISS-C-* 1..22, 0 duplicate
  ids. Open: 93 canonical / 99 union (10 new this sweep: 5 high, 3 medium, 2 low). Token-ledger line appended
  (opus_sub_share 0.0; no unit at fix cycle 3). [figures below this line are from the 2026-09-22 sweep;
  not recomputed this pass — see the 2026-09-24 update above for the delta]
- Mode A this session: **no new verdict** — delivery-gate-manifest-blindness is STALLED-closed at cycle 3 of 3
  (verdict d171d0c FAIL 5/9; disposition "do not open a cycle 4"). Residue: ISS-205 (regex fix for the next
  unit touching that hook block) + two Approver gates (mc-hooks-manifest-blindness, delivery-gate-c4-heading-form).
- Contract maintenance: 8 inbox entries folded into 6 contracts (ai-provider-seam; loop-safety ×4 lessons;
  golden-set-recall; schema-v2; ledger-shard-union-readers; tracker-integrity); 2 marker-only folds; 1 deferred
  (Umesh write-guard shape → write-guard.md is status `proposed`, applies on ratification). All additions;
  nothing weakened.
- Enforcement: wired+alive (5 project hooks registered + 2 user-level; D-006 carries `Approved-by: Umesh` and
  covers the wiring). Loop spec `qa/loop.md` present and consistent (seven terminal states; no adapter.json →
  no contradiction). `qa/adapter.json` absent → data-boundary check out of scope by design. Known gated hook
  defects live verbatim: ISS-183 (blindness/First-1), union-blind open-issue count (open ISS-129), and the new
  no-fix-gap-branch (ISS-267).
- Gates needing the Approver (pre-existing unless noted): d015-generalisation-scope · d023-supersede ·
  delivery-gate-c4-heading-form · mc-hooks-manifest-blindness · handshake-liveness-contract-start ·
  ledger-shard-union-hook · ui-surfaces-test-file-exclusion (Answered line empty) · loop-safety-contract-ratification ·
  enforcement-hooks-unauthorized-and-live-regressed (`(pending)`; absent from the prior list — folded into
  ISS-215 triage) · ISS-215 gate-queue triage · ISS-221 (atomic issue-id allocation) · **new: ISS-267** needs a
  gate file (enforcement path) — raise on the next maker tick · **new: ISS-268** .codex/ mirror disposition ·
  **new: ISS-274** web-fallback GRILL.
- Goal: north star unchanged since 2026-09-03; the uncommitted `.goal/goal.json` diff is tracker metadata only
  (updated ts/velocity/eta/last_deterministic_tick 2026-09-22T15:31). Coverage: Phase-1 surfaces covered
  (ingestion · tree+vector index · router · citations · tenancy/write-guard · Developer API); partial: meeting-bot
  capture, speaker attribution (phase-4 write blocked on the precision re-gate), live web fallback (ISS-274),
  head-to-head championship tier; missing: AI counsellor client contract (T-013 pending, no contract in
  qa/contracts/).
- Bypass: none — 7da0a41's source diff is exactly the two test files its manifest names (105→301 lint-loc claim
  misstatement already filed as ISS-265); 31e8534/baeb66f are process close-outs. Bookkeeping (covered by open
  ISS-C-UNRUN-WRITERS-013): iss-262-lint-loc-split's ready-for-check state never entered git history (verdict
  baeb66f cited an uncommitted manifest).
- `.last-tick` note: content is 2026-09-22T00:30 (HEARTBEAT-ARMED; two units landed) — age is the defect, ruled
  maker-asleep above (ISS-054 recurrence), not a hygiene gap.

## Historical sweeps (superseded as routing; read in git)
- 2026-09-21T23:50 sweep (FINDINGS:5, ISS-260..264; ISS-245 verified fixed; cycle-number anomaly closed-at-6):
  `git show 5fab76e:qa/QUEUE.md`.
- Earlier sweeps: `git show d142628~1:qa/QUEUE.md` and prior history.