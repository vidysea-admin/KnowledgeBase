# Verdict - claims-citable-needs-review (Mode A + Mode D, cycle 0, browser re-dispatch)
Cycle checked: 0
Checked head: 23abaab127258d5044cc04c18248b3e5c4bce153 (code commit 6d2d9366; base 4a94d2115ded94f0b21d1a9e3c7be3b531cadeb1). Branch HEAD at check 93becc4e differs from 23abaab1 only in qa/verdicts + qa/checkpoints (verified `git diff --stat 23abaab1 HEAD`: 2 qa files, 0 product/test files).
Policy-Version: proportional-verification/2026-10-19.17
Prior verdict (BLOCKED-CAPABILITY, browser) kept at qa/verdicts/claims-citable-needs-review.r0-1.md.

## Check plan (step 0)
Scope of this dispatch: only the Mode D live-browser check was missing. Criteria C1-C6 and I1-I2 reuse the cycle-0 checkpoint under evidence identity: every product/test input is unchanged since 23abaab1 (git diff above), no config/dependency change, same node/vitest environment, original checker attribution claude-sonnet-subagent, results in qa/checkpoints/claims-citable-needs-review.md (45/45 + 27/27 + web 1/1, gen:types OK, tsc x3 0, 7 falsifications red-after with hash-verified restores, digest differential identical). Nothing invalidated, nothing rerun. Mode D instrument: own visible Google Chrome (non-headless) driven over CDP with real mouse events, fresh profile (the playwright MCP and claude-in-chrome were not connected; per the dispatch a self-owned driver is the capability).

VERDICT: PASS
SCOREBOARD: 6/6 criteria + 2/2 invariants evidenced; Mode D live-browser check completed (C3 web half now independently verified in a real browser)
TIER: M (multi-file behaviour, public API shape, additive schema field; no concrete L trigger cited)
FAILURES: none
CAPABILITY-COVERAGE: 6/6 floor falsifications (reused, identity unchanged) + live browser interaction on the changed UI surface
LIVE-BROWSER: qa/evidence/browser-claims-citable-needs-review-2026-10-28-checker/report.json (screenshots 01-03 alongside; driver.mjs, harness-server.ts, pids.txt). Console errors: 0 on knowledge-outputs, 0 on session (citation target) page, 0 on reopen; the first of two runs logged exactly 1 `favicon.ico` 404 from the vite dev server (not product code), the final recorded run 0.
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (manifest: claude-sonnet-subagent)

## Mode D (checker-run, head 23abaab1 product code)
Stack: REAL apps/web KnowledgeOutputsPage + SessionDetailPage served by vite (:5191, VITE_API_BASE_URL -> :3391). API: a checker-owned harness (harness-server.ts) mounting the REAL requireAuth + createOutputRouter + createOutputService (evidence builder, synthesis, validator, markdown) with an in-memory repository, a synthetic 3-claim source reader (c1 verified, c2 needs-review, c3 conflicting; 3 turns, 3 speakers) and a fake model provider. No Mongo, no lkb_prod, no live server, localhost only. Disclosed substitution: the repository/reader/provider are fakes (as in the accepted u22 Mode D); the code under test for C1-C5 is real.
Interactions performed and asserted (real mouse click on "Generate draft" and on the citation link):
1. Create form: source session listed, title/purpose filled, session ticked -> Generate draft -> draft rendered (status "AI draft . revision 1 ...", "Coverage is partial", "1 source claims were excluded" = the conflicting claim c3; its text "Transcripts are waived" is NOT shown).
2. Two citations rendered. e(verified, c1): "Admissions expert . 3-9 seconds" -> hasMarker=false. e(needs-review, c2): "Financial aid officer . 40-52 seconds **Unverified (needs review)**" -> hasMarker=true. Page-wide marker count = 1. Verified cited first (C4 order). Screenshot 02.
3. Real Download Markdown click (blob captured): markdown has exactly 1 line with "Unverified (needs review)" = the c2 citation line; the verified citation line carries none (C3 markdown half, end to end through the real export route).
4. Real click on the needs-review citation link -> /sessions/s1#turn-t2: session page shows the transcript with the cited turn t2 highlighted (border rgb(183,121,31) vs rgb(229,229,224) for others), in viewport, no "cited passage was not found" note, showing speaker "Financial aid officer", timestamp "40s-52s" and verbatim "Scholarship forms are due on the fifteenth. Bring two references." Screenshot 03.
5. Reopen from Saved drafts: marker count 1 (persisted citations keep claimStatus).
Network log (harness `__seen`) shows only the expected routes; no request to any host but 127.0.0.1.

## Falsification (reused, cycle 0 checkpoint; inputs unchanged)
C1 gate widened -> RED fail 2; C2 schema field removed -> RED 8+; C3 api marker removed -> RED 1; C3 web marker removed -> RED (jsdom); C4 rank sort removed -> RED 2; C5 early refuse removed -> RED 2; C6 graph-context filter narrowed -> RED 3 (unmodified pins). Restores hash-verified in cycle 0. Mode D adds a browser-level red/green for C3 web: the marker appears for needs-review only and is absent for verified in the live DOM.

## Notes (non-blocking, low; carried from the prior verdict, no ledger write)
1. Surviving mutants (test-strength only, real code correct): digest-compat form not pinned by the "legacy citations" test; `withoutDefaultStatus` stripping needs-review not independently pinned; `hasUnverifiedCitation` in service `refusesDraft` redundant with coverage check (defense in depth).
2. Mode D used a harness API (fake repository/reader/provider) rather than a Mongo-backed demo stack; production reader paths are untouched by this diff (reader.ts diff empty).
3. The manifest "Live browser evidence: SKIP" line is superseded by this verdict's LIVE-BROWSER evidence.

EXPLANATION: All six acceptance criteria and both invariants are evidenced: C1-C6/I1-I2 by my own cycle-0 re-runs and red-after falsifications, still valid because no product or test input changed since 23abaab1, and the UI half of C3 (plus the end-to-end export marker, the verified/needs-review contrast, ordering and the citation-to-evidence-turn click) by a live visible Chrome run I drove myself with real input events and 0 product console errors. Nothing was found that violates a contract line. PASS.

Metrics: start=2026-10-28T13:00:00+05:30 end=2026-10-28T13:25:00+05:30 wall_min=25 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1500 mutants=0 defects_unit=0 defects_6c=0
slow: harness-and-driver-authoring 12 (no browser tool connected; own CDP driver, vite and API harness written and run twice)
