# Verdict - webinarfix

**Cycle checked:** 0
**Commit checked:** a9da80c7
**VERDICT:** PASS (with 2 medium, 1 low issue filed; no bypass found)
ISSUES-WRITTEN: ISS-WEBINARFIX-001 (medium), ISS-WEBINARFIX-002 (medium), ISS-WEBINARFIX-003 (low) in qa/issues.webinarfix.jsonl

## Item 2 - DB guard (full ceremony)
Mutation harness: per-mutation byte backup, restore in finally, 180 s timeout, `git hash-object` == `git rev-parse HEAD:<file>` after every mutation (all true).
db-guard-paths.test.mjs baseline: pass 7.
- KILLED: guard moved after connect; guard checks unresolved process.env.MONGO_WORK_DB; guard checks name before route; guard removed; connect to unresolved name; guard env arg dropped; workDb bypasses route; guard under `if (false &&)`; early second connect(url,"lkb") before guard; aliased connect before guard; connect in queueMicrotask before guard; resolveWorkDb opt-in check dropped; isProtectedWorkDbName without lkb; without staging opt-in.
- SURVIVED: guard wrapped in `try{}catch{}`; `new MongoClient().connect()` inserted before the guard (not via `connect(`). Both are regex limits of a source-level test, filed as ISS-WEBINARFIX-001 (medium). The two cases the brief named (reorder, unresolved name) are caught.
- Maker's finding confirmed: resolveWorkDb does not refuse protected names; the refusal is the post-resolve isProtectedWorkDbName. The test pins that order.
- Bypass hunt: sync-session has one connect, after the guard, on the resolved name. No --db flag; MONGODB_DB is not read; MONGODB_URL supplies only the URL (dbName is an argument). testData reroute reaches only lkb_staging and needs LKB_ALLOW_STAGING=lkb_staging, then the guard re-checks it. --dry-run exits before any import of the client. graph-finalize spawns sync-session as a child, so it inherits the guard. No bypass; no HIGH finding. (Other scripts connect on their own, such as seed-toc, sync-real-turns, watch-store; outside this unit.)

## Item 1 - parseCliArgs fuzz (19 inputs, plus CLI spawns, no Mongo)
Bare id, id before/after --root, --dry-run first: all parsed. Missing id, unknown flag only, dangling `--root`, `--root` followed by a flag: usage, exit 1. `../../etc/x`, `-x`: "invalid sessionId", exit 1 (shape validated downstream). Two ids: first wins, second silently ignored. Repeated --root: second value becomes the id. Both are ISS-WEBINARFIX-003 (low).

## Item 3
Claim 3 confirmed: generated .ts files are committed, so the failure is a loader problem. But `test:webinar` globs only `*.test.mjs`; the four `scripts/webinar/*.test.ts` files (44 tests, all pass under tsx) are not run. ISS-WEBINARFIX-002 (medium). Script as written: 137 pass / 0 fail (same via the quoted glob form).

## Suite
Webinar tests under tsx: 137 pass / 0 fail; .ts tests 44 pass / 0 fail. lint-loc --all OK (10 stages, 0 failed). lint-dirsize OK (164 dirs). No Mongo connection was made.

---

# Cycle 1

**Cycle checked:** 1
**Commit checked:** bf58a6e8 (main merged at ce85fad9)
**VERDICT:** PASS
ISSUES-WRITTEN: none

- ISS-WEBINARFIX-001: the new behavioural test (real sync-session, TCP listener, MONGO_WORK_DB lkb/LKB/global_university_db) killed both survivors, try/catch-wrapped guard and raw MongoClient before the guard, plus guard removed. A control mutant doing a raw net.connect to the listener was caught via the "connection was attempted" assertion, so the listener does detect any connection. Each mutation was restored with HEAD-hash identity verified. Unmutated: pass 8 / fail 0. Fixture dir cleaned up.
- ISS-WEBINARFIX-002: test:webinar globs *.test.ts; 183 tests / 183 pass / 0 fail, also with the quoted-glob form.
- ISS-WEBINARFIX-003: two ids and a repeated --root print `error:` plus usage and exit 1; a lone unknown flag, a dangling --root and `../../x` still exit 1.
- lint-loc OK (0 failed); lint-dirsize OK (164 dirs). No Mongo connection was made.
- The three issues are closed in qa/issues.webinarfix.jsonl and the manifest is flipped to checked-PASS.
