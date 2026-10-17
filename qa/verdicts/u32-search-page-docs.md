# Verdict - u32-search-page-docs

VERDICT: PASS
Cycle checked: 0
Checked commit: 0d22ce79 (lane/u32docs)

EXPLANATION:
- Facts verified against the code: routes (/search, /sessions, /sessions/:id in App.tsx); GET /search is lexical-only (lexicalSearchTurns), requires scope `search`, answers 400 on blank q, k default 10 and max 50; tenant comes from req.auth.tenantId with no client tenant parameter; the 512 cap lives in query.ts and as input maxLength, and neither the API nor the client bounds length otherwise; the bar renders only with an apiKey (returns null otherwise); the client sends k=20 and accepts 1..50. Evidence figures (751 of 1905 chunks, P1 pending, Vite 500 FAIL) match the evidence README. ISS-U32LIVE-001 and -002 exist in qa/issues.u32live.jsonl as open, low. U3.2 is in_progress in goal.json. Every relative link in the docs resolves (0 MISSING).
- Structure: intent.md, spec.md and plan.md, the same three names as docs/features/u4-watch-dashboard/. The headings differ from u4's (Problem/Outcome vs the Requirements style), but u4 is itself a draft and the content is equivalent. Not blocking.
- lint-loc --all on the main tree, read-only: 10 stages, 0 failed. The lane's two failures come from a missing node_modules/json-schema-to-typescript in the worktree (the package is present in the main tree and absent in the lane), so this is a worktree gap and not caused by the docs.

Notes (non-blocking): spec.md says "verified at main HEAD c2d9db9a", but the lane base is c7b09b87. The commits in between are not code changes to apps/web or apps/api, so the claims hold. Not covered by any evidence, as the docs themselves state: a 403 for a key without the scope, and a production build.

ISSUES-WRITTEN: none
