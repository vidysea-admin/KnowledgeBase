# Verdict: scriptguards-script-db-guards

VERDICT: PASS
Cycle checked: 0
Commit checked: b416bc24

EXPLANATION:
1. Bypass probe of requireScriptDatabase (21 cases, fakes only, no DB contacted): refused empty env, URL-path-only `/lkb`, MONGODB_DB=lkb without flag, flag with allowProduction=false, flag + other/empty/unset DB, `LKB`, no/empty URL, `--flag=true`, upper-cased flag, MONGO_WORK_DB=lkb/LKB/' lkb ', lkb_staging without LKB_ALLOW_STAGING, staging+MONGODB_DB=lkb. Allowed only: work DB, staging double opt-in, and flag+exact MONGODB_DB=lkb+URL. No implicit lkb path. Note (low, ISS-SCRIPTGUARDS-002): ' lkb ' with flag resolves to lkb because of trim; explicit and flag-gated.
2. 005 live-verify and 006 eval-recall are read-only on the DB: only countDocuments / reads / scoped finds; local file writes only. live-verify's POST /ask appends a `jobs` row inside the API's own DB (a side effect of the API, not this script's connection, and the script documents it). Flag allowance is acceptable.
3. reingest-crash.test.mjs:546 change `connect(process.env` -> `watchDbTarget()` is a legitimate anchor update. The ordering assertion is unchanged (watch lock before the db target resolve/connect), and watchDbTarget() is first invoked after withWatchLock in runReingestUnderWatchLock. A missing anchor gives indexOf -1, which fails the assertion, so it cannot pass vacuously.
4. Repo re-grep of connect()/MongoClient sites: all script writers go through a guard (backfill, recover-toc, toc-embedding-backfill, seed-toc, sync-real-turns, sync-speakers, sync-session via isProtectedWorkDbName, seed-demo, watch). Remaining unguarded: scripts/mint-key.mjs (002, known, held for Approver); migrate-mongo-config.cjs defaults `MONGODB_DB || "lkb"` (NEW, ISS-SCRIPTGUARDS-001, high, outside this unit's scope); qa/evidence/*.mjs probe scripts default lkb (read-only historical evidence, ignored); apps/api whatsapp/store.ts uses a separate WHATSAPP_MONGO_URL (out of scope).
5. Replay: ISS-LEGACYSEED-001 PASS (seed-demo refuses lkb/empty; no flag path), -003 PASS (watch-config/store/reingest via watchDbTarget, lazy), -005 PASS, -006 PASS. -002 intentionally open.
6. Mutations 6/6 killed (flag-path lkb check dropped; allowProduction ignored; seed-demo, watch-config, eval-recall, live-verify reverted to `?? "lkb"`). 2 further mutations had a non-matching anchor and were not run. Per-mutation byte backup restored in finally; git hash-object == HEAD blob for every file; harness deleted; tree clean.
7. Tests with node bin prepended and `--import tsx`: 130/130 pass (script-db-guard, legacy-unbound, transcript-provenance, reingest-crash, eval-recall, toc-recovery, toc-recovery-import). Without tsx, reingest-crash fails to load .ts imports (environmental, not a regression).

Open for Approver: 002 mint-key; whether watcher/reingest may target lkb with the flag (003 policy note); new ISS-SCRIPTGUARDS-001.

ISSUES-WRITTEN: ISS-SCRIPTGUARDS-001 (high, outside scope), ISS-SCRIPTGUARDS-002 (low note) in qa/issues.scriptguards.jsonl
