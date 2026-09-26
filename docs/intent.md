# Intent — Living Knowledge Base

Status: APPROVED (intent) — Umesh 2026-09-26T23:53 "go on i approve", recorded qa/gates/plan-approved.md (d780a93). Backfilled 2026-09-26 by maker (tick step 2b).

<!-- PLAN phase, step 1, backfilled for a project that predates the rule (D-000, 2026-09-03).
     Sourced from .goal/goal.json, ARCHITECTURE.md, docs/SNAPSHOT.md, TASKS.md, qa/contracts/,
     docs/DECISIONS.md, qa/feedback-inbox.md, qa/gates/*.md, qa/QUEUE.md, and
     C:\Users\Lenovo\.claude\plans\what-is-the-update-vivid-donut.md. No invention — every claim
     cites its source. -->

**Originator:** Umesh · **Date:** 2026-09-03 (project start) / 2026-09-26 (this backfill) ·
**Status:** approved (intent) — see qa/gates/plan-approved.md

## Problem

Vidysea's counselling knowledge (TOC community webinars, WhatsApp expert threads, live sessions)
sits in scattered recordings and documents with no speaker+timestamp citation trail, so nobody —
Umesh, a future developer, or a future AI counsellor — can ask "what did the experts actually say"
and get a provable answer. `.goal/goal.json` north_star: *"Build the Vidysea Living Knowledge Base
as the brain for an AI virtual counsellor that matches and then beats every living top human
counsellor in head-to-head evaluation (public championship, AlphaGo-style)."*

Umesh's own words, verbatim (`qa/feedback-inbox.md`):

- 2026-09-03: *"AUR SABSE important iska schema essaa rakhna jo scalable ho and system design ko
  bhi phle plan krr le properly ... DRY principle use ho ... ERP me schema aur system design decide
  nahi hua tha, cloud code itne zyada tokens kharch hota hai just for holding the context, code
  repeated hai, human engineer control nahi le paata — aisa nahi hona chahiye."* — the design-first
  gate exists because a prior project (ERP) lost engineer control to unplanned schema/design.
- 2026-09-03: *"Main cheez ye dekh abhi ki knowledge base kaise banega, aur phir developers ko API
  deni hogi for virtual counsellor and all — vo log API hit karenge. Baad mein counsellor ka user
  management karenge, tho baad mein dekh lenge."* — priority order: KB first, Developer API second,
  counsellor accounts explicitly deferred.
- 2026-09-09: *"meri need nhi honi chaiye naa, like there should be maker checker validation instead
  of human approval."* — the dev-loop itself should not need Umesh as a doorman, only as a rare
  approver.
- 2026-09-25: *"...tho agli baar ye ye sabb tu khud timele manner mai dekh lena, mujhe yaad naa
  dilana pdeee"* — new source material (TOC Drive recordings, work-Gmail session links) must be
  found and ingested on its own; Umesh should not have to remind the system that new content
  exists. TOC Drive's "September 26" folder held 4 unprocessed recordings for ~3 weeks unnoticed
  (`C:\Users\Lenovo\.claude\plans\what-is-the-update-vivid-donut.md`).

## Proposed outcome

- **O1** — `POST /ask` over the indexed corpus returns speaker+timestamp-cited internal answers
  (`.goal/goal.json` north_star Phase-1 exit; `ARCHITECTURE.md` §1).
- **O2** — off-corpus questions fall back to a cited web search rather than a wrong or refused
  answer (`ARCHITECTURE.md` H2, CRAG-shaped router).
- **O3** — every stored fact carries `evidence[]` to a real turn (speaker, timestamp, session); no
  write lands without schema validation (`ARCHITECTURE.md` H3, §5 "No fact without a citation").
- **O4** — new source material (TOC Drive, work Gmail/Calendar invites, watched URLs) is discovered
  and ingested automatically, with no reminder from Umesh (feedback-inbox 2026-09-25; plan
  `what-is-the-update-vivid-donut.md` U0–U6, TASKS.md T-036–T-046).
- **O5** — a Developer API (tenant-scoped, rate-limited) lets an external client — eventually the
  AI virtual counsellor / avatar — hit `/ask`, `/search`, `/citations` (TASKS.md T-009, T-013;
  feedback-inbox 2026-09-03).
- **O6** — long-range: the counsellor client beats top human counsellors in a blind, panel-scored
  championship (`.goal/goal.json` north_star; TASKS.md T-012/T-014; D-007).

## Affected users and systems

### User types (target 5–6)

| id | who (evidence) | goal | blocks on | confirmed |
|---|---|---|---|---|
| `umesh-operator` | Founder/Approver; runs the maker-checker loop, resolves HUMAN_GATEs, watches Telegram + the dashboard (project CLAUDE.md "Approver"; `qa/feedback-inbox.md` throughout) | KB gets built and kept current with minimal manual reminding; make the small set of decisions only he can make | every open `qa/gates/*.md` file with no `Answered:` line (see Open questions) | found |
| `external-developer` | A developer (internal or partner) hitting the Developer API to build the counsellor client | call `POST /ask` / `GET /search` / `GET /citations` with an API key, tenant-isolated, honest 501s for unbuilt routes | T-009 (done) but T-013 (avatar/voice client) still `pending`; API-key CRUD (`qa/contracts/web-settings-keys.md`) | found — feedback-inbox 2026-09-03 quote above; TASKS.md T-009/T-013 |
| `inhouse-counsellor` | Vidysea's own counselling staff, meant to get a copilot **before** any public-facing avatar (feedback-inbox 2026-09-03 grill: *"copilot for in-house counsellors first (C12/C2 before C14)"*) | ask the KB questions while advising a student and get a cited answer fast | no dedicated copilot UI/contract exists yet — `apps/web` AskPage (U3.1) is the closest built surface, generic not counsellor-specific | found (named in grill outcomes) but the concrete surface is `[ASSUMPTION]` |
| `tenant-org-admin` | An organisation (e.g. `toc`, `vidysea` tenant) whose knowledge must stay isolated from every other tenant | ingest and query only their own data; never see another tenant's rows | recurring tenant-isolation defects (U1.0d, U2.1c "second instance of the ISS-121 shape"; `ARCHITECTURE.md` §5 tenancy rule) | `[ASSUMPTION]` — inferred from schema (`tenants` collection, every collection keyed by `tenantId`) and the repeated tenancy bugs; no named external tenant-admin user exists yet |
| `toc-source-owner` | The community/webinar side providing recordings (TOC via Karunn; work-Gmail senders) under provided-first consent (`ARCHITECTURE.md` H8) | their session becomes searchable knowledge without extra effort from them; recordings purged only after verified use | provided-first capture gate; purge-after-verification gate (D-008, Q6 open) | `[ASSUMPTION]` — inferred from H8/D-002/D-008, no direct quote from a source-owner themselves |
| `end-student-counsellee` | The eventual public/student-facing user of the AI virtual counsellor (avatar/voice client, championship tier) | ask a counselling question, get an answer as good as or better than a top human counsellor | T-013 (avatar/voice client) and T-014 (championship run) are both `pending`; no live student-facing surface exists today | `[ASSUMPTION]` — this is the north_star's terminal user, not yet reachable by any built surface |

### Systems

- **This monorepo** (`D:\KnowledgeBase`, pnpm workspaces): `apps/api` (routes), `apps/web` (React
  SPA — dashboard, Ask, Brain graph, Calendar, Sources, WhatsApp, Settings), `packages/{ai,db,ask,
  index,ingest,meeting-bot,core}`, `workers/transcribe` (Python ML worker) — `ARCHITECTURE.md` §4.
- **MongoDB** — self-hosted (no `+srv`, so no Atlas Vector Search; brute-force cosine instead,
  `ARCHITECTURE.md` Q5/D-021); production is read-only by construction, writes go to
  `MONGO_WORK_DB` (user CLAUDE.md hard boundary).
- **AI providers** — gemini (primary), anthropic (API key + Claude-Code OAuth), openai, ollama,
  claude-code, behind one `Provider` seam with a user-editable per-jobKind chain
  (`ARCHITECTURE.md` H10; `config/ai-routing.yaml`).
- **`sources/whatsapp_msg/`** — a separate git submodule with its own Lab Protocol repo; referenced
  as a source, never duplicated here (`ARCHITECTURE.md` H6).
- **`raw/TOC/`** — 23+ migrated webinar sessions, data not code.
- **External integrations** — Google Drive/Gmail/Calendar (`gws`, `apps/api/src/gws-*.ts`), Zoom /
  Zoho / Google Meet via `packages/meeting-bot` + OBS, Telegram (status alerts, T-030), Tavily (web
  fallback, `qa/contracts/ask-web-fallback-tavily.md` — see Open questions, ISS-274).

## Constraints

- **Data boundary.** Production Mongo is read-only; all knowledge writes go through
  `MONGO_WORK_DB`; sending any internal/session content to an external AI provider needs an
  explicit `HUMAN_GATE` approval (`qa/gates/external-eval-data-egress.md`, answered A but the
  pattern — approve the exact payload, not a blanket rule — stands for future egress).
- **Provided-first capture.** Organizer-provided recording → public recording → attendee notes →
  silent capture only as last resort; every captured fact is diarized and cited
  (`ARCHITECTURE.md` H8); purge only after every citing claim is verified, with a ±15s evidence
  clip retained permanently (D-008).
- **No single-AI dependency.** Five provider adapters from day one, ordered chain, no vendor
  lock-in (`ARCHITECTURE.md` H10).
- **Structure budgets are frozen and CI-enforced** (LOC/files-per-dir/root-file caps,
  `ARCHITECTURE.md` ≤150 lines) — D-003; no feature unit starts before the structure-lint gate
  (T-017) is green.
- **Lab Protocol governance** — `ARCHITECTURE.md`/`docs/DECISIONS.md` are append-only/authorized-
  section-only; Approver = Umesh; enforcement-path changes need `**Approved-by:** Umesh` recorded
  after explicit confirmation (project CLAUDE.md).
- **Machine resources.** The dev machine is RAM-constrained; U2.4's live LLM speaker-eval cycle is
  explicitly paused pending ≥8 GB RAM (`TASKS.md` U2.4; plan `what-is-the-update-vivid-donut.md`
  "RAM is ~2–3 GB free, so builds run 1–2 at a time").
- **Registration forms stay human.** Any session requiring a manual sign-in or form submit (e.g.
  Zoom registrant pages) is never auto-submitted by the bot (plan `what-is-the-update-vivid-donut.md`
  U0/U5; `qa/gates/zoom-bot-signin.md`).

**Audience:** `internal-tool` — today the only real user is Umesh (`apps/web` dashboard/Ask/Brain/
Calendar/Settings, operated by him; counsellor accounts explicitly deferred — TASKS.md T-028,
feedback-inbox 2026-09-03 *"baad mein dekh lenge"*). The Developer API (O5) and an eventual
external-facing avatar client (T-013) are the named trajectory toward `api-only` /
`external-ui`, but neither has a live external user yet.

## Open questions

Each of these is a live, unanswered gate or ARCHITECTURE.md §6 question — not something this
document may resolve. Phrased so Umesh can answer directly.

- [ ] **zoom-bot-signin** (URGENT, deadline ~2026-09-27 10:00 IST) — sign the bot's Chrome profile
  into Zoom (`umeshsugara@vidysea.com` or another account) so it can join the Ashoka Educator
  Dialogues webinar past the sign-in wall, or accept skipping that recording
  (`qa/gates/zoom-bot-signin.md`).
- [ ] **u2-live-repair** — may the maker run the live repair of the 24-Sep InFocus session (deletes
  and re-ingests one tenant's rows + writes to `raw/`/`data/`), which the auto-mode classifier
  refused as "Modify Shared Resources"? This also blocks the U4 dashboard and U6 scheduled watcher
  (`qa/gates/u2-live-repair.md`).
- [ ] **U5 auto-record policy** — should the scheduler auto-join and record every session with a
  join link ("maximum possible", Umesh's own framing) fully automatically, or require per-meeting
  approval, given the classifier treats scheduled recording writes as a gated action? Named inside
  `qa/gates/u2-live-repair.md` ("U5 auto-record blocked by classifier (per-meeting approval vs
  fully automatic)").
- [ ] **ISS-274 / web-fallback vs Phase-1 exit** — `qa/contracts/ask-web-fallback-tavily.md` records
  the web-fallback seam as unwired while the north_star's own Phase-1 exit clause requires
  off-corpus web fallback. Should it be wired to close the gap, or should the Phase-1 exit clause
  be amended to state the honest limit? (`qa/QUEUE.md` 2026-09-22 GRILL row; ISS-274; needs an
  Approver amendment.)
- [ ] **d023-supersede** (open 17+ days) — D-023's Result line overstates what its parity test
  covered (it verified 3 paths, not the 6 later found affected). Append a superseding DECISIONS
  entry (option A), or leave the record as-is (option B)? (`qa/gates/d023-supersede.md`.)
- [ ] **mc-hooks-manifest-blindness** (open 17+ days) — may `.claude/hooks/mc-sessionstart.ps1` and
  `mc-precommit.ps1` (Lab enforcement paths) be patched so they recognize a **bolded**
  `**Status:** ready-for-check` line and read the highest recorded fix-cycle, instead of missing
  pending checks? (`qa/gates/mc-hooks-manifest-blindness.md`.)
- [ ] **Q1 (ARCHITECTURE.md §6)** — keep the product name "Living Knowledge Base" (from the deck),
  or rename it?
- [ ] **Q3 (ARCHITECTURE.md §6)** — who are the "top counsellors" for the eventual championship, and
  who judges? Needed before the eval-harness work scales past the internal tier (T-012/T-014;
  question bank sources fixed by D-007).
- [ ] **Q6 (ARCHITECTURE.md §6)** — the concrete media-retention values and purge-job design (D-008
  fixes only the *gate*: all citing claims verified + ±15s clips retained) — this is T-026's
  remaining scope, not yet decided.
