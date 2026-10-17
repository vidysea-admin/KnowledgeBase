# KnowledgeBase — analytical progress report and execution plan

Audit: **9 October 2026, IST**. Goal/Git/QA snapshot approximately **11:32 IST**; runtime probe **11:33 IST**; RAM refreshed **11:42 IST**. Other sessions may change the working tree after this snapshot.

**Decision:** finish the current architecture through accepted releases. The roadmap declares **51/95 tasks done (53.7%)**, with **5 in progress + 39 pending = 44 unfinished**. All current master commits are public. Dirty local work and four unmerged branches remain unpublished. Complete product release acceptance and current live deployment are **not established**.

## 1. Original goal and count methodology

The goal is a hosted Living Knowledge Base: ingest recordings, documents and messages; preserve speaker/time/source evidence; build tree/vector retrieval; answer internally grounded questions with separate web fallback; expose a Developer API for an AI virtual counsellor. The long-range target is a judged human-versus-AI counsellor championship. Phase 1 requires cited POST /ask answers over 23 TOC sessions, including speaker/timestamp evidence and off-corpus fallback.

Sources: [north star](D:/KnowledgeBase/.goal/goal.json:4), [architecture](D:/KnowledgeBase/ARCHITECTURE.md:10), [delivery groups](D:/KnowledgeBase/TASKS.md:145).

| Measure | Count | Interpretation |
| --- | --- | --- |
| Current engineering roadmap | 95 total; 51 done; 5 in progress; 39 pending | 44 unfinished; 53.7% declared task completion. Tasks vary in effort. |
| Published master roadmap | 84 total; 51 done; 2 in progress; 31 pending | 11 newer task definitions remain local. Same declared done count of 51. |
| Product feature catalogue | 57 total; 8 REAL; 16 PARTIAL; 1 STUB; 32 MISSING | 49 not fully REAL according to saved evidence; not fresh end-to-end acceptance. |
| Saved adjusted catalogue score | 28.1% | (8 + 16 × 0.5) / 57. Old collection evidence and dirty current scorer inputs. |
| QA ledger open | 201 rows; 51 critical/high | Includes historical/security/tooling/governance records. Not 201 fresh product bugs. |
| Current production completeness | Not established | CI red, local runtime inactive, complete Windows/Ubuntu acceptance missing. |

53.7% and 28.1% use different denominators. One counts engineering tasks; the other scores broader product scope against saved evidence. Neither is today's production-readiness percentage.

## 2. Delivery-group counts

| Group | Scope | Total | Done | In progress | Pending | Unfinished |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Source discovery & intake | 9 | 3 | 1 | 5 | 6 |
| G2 | Automated capture & ingestion | 11 | 5 | 0 | 6 | 6 |
| G3 | Transcript & expert identity | 6 | 1 | 1 | 4 | 5 |
| G4 | Knowledge enrichment & organization | 11 | 5 | 1 | 5 | 6 |
| G5 | Search retrieval & cited answers | 20 | 15 | 1 | 4 | 5 |
| G6 | Knowledge Base product experience | 3 | 2 | 0 | 1 | 1 |
| G7 | Knowledge outputs & counsellor client | 2 | 0 | 0 | 2 | 2 |
| G8 | Evaluation & continuous improvement | 6 | 1 | 0 | 5 | 5 |
| G9 | Hosting security & operations | 24 | 19 | 1 | 4 | 5 |
| G10 | Later explicitly retained | 3 | 0 | 0 | 3 | 3 |
| TOTAL | Current local roadmap | 95 | 51 | 5 | 39 | 44 |

G10 is retained/deferred. These are task counts, not effort-weighted percentages. Search/retrieval has 15/20 marked done; operations foundations have 19/24. Complete operational release remains open.

### What has been built

- Data foundation: tenant-aware Mongo schemas/validators, TOC migration, turn evidence, transcription scale-up and first WhatsApp ingestion/view path.
- Knowledge mechanisms: claim extraction, tree indexing, entity-promotion and source/provenance mechanisms. A shipped mechanism does not establish completed live backfill or semantic accuracy.
- Retrieval/API: tree, vector and hybrid retrieval, CRAG Ask routing, internal/web provenance and Developer API.
- Product surfaces: dashboard, Brain/session/calendar views, Ask, ingestion/meeting-bot views, WhatsApp tab and settings/key surfaces.
- Capture/operations: browser joining, capture/remux/playback, reconnect/watchdog, scheduling/controller, source watching, heartbeat/notification interfaces and tenant/ownership safety tests.
- Registration: acquisition and persistence subunits have recorded checker PASS; the complete executable registration feature remains in progress.

Many units have scoped checker evidence. Wider product requirements, current full corpus, hosted release and unattended operation remain separate acceptance gates.

[U3.1 Ask evidence](D:/KnowledgeBase/TASKS.md:49) already includes historical browser answers and citation click-through. Its remaining status reflects acceptance wording and broader UX. An old 'unreachable Ask' title is not a reason to rebuild the shipped page.

## 3. Public branch and unpublished work

