# Ledger triage (product, critical/high) - 2026-10-26

Checker Mode B, bound to D:/KnowledgeBase, HEAD 3233f747. Scope: 11 open critical/high rows. No product code, hook, setting, DECISIONS, contract or manifest was edited; only the ledger rows below.
Each row got a `retriaged_2026-10-26` field carrying the full evidence; verified/superseded rows also changed `status`.

| id | class | evidence |
|---|---|---|
| ISS-WAVECTORLESS-002 | STILL-OPEN | CAS in whatsapp/review/store.ts:43-75 (382e0c14), consent-cas.test.ts 7/7; but no real-Mongo race run and withdrawWhatsAppSourceConsent has no production caller |
| ISS-WEBINARRELEASE-001 | STILL-OPEN (partial) | T-040 closed 3/4 observations behind OFF-by-default --grounded-notes; buildNotes still returns decisions:[] actionItems:[] (process-video.mjs:120, re-run via node -e) |
| ISS-CAPTUREMAKER-001 | FIXED-VERIFIED | tab-startup-cleanup.test.ts 2/2 on HEAD; verdict t034-startup-owned-cleanup.md PASS |
| ISS-CAPTUREMAKER-002 | STILL-OPEN (unverifiable) | finalize-original-eof.test.mjs 5/5 ENOENT: retained corpus stale-duration-source.mkv (sha d07c93e9...) absent from tree; prior PASS verdict t034-original-private-eof.md; original-capture.test.ts 2/2 |
| ISS-CAPTUREMAKER-003 | FIXED-VERIFIED | tab-stop-cleanup.test.ts 3/3 on HEAD; caveat: manifest still in_progress, no Mode A verdict, no mutation run |
| ISS-U0-2 | SUPERSEDED | gate qa/gates/zoom-bot-signin.md answered + profile signed in (verified 2026-09-27); webinar passed; live failure was ISS-324, a different cause |
| ISS-U4BHB-003 | SUPERSEDED | D-053 option a + 5e3a6026/68f1a4e4 (core AlertSink, wired production.ts:75-81); depcruise no apps->meeting-bot violation; 14/14 tests; Dockerfile HEALTHCHECK probes /health |
| ISS-274 | FIXED-VERIFIED | D-041 ruling 2 + contract amendment 02b8343b; production.ts always wires tavilySearchFn; verdict iss-274-wire-web-fallback.md PASS; ask-web-fallback.test.ts 4/4 |
| ISS-283 | STILL-OPEN | run-results.jsonl still outerRun {1:11, 2:4}, no run 3; needs the live Ollama qwen3:8b 3-run regate |
| ISS-C-UNRUN-WRITERS-005 | FIXED-VERIFIED | D-020 (Approved-by Umesh) fix in mc-precommit.ps1:19-24; scratch two-repo repro: other lane not blocked, armed tree denied |
| ISS-366 | FIXED-VERIFIED | lint-codex-hooks.test.mjs 6/6, lint OK 6 pairs, CI-wired (lint-loc.mjs:35, ci.yml:95,104); residual: CI-time detection only |

HUMAN-GATED: none remain open. ISS-U0-2, ISS-U4BHB-003 and ISS-274 had Approver gates, all answered earlier (D-041/D-053/zoom gate).
Not proven here (live / external): real-Mongo concurrency (WAVECTORLESS-002, U4BHB write leg), live Tavily key, live Zoom join, Ollama regate run (283).
