# Plan — Living Knowledge Base

Status: DRAFT — backfilled 2026-09-26 by maker (tick step 2b). Not approved until
qa/gates/plan-approved.md carries `Answered: … — plan`.

**Spec:** docs/spec.md (drafted concurrently by a sibling agent, 2026-09-26 — not yet approved;
this plan does not wait on it, per its own dispatch instruction) · **Intent:** docs/intent.md
(APPROVED, gate `qa/gates/plan-approved.md:9`).

**Ordering rule (project CLAUDE.md "Backlog priority override," D-013/D-014/D-015):** 1) QUEUE.md
top clear row (unless round-capped) → 2) open critical/high ledger issues → 3) next unblocked
roadmap task → 4) open medium issues → 5) contract gaps → 6) feedback-inbox. Full ceremony is
mandatory for high/critical and for anything touching auth/tenancy/data-writes, regardless of
severity. Non-security seams stop after 2 PASSes (class-based cap, D-014); security/tenancy seams
are never capped.

**Fresh gate reads (this backfill, 2026-09-26T23:5x):** `qa/gates/u2-live-repair.md`,
`d023-supersede.md` and `mc-hooks-manifest-blindness.md` all carry a real
`Answered: 2026-09-26T23:54:34` line (Umesh, "go on i approve," scribed by /checker check 6) —
**newer than `qa/QUEUE.md`'s own "unanswered 17d/1.5d" prose**, which this plan supersedes as
routing for those three gates. `zoom-bot-signin.md` remains genuinely open (no Answered line,
deadline tomorrow ~10:00 IST).

## Units (in order)

