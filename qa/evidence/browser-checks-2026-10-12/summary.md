# Browser checks 2026-10-12 (D-024 live-browser run, Approver-authorised)

Browser: system Google Chrome via Playwright (headless, channel chrome; Playwright from the Codex runtime node_modules; no downloads). Web: Vite dev server of this worktree's apps/web on 127.0.0.1:5180. Console/pageerror and non-loopback requests (aborted) were recorded: 0 console errors, 0 external requests.

## Backend: FIXTURE, not the real API and not a database
The work Mongo (127.0.0.1:27019) never came up and the remote-Mongo route was withdrawn. A tiny fixture HTTP API (scripts/fixture-api.mjs, 127.0.0.1:3391) serves real transcript content from data/toc-migrated (4 sessions) in the shapes apps/web consumes. /ask is a deterministic stub (no model), join-rules is in memory. So these runs prove browser rendering, routing, forms and CORS fetch behaviour of the web pages. They do NOT prove the real API, Mongo stores, retrieval/ranking, real Ask answers, the ETag/412 path (absent at this HEAD) or production join-rules wiring (not delivered at this HEAD). Keys in the run are the fixture strings fixture-ro/fixture-rw (not real secrets).

## Results (run-output.txt, results.json; screenshots/)
Ask: heading+input, answer rendered, internal source link, web sources separate, click-through to real session detail with timestamped turns: PASS. Citation shows speaker+timestamp on the Ask page: FAIL/observation (page cites sessions only; not required by contract) -> ISS-BROWSERCHECK-002.
Search: global bar on /sessions (role=search), submit -> /search?q=visa, results with title/Speaker/time range/quote, bar mirrors URL, Open transcript -> /sessions/<id>#turn-..., no-match message: all PASS.
Meeting bot: headings Upcoming meetings on the calendar / Live now / Webinar operations / Past recordings, retention text, no alerts: PASS.
Join rules: load, add+edit rule, Save disabled when clean, Save persists across reload, matcher-less rule blocked with a problem list, approvals section, read-only without scope: PASS. 412 dialog: N/A (no ETag API). -> ISS-BROWSERCHECK-001 (mint scripts lack join-rules scope).

## Not checkable without a real backend
Real Ask answer quality/citations from the corpus, real search ranking, live webinar operations/retention data, the real join-rules store, ETag/412 conflict dialog.

Note: Vite may have refreshed its dependency cache under apps/web/node_modules/.vite (junction to the main checkout); no package files were changed.
