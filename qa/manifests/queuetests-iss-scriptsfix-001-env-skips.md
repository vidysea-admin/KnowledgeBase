# Unit: queuetests-iss-scriptsfix-001-env-skips

**Handshake status:** ready-for-check
**Fix cycle:** 0
**Lane:** queuetests (branch lane/queuetests)
**Tier:** medium issue pulled by orchestrator (ISS-SCRIPTSFIX-001); test-only change, no auth/tenancy/data-write code touched.

## Scope
`scripts/upload/queue.test.mjs` had 4 tests failing on a clean checkout/CI: two need the Python interpreter (`.venv/Scripts/python.exe`) and ffprobe, two need a live MongoDB at 127.0.0.1:27017. No in-process Mongo fake exists in the repo (no mongodb-memory-server), and test 3 spawns the real Python worker against Mongo, so a fake cannot be faithful. Chosen fix (the issue's fallback): skip with a stated reason.

## Files
- scripts/upload/queue.test.mjs (only file changed). All assertions kept.

## Change
- `python` honours `UPLOAD_PYTHON`; tests 1 and 2 skip when it is absent; test 1 also skips when ffprobe (`UPLOAD_FFPROBE` or the default tool path) is absent.
- Mongo tests (3, 4) skip unless `TEST_MONGO_URL` is set and is a loopback host. `MONGODB_URL` from .env is never used any more (replaced `process.env.MONGODB_URL ?? 127.0.0.1` fallback).

## Criteria
1. No test fails for a missing interpreter, ffprobe or MongoDB; each skips with a reason.
2. Mongo tests never read .env MONGODB_URL and never connect to a non-loopback host.
3. With the tools present, the non-Mongo tests still pass.

## Evidence
- Clean worktree (no .venv, no Mongo): `node --test --import tsx scripts/upload/queue.test.mjs` -> tests 7, pass 3, fail 0, skipped 4 (was fail 4).
- `TEST_MONGO_URL=mongodb://example.com/x`: pass 3, fail 0, skipped 4 (remote refused).
- With UPLOAD_PYTHON and UPLOAD_FFPROBE pointing at the main tree's tools: pass 5, fail 0, skipped 2 (Mongo only).
- CI lint set subset (lint, snapshot, catalogue, catalogue-cli, mutate, find-audio-file, session-rows): 71/71 pass.
- Mongo tests 3 and 4 were NOT run with a live Mongo (none available; not connected to any DB).
- CI: queue.test.mjs is not in `.github/workflows/ci.yml` (`pnpm -r test`, `pnpm test:lint` lists), so CI is unaffected; ubuntu would skip tests 1-4 cleanly (no default ffprobe.exe, no TEST_MONGO_URL).
- Ledger reproductions: ISS-SCRIPTSFIX-001: 4/4 named tests now skip instead of failing in an environment without them.
