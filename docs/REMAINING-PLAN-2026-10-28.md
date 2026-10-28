# Remaining work: build plan (2026-10-28)

Source: read-only plan sweep at HEAD 80b8db43 (branch docs/devops-golive-2026-10-26). Nothing here is approved for building until Umesh picks it. File lists marked [guess] are not verified.

## State
- Done and merged: claims-citable-needs-review (10635a57), gemini-web-fallback (1db871d1), ask-fast-rag (b348ab8b). codex/calendar-bot-completion is already merged (39a69280 is an ancestor of HEAD).
- goal.json: 95 tasks: 55 done, 39 in_progress (built in slices, not live-accepted), 1 blocked (T-015, excluded).
- Ledger, union of qa/issues*.jsonl: 14 high (5 product), 111 medium, 202 low, 0 critical.
- Nothing pushed: the branch is 94 commits ahead of origin's copy. The server runs old code. There is no SSH from the dev box.

## Wave 0: human / ops gates (Umesh)
- H1 URGENT Mongo: firewall 27017, create the lkb_app user, enable authorization, update MONGODB_URL on the server and bot machine, audit the ransom-note host.
- H2 .env.t028 on the server (all 5 vars or none).
- H3 GEMINI_API_KEY on the server (D-202; Tavily optional).
- H4 WhatsApp Mongo URL/DB set, or hide the page.
- H5 Cutover: when the pipeline writes lkb_prod; approve reindexing the 2 FAILED sessions.
- H6 Push + PR to master + redeploy (`git pull && docker compose build api web && docker compose up -d api web`).
- H7 Answer the open gates: iss-346-slug-collision, maker-predicate-canonical-field, mc-sessionstart-round-cap, unmerged-worktree-inventory (zoom-bot-signin, u2-live-repair if still wanted).
- H8 JOIN_RULES_ENFORCE policy and multi-mailbox calendar scope before the bot is turned on.

## Wave 1: gates and live fixes (file-disjoint, parallel)
| id | goal | files | dep | decision |
|---|---|---|---|---|
| G-A1 | Unconfigured integrations return 503 "not configured"; mount the connector-workflow router | apps/api/src/server.ts, routes/whatsapp*, routes/connector-workflow* | - | no |
| G-A2 | Web polish from the live audit (login 401 msg, /knowledge/profiles, /analytics, graph empty state) | apps/web/src/... | - | no |
| G-B1 | lint:structure must not short-circuit; .test.mjs in testPatterns; regenerate SNAPSHOT | package.json, structure.config.json, scripts/lint-*.mjs | - | no |
| G-B2 | A heartbeat read failure must not report "all fresh" (iss-368) | apps/api/src/routes/health.ts | - | no |
| G-B3 | Ledger duplicate-id guard over the union of issues*.jsonl | scripts/tracker-audit* | - | no |
| W2 | Check + merge wave/vector-gap-durability (ISS-122) | apps/api/src/indexing/*, ingest-store.ts, whatsapp-store.ts | - | no |
| W-AFR | ISS-AFR-001..004: /ask verdict, web fallback, abstain, deadline orphan | apps/api/src/routes/ask/*, packages/ask/src/* | - | no |
| W-S | Speaker-rules test split, then narrow place signal (ISS-104 corpora) | packages/index/src/pipeline/speaker-name-rules* | split first | no |
| X3 | Branch/worktree cleanup (merged ones; archive-tag stale) | git only | H7 | yes (delete) |

## Wave 2: high-risk product fixes (full ceremony)
- W6 ISS-WAVECTORLESS-002: consent-withdrawal vs approval CAS (after W2) [decision: schema owner]
- W7 ISS-CAPTUREMAKER-002: consent clock bound before lean media normalize [guess files]
- W8 ISS-WEBINARRELEASE-004: sb_join.py orphan cleanup must not kill neighbour Chrome profiles
- W9 ISS-WEBINARRELEASE-001: structured Q&A + grounded decisions/actions
- W10 ISS-WEBINARRELEASE-002: provider degradation blocks "ready" (after W2)
- W11 ISS-WEBINARRELEASE-003: durable webinar gaps visible in API/UI (after W10)

## Wave 3: R1 operational release (bot joins meetings)
- R1-a T-036/T-037 calendar discovery + join rules: enable the D-192 calendar worker, a discovery-only run on the real inbox, then enforce (deps H2, H8; decision: attendanceMode)
- R1-b T-038/T-039 scheduler + send-now launcher (deps H2, W8)
- R1-c T-034/T-035/T-011 tab capture + live bot (deps W7, W8; decision: bot host Ubuntu vs Windows)
- R1-d T-052/T-053/T-045 registration, connector intake, sources
- R1-e T-060/T-061 hosting, roles, audit, automation

## Wave 4: R2 complete usable KB
R2-a T-044/T-043 QA clamp (D-119 decision) + live /ask cited proof · R2-b real-LLM extraction + golden set + eval baseline (T-022: 30 human reviews) · R2-c post-processing (OCR, speaker tiles) · R2-d review/knowledge/ops UI · R2-e eval->gap->reindex flywheel · R2-f WhatsApp claims + vectorless acceptance.

## Wave 5: R3 counsellor product (lowest)
T-058 builders · T-013/T-014 on Umesh's word · T-028 deferred · T-015 excluded.

## Branch triage
- Delete: iss392-v2-refusal-coverage, iss394-api-acl-timeout-retry.
- Merge: wave/vector-gap-durability (W2).
- Fold the race test into W6: wavectorless002-cas-race.
- Decide: wave/u2-4-phase3-fix (resume vs archive).
- Archive-tag: lane/a-speakers, backup/local-wip-2026-10-26, codex/machine-migration-alerts-2026-10-09.
- Keep until gates answered: iss-346 worktree.
