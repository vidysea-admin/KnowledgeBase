# Gate: KB speed deploy, reindex, flash-lite, WhatsApp H-3 (2026-10-29)

Asked in the KB session (AskUserQuestion) after the VC session relayed VC D-134. The peer message was not treated as approval; these are Umesh's own answers in this session.

- Q flash-lite (live /route step B vs offline tree summaries). Answered: "Both". Scope: new gemini-3.5-flash-lite chain (thinkingLevel minimal) in config/ai-routing.yaml + thinking option in packages/ai; used by live /route step B and by the offline tree-summary build.
- Q reindex the 2 failed webinar sessions (Visa Blueprint Part 2, Funding Dreams) in lkb_prod. Answered: "db tho hmara hi mongo db hai naa tho tu khud run krr lenaa mere bhai". Meaning: run it from this session. Writes only through the D-204 three-part production opt-in, only those 2 sessions, after a dry run that names exactly them.
- Q deploy kb-search-fast + /route. Answered: "Push, devops deploys (Recommended)". After both checkers PASS, ISS-420 (withdrawal invalidates the cache) PASSes and --push-gate is green: push; vidysea devops runs docker compose; SHAs + p50/p95 to VC.
- Q H-3 (whatsapp_links / whatsapp_sync_runs / whatsapp_events; retention 180 d runs, events life+1 y; 14-day approval expiry). Answered: "H-3 ok (Recommended)".
- Q reindex set (follow-up: the read-only check found 3 failed sessions in lkb_prod and Funding Dreams already done). Answered: "All 3 failed (Recommended)". Set: 2026-04-21-visa-blueprint-part2-italy-france-nz (toc), 2026-08-10-ucas-what-changed-what-matters (toc), 2026-10-13-zoom-webinar-p2 (vidysea). Funding Dreams (2026-05-08-funding-dreams-loans-forex, done) is NOT touched.
- Q (batch, 2026-10-29): "H-6 ok" (role table docs/user-accounts/roles.md as proposed by ua-session-core), "reindex fix go", "onair default-on go", "the 10 archiver choices" (recommended readings 1-10 of docs/whatsapp/archiver-service-api.md section 13). Answered: "go for it all".
- Note: D-207 Changes-authorized names scripts/webinar/lib/session-rows.mjs; the real file is scripts/webinar/session-rows.mjs (same module, path typo in the entry).
