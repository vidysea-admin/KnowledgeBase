# QUEUE — checker Mode B sweep 2026-09-24T22:1x+05:30 (3-shard wave, consolidated)

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

## Current top 3 (backlog-priority order, refreshed 2026-09-24 sweep)

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