# Verdict B — ua-production-enable (coordinator B, blind)
Date: 2026-10-30 · Base 0f565734 · Head 2ae928e5 (product files identical to e9600960; 2ae928e5 adds only the manifest) · Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17 · Tier L (auth: apps/api/src/composition/production.ts:265) · Dual check, coordinator B (no ledger rows written, no goal task closed)
Project bound: D:/KnowledgeBase/.worktrees/ua-prod-enable · API-only, no browser walk · Real Mongo not used (no criterion needs it; in-memory Db double is the manifest's declared design)

## Check plan
1. Read full product diff (production.ts, watch-runs.ts, both test files) + user-accounts.ts composition/mount.
2. Re-run P-1..P-4 commands in a throwaway `git archive 2ae928e5` copy outside the bound tree (the worktree has no node_modules; the bound tree was only read).
3. One falsification per criterion in the copy, per-mutation backup + trap + HEAD-fidelity (CRLF-normalised blob hash).
4. Byte-compare the moved watch helpers against base. tsc, lint:structure, dependency cycle check.

## Results
- P-1 PASS. production.test.ts + mounted-routes.test.ts: 12 pass / 0 fail. Secret set (48 bytes): userAccounts defined, authRouter and adminRouter are functions, /auth/no-such-route 404, anon /admin/users 401, key without user-admin 403. Secret unset or 12 bytes: undefined, /auth 401 (not mounted), valid key still authenticates, anon 401. Falsify: delete `userAccounts:` line -> P-1 positive test red (pass 5 / fail 1). Second mutant (force a usable secret into buildUserAccounts) -> the "unset leaves API keys unchanged" test red (5/1).
- P-2 PASS. Anonymous 401, API-key POST (key holds user-admin) 403 `admin_session_required`, admin session 200 via real createServer. Falsify: drop `requireAuth(keyStore, ua.session)` from the /admin mount -> P-2 and P-3 red (4/2).
- P-3 PASS. 8 failed A4 logins -> exactly 1 locked throttle row keyed by `auth.subjectHash`; router unlock -> 200 cleared:true, row count 0, `unlocked` event; issue-link starts with `https://kb.example.org/knowledgebase/`. Falsify: `subjectHash: () => "mutant"` -> P-3 red (5/1); `basePath: ""` -> P-3 red (5/1). Only P-3 fails in each.
- P-4 PASS. Consumer files watch-runs, watch-silence, health, watched-sources: 49 pass / 0 fail (unchanged files). Removed block in production.ts vs added block in watch-runs.ts compared programmatically (CRLF-normalised): identical except `export` on `createMongoWatchStateReadDeps`. Both call sites in production.ts (lines 171, 175) are the only users; no other importer. tsc --noEmit (apps/api) exit 0, no output. lint:structure in the bound tree: loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker all OK (production.ts within budget); `dependencies` stage cannot run in the node_modules-less worktree (env, exit 1), so cycle-freedom was shown by import trace (watch-runs -> routes/health.ts imports only express; user-accounts.ts/logger.ts never import production.ts) and a depcruise run over composition+activity-health+routes that reported zero `no-circular` violations.
- Security read of the changed lines: with AUTH_CSRF_SECRET unset `buildUserAccounts` returns undefined before touching the db (no behaviour change; one warn line per call, declared). With it set, session/auth store constructors only call `db.collection(...)` on the lazy proxy, so construction needs no live Mongo (P-1 test builds production deps with the secret set and no Mongo). Mount order unchanged: /auth and /admin before the shared perimeter, each ending in a terminal 404. No new defect found.
- Falsification floor met: 7 mutants (cap 10), all restored; HEAD-fidelity of production.ts, user-accounts.ts, watch-runs.ts verified (CRLF-normalised blob hash == `git rev-parse 2ae928e5:<file>`). Bound tree untouched (`git status` clean before verdict).

PROPOSED-ISSUE: {"severity":"low","type":"test-gap","criterion":"P-4","title":"TS watchHeartbeatIntervalMs 1-hour fallback is unpinned: mutating it to 1234 ms survives all 49 consumer tests plus production.test.ts (16 pass); the drift pin in watch-silence.test.ts covers only scripts/watch/lib/heartbeat.mjs","evidence":"mutant in a copy, restored, HEAD-fidelity OK","note":"pre-existing function body moved byte-identically; not caused by this unit","fix_direction":"one test asserting createMongoWatchStateReadDeps().heartbeatIntervalMs === 3600000 with WATCH_HEARTBEAT_INTERVAL_MS unset"}
PROPOSED-ISSUE: {"severity":"low","type":"process","criterion":"P-4","title":"lint:structure `dependencies` stage exits 1 in a fresh worktree without node_modules, so a checker cannot reproduce the manifest's 'all 10 stages OK' there without linking node_modules","fix_direction":"document or script node_modules linking for worktree checks"}

VERDICT: PASS
SCOREBOARD: 4/4 criteria met, 3/3 invariants hold (moved-helper identity, unset-secret API-key behaviour, mount order)
TIER: L (auth composition, production.ts:265 enables /auth and /admin when AUTH_CSRF_SECRET is usable)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api-only)
LIVE-BROWSER: not-applicable (apps/api/src only)
ISSUES-WRITTEN: none (dual coordinator: 2 PROPOSED-ISSUE lines above, P1 and P2)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: All four criteria reproduced independently in a clean archive of 2ae928e5, each falsified by a mutant that turned the named test red; moved watch helpers are byte-identical apart from one `export`. Wall time ran past the 45-min L target (about 65 min by file timestamps, much of it fighting the node_modules-less worktree) but every mandatory check completed, so this is PASS, not CONTINUE-NEEDED.
Metrics: start=2026-10-30T04:55:00Z end=2026-10-30T06:02:00Z wall_min=67 agent_min=67 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=4020 mutants=7 defects_unit=0 defects_6c=0
