# scriptguards-script-db-guards

**Handshake status:** checked-PASS
Fix cycle: 0
Lane: lane/scriptguards (from lane/nolkbdefault 11fef90d)

## Scope
ISS-LEGACYSEED-001, -003, -005, -006: scripts that defaulted MONGODB_DB to `lkb`. Security / data-write class (D-143).
**NOT done: ISS-LEGACYSEED-002 (scripts/mint-key.mjs)** - its own row says "needs Approver ruling on whether lkb is allowed here"; left untouched and open. STOP, Approver decision needed.

## Design
New `requireScriptDatabase(env, argv, {allowProduction})` in scripts/lib/transcript-provenance.mjs. No default DB. Work DB / staging go through requireLegacyUnboundDatabase (requireWorkDatabase + staging double opt-in) unchanged.
`lkb` is reachable only when the script passes allowProduction AND argv has `--i-know-this-is-production` AND MONGODB_DB is exactly `lkb` AND a Mongo URL is set.
- seed-demo-server.mjs (001): work/staging only, no production path.
- watch-config/store/reingest (003): `watchDbTarget()` replaces the import-time `MONGODB_DB` const (lazy, so --dry-run/tests importing the file never throw). Production allowed with flag (watcher/reingest is a deployed operator tool). POLICY NOTE for Approver: confirm the watcher/reingest should be able to target lkb at all with this flag.
- live-verify.mjs (005), eval-recall.mjs (006): read-only; production allowed with flag.
- Existing test scripts/watch/lib/reingest-crash.test.mjs line 546 string anchor changed `connect(process.env` -> `watchDbTarget()` (same ordering assertion).

## Files
scripts/lib/transcript-provenance.mjs, scripts/demo/seed-demo-server.mjs, scripts/watch/{watch-config,watch-store,watch-reingest}.mjs, scripts/live-verify.mjs, scripts/eval-recall.mjs, scripts/lib/script-db-guard.test.mjs (new), scripts/watch/lib/reingest-crash.test.mjs (anchor).

## Criteria
Each script: refuses with no DB; refuses lkb without the flag; accepts the intended work DB. Fakes only; no Mongo contacted.

## Evidence
- script-db-guard.test.mjs: 14/14 pass. Replay per id (source site no longer defaults to lkb and routes through guard): ISS-LEGACYSEED-001 1/1, -003 3/3 files, -005 1/1, -006 1/1; plus seed-demo-server spawn with empty env exits non-zero before connect.
- Regression: legacy-unbound + transcript-provenance + eval-recall + main-tree + reingest-crash: all pass (reingest-crash 56/56).
- Mutations 6/6 killed (flag path skips lkb check; allowProduction ignored; fallthrough returns lkb default; seed-demo old default; watchDbTarget old default; live-verify old default), per-mutation byte backup restored in finally; harness deleted.
