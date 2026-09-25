# TASKS â€” Living Knowledge Base

> Stable IDs + status field mandatory. DECISIONS entries cross-reference these IDs in **Links**.
> Full feature catalogue (60+ items, Aâ€“F) and the system design live in the approved plan:
> `C:\Users\Lenovo\.claude\plans\thik-hai-and-you-nested-cat.md` (Â§4c, Â§6c). This file tracks the
> actionable front, not the whole backlog.

**Design-first gate (D-002â€¦D-005, 2026-09-03):** no feature unit starts before T-017 is green.

## Phase 1a â€” Foundation

| ID | Status | Task | Notes |
|---|---|---|---|
| T-000 | done | Backfill interview | Answered inline â€” D-001 |
| T-001 | done | Mongo schema v1 + validators | checker PASS, verdict `2ce65d1` |
| T-004 | done | Vectorless tree-index generator v1 | checker PASS, verdict `222314a` |
| T-005 | done | `POST /ask` CRAG router v1 | checker PASS cycle 2, verdict `129f8f1` |
| T-016 | done | Repo restructure â†’ TS pnpm monorepo | checker PASS 9/9, verdict `66f1372` |
| T-017 | done | Structure lint in CI | checker PASS 10/10, verdict `4ccfcfd` |
| T-018 | done | Schema v2 (ADR-first, camelCase evidence, 8 new collections, migrate-mongo) | checker PASS 7/7, verdict cycle-1 (recovered from network-error-interrupted dispatch) |
| T-019 | done | AI provider seam (5 adapters + STT sub-seam) | checker PASS 8/8, verdict `424bb38` |
| T-020 | done | Ingestion source seam (recording, document adapters) | checker PASS 7/7, verdict `3d2bb6f` |
| T-005b | done | Ask v2: selectNodes/refine/answer + audit log | checker PASS 6/6, verdict `e5dafe3` |

## Phase 1b â€” Prove the loop on TOC

| ID | Status | Task | Notes |
|---|---|---|---|
| T-002 | done | Migrate 23 TOC sessions into schema v2 | checker PASS 7/7, verdict `b59e0ff`; content ground-truthed against source transcripts. Follow-up: `session-pages-accessor` unit (missing `session_pages` Mongo accessor found during T-002 gap review) â€” checker PASS, verdict `qa/verdicts/session-pages-accessor.md`, commit `7e6185a`; `lkb.session_pages` backfilled to 23 real docs via one-off insert. |
| T-003 | done | Scale Gemini transcription 1â†’23 sessions | Phases 1-3 as before (PASSed). **Phase 4 (long-audio-chunking + real root-cause fix), checker PASS**, verdict `qa/verdicts/diarization-marker-frequency-fix.md`: real root cause of the "chunking stalls" symptom found and fixed â€” `DIARIZE_PROMPT` (`packages/ai/src/stt/gemini-file-upload.ts`) never required frequent `[MM:SS]` markers, so a long uninterrupted monologue could come back as ONE turn with a single leading marker; the parser's `tEnd = tStart + 30s` last-turn fallback then drastically understated real coverage, making fully-transcribed audio look truncated. Fixed by requiring a fresh marker at least every 15-20s. Also fixed `scripts/transcribe-long-session.mjs`'s `MIN_RECURSE_SECONDS` (180â†’20) so a small real boundary gap gets an actual recursive retry instead of being given up on immediately. **23/23 TOC sessions now genuinely real** (independently re-verified via fresh pymongo: zero `speakerRef: "unknown"` turns remain anywhere) â€” visa-blueprint (291 turns), creative-futures (269 turns), in-focus-3 (96 turns) newly real this cycle. |
| T-004b | done | Tree topic/org child nodes + incremental regen (real T-002 data) | checker PASS 5/5, verdict `15e4ecf`; found real cross-session "New Zealand" topic |
| T-004c | done | `regenerate()`: handle session year-migration cleanup + cross-year topic-evidence refresh | checker PASS 4/4, verdict `qa/verdicts/regenerate-year-migration.md`, commit `8ae94f4` |
| T-006 | done | Recording-gap tracking (never silently drop) | checker PASS 7/7, verdict `819262a` |
| T-021 | in_progress | Golden set (50â€“100 Qs) + recall@k report â€” regenerate under gate Option C | **Semantic leg measured 2026-09-21 (manifest golden-set-semantic-leg, checker PASS cycle 0, verdict `5fab76e`): recall@5 = 0.935 (86/92), control 0.217, 6 misses, INFORMATIVE; pin rate 10.9% vs 63%; near-verbatim 0/0; condition-4 sibling margins published (all 6 misses negative). Conditions 1â€“3 SATISFIED (checker-reproduced), condition 4 evidence delivered.** UNBLOCKED 2026-09-08: qa/gates/golden-set-redesign.md is ANSWERED - Option C, regenerate the golden set from raw transcripts (data/toc-migrated/<sessionId>/turns.json), by a different model+prompt than the summarizer, phrased as real student questions, with near-neighbour distractors. This task IS that unit. Binding acceptance conditions from the gate: cite the question-blind control (0.217) beside every score; PASS = recall@5 STRICTLY between 0.217 and 1.000 with a non-zero miss count - 1.000 is a FAILURE of the remedy and escalates to Option B; re-run the verbatim-overlap and single-unique-token-pin diagnostics (pin rate must fall well below 63%). The gate is answered but NOT closed - it closes when this unit satisfies those conditions. |
| T-022 | open | Evaluator calibration on 30 hand-scored pairs | depends T-021. NOT gate-blocked - the gate file says so explicitly. Blocked only by its dependency: calibration needs a non-saturated golden set to calibrate against. |

