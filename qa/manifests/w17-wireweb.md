# w17-wireweb

Status: checked-PASS
Fix cycle: 0
Base SHA: a0391420451b3a1f465d0862378cec3492f0133f
Candidate SHA: see git log of branch lane/w17-wireweb (single commit)
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-wireweb, branch lane/w17-wireweb

Authorization: Approver in chat 2026-10-17: "Umesh approves the central wiring lane in composition/server/App: championship composed verifier, T-052 caller, T-042 tile-suggest, T-056/T-054/T-008 routes."

## Findings
All pages already existed and were already routed in apps/web/src/App.tsx behind LoginGate. Only nav gap: /extraction-review.
- T-056 answer policy/review: /ask, /answer-policy, /answer-policies, /answer-review -- mounted, nav present. API paths match routers (answer-policy/admin-router.ts, answer-router.ts, routes.ts).
- T-054 transcript review: /transcript-review(/:id) -- mounted, nav present; web calls /sessions/:id/transcript-review, API mounts /sessions/:sessionId/transcript-review (composition/integrations/routes.ts:81).
- T-008 knowledge outputs: /knowledge-outputs -- mounted, nav present; matches knowledge-outputs/router.ts.
- U2.2 extraction review: /extraction-review -- route was mounted, nav link MISSING; added. Matches extraction-review/router.ts.
- Championship: /championship mounted, nav present; matches routes/championship.
- Pages are eagerly imported in App.tsx (existing pattern; no lazy loading exists). Not changed.

## Changed paths
- apps/web/src/layout/NavSidebar.tsx (one nav item)
- apps/web/src/App.wiring.test.tsx (new; 18 tests: route declared once, signed-out shows only gate + no fetch, signed-in renders in shell with active nav link)
- qa/manifests/w17-wireweb.md

## Evidence
- vitest App.wiring + App.routes: 2 files, 21 tests pass.
- vitest pages extraction-review, championship, transcript-review, knowledge-outputs, answer-policy, layout: 13 files, 69 tests pass.
- tsc --noEmit apps/web: exit 0, no output.
- lint-loc --all: stage loc OK (1704 files). Stage dependencies fails with 897 no-unresolvable-workspace-import errors (e.g. packages/meeting-bot -> @lkb/ingest); these come from the lane's node_modules junction and none involve touched files. Not re-run on main.
- D-020 mutation: LoginGate `if (apiKey || true) return children;` with per-mutation backup + trap: 6/18 wiring tests fail (killed). Restored: cmp OK and git hash-object == HEAD blob.
- Not run: browser/e2e; apps/api untouched.