Repository: [vidysea-admin/KnowledgeBase](https://github.com/vidysea-admin/KnowledgeBase), **public**. The default branch is **master**; there is no main branch in this repository.

| Item | Verified status |
| --- | --- |
| Local HEAD and origin/master | 614d78b8966428296f394b8bf3e6c547d41beca5 |
| Committed master history | 962 commits |
| Local master vs published master | 0 ahead / 0 behind |
| Default fetch/push remote | https://github.com/vidysea-admin/KnowledgeBase.git; remote.pushDefault=origin |
| Modified tracked paths | 48; 47 contain content diffs |
| Tracked diff size | +3094 / −746 lines; not an effort estimate |
| Selected untracked code/QA paths | 20 |
| Unmerged local branches | 4, containing 22 unique commits absent from master |
| Registered worktrees | 30; this is not active agent count |
| GitHub deployment records | 0; this does not rule out an external DevOps deployment |
| Published CI | FAILURE on the same master identity |

T-051 through T-061 are **11 local-only task definitions**, not 11 completed unpublished features. U2.2 is locally in progress but published as pending. Large numbers of browser/runtime/test artifacts also exist; access warnings make the broad untracked scan unsuitable as a complete code count.

| Local branch | Commits absent from master | Disposition |
| --- | --- | --- |
| lane/a-speakers | 2 | Reconcile QA/history and ownership. |
| wave/u2-4-phase3-fix | 13 | Speaker re-gate FAIL/paused; do not merge as accepted. |
| wave/vector-gap-durability | 2 | Ready-for-check on stale base; wholesale application risks dropping current webinar indexing guards. |
| worktree-agent-a035913864247fa58 | 5 | Hook/QA FAIL evidence; review attributable changes. |

Normal future Git pushes are configured for the admin repository. Accepted commits still need to be pushed; publication alone does not establish automatic deployment. The private, independently governed sources/whatsapp_msg submodule needs an explicit deployment access/material strategy.

## 4. Fresh checks and actual failures

| Check | Fresh result | Practical meaning |
| --- | --- | --- |
| pnpm -r typecheck | PASS, exit 0 | Initial sandbox EPERM resolved on approved-context retry; not a code failure. |
| node scripts/lint-loc.mjs --all | FAIL, exit 1; 10 stages, 4 failed | LOC, directory-size, root-file and tracker gates failed. Other six stages completed. |
| node scripts/tracker-audit.mjs --json | FAIL, exit 1; 8 findings | 155 fixed-unverified rows, stale sweep, six ambiguous issue-reference findings. |
| node scripts/catalogue-score.mjs --check | FAIL, exit 2 | 22 inputs untrusted: 20 modified and 2 untracked. Clean committed reproducibility refused. |
| .venv/Scripts/python.exe contracts/verify_contracts.py | Exit 0, PASS by vacuity | No frozen contracts in this validator; QA contracts exist separately. Not product acceptance. |
| node scripts/eval-extraction.mjs --input data/eval/extraction-corpus.json | Exit 2, incomplete | Offline artifact replay, no model calls or DB writes. |
| Published GitHub CI | Completed FAILURE | Remux test failed; downstream gates skipped. Full product suite not rerun in this audit. |

[Published CI run](https://github.com/vidysea-admin/KnowledgeBase/actions/runs/37734830843) failed at the [live WebM remux test](D:/KnowledgeBase/packages/meeting-bot/src/capture/record-backend.test.ts:23): FFmpeg subprocess status was null rather than zero. Runner FFmpeg availability is a hypothesis to verify, not a confirmed root cause. Local FFmpeg/FFprobe exist. Preserve playable-media and provenance assertions while diagnosing it.

Exact structure failures:

| Gate | Current violations |
| --- | --- |
| Source LOC, budget 300 | speakers-llm.ts 313; sb_join.py 1067; obs-windows.ts 359; run-watch.mjs 558; run-pipeline.mjs 324 |
| Test LOC, budget 400 | run-pipeline.test.mjs 434 |
| Directory size | apps/api/src 32 files vs 31; scripts 33 vs 32 |
| Root loose files | 17 vs 15 |
| Tracker | Six manifest/verdict references use bare ISS-001/ISS-002 where lane qualification is required |

Do not raise limits solely to get green checks. Reconcile ownership, approved structural exceptions and existing-file refactoring first.

## 5. Knowledge quality is the main product gap

| Fresh extraction replay | Measured value |
| --- | --- |
| Declared / loaded cases | 35 / 29; six synthetic case artifacts missing |
| Source turns | 3427 |
| Persisted claims / citation occurrences | 72 / 80 |
| Invalid persisted citations | 14 / 80 = 17.5%; 14 claims affected |
| Invalid source-time cases | 3; 26/29 structurally complete |
| Raw/parsed/filtered artifacts | Unavailable for all 29 cases |
| Independently labelled semantic cases | 0/29; truth/support/coverage quality unmeasured |
| Artifact identity against replay baseline | No hash drift; reference identities match |
| U2.2 acceptance | BUILDING; no final independent checker verdict |

**17.5% measures structural citation invalidity, not hallucination or answer accuracy.** Unavailable stage artifacts are not zero output. Reconcile the original 23-session TOC scope against 29 loaded sessions using provenance. Independently label semantic support and coverage, set binding thresholds and account for every missing/incomplete case.

Historical retrieval evidence is useful but bounded: vector recall **86/92 = 0.935**, control **0.217**, hybrid **80/92 = 0.870**. Hybrid is lower than vector on that set. These are retrieval metrics, not generated-answer accuracy. Scoped golden-set semantic-leg PASS does not close all T-021 acceptance/Approver gates.

U2.4 speaker resolution has shipped several mechanisms, but phase-3 precision re-gate is FAIL/paused. Keep uncertain identities unresolved; do not enable model-proposed identity writes or persona enrichment before acceptance. Old label-wide and newer segment-scoped coverage denominators differ and must not be mixed.

## 6. Current machine and operational challenges

| Observation | Current evidence and consequence |
| --- | --- |
| API/UI | 127.0.0.1:3300 and :5173 not accepting TCP |
| Local Mongo/work Mongo | :27017 and :27019 not accepting TCP |
| Docker | CLI present; dockerDesktopLinuxEngine pipe absent; docker ps cannot connect |
| Runtime versions | Node v24.13.1; project Python 3.11.15 |
| Media tools | FFmpeg and FFprobe available on PATH |
| GWS credentials | OAuth2 metadata, client config and encrypted credentials exist; auth status exit 0 |
| Live Google provider readiness | Not re-probed here; metadata does not prove current refresh/permissions |
| Latest RAM | 23.7 GB total / 2.4 GB free; volatile 11:42 IST probe |
| Speaker model gate | Requires ≥8 GB free and its other pause conditions; current RAM below threshold |
| Live release readiness | Historical bounded proof exists; current runtime and complete release proof absent |

Historical connected evidence recorded Calendar's 209-event baseline / 13 window meetings and a complete 1907 Gmail-ID listing. Mail body acquisition timed out after 227 GETs; full classification was not persisted or verified. An earlier isolated work API/Mongo sample had 291 turns, six claims, 7/7 resolving references and 5/5 resolving search hits with zero model calls. These are historical bounded proofs, not current live inventories.

The old missing-GWS-credentials blocker is resolved at configuration level. Remaining operations work includes full mailbox acquisition, real webinar/provider/Ask proof, actual operator alert receipt, sustained capture, interruption/restart and Ubuntu host verification.

Use independent light lanes where ownership permits; serialize memory-heavy speaker/capture jobs until RAM is sufficient. No services started, paid models called or processes killed for this report.

## 7. QA state and prioritized blockers

| QA ledger state | Count |
| --- | --- |
| Rows / unique IDs | 464 / 464; no duplicate IDs or parse errors in the union |
| Open critical / high / medium / low | 4 / 47 / 96 / 54 |
| Open total | 201 |
| Fixed / fixed without verified_date | 170 / 155 |
| Verified / wontfix / closed duplicate / closed self-corrected | 88 / 2 / 2 / 1 |

201 is a ledger state, not 201 newly reproduced product defects. Some open records have repair evidence but need independent current-identity close-out. Do not add 155 fixed-unverified rows to 201 as a defect count.

| Priority | Blocker | Required next evidence |
| --- | --- | --- |
| P0 | Unpublished candidate + red CI/structure/tracker | Attribute local work, preserve peers and obtain green same-candidate gates. |
| P0 | Citation integrity and missing semantic gold | Disposition 14 invalid references; independently label support/coverage with binding thresholds. |
| P0 | Registration destination/credential safety | ISS-373/374 remain ledger-open despite fixture repairs; independent full-feature acceptance before real submissions. |
| P0 | Speaker precision | Complete paused re-gate under resource conditions before identity/persona writes. |
| P1 | Real operational release | Approved real webinar → usable AV → cited Ask; sustained capture, received alert, interruption/restart. |
| P1 | Grounded notes/Q&A schema | Prior canonical schema edit rejected/pending owner authorization; no ungrounded substitute or validator weakening. |
| P1 | Runtime/RAM/mailbox acquisition | Restore owned work services and complete auditable/resumable full mail acquisition. |
| P1 | Ubuntu deployment | Actual host/service owner, served identity and independent end-to-end host proof. |
| P2 | Catalogue/ledger freshness and remaining product scope | Fresh trusted probes, retrieval adjudication and broader UX; then counsellor/platform/championship. |

Open critical rows include ISS-104 (speaker identity), ISS-282 (speaker precision), ISS-372 and ISS-A035913-008 (delivery/hook identity). They were inventoried, not freshly reproduced in this report. Security/tenancy/credential findings remain uncapped; medium issues belong in related work and low observations should not restart a full loop.

## 8. Execution plan, proposed owners and acceptance

| Stage | Proposed owner | Concrete work | Exit proof |
| --- | --- | --- | --- |
| 0 — Candidate reconciliation | Current feature makers + fresh checker | Attribute 48 modified paths, 20 selected new paths and four branches; select accepted current-master changes | Exact files/hashes/commit identity; peer work retained; no broad merge of FAIL/paused lanes |
| 1A — Release gates | Meeting-bot/infra maker + checker | Diagnose remux CI; resolve approved structure and tracker issues | Same-candidate typecheck, affected tests/falsification, all structure stages and required CI |
| 1B — U2.2 offline, parallel | Extraction maker + checker/quality adjudicator | Checker-owned contract/thresholds; provenance inventory; missing-artifact disposition; citation/support/coverage evaluation | Every declared case accounted for, independent labels and matching-cycle checker verdict |
| 2 — R1 Windows direct-link lane | Webinar owner + operator | Owned work services, approved real webinar, usable media, speech/screen citations, Ask, actual alert and recovery | Sustained 60-minute capture, current provenance, operator alert receipt, restart and independent acceptance |
| 2B — Registration-required lane | T-052 maker + checker + Umesh | Full executable registration safety and confirmation-email join-link correlation | Independent feature acceptance, safe refusals, approved real submission scope and linked capture proof |
| 3 — Ubuntu and publication | DevOps host/service owner + checker | Actual Ubuntu deployment of accepted release; dependency/access/persistence/restart checks; accepted push | Green checks, remote readback, served build/commit identity and actual-host end-to-end proof |
| 4 — R2 usable KB | Extraction/speaker/retrieval/UI owners | Full TOC/WhatsApp/new-webinar acceptance; speaker/retrieval gates; transcript/search/answer UX | Accepted support/coverage/accuracy, browser citation click-through and tenant-safe corpus readback |
| 5 — R3 counsellor | Product/API/client/evaluation owners | Outputs, avatar/voice, roles/audit/webhooks/retention, feedback and championship | Explicit customer acceptance and independent human-versus-AI judging |

Direct join-link capture can progress independently of T-052; registration-required coverage cannot. R1/R2/R3 reuse groups, so their counts must not be added. G10 remains explicitly retained/deferred.

Owner inputs: Umesh/quality checker must settle gold adjudication/semantic thresholds, the previously rejected grounded-notes schema change, real registration identity/scope and provider-spend boundaries. DevOps must name the Ubuntu host/service owner and actual alert recipient/channel. Championship judges are a later R3 gate and should not block R1.

**Recommended next unit:** reconcile the candidate and CI/structure ownership while U2.2 advances offline in a separate lane. Then close R1 and R2 before wider counsellor features. This is a proposed plan, not already-running work or a delivery-date promise. The report does not reactivate paused jobs or authorize paid batches, production promotion or new external registrations.

## 9. Fresh CTO review — exact recommendation and next actions

The CTO Advisor workflow used a fresh read-only cto-brief review. Its required recommendation and next actions are reproduced verbatim.

**Recommended Direction**

> Finish the current architecture through accepted release seams. First reconcile unpublished work and make the candidate CI/structure gates green; then complete R1’s connected operational proof, while independently advancing U2.2’s offline quality gate. Proceed to R2 before building the broader R3 counsellor surfaces.

**Next Actions**

1. **Today: freeze an evidence inventory of the current candidate.** Assign the 48 modified files and relevant lane work to their feature owners, record exact identities and preserve peer changes; do not use one broad commit.
2. Diagnose CI’s remux failure and close the existing structure violations through reviewed ownership-preserving changes. Keep original safety assertions and budgets.
3. Complete **U2.2**: checker-owned extraction contract, independent labels/thresholds, 23-versus-29 provenance reconciliation and invalid-reference disposition. This can proceed offline alongside R1.
4. Close **R1 Windows** using a real approved direct-link webinar; finish T-052’s independent registration acceptance and then its approved external lane. Verify alert receipt, controlled interruption, restart and sustained capture.
5. Have the deployment owner prove the same release on an actual Ubuntu host, then assemble and push the accepted candidate. Deployment requires its own served-identity/live readback.
6. Close **R2** with full-corpus/WhatsApp/new-webinar Ask proof, speaker re-gate and retrieval adjudication; proceed to R3 after those gates pass.


## Appendix A — all unfinished tasks (44)

Recorded titles can lag later code/verdict evidence. Published row means a task definition exists on master, not that implementation is done.

| ID | Group | State | Recorded scope | Dependencies | Published row |
| --- | --- | --- | --- | --- | --- |
| T-007 | G1 | pending | WhatsApp -> claims ingestion review | T-020 | Yes |
| T-008 | G5 | pending | Vector index + unstructured search | T-007 | Yes |
| T-011 | G2 | pending | Meeting bot (auto-join, consent, live capture) | T-024 | Yes |
| T-013 | G7 | pending | Avatar/voice counsellor client | T-009 | Yes |
| T-014 | G8 | pending | Championship run | T-012, T-013 | Yes |
| T-015 | G10 | pending | Own-model training path | T-002 | Yes |
| T-021 | G8 | pending | Golden set 50-100 Qs + recall@k report (target recall@5 >= 0.85) | T-002 | Yes |
| T-022 | G8 | pending | Evaluator calibration on 30 hand-scored pairs | T-021 | Yes |
| T-028 | G10 | pending | Counsellor user management/accounts | T-009 | Yes |
| U0.10 | G8 | pending | Honest eval baseline against a real LLM (redo T-021/T-022) | none recorded | Yes |
| U2.2 | G4 | in_progress | Extraction-quality harness + golden set (built BEFORE the LLM extractors) | U2.1 | Yes |
| U2.3 | G4 | pending | LLM topic extractor via the existing extractFn seam | U2.2 | Yes |
| U2.4 | G3 | in_progress | Speaker resolution (TOC turns are literally spk:0) | U2.2 | Yes |
| U2.5 | G4 | pending | Decisions extraction (claims.ts template, different prompt) | U2.2 | Yes |
| U3.1 | G5 | in_progress | Ask page in apps/web (POST /ask is unreachable from the UI today) | none recorded | Yes |
| U3.2 | G5 | pending | Search page / global search bar | U3.1 | Yes |
| U4.1 | G2 | pending | Recording/file upload wired to a real transcribe worker | none recorded | Yes |
| T-034 | G2 | pending | In-browser tab capture (extension + MediaRecorder); OBS becomes fallback | none recorded | Yes |
| T-035 | G2 | pending | Lean video (720p, low fps) — target <400 MB/hour | none recorded | Yes |
| T-036 | G1 | pending | Discovery: Gmail + Calendar webinar-link scan incl. Zoho/OnAir/YouTube Live | none recorded | Yes |
| T-037 | G1 | pending | Auto-join rules (sender/domain/platform, approve-once, opt-out) | none recorded | Yes |
| T-038 | G2 | pending | Scheduler service (5-min poller → selectEventsToAutoJoin → record; overlaps) | none recorded | Yes |
| T-039 | G2 | pending | "Send bot now" to a live meeting (CLI/API/web) | none recorded | Yes |
| T-040 | G4 | pending | Post-processing: summary, facts, Q&A, action items with timestamp citations | none recorded | Yes |
| T-041 | G4 | pending | Slide keyframes → OCR → attached to turns by time | none recorded | Yes |
| T-042 | G3 | pending | Speaker naming for webinar turns (Zoho tile names + intros + sync-speakers) | none recorded | Yes |
| T-043 | G5 | pending | Index webinar sessions into the KB (/ask across webinars) | none recorded | Yes |
| T-044 | G3 | pending | Transcript QA: timestamp drift clamp + hallucination spot-check | none recorded | Yes |
| T-045 | G1 | pending | More sources: OnAir on-demand, YouTube via yt-dlp, Meet/Teams/Zoom via browser bot | none recorded | Yes |
| T-046 | G9 | pending | Retention policy for raw video (D-008) + real /meeting-bot web page | none recorded | Yes |
| T-049 | G9 | pending | Langfuse self-hosted tracing on every Gemini call (transcribe, extract, ask): latency, tokens, cost, retries, failures | none recorded | Yes |
| T-050 | G9 | pending | Pipeline as a thin LangGraph 1.x workflow (capture → transcribe → extract → index) with checkpoint/resume + a job queue; /ask router as a graph | none recorded | Yes |
| T-048 | G3 | pending | Make gemini-3.8-flash single-call the default for recordings ≤ ~90 min; keep chunking as fallback | none recorded | Yes |
| T-051 | G9 | in_progress | Webinar to Knowledge Base Windows operational release; independently verified Ubuntu deployment | T-036, T-037, T-038, T-040, T-043, T-044 | Local only |
| T-052 | G1 | in_progress | Automatic webinar registration and confirmation-email join-link correlation | T-036, T-037 | Local only |
| T-053 | G1 | pending | Connector expansion public/on-demand intake missing-recording workflow and watched-source verification | T-006, T-023, T-025, T-027, T-045 | Local only |
| T-054 | G3 | pending | Transcript review and speaker mapping UI | T-003, U2.4, T-044 | Local only |
| T-055 | G4 | pending | Page-evidenced documents topic/speaker pages collections and resource directories | T-020, U2.2, U2.3, U2.4 | Local only |
| T-056 | G5 | pending | Full cited-answer UX policies conflicts review queue and unstructured search acceptance | U3.1, U3.2, T-007, T-008, T-022 | Local only |
| T-057 | G6 | pending | Sessions explorer graph health jobs analytics notifications Sheets and setup UI | T-010, U2.6, T-006 | Local only |
| T-058 | G7 | pending | FAQ reports and meeting preparation builders | T-056 | Local only |
| T-059 | G8 | pending | Evaluation loss to gap capture re-index and re-test flywheel | T-021, T-022, T-043 | Local only |
| T-060 | G9 | pending | Multi-tenant hosting roles audit API webhooks security and retention completion | T-009, T-018, T-026, T-051 | Local only |
| T-061 | G10 | pending | Wider application automation and bot-monitored operations | T-060 | Local only |

## Appendix B — all 95 roadmap items

| ID | Group | State | Recorded scope |
| --- | --- | --- | --- |
| T-001 | G4 | done | Mongo schema + deterministic validators (sources/sessions/turns/speakers/session_pages/claims/topics/orgs/programs/decisions) |
| T-002 | G4 | done | Migrate 23 TOC sessions into the DB with turn-level citations |
| T-003 | G3 | done | Scale Gemini diarize/timestamp/name/summarize pipeline from 1 to 23 sessions |
| T-004 | G5 | done | Vectorless tree-index generator over session_pages |
| T-005 | G5 | done | POST /ask CRAG router (tree-search -> evaluator -> internal/web) with provenance |
| T-006 | G1 | done | Recording-gap rows + standing-ask process |
| T-007 | G1 | pending | WhatsApp -> claims ingestion review |
| T-008 | G5 | pending | Vector index + unstructured search |
| T-009 | G9 | done | Developer API + webhooks |
| T-010 | G6 | done | Product shell (hosted multi-tenant app) |
| T-011 | G2 | pending | Meeting bot (auto-join, consent, live capture) |
| T-012 | G8 | done | Counsellor eval harness + human golden set |
| T-013 | G7 | pending | Avatar/voice counsellor client |
| T-014 | G8 | pending | Championship run |
| T-015 | G10 | pending | Own-model training path |
| T-016 | G9 | done | Repo restructure to TS pnpm monorepo; port tree_index/ask_router to TS; ARCHITECTURE <=150 |
| T-017 | G9 | done | Structure lint in CI: lint-loc, dependency-cruiser, lint-dupes, root-file cap, ARCHITECTURE cap |
| T-018 | G9 | done | Schema v2: camelCase evidence, new collections, index.json, generated TS types, migrate-mongo baseline, db accessors |
| T-019 | G9 | done | AI provider seam: gemini (primary), claude-code (OAuth), anthropic (flag), stt seam, routing.yaml, parity test |
| T-020 | G9 | done | Ingestion source seam + recording/document adapters |
| T-005b | G5 | done | Ask v2: select_nodes job, (score,reason) evaluator, refine, answer, per-call log |
| T-021 | G8 | pending | Golden set 50-100 Qs + recall@k report (target recall@5 >= 0.85) |
| T-022 | G8 | pending | Evaluator calibration on 30 hand-scored pairs |
| T-023 | G1 | done | URL ingestion adapter (Jina Reader / Firecrawl) |
| T-024 | G2 | done | FIRST FEATURE UNIT: paste-a-link capture CLI, platform adapters (Vexa/browser/system-audio), provided-first gate, vault |
| T-025 | G9 | done | Google Calendar connect + auto-join |
| T-026 | G9 | done | Recording purge-after-processing policy + migration (deferred by Umesh) |
| T-027 | G1 | done | Watched Sources: bookmark reputed URLs, change-tracking, re-ingest (A13) |
| T-017b | G9 | done | SNAPSHOT.md generated + FEATURES.jsonl ledger + hook injection (plan 6d) |
| T-000 | G9 | done | Backfill interview |
| T-004b | G5 | done | Tree topic/org child nodes + incremental regen (real T-002 data) |
| T-004c | G5 | done | regenerate(): session year-migration cleanup + cross-year topic-evidence refresh |
| T-009b | G5 | done | Async ScoreFn + real LLM-based scorer wired into /ask |
| T-028 | G10 | pending | Counsellor user management/accounts |
| T-011a | G9 | done | Phase-B browser-profile bot + live monitor — privacy/consent logic only |
| U0.5 | G9 | done | Catalogue scorer + docs/PROGRESS.md (machine-derived verdicts) |
| U0.6 | G9 | done | Tracker honesty: reconcile goal.json/TASKS.md, revert T-021/T-022 to partial |
| U0.7 | G9 | done | GET /health + GET /search un-stub (lexical over turns) |
| U0.8 | G9 | done | GET /citations/:claimId un-stub |
| U0.9 | G9 | done | Five packages/db accessors (topics, speakers, decisions, orgs, graph-edges) |
| U0.10 | G8 | pending | Honest eval baseline against a real LLM (redo T-021/T-022) |
| U1.1 | G5 | done | embed() on the Provider seam (Gemini + Ollama over existing Transport) |
| U1.2 | G5 | done | Chunking + real chunks rows (schema needs vector:number[] + dims) |
| U1.3 | G5 | done | Embed on index (apps/api/src/indexing.ts, delete-then-insert) |
| U1.0 | G5 | done | Backfill chunks for pre-vector-layer sessions (+ fix Gemini 100-per-batch embed limit) |
| U1.0b | G5 | done | Surface the chunk skip out of indexSession (ISS-116 concealment half) |
| U1.0c | G5 | done | Durable vector-pending gap row (ISS-118) |
| U1.0d | G5 | done | Tenant-namespace the vector-gap id + never strand a session (ISS-121) |
| U1.4 | G5 | done | Brute-force cosine retriever behind vectorSearchFn |
| U1.5 | G5 | done | Hybrid merge (tree + vector + lexical, RRF) into askV2 |
| U2.1 | G4 | done | Promote topics + orgs from the tree deterministically (no LLM) |
| U2.1b | G4 | done | Assert claims/topics/orgs write TARGETING (ISS-C-CLAIMS-TARGETING-001) |
| U2.1c | G4 | done | Tenant-namespace entity ids (entity-promotion contract C6) |
| U2.2 | G4 | in_progress | Extraction-quality harness + golden set (built BEFORE the LLM extractors) |
| U2.3 | G4 | pending | LLM topic extractor via the existing extractFn seam |
| U2.4 | G3 | in_progress | Speaker resolution (TOC turns are literally spk:0) |
| U2.5 | G4 | pending | Decisions extraction (claims.ts template, different prompt) |
| U2.6 | G6 | done | Real graph_edges rows + merge at the route boundary |
| U3.1 | G5 | in_progress | Ask page in apps/web (POST /ask is unreachable from the UI today) |
| U3.2 | G5 | pending | Search page / global search bar |
| U4.1 | G2 | pending | Recording/file upload wired to a real transcribe worker |
| U4.2 | G2 | done | ONE real meeting-bot joiner (browser/Meet); quarantine the other two |
| T-029 | G2 | done | Auto-reconnect on "connection interrupted" (reload + rejoin, gap logged) |
| T-030 | G9 | done | Status alerts to Telegram (joined / dropped / silent / done + summary) |
| T-031 | G2 | done | Live audio watchdog via OBS meters (>2 min silence → alert + reconnect) |
| T-032 | G9 | done | OBS guard: Safe Mode / websocket-down detection + normal restart |
| T-033 | G9 | done | Tests (fake OBS client failure paths, audioPath) + /checker PASS for the phase-0 bot |
| T-034 | G2 | pending | In-browser tab capture (extension + MediaRecorder); OBS becomes fallback |
| T-035 | G2 | pending | Lean video (720p, low fps) — target <400 MB/hour |
| T-036 | G1 | pending | Discovery: Gmail + Calendar webinar-link scan incl. Zoho/OnAir/YouTube Live |
| T-037 | G1 | pending | Auto-join rules (sender/domain/platform, approve-once, opt-out) |
| T-038 | G2 | pending | Scheduler service (5-min poller → selectEventsToAutoJoin → record; overlaps) |
| T-039 | G2 | pending | "Send bot now" to a live meeting (CLI/API/web) |
| T-040 | G4 | pending | Post-processing: summary, facts, Q&A, action items with timestamp citations |
| T-041 | G4 | pending | Slide keyframes → OCR → attached to turns by time |
| T-042 | G3 | pending | Speaker naming for webinar turns (Zoho tile names + intros + sync-speakers) |
| T-043 | G5 | pending | Index webinar sessions into the KB (/ask across webinars) |
| T-044 | G3 | pending | Transcript QA: timestamp drift clamp + hallucination spot-check |
| T-045 | G1 | pending | More sources: OnAir on-demand, YouTube via yt-dlp, Meet/Teams/Zoom via browser bot |
| T-046 | G9 | pending | Retention policy for raw video (D-008) + real /meeting-bot web page |
| T-047 | G2 | done | Record controller must survive console close: run hidden/detached, plus a finalize-on-restart watchdog (detect OBS still recording with no controller → finalize) |
| T-049 | G9 | pending | Langfuse self-hosted tracing on every Gemini call (transcribe, extract, ask): latency, tokens, cost, retries, failures |
| T-050 | G9 | pending | Pipeline as a thin LangGraph 1.x workflow (capture → transcribe → extract → index) with checkpoint/resume + a job queue; /ask router as a graph |
| T-048 | G3 | pending | Make gemini-3.8-flash single-call the default for recordings ≤ ~90 min; keep chunking as fallback |
| T-051 | G9 | in_progress | Webinar to Knowledge Base Windows operational release; independently verified Ubuntu deployment |
| T-052 | G1 | in_progress | Automatic webinar registration and confirmation-email join-link correlation |
| T-053 | G1 | pending | Connector expansion public/on-demand intake missing-recording workflow and watched-source verification |
| T-054 | G3 | pending | Transcript review and speaker mapping UI |
| T-055 | G4 | pending | Page-evidenced documents topic/speaker pages collections and resource directories |
| T-056 | G5 | pending | Full cited-answer UX policies conflicts review queue and unstructured search acceptance |
| T-057 | G6 | pending | Sessions explorer graph health jobs analytics notifications Sheets and setup UI |
| T-058 | G7 | pending | FAQ reports and meeting preparation builders |
| T-059 | G8 | pending | Evaluation loss to gap capture re-index and re-test flywheel |
| T-060 | G9 | pending | Multi-tenant hosting roles audit API webhooks security and retention completion |
| T-061 | G10 | pending | Wider application automation and bot-monitored operations |

## Appendix C — all 57 product catalogue entries (saved evidence)

Collection evidence: **2026-09-08T11:06:33.153Z**, qa/evidence/live-2026-09-08-11-06-33/preflight.json, committed hash prefix 37031dce7956; about 31 days old. **19 entries have no probes** and default to MISSING. Some manual downgrades predate newer builder evidence; MISSING is not a fresh proof of absent code.

| Group | Total | REAL | PARTIAL | STUB | MISSING |
| --- | --- | --- | --- | --- | --- |
| A Ingestion | 13 | 2 | 4 | 1 | 6 |
| B Memory/knowledge | 13 | 4 | 3 | 0 | 6 |
| C Reasoning/answers | 14 | 2 | 4 | 0 | 8 |
| D Improvement | 8 | 0 | 3 | 0 | 5 |
| E Platform | 7 | 0 | 2 | 0 | 5 |
| F Operations | 2 | 0 | 0 | 0 | 2 |

| ID | Requirement | Saved label | Caveat / manual reason |
| --- | --- | --- | --- |
| A1 | Ingestion Hub (upload + metadata + consent + 5-step status) | PARTIAL | URL-only. No file/recording upload, no consent checkbox, no 5-step Ingest->Index->Enrich->Verify->Publish status. Plan §10 U4.1. |
| A2 | Transcription pipeline (diarize + timestamps + name-map) | REAL | Saved source/collection probe; no fresh live acceptance |
| A3 | Transcript Review & Speaker Mapping UI | MISSING | Saved source/collection probe; no fresh live acceptance |
| A4 | Sessions Library (filters, coverage %) | PARTIAL | List + detail are real, but there are no month/status/speaker/topic filters and no coverage %. |
| A5 | Missing Recording Workflow (request, SLA, reminders) | MISSING | Saved source/collection probe; no fresh live acceptance |
| A6 | Document/PDF/XLSX ingestion with page-level evidence | PARTIAL | Document adapter is real and sources are populated, but there is no page-level evidence highlight, no detected-topics/orgs panel, no source quality score. |
| A7 | Integrations (Drive, Zoom, Teams, Meet, Sheets) | PARTIAL | Only Google Calendar + Gmail, via the gws CLI. No Drive, Zoom, Teams or Sheets connector, and no per-source ingestion rules. |
| A8 | WhatsApp Knowledge Connector | REAL | Saved source/collection probe; no fresh live acceptance |
| A9 | WhatsApp Ingestion Review (topics/decisions/dupes/sensitive) | MISSING | Saved source/collection probe; no fresh live acceptance |
| A10 | Meeting Bot (calendar connect, consent, auto-join) | STUB | All three joiners (vexa/browser/system-audio) are explicit stubs and the package is dead code imported by nothing. The page honestly self-labels as not live. Plan §10 U4.2. |
| A11 | Live Meeting Bot Monitor | MISSING | Saved source/collection probe; no fresh live acceptance |
| A12 | Web capture of public webinars (YouTube etc.) | MISSING | No probes; defaults MISSING |
| A13 | Watched Sources (bookmark + change-tracking + re-ingest) | MISSING | Schema + accessor + schedule code exist, but nothing ever calls them -- no scheduler runs, so the collection is permanently empty. Code without a caller is not a feature. |
| B1 | Mongo schema + deterministic validators | REAL | Saved source/collection probe; no fresh live acceptance |
| B2 | Migrate TOC sessions with turn-level citations | REAL | Saved source/collection probe; no fresh live acceptance |
| B3 | Speaker identity resolution (aliases, orgs, roles, confidence) | PARTIAL | The speakers collection is real and non-empty as of 2026-09-08 (2 documents, written by scripts/sync-speakers.mjs from real transcripts, each citing a real turn that contains the name verbatim). But this feature's own name is 'aliases, orgs, roles, confidence' and only aliases and confidence are emitted -- no org and no role is extracted at all. Coverage is also thin: 2 speakers against 88 distinct name strings in the corpus, resolving 78 of 494 positional turns (15.8%). The probe flips REAL on a non-empty collection alone, which over-credits exactly as the C2/C3 /ask-page probe did. Downgraded 2026-09-08 by the session that wrote the rows. Plan §10 U2.4. |
| B4 | Claim extraction with evidence[] | REAL | Saved source/collection probe; no fresh live acceptance |
| B5 | Vectorless tree index generator + incremental regeneration | REAL | Saved source/collection probe; no fresh live acceptance |
| B6 | Vector index for unstructured (hybrid semantic + keyword) | MISSING | Saved source/collection probe; no fresh live acceptance |
| B7 | Knowledge Graph (graph_edges) with confidence filter | MISSING | Saved source/collection probe; no fresh live acceptance |
| B8 | Knowledge Explorer tree UI (year->month->session) | PARTIAL | The Brain graph renders real tree_index nodes, but there is no year->month->session drill-down explorer and no overview/topics/speakers/orgs tabs. |
| B9 | Topic pages (coverage, risks, decisions, timeline) | MISSING | Saved source/collection probe; no fresh live acceptance |
| B10 | Speaker Intelligence profiles | PARTIAL | Speaker Intelligence PROFILES. The identity documents now exist, which is the input to a profile rather than the profile: no org, no role, no per-speaker topic or session rollup, no page. Recorded explicitly so the PARTIAL is a judged verdict with a reason rather than an artefact of whatever the probe happened to return. Downgraded 2026-09-08 by the session that wrote the rows. |
| B11 | Decisions & Action Tracker | MISSING | Saved source/collection probe; no fresh live acceptance |
| B12 | Collections builder (curated sets + answer scope) | MISSING | No probes; defaults MISSING |
| B13 | Program & resource directories | MISSING | Saved source/collection probe; no fresh live acceptance |
| C1 | POST /ask CRAG router (tree-search -> evaluator -> cited answer) | PARTIAL | Works end-to-end and citations resolve to real sessions, but retrieval is tree-only -- there is no vector layer, so the 'two indexes' hypothesis H1 is half-built. Plan §10 U1.5. |
| C2 | Ask AI UI (evidence mode, filters, history) | PARTIAL | The /ask page exists and drives a real question->answer flow, but this feature's own scope is not built: there is no evidence mode, no filters, no suggested questions and no history -- the page is a single stateless query box. The probe credits it REAL purely because a /ask page is present. Downgraded 2026-09-08 by the same session that shipped the page. Plan §10 U3.1 (its Playwright gate is also still unmet). |
| C3 | Answer page (confidence, internal-vs-web sources, follow-ups) | PARTIAL | Internal-vs-web source separation IS real and mutation-tested (contract qa/contracts/web-ask-page.md C4). The rest of this feature is absent: no retrieval-confidence display, no coverage verdict beyond a raw insufficient_coverage flag, no evidence excerpts, no follow-ups, no feedback control. One of three parts shipped. Downgraded 2026-09-08 by the session that shipped the page. |
| C4 | Evidence & Provenance Audit (claim -> turn -> recording) | REAL | Saved source/collection probe; no fresh live acceptance |
| C5 | Answer Policy Builder (YAML + simulator + versions) | MISSING | No probes; defaults MISSING |
| C6 | Conflicting Evidence Resolution | MISSING | No probes; defaults MISSING |
| C7 | AI Answer Review Queue | MISSING | No probes; defaults MISSING |
| C8 | Universal Search (sessions, moments, docs, decisions, speakers) | REAL | Saved source/collection probe; no fresh live acceptance |
| C9 | Unstructured Knowledge Search (structured + vector side by side) | PARTIAL | Saved source/collection probe; no fresh live acceptance |
| C10 | AI FAQ Builder | MISSING | No probes; defaults MISSING |
| C11 | Reports builder (exec summary / insights / decisions / risks) | MISSING | No probes; defaults MISSING |
| C12 | Meeting Preparation Brief | MISSING | No probes; defaults MISSING |
| C13 | Talk to your KB (real-time voice) | MISSING | No probes; defaults MISSING |
| C14 | 3D-avatar AI Knowledge Assistant | MISSING | No probes; defaults MISSING |
| D1 | Dashboard (sessions, coverage, knowledge health) | PARTIAL | Real stat tiles + recent sessions, but no coverage %, no internal-vs-web answer ratio, no knowledge-health score. |
| D2 | Activity & Knowledge Health (jobs, freshness, errors, retries) | MISSING | No probes; defaults MISSING |
| D3 | Knowledge Gaps Dashboard | PARTIAL | Saved source/collection probe; no fresh live acceptance |
| D4 | Usage & Value Analytics | MISSING | No probes; defaults MISSING |
| D5 | Notification Center, saved views, scheduled digests | MISSING | No probes; defaults MISSING |
| D6 | Google Sheet sync | MISSING | No probes; defaults MISSING |
| D7 | Counsellor eval harness (golden set, judge, leaderboard) | PARTIAL | compete routes + eval_runs are real, but T-021/T-022 were PASSed against a HEURISTIC proxy, not a real LLM -- the recall@5 >= 0.85 target and real judge calibration have never actually been met. Plan §10 U0.10. |
| D8 | Loss -> gap -> capture -> re-index -> re-run flywheel | MISSING | Saved source/collection probe; no fresh live acceptance |
| E1 | Multi-tenant hosting | MISSING | Saved source/collection probe; no fresh live acceptance |
| E2 | Auth, roles, permissions matrix, audit log | PARTIAL | Scoped API keys are real (hashed, revocable, per-tenant). There are no users, no roles, no permissions matrix and no audit log. |
| E3 | Developer API + scoped keys + webhooks | PARTIAL | Saved source/collection probe; no fresh live acceptance |
| E4 | Setup wizard | MISSING | No probes; defaults MISSING |
| E5 | Enterprise Security & Compliance (SSO/MFA, residency, DLP) | MISSING | No probes; defaults MISSING |
| E6 | Data retention / archive / exclusions / quotas | MISSING | Saved source/collection probe; no fresh live acceptance |
| E7 | Own-model training path | MISSING | No probes; defaults MISSING |
| F1 | Registration / application-form automation | MISSING | No probes; defaults MISSING |
| F2 | Ops task intake -> bot-monitored automations | MISSING | No probes; defaults MISSING |

## Appendix D — unpublished working-tree inventory

Tracked paths:

- M .goal/goal.json
- M TASKS.md
- M apps/api/src/gws-calendar.ts
- M apps/api/src/gws-gmail.test.ts
- M apps/api/src/gws-gmail.ts
- M apps/api/src/routes/calendar.test.ts
- M apps/api/src/routes/health.test.ts
- M apps/api/src/routes/health.ts
- M apps/api/src/routes/meeting-candidates.test.ts
- M apps/api/src/store.ts
- M docs/DECISIONS.md
- M docs/SNAPSHOT.md
- M docs/webinar-release.md
- M package.json
- M packages/core/src/generated/meeting_candidates.ts
- M packages/core/src/index.ts
- M packages/index/src/pipeline/claims.test.ts
- M packages/meeting-bot/py/sb_join.py
- M packages/meeting-bot/py/tab-capture/background.js
- M packages/meeting-bot/py/tab-capture/manifest.json
- M packages/meeting-bot/py/test_sb_join.py
- M packages/meeting-bot/py/test_sb_join_iframe.py
- M packages/meeting-bot/src/calendar/auto-join.ts
- M packages/meeting-bot/src/calendar/auto-record-policy.ts
- M packages/meeting-bot/src/calendar/calendar-client.ts
- M packages/meeting-bot/src/calendar/schedule-state.test.ts
- M packages/meeting-bot/src/calendar/schedule-state.ts
- M packages/meeting-bot/src/calendar/schedule-tick.test.ts
- M packages/meeting-bot/src/calendar/schedule-tick.ts
- M packages/meeting-bot/src/joiners/browser-joiner.ts
- M packages/meeting-bot/src/joiners/joiners.test.ts
- M qa/.last-tick
- M qa/contracts/gmail-meeting-candidates-approval.md
- M qa/contracts/structure-lint.md
- M qa/feedback-inbox.md
- M qa/issues.jsonl
- M qa/manifests/webinar-portable-release.md
- M qa/verdicts/webinar-portable-release.md
- M schema/meeting_candidates.schema.json
- M scripts/demo-live.mjs
- M scripts/gen-types.mjs
- M scripts/lib/ledger-union.test.mjs
- M scripts/lib/tracker-audit.mjs
- M scripts/lint-loc.mjs
- M scripts/lint.test.mjs
- M scripts/webinar/run-pipeline.mjs
- M scripts/webinar/run-pipeline.test.mjs
- M structure.config.json

Selected untracked code/QA paths:

- packages/core/src/domain/webinar-types.ts
- packages/index/src/eval/extraction.ts
- packages/meeting-bot/py/test_sb_join_ownership.py
- qa/checkpoints/iss-368-heartbeat-read-failure-is-not-health.md
- qa/manifests/iss-367-lint-structure-no-shortcircuit.md
- qa/manifests/iss-368-heartbeat-read-failure-is-not-health.md
- qa/manifests/ledger-duplicate-id-guard.md
- qa/manifests/t036-alias-label-intake.md
- qa/manifests/t052-executable-registration.md
- qa/manifests/t052-registration-acquisition.md
- qa/manifests/t052-registration-persistence.md
- qa/manifests/u22-extraction-measurement-harness.md
- qa/verdicts/iss-367-lint-structure-no-shortcircuit.md
- qa/verdicts/iss-368-heartbeat-read-failure-is-not-health.md
- qa/verdicts/ledger-duplicate-id-guard.md
- qa/verdicts/t036-alias-label-intake.md
- qa/verdicts/t052-registration-acquisition.md
- qa/verdicts/t052-registration-persistence.md
- scripts/eval-extraction.mjs
- scripts/webinar/source-discovery.test.mjs

## Appendix E — raw evidence and audit boundaries

- [inventory.json](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/inventory.json)
- [catalogue-current.json](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/catalogue-current.json)
- [catalogue-current.md](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/catalogue-current.md)
- [runtime-current.json](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/runtime-current.json)
- [memory-current.json](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/memory-current.json)
- [extraction-replay.json](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/extraction-replay.json)
- [tracker-audit-approved-context.json](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/tracker-audit-approved-context.json)
- [structure-check-approved-context.log](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/structure-check-approved-context.log)
- [catalogue-check-approved-context.log](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/catalogue-check-approved-context.log)
- [typecheck-approved-context.log](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/typecheck-approved-context.log)
- [contracts-check-approved-context.log](C:/Users/Lenovo/.codex/visualizations/2026/10/08/01a119f6-a9d6-7ec1-9ddf-4bfa39d8e7e4/knowledgebase-report-2026-10-09/contracts-check-approved-context.log)

Additional repo evidence: [webinar release](D:/KnowledgeBase/docs/webinar-release.md), [portable-release manifest](D:/KnowledgeBase/qa/manifests/webinar-portable-release.md), [T-052 manifest](D:/KnowledgeBase/qa/manifests/t052-executable-registration.md), [U2.2 manifest](D:/KnowledgeBase/qa/manifests/u22-extraction-measurement-harness.md), [golden-set verdict](D:/KnowledgeBase/qa/verdicts/golden-set-semantic-leg.md), [portable-release contract](D:/KnowledgeBase/qa/contracts/webinar-portable-release.md).

Project-generated docs were not regenerated in the shared working tree. No source edits, DB writes, provider calls, service starts, commits, pushes or deployment occurred for this audit. Sandbox typecheck failure was repeated successfully in approved context; raw failed sandbox log retained separately. Current counts were verified from repo/GitHub/artifacts; memory only routed goal/governance context (MEMORY.md 1275–1276; governance/goal-first rollouts 01a08592-19fc-7603-acfa-bf4f8a2bd917 and 01a08592-183b-78e3-b81e-8cef83915b04).
