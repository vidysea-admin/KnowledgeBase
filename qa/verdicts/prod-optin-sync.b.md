# Verdict B (blind dual check) — prod-optin-sync
**Cycle checked:** 0
**Checked state:** HEAD ce5d03db (code edf30477, 72c34d7d, 2e4c33f3; diff e99c9011..HEAD touches sync-session.mjs, db-guard-paths.test.mjs, GO-LIVE-UBUNTU.md, manifest)
**Policy-Version:** proportional-verification/2026-10-19.17
**Coordinator:** B (blind; no other verdict read)

VERDICT: PASS

## Criteria (independently evidenced)
- C1 PASS: sync-session.mjs:167-171 takes the production path only when the flag is in argv, resolved workDb is "lkb_prod" and trimmed MONGODB_DB is "lkb_prod"; spawned-script test reaches the fake listener (connect attempted). Own run of db-guard-paths.test.mjs: 18/18 pass.
- C2 PASS: flag missing and `=true` spelling both keep the old refusal text, no production line, zero TCP attempts (test asserts attempts == []).
- C3 PASS: MONGODB_DB unset / lkb / LKB_PROD, MONGO_WORK_DB not lkb_prod, global_university_db all refuse; the work-DB branch falls to the unchanged guard (`requireWorkDatabase` text).
- C4 PASS: shared `requireScriptDatabase(process.env, argv, { allowProduction: true })`, not reinvented; helper (transcript-provenance.mjs:158) refuses lkb_prod without allowProduction.
- C5 PASS: isolated work DB, with and without the flag, no production line, normal connect attempt.
- C6 PASS: exactly one `PRODUCTION WRITE ENABLED (D-204)` line (asserted).
- C7 PASS: `isProtectedWorkDbName` untouched (git diff shows no change to scripts/lib); only sync-session.mjs gained a production opt-in in this diff; other allowProduction users (mint-key, recover-index-attempt, eval-recall, live-verify, watch-config) pre-exist.
- C8 PASS: docs/GO-LIVE-UBUNTU.md section "Cutover: reindex the two FAILED sessions in lkb_prod (D-204, devops step)" has dry-run and live commands for both session ids (both exist under data/toc-migrated), says "Not run by the build agent". See PROPOSED-ISSUE 1 for one inaccurate sentence.
- R1 PASS: script-db-guard 14/14, transcript-provenance 15/15, turn-timing 7/7, graph-finalize 5/5, plan 5/5 (one file per invocation, timeout 300). `pnpm lint:structure` OK (10 stages), `snapshot.mjs --check` OK.

## Independent falsifications (own scratch copy of HEAD via git archive; bound tree untouched, `git status` clean after)
Per-mutation byte backup (cp -p) restored by explicit code, no EXIT trap; `git hash-object` equalled HEAD blob after every restore (8/8 OK). Each run `timeout 300`, whole db-guard-paths file.
| Crit | Mutant | Result |
|---|---|---|
| C1 | `productionOptIn = false && ...` | 17 pass / 1 fail (all-three-parts test) |
| C2 | drop flag clause | 17/1 (single-missing-part test) |
| C3a | drop MONGODB_DB clause | 17/1 (single-missing-part test) |
| C3b | drop `workDb === "lkb_prod"` clause (extra, tenancy-relevant) | 17/1 (single-missing-part test, case "MONGO_WORK_DB not lkb_prod") |
| C4 | drop `{ allowProduction: true }` | 16/2 (all-three + source test) |
| C5 | add allowProduction to the legacy else-branch call | 16/2 |
| C6 | duplicate the production log line | 17/1 |
| C7 | remove "lkb_prod" from isProtectedWorkDbName list | 12/6 |
All 8 mutants killed; each failed the test the manifest names.

## Adversarial hunt (auth / data-write path)
- Whitespace/case: MONGO_WORK_DB is trimmed before comparison, MONGODB_DB trimmed; case variants refused (tested). `lkb` as MONGODB_DB with MONGO_WORK_DB=lkb_prod refused (tested).
- testData + LKB_ALLOW_STAGING: routed to lkb_staging by resolveWorkDb before the opt-in, so workDb never equals lkb_prod; with LKB_ALLOW_STAGING unset it throws (tested). Prod path never reads LKB_ALLOW_STAGING.
- Work-DB / target mismatch: prod path requires workDb === MONGODB_DB === lkb_prod, `target.dbName` is MONGODB_DB trimmed, so connect() and the retention `workDb` agree.
- Dry run still skips the whole guard block (`if (!DRY_RUN)`), unchanged; opt-in cannot widen it.
- Flag as a value of another option: only `argv.includes` as in the shared helper; no new surface.
- No bypass found.

## PROPOSED-ISSUEs (dual check: not written to the ledger)
PROPOSED-ISSUE 1 | severity: low | class: doc accuracy (capped, file-don't-fix) | docs/GO-LIVE-UBUNTU.md (cutover section, first paragraph) and scripts/webinar/db-guard-paths.test.mjs (D-204 comment) say the opt-in is "the same one as mint-key.mjs, recover-index-attempt.mjs and backfill-document-consent.mjs"; scripts/operations/backfill-document-consent.mjs:106 calls requireScriptDatabase with `allowProduction: false` and also asserts staging-only (lines 103, 107), so it has no production opt-in. The sentence is copied from D-204's What text (append-only; not editable). No behavioural effect.

ISSUES-WRITTEN: none (dual check; proposals above only)

## Metrics
Metrics: start=2026-10-28T17:25:00Z end=2026-10-28T17:59:00Z wall_min=34 agent_min=unavailable blocked_min=0 suite_runs=7 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable builder_min=45 check_min=34 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2040 mutants=8 defects_unit=0 defects_6c=0