| # | unit slug | source | files it touches | schema | how it is tested | criticality | persona walk | blocked-by | feature-row |
|---|---|---|---|---|---|---|---|---|---|
| 1 | zoom-bot-signin-readiness | QUEUE.md top-3 #1; `qa/gates/zoom-bot-signin.md`; ISS-U0-2 | `scripts/webinar/start-record-detached.ps1`, bot Chrome profile | no | manual: bot joins past Zoom sign-in wall | critical (outward-facing, deadline) | skip (no screen; ops task) | gate `zoom-bot-signin.md` (OPEN — no Answered line) | no |
| 2 | u2-fix1-ingest-guards-closeout | `qa/gates/u2-live-repair.md` (ANSWERED); ISS-304/305/306 | `scripts/watch/run-watch.mjs`, `data/toc-migrated/2026-09-24-in-focus/`, `raw/TOC/` (via lane `u2-fix1-ingest-guards`, code `87df8e8`) | no | `run-watch.mjs --reingest <id>` + `--dry-run`; coverage ≥97%, chunks>0, checker close-out | high (tenancy/data-write class, full ceremony) | skip (data repair, no screen) | — (gate answered) | no |
| 3 | d023-decisions-supersede-entry | `qa/gates/d023-supersede.md` (ANSWERED) | `docs/DECISIONS.md` via `scripts/append_decision.ps1` only | no | `append_decision.ps1` run; entry carries reasoned Supersedes field; D-023 untouched | medium (governance, no code) | skip | — | no |
| 4 | mc-hooks-manifest-blindness-fix | `qa/gates/mc-hooks-manifest-blindness.md` (ANSWERED); ISS-183/184/205/227/228/229 | `.claude/hooks/mc-sessionstart.ps1`, `mc-precommit.ps1`; DECISIONS entry first (Approved-by: Umesh, cites the gate line) | no | `/aios-config-auditor` before commit; re-run ISS-205/227/228's own recorded reproductions (D-015) | critical (enforcement path, security class — never round-capped) | skip | DECISIONS entry with Approved-by must land first (internal sequencing) | no |
| 5 | iss-221-atomic-issue-id-allocation | ISS-221 (high); QUEUE.md "id-citation defect" note | id-allocation tooling for `qa/issues*.jsonl` (checker-owned; exact path `[ASSUMPTION]`) | no | concurrent-append simulation across 2+ lanes, zero duplicate ids | high | skip | — | no |
| 6 | iss-250-gate-durability-marker | ISS-250 (high) | HUMAN_GATE answer-recording mechanism (currently `qa/.last-tick` prose, overwritten each tick) | yes (new durable marker format) | simulate a tick overwrite; confirm the recorded answer survives | high | skip | — | no |
| 7 | u2-source-watcher-continue | plan `what-is-the-update-vivid-donut.md` U2; TASKS.md T-036 (partial via lane work) | `packages/ingest/src/sources/gdrive.ts`, `apps/api/src/gws-gmail.ts:39-40`, `apps/api/src/gws-calendar.ts` | yes (`watch_state` collection, `meeting_candidates` fields) | dry-run vs real Drive/Gmail lists names exactly the known 4 catch-up files before ingest, 0 after | medium | skip (backend ingestion, no screen yet) | SERIAL: waits on unit 2 (same file `run-watch.mjs`) | no |
| 8 | u3-notify-channels | plan U3 | `packages/meeting-bot/src/capture/telegram-alerts.ts` → `Notifier` interface + whatsapp stub | no (config-gated) | fake-transport unit tests; one real Telegram message only after Umesh sets the token | medium | skip | — (disjoint files from unit 7) | no |
| 9 | u2.2-extraction-quality-harness | goal.json U2.2 (pending, deps U2.1 done → unblocked) | new eval-harness scripts + golden set (built BEFORE the LLM extractors, per its own note) | yes (hallucination-rate corpus rows) | harness run reports hallucination rate = cited id absent from turns, on a fixed corpus | medium | skip | — | no |
| 10 | u2.3-llm-topic-extractor | goal.json U2.3 (pending, deps U2.2) | `packages/index` `extractFn` seam; keep regex heuristic as fallback | no | recall/precision vs unit 9's harness before wiring live | medium | skip | unit 9 must PASS first | no |
| 11 | u4-watch-dashboard | plan U4 | new `apps/web` "Sessions" page + `apps/api` routes over unit 7's collections | no (reads existing) | Mode D checker: real browser walk, no console errors, filters/links respond | medium | **required (umesh-operator)** — new screen | unit 7 (needs real watch_state/meeting_candidates data) | **yes** — needs `docs/features/u4-watch-dashboard/` first |
| 12 | u5-auto-record-scheduler | plan U5; TASKS.md T-037/T-038 | `packages/meeting-bot/src/calendar/auto-join.ts`, `scripts/webinar/start-record-detached.ps1`, new poller CLI | yes (dedup/overlap state) | fake-clock test for selection/dedup/overlap; dry run lists what would record next | high (auto-triggers real recordings — outward-facing risk) | skip (scheduler, no new screen) | **U5 auto-record policy** open question — named inside `u2-live-repair.md` line 15 but NOT itself answered (per-meeting approval vs fully automatic) | no |
| 13 | t034-in-browser-tab-capture | TASKS.md T-034 (no deps, pending) | browser extension + `apps/web` MediaRecorder wiring; `packages/meeting-bot` capture | no | capture unit test + live recording length check; OBS becomes fallback | medium | skip (capture-layer swap, no new screen) | — | no |
| 14 | u4.1-recording-upload-worker | goal.json U4.1 (pending, no deps) | `workers/transcribe` (today a 3-line placeholder), `packages/ingest` recording adapter wiring | no | upload → transcribe → `turns.json` integration test | medium | skip (backend wiring; no new UI element confirmed) | — | no |
| 15 | u3.2-search-page | goal.json U3.2 (pending, deps U3.1) | new `apps/web` Search page / global search bar; builds on U0.7 + U1.5 | no | Mode D checker browser walk of search results + citations | medium | **required (umesh-operator, external-developer)** — new screen | U3.1 must reach `done` (currently `in_progress` in a concurrent maker session) | **yes** — needs `docs/features/u3.2-search-page/` first |
| 16 | t049-langfuse-tracing | TASKS.md T-049 (approved 2026-09-24, no deps) | `packages/ai` provider-call instrumentation (transcribe/extract/ask) | no | one traced call visible in the self-hosted Langfuse UI; `TELEMETRY_ENABLED=false` confirmed | medium | skip | — (disjoint from unit 13) | no |
| 17 | t050-langgraph-pipeline | TASKS.md T-050 (approved 2026-09-24) | new graph-wiring layer (capture→transcribe→extract→index); `/ask` router as a graph | no (wiring only; logic stays in existing functions) | checkpoint/resume test on a killed-mid-run job | high (touches whole pipeline) | skip | soft: sequence after units 7/14 stabilize (shares the pipeline they wire) | no |
| 18 | u2-4-phase3-speaker-precision | ISS-104 (critical), ISS-282/283/289 (high); goal.json U2.4 `in_progress` | `packages/index/src/pipeline/speakers.ts`, speaker-llm scorer | no | re-run each issue's own recorded reproductions (D-015); precision bar must clear before any write unit | critical | skip (no screen; precision gate) | **RAM pause** — u2-4-phase3-fix cycle 2 live eval is paused by Umesh pending ≥8 GB free RAM; pull decision is a human call per QUEUE.md precedent | no |
| 19 | ledger-shard-union-fix | ISS-129/130 (high) | ledger-reading surfaces (checker sweep, tracker audit) so `qa/issues.*.jsonl` shards are actually read as a union | no | sweep reads a seeded shard row it previously missed | high | skip | gate `ledger-shard-union-hook.md` (OPEN — no Answered line) | no |
| 20 | handshake-liveness-fix | ISS-178 (high) | maker↔checker handshake dispatch marker (distinguish "not dispatched" from "died mid-check") | no | kill a checker mid-run; confirm the gap is now detectable on disk | high | skip | gate `handshake-liveness-contract-start.md` (OPEN — no Answered line) | no |