## Phase A â€” Capture

| ID | Status | Task | Notes |
|---|---|---|---|
| T-023 | done | URL adapter (Jina Reader / Firecrawl â†’ paragraphs-as-turns) | depends T-020; checker-verified commit `bcc6f1e`, verdict `qa/verdicts/url-adapter.md` |
| T-024 | done | **FIRST DEMO SHIPPED (grill Q9/Q10):** paste-a-link capture CLI `lkb capture <url>` â†’ platform adapter (Vexa: Meet/Teams Â· browser-profile join: Zoom/others Â· system-audio fallback) â†’ record â†’ diarize â†’ `sources/sessions/turns` w/ `captureMode`+`platform`+`joinStrategy`; provided-first soft gate warns before silent join; private vault | D-002/D-004/D-008; depends T-018 (bot fields), T-019 (STT), T-020 (recording adapter) |
| T-025 | done | Google Calendar connect + auto-join | checker PASS 6/6, verdict `qa/verdicts/calendar-auto-join.md`, commit `cfe3025`. Interface (`CalendarClient`) + pure decision layer (`selectEventsToAutoJoin`) only â€” no real Google Calendar credentials/implementation exist yet, not wired to production. |

## Phase 3 â€” Surface it

| ID | Status | Task | Notes |
|---|---|---|---|
| U3.1 | in_progress | Ask page (`apps/web/src/pages/AskPage.tsx`) | Shipped + checker PASS 8/8 (`qa/verdicts/web-ask-page.md`, commit `a7641bf`). Retained live-browser evidence proves a real tenant answered "What did speakers say about UK student visas?" with one internal citation (`qa/evidence/browser-2026-09-09/ask-answer.png`), and an independent checker clicked it through to the real session, claims, and 46 transcript turns (`qa/evidence/browser-hybrid-arms-binding-2026-09-09-checker/report.json:28-31`). Follow-up commit `725f94c` made the missing-`sessionRef` branch mutation-proven and replaced the observed C4 timing flake with an explicit 3 s wait timeout; full web suite 47/47 and typecheck passed, fresh senior review Approve. **2026-09-21 rerun DONE under the now-answered egress gate (A)**: real CDP-driven Chrome typed the question; live answer rendered (verdict correct) with the internal citation as a clickable link; click-through to the real session detail proven (screenshots + HTTP parity) — `qa/evidence/u31-ask-proof-20260921/summary.md`. The plan's literal Playwright exit wording remains the only open item. Catalogue C2/C3 remain PARTIAL for their broader product scope (no evidence mode / filters / history; no confidence, excerpts, follow-ups or feedback). |

## Later (unchanged)

