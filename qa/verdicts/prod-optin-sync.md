# Verdict — prod-optin-sync
**Cycle checked:** 0
**VERDICT: PASS**
**Checker:** A (blind dual coordinator, fresh, bound to D:/KnowledgeBase, worktree .worktrees/prod-optin-sync)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** e99c9011..ce5d03db (product code at 2e4c33f3; ce5d03db adds only the manifest). Blobs: sync-session.mjs c7e7a18a, db-guard-paths.test.mjs 5f40f452 (match manifest pre-check identity).

## Independent evidence (re-run by checker, one file per invocation, timeout 300-400s)
- db-guard-paths.test.mjs: 18/18 pass (13 existing + 5 new). script-db-guard 14/14, transcript-provenance 15/15, turn-timing 7/7, graph-finalize 5/5, plan 5/5 (R1 green).
- C1: reading sync-session.mjs:167-171, production branch needs flag AND workDb==="lkb_prod" AND trimmed MONGODB_DB==="lkb_prod", then shared requireScriptDatabase(..., {allowProduction:true}); test C1 spawns the real script against a never-answering local listener and asserts a connection attempt.
- C2/C3: refusal cases (flag missing, `=true` spelling, MONGODB_DB unset/lkb/LKB_PROD, MONGO_WORK_DB not lkb_prod, global_university_db) all exit non-zero with the old messages, no production line, zero connection attempts. The `else` branch (172-177) equals the base guard block byte-for-byte apart from indentation (diff read).
- C4: shared helper reused (transcript-provenance.mjs:158); without allowProduction the helper falls to requireLegacyUnboundDatabase (refuses lkb_prod). C5: non-prod work DB passes with and without flag, no production line.
- C6: exactly one `PRODUCTION WRITE ENABLED (D-204)` line asserted. C7: isProtectedWorkDbName list literal intact (transcript-provenance.mjs:92-95, diff shows file untouched); `grep allowProduction scripts` shows only pre-existing users, sync-session is the sole new one and via the D-204-authorized path.
- C8: docs/GO-LIVE-UBUNTU.md section "Cutover: reindex the two FAILED sessions in lkb_prod (D-204, devops step)" read: names both sessions, dry-run first, live command carries all three parts, states "Not run by the build agent ... human/devops action". Dry run connects to nothing (DRY_RUN guard at sync-session.mjs:161 skips DB block).
- Scope: diff touches only sync-session.mjs, its test, GO-LIVE-UBUNTU.md, manifest; all within D-204 Changes-authorized. No secrets, no .env, no network/live provider.

## Falsification (checker's own, in a git-archive COPY with node_modules junctions; bound tree never edited)
Per-mutation byte backup (cp -p) restored by explicit code after each run; after each, `git hash-object` of the copy file == `git rev-parse HEAD:<file>` (OK for all 8). Junctions unlinked (rmdir) before the copy was removed; main-tree node_modules verified present.
| Mutant | Result (whole file) |
|---|---|
| C1 `false && ...` on productionOptIn | 17/1 killed: "all three parts ..." |
| C2 drop argv flag clause | 17/1 killed: "each single missing part ..." |
| C3 drop MONGODB_DB==="lkb_prod" clause (shared helper would accept `lkb`) | 17/1 killed: "each single missing part ..." |
| C3b (extra) drop workDb==="lkb_prod" clause | 17/1 killed: "each single missing part ..." |
| C4 remove allowProduction from prod call | 16/2 killed: "all three parts", "D-204 source" |
| C5 add allowProduction to the non-prod call | 16/2 killed: "non-production work DB unchanged", "each single missing part" |
| C6 duplicate production log line | 17/1 killed: "all three parts" |
| C7 remove "lkb_prod" from isProtectedWorkDbName | 12/6 killed (incl. D-204 source, MONGO_WORK_DB=lkb exits non-zero) |
8/8 mutants killed.

## Adversarial bypass hunt (auth / data-write path)
- Whitespace/case: workDb and MONGODB_DB are both trimmed; case variants fail the strict `===` and the old guard (case-insensitive) still refuses. No bypass.
- testData source: resolveWorkDb routes testData===true to lkb_staging or throws before the opt-in check; a non-boolean testData keeps the configured DB and so still needs all three parts. No bypass.
- MONGODB_DB=lkb with MONGO_WORK_DB=lkb_prod: the shared helper alone would accept `lkb`, but the script's own clause blocks it (mutant C3 proves test coverage). No bypass.
- LKB_ALLOW_STAGING does not interact with the prod branch. The only other DB use is `connect(target.url, target.dbName)` at :234 (target set solely by the two guarded branches) plus workDb stamped into retention proofs.
- Residual (not a defect): MONGODB_URL is unconstrained, same as every other D-196 opt-in script.

ISSUES-WRITTEN: none
PROPOSED-ISSUE: none (no findings; low observation only: the dry-run wording in the doc "a dry run connects to nothing" is accurate, no change needed)

SCOREBOARD: 8/8 criteria met, R1 invariants hold
TIER: L (production-write capability on existing script, dual-trigger prod-write sync-session.mjs:167)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (CLI guard change, no screen)
LIVE-BROWSER: not-applicable (no UI paths changed)
EXECUTOR: claude-opus-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The three-part opt-in is implemented in place with the shared helper, the refusal path is unchanged, isProtectedWorkDbName is untouched, and every criterion is covered by a test that an independent mutant kills. No bypass found on the auth/data-write path.
Metrics: start=2026-10-28T17:40:00Z end=2026-10-28T17:57:00Z wall_min=17 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=1 mutations=8 cycle=0 resumes=0 tokens=unavailable builder_min=45 check_min=17 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1020 mutants=8 defects_unit=0 defects_6c=0
