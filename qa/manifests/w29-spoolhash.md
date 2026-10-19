# Manifest - w29-spoolhash
**Status:** ready-for-check
**Fix cycle:** 0
**Lane:** C:\Users\product\Desktop\KnowledgeBase-lanes\w29-spoolhash (branch lane/w29-spoolhash)
**Base SHA:** 4ca0271e3a8be2b6b7efc199280bd165493e9e77 (origin/master)
**Candidate SHA:** see the commit that adds this file (git log -1 lane/w29-spoolhash)
**Issue addressed:** ISS-T045WORKER-001 residual (checker verdict 90d89158; shard qa/issues.T045WORKER.jsonl). Ledger row NOT flipped.

## What changed
- jobs/store.ts: enqueue writes `url: redacted:sha256:<hash>` to the journal; the real URL goes to a private per-job secret file
  `<tenant dir>/<jobId>.secret` (same ACL-gated spool dir). `claim` reads it, requires redactedSourceUrl(url) == journal marker and
  sourceJobInputHash == row inputHash, and hands the worker the real URL in memory only. Missing or mismatched secret: the job becomes
  `uncertain` (execution-unconfirmed), never refetched. Secret deleted (`retire`) before every settled row (succeeded/uncertain, incl. stale lease).
  replay accepts a marker on any state (queued->uncertain allowed only for marker rows); legacy rows holding a URL replay unchanged.
- jobs/private-journal.ts: writeSecret/readSecret/dropSecret (O_NOFOLLOW, nlink 1, fsync, `verify.artifact`); preflight allows `<64hex>.secret` and verifies it.
- jobs/secret-spool.test.ts: 6 tests (no URL in audit.jsonl at any stage, deletion on succeeded/uncertain/stale, missing secret, hash mismatch, legacy replay).
- hosting/journal.ts untouched.

## Checks
- node --test (secret-spool, jobs, privacy, url-redaction, onair-binding): pass 39, fail 0, skipped 2 (native ACL, pre-existing).
- consumers connector-workflow/watched-job + workflow tests: pass 21, fail 0.
- tsc apps/api: exit 0. lint-loc --all: OK (10 stages, 0 failed) (apps/web node_modules junction added to the lane for the dependencies stage).
- D-020 mutations (per-mutation backup, restored, cmp ok; outputs in scratchpad w29-mut-M1.out / M2.out):
  M1 write URL into the journal row at enqueue: secret-spool 4 fail / 2 pass. M2 skip secret deletion: 4 fail / 2 pass.
- D-015: the ledger issue's recorded cases are the three url-redaction.test.ts scenarios; they still pass unchanged (3/3).

## Limit
Rows written by earlier builds that already hold a URL stay as they are (append-only chain).
