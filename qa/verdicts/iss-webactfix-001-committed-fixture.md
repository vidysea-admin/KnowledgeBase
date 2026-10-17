# Verdict: iss-webactfix-001-committed-fixture

VERDICT: PASS
Cycle checked: 0
Commit checked: d69bcc1 (lane/webfixture, based on lane/webactfix 485e080)
Scope: apps/web ActivityHealthIntegration test fixture + apps/api drift guard; local Windows run, CI behaviour derived from .github/workflows/ci.yml, not run on CI.

## EXPLANATION

- Fixture content (public repo): read all 2770 bytes. Only 64-hex / 000..0N job ids, fixture dates (2026-10-09/12), counters, status and errorClass strings, `upload_queue_fixture01`, proof booleans. No emails, tenant ids, usernames/paths, tokens, hostnames, claimToken. Nothing real.
- Web test: diff against 485e080 changes only the path string (now `../../../test-fixtures/t057-d2-runtime-output.json`); every assertion line is identical. No `.cache` reference remains in apps/web source.
- Measured, worktree with no `.cache/coordination/t057-d2-runtime-output.json`: ActivityHealthIntegration 2/2; full apps/web 59 files, 625/625; apps/api activity-health router.test.ts 3/3 (D2_FIXTURE_PYTHON to main tree .venv).
- Mutation: renamed `automaticRetryCount` to `automaticRetries` in apps/api/src/activity-health/queue-reader.ts. KILLED (api test: 2 red, incl. the producer test whose guard compares shape). File restored; `git hash-object` equals HEAD blob; tree clean; harness deleted. (My harness trap used a relative path after a cd and failed to restore; I restored with git checkout and verified by hash. No effect on the product.)
- `UPDATE_WEB_FIXTURE=1` is set by nothing in ci.yml (grep of .github); it cannot fire by accident in CI. It writes only when explicitly exported.
- CI GUARD FINDING: the guard is effectively decorative in CI. ci.yml runs `pnpm -r test` on ubuntu and sets neither D2_FIXTURE_PYTHON nor creates `.venv/Scripts/python.exe`, so the api test's `spawnSync` returns status null and the test fails at `assert.equal(child.status, 0)` BEFORE the guard line. It does not skip silently; it is red (pre-existing, same line failed before this change). So the web test is now safe on a clean checkout, but the shape guard never runs green in CI. Filed ISS-WEBFIXTURE-001 (medium).
- Strengthen note: shape is merged per path, so a key missing from only some rows is not detected (acknowledged limit in the manifest).
- ISS-WEBACTFIX-001 set to verified in qa/issues.webactfix.jsonl (the row is in this branch's tree).

ISSUES-WRITTEN: ISS-WEBFIXTURE-001 (medium)