## Gated — needs Umesh

| gate file | status | blocks |
|---|---|---|
| `qa/gates/zoom-bot-signin.md` | OPEN, urgent, deadline 2026-09-27 ~10:00 IST | unit 1 |
| `qa/gates/handshake-liveness-contract-start.md` | OPEN | unit 20 |
| `qa/gates/ledger-shard-union-hook.md` | OPEN | unit 19 |
| `qa/gates/d015-generalisation-scope.md` | OPEN | blocks nothing buildable per its own text — decides whether 2 already-STALLED units (write-guard-enforcement-gaps, delivery-gate-manifest-blindness) leave behind a rule |
| `qa/gates/enforcement-hooks-unauthorized-and-live-regressed.md` | placeholder only (`**Answered:** (pending)`) — treated as OPEN | resolution of ISS-189/190/200/201/219/220 (uncommitted enforcement hooks); no unit built for these pending this gate |
| `qa/gates/write-guard-contract-contradiction.md` | placeholder only (`**Answered:** <pending>`) — treated as OPEN | resolution of the STALLED write-guard-enforcement-gaps unit |
| `qa/gates/ui-surfaces-test-file-exclusion.md` | blank (`**Answered:** —`) — treated as OPEN | test-file classification affecting units 11/15's Mode D checker runs |
| U5 auto-record policy (named inside `u2-live-repair.md:15`, not separately answered) | OPEN | unit 12 |
| ISS-274 web-fallback-vs-Phase-1-exit (intent.md open question / QUEUE.md GRILL row) | OPEN — needs an Approver amendment | no unit built yet; either wire the web fallback or amend the north-star Phase-1 exit clause to state the honest limit |

## Parallelism

Independent (disjoint files, may run concurrently):
- Units 3, 5, 6 — different surfaces (DECISIONS.md via script / ledger-id tooling / gate-durability marker).
- Units 7 and 8 — plan `what-is-the-update-vivid-donut.md` states these files don't overlap by design.
- Units 13 and 16 — browser-capture layer vs. AI-call instrumentation.
- Unit 9 vs. units 7/8 — different packages (eval harness vs. ingestion/notify).
- Unit 4 vs. everything else — `.claude/hooks/*` is touched by no other row.

Serial (stated dependency):
- SERIAL: unit 7 waits on unit 2 (both touch `scripts/watch/run-watch.mjs`).
- SERIAL: unit 10 waits on unit 9 (extractor needs the harness's PASS first).
- SERIAL: unit 11 waits on unit 7 (dashboard needs real watch collections).
- SERIAL: unit 15 waits on U3.1 reaching `done` (concurrent maker session, not this plan).
- SERIAL: unit 17 sequenced after units 7/14 (soft — shares the pipeline it wires).

## Sources cited
`docs/intent.md` (APPROVED) · `.goal/goal.json` `tasks[]` · `TASKS.md` · `qa/QUEUE.md` (2026-09-26T23:0x sweep, top-3 + backlog state) · `qa/gates/*.md` (fresh-read 2026-09-26T23:5x) · `qa/issues.jsonl` + `qa/issues.{c-unrun-writers,t-029,t-031,t-033,t-047-controller,u0,u1,u2,u3}.jsonl` · `C:\Users\Lenovo\.claude\plans\what-is-the-update-vivid-donut.md` · project `.claude/CLAUDE.md` "Backlog priority override."
