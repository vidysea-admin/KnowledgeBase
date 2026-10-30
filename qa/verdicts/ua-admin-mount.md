# Verdict - ua-admin-mount (coordinator A of a dual check) - cycle 0
Date: 2026-10-30. Bound to D:/KnowledgeBase. Base cdc61b36, Head a956d368. Policy proportional-verification/2026-10-19.17. Cycle checked: 0
Contract: plan.md A6 CORE-REQUEST; manifest criteria M-1..M-3 (no qa/contracts file). Dual coordinator A; coordinator B's evidence not read.

## Check plan
Diff: 1 composition file (+7/-4), 1 test (+8), structure.config.json (dirsize override). Signals: auth/tenancy wiring (L, dual-trigger user-accounts.ts:141) -> read of changed lines, affected tests, falsification per changed criterion, security probe. api-only: no browser, no persona walk, no data audit. SERIAL: none needed (no shared port/DB; real Mongo not used, A6 mongo test is out of this diff).

## Evidence (I ran all of it)
- M-1 admin-router.test.ts at a956d368: 21/21 pass (includes `[A6 wiring]`).
- M-1 differential probe (scratch copy, fake Db, real adminRouter over buildUserAccounts, req.auth stubbed as active admin): POST /admin/users/:id/unlock -> 200 {cleared:true}; its auth_throttles deleteMany filter equals the one `auth.unlockEmail(" Member@X.org ")` issues (same HMAC subjectHash, same tenant). POST issue-link -> 200 `https://kb.example.org/knowledgebase/reset#...` (publicOrigin and basePath wired). Probe: qa/evidence/ua-admin-mount/probe-mount.test.ts.txt.
- subjectHash identity by reading: auth-service.ts:107 defines subjectHash (HMAC keyed by csrfSecret), returned at :135; A4 throttle writes and unlockEmail (:315) use it on parseEmail().email; admin-service.ts:277 calls the injected one on target.emailNormalized (stored as parsed.email, :158); both stores write the same `auth_throttles` collection (user-accounts.ts:106, admin-service.ts:324). Same function, same input form.
- M-2 principal/auth-router/auth-service/throttle tests: 48/48 pass.
- M-3 `pnpm -s lint:structure`: OK, 10 stages 0 failed; `tsc --noEmit -p apps/api`: exit 0. Dir holds exactly 34 files; budget 34 is tight.
- Boundary: mountUserAccounts unchanged (`ua.adminRouter ?? placeholder`), /admin still behind requireAuth(keyStore, session) and a terminal 404. buildUserAccounts has no production caller (server.ts:106/135 only take deps; confirmed open point 1), so production exposure is unchanged by this unit.

## Falsification (isolated copies, junctions to bound read-only dirs, per-mutation byte backup, restored, `git hash-object` == HEAD blob d66cc39e each time)
| id | criterion | mutation | before | after |
|---|---|---|---|---|
| F1 | M-1 | drop `adminRouter` from returned runtime | 22/22 green | `[A6 wiring]` red (assertion) |
| F2 | M-1 | `subjectHash` replaced by a constant function | 22/22 green | repo tests STILL GREEN; only my probe red |
| F3 | M-1 | drop `publicOrigin` | 22/22 green | repo tests STILL GREEN; only my probe red |
| F4 | M-3 | remove / lower the dirsize override (in-memory config) | [] | "34 files (budget 30)" / "(budget 33)" |
Floor met (one named falsification per changed criterion: M-1 F1, M-3 F4; M-2 is a no-regression criterion with no changed behaviour). F2/F3 are extra scrutiny and show a pinning gap, not a defect.

## Findings (non-blocking)
PROPOSED-ISSUE: {"id":"P1","sev":"medium","class":"test-gap","file":"apps/api/src/user-accounts/admin-router.test.ts:386","summary":"[A6 wiring] asserts only typeof ua.adminRouter === 'function'. The manifest's M-1 claim that subjectHash is auth.subjectHash (so unlock deletes exactly the A4 throttle row) and that publicOrigin/basePath are passed is pinned by no committed test: replacing subjectHash with a constant, or dropping publicOrigin, leaves all 21+48 tests green. A wrong subjectHash would make admin unlock a silent no-op (locked user stays locked, audited as unlocked).","fix_direction":"add an assertion in a composition test that drives the built adminRouter unlock with a fake Db and compares the deleteMany filter with ua.auth.unlockEmail's (probe in qa/evidence/ua-admin-mount/ does this), and one issue-link origin assertion. Candidate, not a unit now; before ua-production-enable."}
PROPOSED-ISSUE: {"id":"P2","sev":"low","class":"doc","file":"qa/manifests/ua-admin-mount.md","summary":"Manifest says 'head be587455' but the dispatched head is a956d368 (bookkeeping commit on top; product diff identical). Not a defect."}

## Return block
VERDICT: PASS
SCOREBOARD: 3/3 criteria met, 3/3 invariants hold (tenancy scope unchanged, /admin behind requireAuth, throttle key identity)
TIER: L (auth wiring apps/api/src/composition/integrations/user-accounts.ts:141; dual-trigger line present and valid)
FAILURES: none. Non-blocking: P1 (medium, test-gap), P2 (low, wording)
CAPABILITY-COVERAGE: not-applicable (api-only wiring, no UI)
LIVE-BROWSER: not-applicable (apps/api/src/composition/integrations/user-accounts.ts)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only)
EXECUTOR: claude-opus (checker: claude-sonnet-subagent)
EXPLANATION: The three-line wiring is correct: the real adminRouter built by buildUserAccounts unlocks with the same HMAC throttle key A4 uses and builds links from APP_PUBLIC_ORIGIN + APP_BASE_PATH; no regressions, budget green, no production caller so no new exposure. The unit's own test pins only the router's existence, so subjectHash/origin wiring regressions would go unnoticed (P1).
Metrics: start=2026-10-30T05:05:00Z end=2026-10-30T05:40:00Z wall_min=35 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2100 mutants=2 defects_unit=0 defects_6c=0
slow: n/a (L tier, within 45 min)
