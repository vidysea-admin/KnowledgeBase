# Verdict: w17-wireweb

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: c1a6b61342d9a8ee9ebead571e45501467ce9d75
Base SHA: a0391420451b3a1f465d0862378cec3492f0133f

## Diff verified (git diff base candidate)
NavSidebar.tsx +1 nav item (/extraction-review), App.wiring.test.tsx new (18 tests), qa/manifests/w17-wireweb.md. App.tsx unchanged.

## Claim 1: already mounted behind LoginGate -- CONFIRMED
App.tsx (unchanged since base) has all routes inside AuthProvider > LoginGate > BrowserRouter > AppShell > Routes: /answer-policy, /answer-policies, /answer-review, /ask (T-056); /transcript-review(/:id) (T-054); /knowledge-outputs (T-008); /extraction-review (U2.2); /championship. Web paths vs apps/api mounts all match (mountIntegratedWorkflows is called at server.ts:127, after requireAuth at :124):
- /extraction-review, /items/:id, /export -> extraction-review/router.ts
- /championship, /:id, /:id/freeze, /:id/trials; /compete/:id/score -> routes/championship, routes/compete
- /answer-policies*, /answer-reviews*, /answer-history*, /answer-evidence-conflicts* -> admin-router.ts / answer-router.ts; /answer-policy/simulate(-yaml) -> answer-policy/routes.ts
- /sessions/:id/transcript-review -> transcript-review/router.ts; /knowledge-outputs -> knowledge-outputs/router.ts

## Claim 2: humanGold-writing path auth -- OK
extraction-review POST /items/:id goes through the shared requireAuth perimeter, then router execute(): 401 without req.auth, 403 unless scope "compete", and 403 unless contextFor() returns canReview===true and reviewerKind==='human' for the same tenant; no deps -> 503. The web client sends the bearer key via apiFetch. LoginGate is only UX (its own comment says so); the server enforces.

## Checks (own runs, exit codes captured in scratchpad ww-*.exit)
- vitest App.wiring.test.tsx + App.routes.test.tsx: exit 0, 2 files, 21 tests pass.
- tsc --noEmit -p apps/web/tsconfig.json: exit 0, empty output.
- Mutation A (delete the /extraction-review nav item): 1/18 fails (extraction-review signed-in nav link). Killed.
- Mutation B (LoginGate `apiKey || true`): 6/18 fail (all signed-out gate tests). Killed.
- Per-mutation byte backup, trap on INT/TERM/ERR, restore, cmp OK. HEAD fidelity: git hash-object == rev-parse HEAD:<file> for NavSidebar.tsx (0f03fab1...) and LoginGate.tsx (7fbb07da...).

## Claim 5: lint-loc dependencies stage -- ENVIRONMENT GAP, confirmed
`node scripts/lint-loc.mjs --all`: w17-integrate (0ec3319d, descends from base) exit 0, 0 no-unresolvable-workspace-import errors. w17-wireweb exit 1, dependencies stage exit=897 (all no-unresolvable-workspace-import, e.g. packages/meeting-bot -> @lkb/ingest). Cause: w17-integrate has 9 per-package node_modules junctions (packages/*, apps/*); w17-wireweb has only apps/web (1). Other stages (loc, dirsize, root, dupes, migrations, tracker) identical and OK. The change touches no packages/ imports, so this is not attributable to the unit. Receipt to be re-run on a fully junctioned tree at integration.

## Findings
None. ISSUES-WRITTEN: none.
Low note: the wiring test checks route declaration by regex on App.tsx source; adequate given the render tests.

## Ledger
Ledger rows for this unit may be flipped to verified.

## Not verified
Browser/e2e; full web suite; apps/api tests (untouched); lint dependencies stage in this lane (env gap above).
