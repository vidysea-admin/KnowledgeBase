# Spec — Living Knowledge Base (PLAN backfill)

Status: DRAFT — backfilled 2026-09-26 by maker (tick step 2b) from qa/contracts + approved intent.
Not approved until qa/gates/plan-approved.md carries `Answered: … — spec`.

**Intent:** docs/intent.md (approved 2026-09-26, Umesh "go on i approve", gate `d780a93`) ·
**Status:** draft

<!-- Every requirement cites: (a) the intent outcome it serves — O1..O6 (docs/intent.md
     "Proposed outcome") — and (b) the qa/contracts/*.md file(s) that are its de-facto acceptance
     criteria today. Contracts are cited, not restated (`qa/contracts/*.md` §"Scope" holds the
     actual [C*] criteria). Areas with no contract are marked NO CONTRACT YET. -->

## Requirements by capability area

### 1. Ingest + transcription
Capture recordings/documents/URLs/WhatsApp, transcribe with speaker+timestamp turns, never
silently drop a source (ARCHITECTURE.md §5).
- R1 Ingestion adapter seam, one shape (recording/document/url/whatsapp/meeting-bot) →
  turns→pages→claims→tree (serves: intent#O1, intent#O3) — `qa/contracts/ingestion-source-seam.md`
- R2 URL adapter, paste-a-link → paragraphs-as-turns (serves: intent#O1) —
  `qa/contracts/url-adapter.md`
- R3 Gemini diarized transcription at scale (23/23 TOC sessions genuinely real, zero
  `speakerRef: unknown`) (serves: intent#O1, intent#O3) — `gemini-audio-transcription.md`,
  `toc-transcription-scale-up.md`, `diarization-marker-frequency-fix.md`,
  `disable-thinking-budget.md`, `transcription-empty-result-guard.md` (all in `qa/contracts/`)
- R4 Sync real transcribed turns into live Mongo, replacing placeholder seed data (serves: intent#O3)
  — `qa/contracts/sync-real-turns-to-mongo.md`, `qa/contracts/toc-migration.md`
- R5 Recording-gap tracking — a source that fails is logged as a gap row, never dropped
  (serves: intent#O4) — `qa/contracts/recording-gap-tracking.md`
- R6 Purge only after every citing claim is verified; ±15s evidence clip retained permanently
  (D-008) (serves: intent#O3, constraint "Provided-first capture") — `qa/contracts/purge-retention-policy.md`
- R7 WhatsApp ingestion first slice, referencing the `sources/whatsapp_msg` submodule as a source
  (serves: intent#O1) — `qa/contracts/whatsapp-ingestion-first-slice.md`
- R8 Multi-provider AI seam (5 adapters + pluggable STT sub-seam) underlies transcription and
  extraction (serves: intent#O1, constraint "No single-AI dependency") — `qa/contracts/ai-provider-seam.md`

### 2. Speaker resolution
Attribute every turn to a real identity, alias-based (H4), never guess past the confidence bar.
- R9 Deterministic speaker resolution (self-naming, gazetteer denylist) (serves: intent#O1,
  intent#O3) — `qa/contracts/speaker-resolution-deterministic.md`
- R10 LLM-assisted speaker resolution, no-write eval path, windowed/segment-scoped (serves: intent#O1)
  — `qa/contracts/speaker-resolution-llm.md`
- R11 Speaker apply-write — the only unit permitted to write resolved identities into `speakers`/
  `turns.speakerRef` (serves: intent#O3) — `qa/contracts/speaker-apply-write.md`
- **Status (TASKS.md U2.4):** live write covers 2/88 distinct name strings (~8.5% of turns,
  block-based); LLM path built but not wired to the write pending a precision re-gate — the
  least-complete area against its own contracts.

### 3. Extraction / claims
Every stored fact carries `evidence[]` to a real turn; schema is the only place shape is defined.
- R12 Mongo schema v2 — `claims`/`decisions`/`session_pages` require `evidence`; `tenantId` on every
  knowledge-layer row (serves: intent#O3, intent#O1) — `qa/contracts/knowledge-base-schema.md`,
  `qa/contracts/schema-v2.md`
- R13 Entity promotion — topics/orgs promoted deterministically from the tree (no LLM), backfills
  `claims.topicRefs` (serves: intent#O1) — `qa/contracts/entity-promotion.md`
- R14 Ingest→index wiring — a live-ingested (WhatsApp/URL) session's `summarize`/`claims` job kinds
  actually run, not just TOC's one-time backfill (serves: intent#O1) —
  `qa/contracts/ingest-indexing-pipeline.md`
- **NO CONTRACT YET** — LLM topic/decision extractors (TASKS.md U2.2/U2.3/U2.5) are `open`, ungated.

### 4. Index + search + ask
Two indexes (tree + vector), merged, behind a CRAG-shaped router; internal-first, web fallback.
- R15 Vectorless tree index + topic/speaker child nodes + incremental regen (serves: intent#O1) —
  `qa/contracts/tree-index-generator.md`, `qa/contracts/tree-index-v2.md`,
  `qa/contracts/regenerate-year-migration.md`
- R16 `/ask` CRAG router — tree-search → evaluator → internal answer or web refine, sources cited
  separately (serves: intent#O1, intent#O2) — `qa/contracts/ask-router.md`, `qa/contracts/ask-router-v2.md`
- R17 Web fallback (Tavily) wired into the router — **open gap, see Known conflicts** (serves:
  intent#O2) — `qa/contracts/ask-web-fallback-tavily.md`
- R18 Vector retrieval (brute-force cosine, no Atlas) + hybrid tree/vector/lexical merge (RRF)
  (serves: intent#O1) — `qa/contracts/vector-retrieval.md`, `qa/contracts/hybrid-retrieval.md`
- R19 `GET /health`, `GET /search` (lexical), `GET /citations/:claimId` un-stubbed (serves:
  intent#O1, intent#O5) — `qa/contracts/health-route.md`, `qa/contracts/search-route.md`,
  `qa/contracts/citations-route.md`
- R20 Real async LLM relevance scorer (replaces heuristic keyword overlap) (serves: intent#O1) —
  `qa/contracts/real-llm-scorer.md`
- R21 `packages/db` tenant-scoped accessors for topics/speakers/decisions/orgs/graph_edges
  (serves: intent#O1) — `qa/contracts/knowledge-graph-accessors.md`, `qa/contracts/session-pages-accessor.md`
- **Measured (TASKS.md T-021/U0.10/U1.5):** recall@5 = 0.935 pure-vector vs 0.870 hybrid — hybrid
  is live on `/ask` but *worse* than its own vector arm; ≥0.85 exit bar not claimed pending gate
  condition 4.

### 5. Tenancy / auth
Every row scoped by `tenantId`; no handler accepts a tenant id from the client (ARCHITECTURE.md §5).
- R22 Every collection keyed by `tenantId`, session/auth-derived only (serves: intent#O3,
  constraint "Data boundary") — `qa/contracts/knowledge-base-schema.md`, `qa/contracts/schema-v2.md`
- R23 Developer API — `POST /ask` real, honest 501 stubs for unbuilt routes, rate limiting
  (serves: intent#O5) — `qa/contracts/developer-api.md`
- R24 Self-serve API-key CRUD (list/create/revoke, tenant-isolated, raw key shown once) (serves:
  intent#O5) — `qa/contracts/web-settings-keys.md`
- **Known weak spot:** tenant-isolation defects recurred twice at entity-write time (U1.0d/ISS-121,
  U2.1c same shape) — cross-tenant `_id` collisions; no dedicated tenant-isolation contract exists.

### 6. Meeting bot + source watcher
Auto-join/record webinars; discover new source material without a reminder from Umesh (intent#O4).
- R25 Meeting-bot capture — platform-adapter join (Vexa/browser-profile/system-audio fallback),
  provided-first soft gate, private vault (serves: intent#O4, constraint "Provided-first capture")
  — `qa/contracts/meeting-bot-capture.md`, `qa/contracts/meeting-bot-live-capture.md`,
  `qa/contracts/browser-profile-privacy.md`
- R26 Google Calendar connect + `selectEventsToAutoJoin` decision layer (serves: intent#O4) —
  `qa/contracts/calendar-auto-join.md`
- R27 Watched Sources (A13) — bookmark URL → periodic fetch → hash+diff → re-ingest changed
  sections only, with `guarded-fetch` SSRF defence (serves: intent#O4) —
  `qa/contracts/watched-sources.md`, `qa/contracts/watched-sources-entrypoint.md`,
  `qa/contracts/watched-sources-run.md`, `qa/contracts/guarded-fetcher.md`
- R28 Gmail meeting-candidate detection with human-approve-then-autoconfirm trust ramp
  (serves: intent#O4) — `qa/contracts/gmail-meeting-candidates-approval.md`
- **NO CONTRACT YET** — plan units U1 (TOC catch-up), U2 (source-watcher), U5 (auto-record
  scheduler), U6 (Task Scheduler install) are plan-only (`what-is-the-update-vivid-donut.md`), no
  contract file. T-036–T-046 (discovery scan, auto-join rules, scheduler, post-processing, OCR) are
  `open` in TASKS.md, no contract.

### 7. Eval / golden set
Measure recall/precision honestly against a question-blind control; no self-graded corpora (D-015).
- R29 Golden-set recall@k, regenerated from raw transcripts by a different model+prompt than the
  summarizer, with near-neighbour distractors (serves: intent#O1, intent#O6) —
  `qa/contracts/golden-set-recall.md`
- R30 Question-blind control + saturation/ceiling check accompanies every recall@k number
  (serves: intent#O6) — `qa/contracts/eval-baseline-control.md`
- R31 Evaluator calibration on 30 hand-scored pairs (blocked on R29's non-saturated set)
  (serves: intent#O6) — `qa/contracts/evaluator-calibration.md`
- R32 Internal-tier compete screen (manual entry, no panel-management UI) (serves: intent#O6) —
  `qa/contracts/compete-screen.md`
- **Status:** R29 recall@5 = 0.935 (control 0.217), conditions 1–3 satisfied; public-championship
  tier (T-013/T-014/Q3) is `open`/`[ASSUMPTION]` — see Known conflicts.

### 8. Notifications
Report ingestion/watcher status through configurable channels without Umesh having to ask (intent#O4).
- **NO CONTRACT YET.** T-030 (Telegram status alerts) shipped inside the webinar-bot chain but no
  contract scopes notifications as their own capability; the plan's U3 (`Notifier` channel
  interface, telegram now + whatsapp stub) is still plan-only (`what-is-the-update-vivid-donut.md`).

### 9. Web UI (`apps/web`)
Real Vite+React SPA — sidebar nav Dashboard/Sessions/Ask/Brain/Calendar/Sources/Settings/Ingest/
Meeting-Bot/WhatsApp (`apps/web/src/App.tsx` routes).
- R33 App shell + Brain (Obsidian-style graph, drill-down) + Calendar (serves: intent#O1) —
  `qa/contracts/web-app-shell-brain-calendar.md`, `qa/contracts/brain-explorer-pages.md`,
  `qa/contracts/brain-knowledge-graph.md`, `qa/contracts/calendar-grid-ui.md`
- R34 Ask page — real internal-citation answers, click-through to session/claims/turns (serves:
  intent#O1) — `qa/contracts/web-ask-page.md`
- R35 Dashboard visual polish (stats/overview, not just a gaps list) (serves: intent#O1) —
  `qa/contracts/web-dashboard-visual-polish.md`
- R36 Sessions/Calendar/Brain richness — real upcoming meetings from GWS credentials (serves:
  intent#O4) — `qa/contracts/web-sessions-calendar-brain-richness.md`
- R37 Settings — API-key CRUD (serves: intent#O5) — `qa/contracts/web-settings-keys.md`
- R38 Ingest page (real write path) + Meeting-Bot page (honest empty state, no vendor wired yet)
  (serves: intent#O4) — `qa/contracts/web-ingest-and-meetingbot.md`
- R39 WhatsApp tab, TOC-related features surfaced in the website (serves: intent#O1) —
  `qa/contracts/web-whatsapp-tab.md`
- R40 Product actually reachable as a running server (serves: intent#O1) —
  `qa/contracts/live-demo-server.md`

### Process/governance contracts (not a product capability area, cited for completeness)
`structure-lint.md`, `monorepo-restructure.md`, `post-review-fixes-2026-09-06.md`,
`delivery-gate.md`, `write-guard.md`, `loop-safety.md`, `ledger-id-allocation.md`,
`ledger-shard-union-readers.md`, `lane-data-isolation.md`, `tracker-integrity.md`,
`snapshot-features-ledger.md`, `catalogue-progress-score.md` govern the maker-checker loop/repo
structure itself, not a user outcome — no `serves:` link applies.

## Navigation flow per user type
<!-- Audience per intent.md: internal-tool. Only `apps/web` (Umesh) and the Developer API
     (external-developer) have a live surface today; the other four are [PLANNED] or [ASSUMPTION]
     per intent.md's own user-type table. -->

### umesh-operator
- **Entry:** Dashboard (`/`, `DashboardPage.tsx`). **Goal (≤4 steps):** Dashboard → sidebar "Ask" →
  type question → cited answer → click through to Session detail (`/sessions/:id`).
- **Must understand:** stat tiles = corpus health not personal tasks; sidebar is the only nav
  (`web-app-shell-brain-calendar.md`); citation links are clickable to the real turn.
- **Happy path:** a question covered by an ingested TOC session gets a correct-verdict cited
  answer, click-through proven (`qa/evidence/u31-ask-proof-20260921/summary.md`).
- **Negative path:** off-corpus question hits the live web-fallback gap (ISS-274, see Known
  conflicts); a failed source shows as a gap row, never silently missing (`recording-gap-tracking.md`).

### external-developer
- **Entry:** Settings (`/settings`) to self-serve a key, then the Developer API directly —
  `web-settings-keys.md`, `developer-api.md`. **Goal (≤3 steps):** Settings → "Create key" → copy
  raw key (shown once) → call `POST /ask` with the key header.
- **Must understand:** the key is unrecoverable after this screen; unbuilt routes return an honest
  `501`, never a silent 200 with fake data.
- **Happy path:** tenant-scoped key → `POST /ask` returns a cited answer.
- **Negative path:** revoked key → 401; unbuilt route → honest 501, never guessed.

### inhouse-counsellor
- **Entry `[ASSUMPTION]`:** no dedicated copilot surface; closest built entry is the shared Ask
  page (`/ask`) — intent.md names the concrete surface as `[ASSUMPTION]`.
- **Goal `[PLANNED]`:** Ask page → student-specific question mid-advising → fast cited answer; not
  yet scoped as counsellor-specific (TASKS.md U3.1: "C2/C3 remain PARTIAL... no evidence mode /
  filters / history").
- **Must understand / happy / negative paths:** `[PLANNED]` — undefined until a copilot UI unit exists.

### tenant-org-admin
- **Entry `[ASSUMPTION]`:** no named tenant-admin user or UI; tenancy is enforced in code/schema
  (`tenants` collection, every collection keyed by `tenantId`), not a visible admin screen.
- **Goal `[PLANNED]`:** ingest/query only their own tenant's data — today a backend guarantee
  (ARCHITECTURE.md §5), not something they can inspect themselves.
- **Happy path:** writes land under their `tenantId`, invisible to other tenants
  (`knowledge-base-schema.md`/`schema-v2.md`).
- **Negative path (real bugs, not hypothetical):** a second tenant upserting a slug/id the first
  already holds hits `E11000` — caught live twice (U1.0d/ISS-121, U2.1c) — see Known conflicts.

### toc-source-owner
- **Entry `[PLANNED]`:** no UI; touchpoint is providing a recording (Drive/Zoom/Zoho) which the
  bot/watcher captures for them; they never log in (`ARCHITECTURE.md` H8 provided-first capture).
- **Goal:** their session becomes searchable with no extra effort — true today for the 23 migrated
  TOC sessions (`toc-migration.md`), not yet automatic for new ones (areas 6/8, NO CONTRACT YET).
- **Happy path:** organizer-provided recording → auto-transcribed → cited in `/ask` answers.
- **Negative path:** registration-form-gated sessions never auto-submitted (`qa/gates/zoom-bot-
  signin.md`); silent capture is last resort only (H8).

### end-student-counsellee
- **Entry `[PLANNED]`:** no live student-facing surface (T-013 avatar/voice client, T-014
  championship run both `open`) — intent.md: "the north star's terminal user, not yet reachable
  by any built surface".
- **Goal / must-understand / happy / negative paths:** all `[PLANNED]` — the long-range O6 outcome,
  blocked on T-013/T-014 and the Q3 judge/panel question.

## Flow → user types map
| flow | user types |
|---|---|
| Ask a question, get a cited answer | umesh-operator, external-developer, inhouse-counsellor |
| Issue/revoke an API key | umesh-operator (self), external-developer |
| Provide a recording for capture | toc-source-owner |
| Tenant-scoped ingest/query isolation | tenant-org-admin, all others implicitly |
| Public championship / avatar interaction | end-student-counsellee (not yet built) |

## Known conflicts / gaps
- **ISS-274 / web-fallback vs Phase-1 exit** — Phase-1 exit requires off-corpus web fallback
  (intent#O2); `ask-web-fallback-tavily.md` records the seam as unwired. Open in `docs/intent.md`
  and `ARCHITECTURE.md` — needs an Approver amendment (wire it, or state the honest limit).
- **Recurring tenant-isolation defect (ISS-121 shape, twice)** — two separate units (U1.0d, U2.1c)
  shipped the same cross-tenant `_id` collision before being caught; no dedicated tenant-isolation
  contract exists to prevent a third.
- **Named users with no contract/surface:** `inhouse-counsellor` (O1) has no counsellor-UI
  contract; `tenant-org-admin` has no admin-surface contract; `end-student-counsellee` (O6) has
  none at all — T-013/T-014 are `open`, ungated.
- **O4 ("no reminder from Umesh") vs reality** — R25–R28 cover bot/watcher building blocks, but the
  watcher loop (U2), auto-record scheduler (U5), Task-Scheduler install (U6) that would close O4
  end-to-end are plan-only (`what-is-the-update-vivid-donut.md`, TASKS.md T-036–T-046) — the
  intent's own O4 evidence (4 unprocessed TOC recordings, 3 weeks unnoticed) is not yet closed.
- **Q3 (ARCHITECTURE.md §6, open):** who are the "top counsellors" for O6, and who judges — blocks
  the eval-harness (area 7) from scaling past the internal tier.
- **Notifications (area 8) has zero contracts** despite T-030 (Telegram alerts) already shipped
  inside `meeting-bot-live-capture.md`'s broader unit; the plan's generalized `Notifier` interface
  (U3) has none either.

## Out of scope (this backfill)
- Resolving any of the six open questions listed above — they resolve only through
  `/checkpoint`/Approver verdicts, not this document (ARCHITECTURE.md §6 rule).
- Editing ARCHITECTURE.md, docs/DECISIONS.md, qa/contracts/*.md, or docs/intent.md — Lab Protocol
  forbids it outside their own authorized paths.
- Designing the counsellor-copilot UI, tenant-admin UI, or student-facing avatar — all `[PLANNED]`
  above; each needs its own intent/spec pass once a surface is actually proposed.

## Seeds
- `qa/adapter.json` `personas` ← the 6 user types above (2 already reachable: umesh-operator,
  external-developer; 4 `[PLANNED]`/`[ASSUMPTION]`)
- `qa/scenarios/` ← one row per happy/negative path above, once a checker walks these as personas