| ID | Status | Task | Notes |
|---|---|---|---|
| T-007 | open | WhatsApp â†’ claims ingestion review | depends T-020 |
| T-008 | open | Vector index (`chunks`, Atlas Vector Search) + unstructured search | depends T-007 |
| T-009 | done | Developer API â€” `POST /ask` real, honest 501 stubs, rate limiting | checker PASS 8/8, verdict `cb04252`; post-verdict security fix `be86bf8` (shell:true removed) |
| T-010 | done | Product shell (`apps/web`, real Vite+React SPA) â€” un-deferred 2026-09-04 (Umesh asked for a proper professional UI: sidebar nav, dashboard, Obsidian-style brain/graph view, calendar). Phases 0-3: `qa/verdicts/web-app-shell-brain-calendar.md`, checker PASS. Phase 4 (Settings/API-key CRUD â€” real list/create/revoke, tenant-isolated, raw key shown once): `qa/verdicts/web-settings-keys.md`, checker PASS. Ingest/Meeting-Bot pages remain a separate, later unit (not part of T-010's original scope). | depends T-009 |
| T-011a | done | Phase-B per-user browser profile bot + live monitor â€” **privacy/consent logic only** | checker PASS 1/1, verdict `qa/verdicts/browser-profile-privacy.md`, commit `59dc2db`; real Playwright/UI wiring remains future work (see contract Non-goals). **Renamed from T-011 on 2026-09-07**: this row and `.goal/goal.json`'s T-011 were two different scopes sharing one id, so this row read as "the meeting bot is done" when it never claimed that. |
| T-011 | open | Meeting bot (auto-join, consent, live capture) â€” the FULL bot | All three joiners (vexa / browser / system-audio) are explicit stubs and `@lkb/meeting-bot` is imported by nothing; the catalogue scores it STUB (A10). Umesh 2026-09-07: this is a priority and gets made real â€” plan Â§10 U4.2, sequenced after the recording-upload path. |
| T-012 | done | Compete screen (internal tier, manual entry) | checker PASS 6/6, verdict `71b5fd2` |
| T-009b | done | Make `@lkb/ask`'s `ScoreFn` async; wire a real LLM-based scorer into apps/api's /ask (replaces the heuristic keyword-overlap scorer) | checker PASS 6/6, verdict `089d2b6` |
| T-013 | open | Avatar/voice counsellor client | depends T-009 |
| T-014 | open | Championship run (uses T-012's simple compete screen, not a platform) | depends T-012, T-013 |
| T-028 | open | Counsellor user management/accounts â€” **explicitly deferred** (Umesh: "baad mein dekh lenge") | depends T-009 |
| T-015 | open | Own-model training path | explicit approval before any data export |
| T-026 | done | Recording purge policy: gated on verified claims + Â±15 s evidence clips retained (D-008) | checker PASS 7/7, verdict `950a804` |
| T-027 | done | **Watched Sources** (A13): bookmark reputed URLs/landing pages â†’ periodic fetch â†’ hash+diff â†’ re-ingest changed sections â†’ provenance `{url, fetchedAt, diffFrom}` â†’ change notifications | checker PASS 1/1, verdict `38bc88a` |
| T-017b | done | SNAPSHOT.md generator + FEATURES.jsonl ledger + anti-cyclic hook | checker PASS 9/9, verdict `45b1b88` (cycle 2, D-009 hook wiring) |

**Done (2026-09-03/04):** T-016, T-017, T-017b, T-018, T-019, T-020, T-005b, T-024, T-002, T-009,
T-004b, T-012, T-009b, T-010 â€” all checker-PASSed and pushed. **T-003 done (2026-09-04)**: all 4
phases checker-PASSed. Phase 4 found and fixed the real root cause behind the earlier "2 sessions
structurally blocked" symptom (a diarization-prompt gap, not a hard size/model limit â€” see the
T-003 row above) â€” 23/23 TOC sessions now genuinely real, independently re-verified in Mongo.
**Maker picks next:**
T-004c (regenerate edge cases, low urgency). T-010 done. T-028 stays deferred. Ingest +
Meeting-Bot pages (apps/web) are open follow-up work, not yet started.

## Phase 0-4 â€” the current roadmap (plan Â§10 U-units)

> Imported 2026-09-08. These are the units the plan actually sequences; until now they existed
> ONLY in the plan file, so the maker's roadmap tier could not see them and pulled self-generated
> QA work instead. Statuses were verified on disk, not copied from the plan.

| ID | Status | Task | Notes |
|---|---|---|---|
| U0.5 | done | Catalogue scorer + docs/PROGRESS.md (machine-derived verdicts) | plan Â§10 Phase 0 |
| U0.6 | done | Tracker honesty: reconcile goal.json/TASKS.md, revert T-021/T-022 to partial | plan Â§10 Phase 0 |
| U0.7 | done | GET /health + GET /search un-stub (lexical over turns) | plan Â§10 Phase 0 |
| U0.8 | done | GET /citations/:claimId un-stub | plan Â§10 Phase 0 |
| U0.9 | done | Five packages/db accessors (topics, speakers, decisions, orgs, graph-edges) | plan Â§10 Phase 0 |
| U0.10 | in_progress | Honest eval baseline against a real LLM (redo T-021/T-022) | UNBLOCKED 2026-09-08: the gate is ANSWERED (Option C). An earlier note here claimed it needed the human gate answered first - that was written from a stale read and is false. This unit is the Option C regeneration; see T-021 for the binding acceptance conditions. NOTE for U1.4/U1.5: gate condition 4 says their delta-vs-baseline and >=0.85 exit criteria may not be re-pointed at the new set until conditions 2-3 hold, and until then must not be cited as passed. |
| U1.1 | done | embed() on the Provider seam (Gemini + Ollama over existing Transport) | plan Â§10 Phase 1. packages/ai/src/provider.ts exists; zero embed references today. |
| U1.2 | done | Chunking + real chunks rows (schema needs vector:number[] + dims) | embeddingRef is a string pointer; cosine needs the numbers in the doc |
| U1.3 | done | Embed on index (apps/api/src/indexing.ts, delete-then-insert) |  |
| U1.0 | done | Backfill chunks for pre-vector-layer sessions (+ fix Gemini 100-per-batch embed limit) | `chunks` was 0 rows despite U1.1/U1.2/U1.3 all PASSing â€” `writeSessionChunks` only runs during indexing and every session predated it. Live: 0 -> 1452 chunks, 26/26 sessions, 0 dim mismatches, 2118/2118 turnRefs resolve. Discharges C8 + ISS-113; fixed ISS-116's cause (batch >100 rejected, silently losing the 3 largest sessions = 37% of the corpus). Verdict `qa/verdicts/chunk-backfill.md` PASS 8/8. |
| U1.0b | done | Surface the chunk skip out of indexSession (ISS-116's concealment half) | `indexSession` discarded `{written, skipped}`, so `status.index` read "done" for all 26 sessions while three held zero vectors. Now returns `IndexSessionResult`; new `no-embedder` reason. Verdict `qa/verdicts/index-skip-surfacing.md` PASS 11/11. Follow-up ISS-118 (high): the operator-facing warn is untested and silently deletable â€” a `gaps` row is the durable fix. |
| U1.0c | done | Durable vector-pending gap row (ISS-118) | The previous unit's checker proved its own `console.warn` surface was unguarded: disabling it on both ingest paths left the whole suite green. A `gaps` row (additive `kind: vector-pending`) is the durable surface; idempotent by derived `_id`, resolved on a later success. Forced structural work: real depcruise cycle + `apps/api/src` already at 30/30, consolidated into `apps/api/src/indexing/` rather than taking a fourth budget override. |
| U1.0d | done | Tenant-namespace the vector-gap id + never strand a session (ISS-121) | Found LIVE by U1.0c's checker in code from the unit before it. `_id` was globally unique while its filter was tenant-merged, so a second tenant hit E11000 - reachable, since whatsapp-store derives sessionId from a sha256 of (groupJid, ownerUserId) with no tenant in it. Isolation held, so graded medium; pulled anyway under the tenancy/data-write clause because the throw ran BEFORE the status.index flip and stranded the session at "pending" while ingest returned 201. `recordVectorGap` now also never throws. |
| U1.4 | done | Brute-force cosine retriever behind vectorSearchFn | D-a: Atlas Vector Search unavailable (self-hosted Mongo, no +srv). Its recall delta claim additionally needs U0.10. |
| U1.5 | done | Hybrid merge (tree + vector + lexical, RRF) into askV2 | checker PASS 11/11, qa/verdicts/hybrid-arms-binding.md cycle 3. NOT a quality verdict: hybrid recall@5 is 0.870 (80/92) against pure vector 0.935, so the merge is correct, tenant-safe and honestly measured but WORSE than its own vector arm, and it is live on /ask. The >=0.85 exit criterion is NOT claimed as passed - see U0.10 and the golden-set gate condition 4. |
| U2.1 | done | Promote topics + orgs from the tree deterministically (no LLM) | cheapest real Phase 2 win; also backfills claims.topicRefs, which nothing has ever written |
| U2.1b | done | Assert claims/topics/orgs write TARGETING (ISS-C-CLAIMS-TARGETING-001) | Filed by U2.1's cycle-3 checker with a hard precondition: must close BEFORE U2.2/U2.3 enables a live entity backfill. Two mutations survived a green 139-test suite - `.find({evidence.sessionId})` to `.find({})` and `.updateOne({_id})` to `.updateOne({})` - because the tests asserted what each write CARRIES and never the predicate deciding WHICH ROWS it reaches, and `fakeDb.find` ignored its filter so the regression was structurally invisible. No production code changed; the shipped filters were already correct. |
| U2.1c | done | Tenant-namespace entity ids (entity-promotion contract C6) | SECOND instance of the ISS-121 shape, in a file I wrote one unit after fixing the first. `scopedCollection` merges tenantId into the FILTER but Mongo's `_id_` index is unique per COLLECTION, so tenant B upserting a slug tenant A holds gets E11000 - reproduced live before fixing. Worse than ISS-121: it sits inside the never-throws catch, so tenant B would lose ALL entity promotion silently and permanently. |
| U2.2 | open | Extraction-quality harness + golden set (built BEFORE the LLM extractors) | metrics incl. hallucination rate = cited id absent from turns |
| U2.3 | open | LLM topic extractor via the existing extractFn seam | keep the regex heuristic as degradation fallback |
| U2.4 | in_progress | Speaker resolution (TOC turns are literally spk:0) | **Five checker-PASSed units, eight checker rounds** (`speaker-resolution-deterministic`, `-whitespace-guard`, `-llm`, `speaker-denylist-ledger-corpus`, `speaker-apply-write`). Live write done 2026-09-08: `speakers` 0 to 2 real documents, each citing a real turn containing the name verbatim. **NOT done:** 78 of 494 positional turns (15.8%) attributed, 2 speakers against 88 distinct name strings; no `org`, no `role`, no profile; no turn's `speakerRef` rewritten; the LLM path is built and PASSed but deliberately NOT wired to the write, so nothing model-proposed reaches the database. B3 and B10 both human-downgraded to PARTIAL rather than accepting the probe's REAL. Open and carried: three gazetteer residues (India/Mumbai/Google), ISS-099-equivalent (the discriminator is an enlarged allowlist, not the noun test I described), a nominal pin, and `person:j` from a J. Smith style introduction. The rule that held throughout: leave low-confidence speakers UNRESOLVED rather than guessing. | **Phase 1 of the answered speaker-segment-identity gate DONE (checker PASS, qa/verdicts/speaker-block-floor.md): ResolvedSpeaker now carries blocks[] turn-index windows; recurring-label identity is scoped to its evidence block, never label-wide; corpus re-verified 494 turns / 240 blocks / 29 pairs. Phases 2-4 (LLM candidates, no-write precision eval, write unit + persona fields) remain separate units; sync-speakers.mjs block-based measurement owed next.** **Phase 2+3 DONE (checker PASS, qa/verdicts/speaker-llm-windows.md): segment-scoped windows (<=8 turns/block, no cross-block bleed, per-window calls), ollama adapter structured+think passthrough, speakers route pinned to local qwen3:8b, partial-window degradation. Phase-3 eval measured (no writes): precision bar FAILS — ISS-255 (high): LLM path inverts handover direction (moderator ships as Ruby); floor is correct (spk:2 self-naming); non-determinism across runs recorded. Phase 4 (write unit + persona fields) stays blocked until ISS-255 fixed + precision holds.** **ISS-255 FIXED same day (checker PASS, qa/verdicts/iss-255-handover-direction.md): handover-direction rule (HANDOVER_MARKERS/SELF_NAMING_CUES in speaker-name-rules.ts); two ISS-094 handover-form pins superseded to refusal tests with reason; live re-run: inversion gone (session conservatively unresolved), floor intact (spk:2 self-naming t206). 213/0 index tests, monorepo green. Next: 2-of-3 run-agreement + precision re-gate, then phase-4 write unit + persona fields.** **Phase-1.5 debt closed: sync-speakers.mjs coverage is now block-based — 42/494 (8.5%) attributable vs the label-wide 78/494 (15.8%), the honest segment-scoped number (dry-run verified).** **ISS-255 (2) DONE (checker PASS, qa/verdicts/speaker-run-agreement.md): 2-of-3 run voting on the windowed LLM path + cross-run evidence dedup; live visa-session re-eval (3 internal runs, 389s) still conservatively unresolved — unstable proposals refused. Phase-3 precision re-gate remains the precondition for the phase-4 write unit.**
| U2.5 | open | Decisions extraction (claims.ts template, different prompt) |  |
| U2.6 | done | Real graph_edges rows + merge at the route boundary | do NOT reshape flatten-graph.ts â€” map in routes/graph.ts (PASS a264c49) |
| U3.2 | open | Search page / global search bar | builds on U0.7 + U1.5 |
| U4.1 | open | Recording/file upload wired to a real transcribe worker | workers/transcribe is a 3-line placeholder; packages/ingest recording adapter is real but unwired |
| U4.2 | done | ONE real meeting-bot joiner (browser/Meet); quarantine the other two | 2026-09-24: real browser joiner (SeleniumBase Chrome + OBS) live-run on a Zoho webinar, D-027; awaiting /checker (T-033) (PASS c21355e, merged 856d31b) |

## Webinar bot (D-027, roadmap: docs/meeting-bot-roadmap.md)

| ID | Status | Task | Notes |
|---|---|---|---|
| T-029 | done | Auto-reconnect on "connection interrupted" (reload + rejoin, gap logged) | seen live 2026-09-24 ~16:03, fixed by hand (PASS 9eb5307, merged dd07aa2) |
| T-030 | done | Status alerts to Telegram (joined / dropped / silent / done + summary) | Umesh had to ask for status on the first live run (PASS d3cefbf; live phone delivery pending human-approved run) |
| T-031 | done | Live audio watchdog via OBS meters (>2 min silence → alert + reconnect) | depends T-029 (PASS 4c87be0, merged bf653fe; live muted-tab run pending approval) |
| T-032 | done | OBS guard: Safe Mode / websocket-down detection + normal restart | force-killed OBS relaunched in Safe Mode on 2026-09-24 (PASS 0c310b2, merged 6b8caef) |
| T-033 | done | Tests (fake OBS client failure paths, audioPath) + /checker PASS for the phase-0 bot | closes U4.2 (PASS f0b9c91, merged 5262deb) |
| T-034 | open | In-browser tab capture (extension + MediaRecorder); OBS becomes fallback | removes OBS; enables parallel meetings |
| T-035 | open | Lean video (720p, low fps) — target <400 MB/hour | live run measured ~2.7 GB/hour |
| T-036 | open | Discovery: Gmail + Calendar webinar-link scan incl. Zoho/OnAir/YouTube Live | extends apps/api gws-gmail.ts / gws-calendar.ts |
| T-037 | open | Auto-join rules (sender/domain/platform, approve-once, opt-out) | Read AI pattern |
| T-038 | open | Scheduler service (5-min poller → selectEventsToAutoJoin → record; overlaps) | replaces one-off Windows tasks; depends T-034, T-036, T-037 |
| T-039 | open | "Send bot now" to a live meeting (CLI/API/web) |  |
| T-040 | open | Post-processing: summary, facts, Q&A, action items with timestamp citations |  |
| T-041 | open | Slide keyframes → OCR → attached to turns by time | video capture proven live 2026-09-24 |
| T-042 | open | Speaker naming for webinar turns (Zoho tile names + intros + sync-speakers) | relates U2.4 |
| T-043 | open | Index webinar sessions into the KB (/ask across webinars) |  |
| T-044 | open | Transcript QA: timestamp drift clamp + hallucination spot-check | measured 223 s of turns on 186 s of audio |
| T-045 | open | More sources: OnAir on-demand, YouTube via yt-dlp, Meet/Teams/Zoom via browser bot |  |
| T-046 | open | Retention policy for raw video (D-008) + real /meeting-bot web page |  |
| T-047 | done | Record controller must survive console close: run hidden/detached, plus a finalize-on-restart watchdog (detect OBS still recording with no controller → finalize) | 2026-09-24: controller died 16:30:56 (console closed, Ctrl+C exit); OBS + bot kept going; recovered by hand with `lkb finalize --stop-obs` (PASS 8c1cfc1, merged 784df67) |
| T-049 | open | Langfuse self-hosted tracing on every Gemini call (transcribe, extract, ask): latency, tokens, cost, retries, failures | Vidysea standard rule 5 (brain `patterns/agentic-architecture-standard.md`): self-hosted only, TELEMETRY_ENABLED=false, no enterprise key; approved by Umesh 2026-09-24 |
| T-050 | open | Pipeline as a thin LangGraph 1.x workflow (capture → transcribe → extract → index) with checkpoint/resume + a job queue; /ask router as a graph | standard: graph = wiring only, logic stays in functions/skills; multi-agent (Deep Agents) only for the counsellor (T-013); approved by Umesh 2026-09-24 |
| T-048 | open | Make gemini-3.8-flash single-call the default for recordings ≤ ~90 min; keep chunking as fallback | D-028: one call fixed speaker attribution + no gaps; first re-run one TOC session to compare |

