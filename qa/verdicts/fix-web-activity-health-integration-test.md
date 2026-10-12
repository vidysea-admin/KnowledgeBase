# Verdict: fix-web-activity-health-integration-test

VERDICT: PASS
Cycle checked: 0
Commit checked: 980b4cc (lane/webactfix)
Scope: apps/web test path construction only; jsdom; no browser. Passes only where the gitignored fixture exists (see ISS-WEBACTFIX-001).

## EXPLANATION

- Diff: `git show 980b4cc` touches the test file (+2 imports `node:path`, `node:url`; one line changed: `new URL(rel, import.meta.url)` to `resolve(dirname(fileURLToPath(import.meta.url)), rel)`, same relative target), qa/issues.webactfix.jsonl, and the manifest. No assertion added, removed or altered; no source, contracts, DECISIONS or CLAUDE.md touched.
- Failure reproduced read-only on main tree (apps/web, that test file): 1 failed | 1 passed, `TypeError: The URL must be of scheme file` at line 9:31. Cause (jsdom global URL gives http://localhost URLs) is consistent with the manifest.
- Fix measured in lane: full apps/web `vitest run`: Test Files 59 passed (59); Tests 625 passed (625). Note the lane's `.cache/coordination/t057-d2-runtime-output.json` is a copy from the main tree (gitignored), so this pass is conditional on that fixture.
- ISS-WEBACTFIX-001, CI analysis: `.github/workflows/ci.yml` runs `pnpm -r test` on a fresh checkout. The file is gitignored (`.gitignore:72 .cache/`) and written only by apps/api `src/activity-health/router.test.ts:155`. apps/web does not depend on apps/api (no workspace dep), so pnpm gives no ordering guarantee; recursive runs execute concurrently, and the api test is long. Web would either hit ENOENT (file absent) or race. On a clean checkout the web test therefore fails in CI; before this fix it failed regardless (URL scheme), so the fix does not regress CI but does not make it green. Rating: MEDIUM, correctly filed (CI-red on clean checkout, not a security or data-write issue). Fix direction (owner decision): commit a sanitized fixture under apps/web, or have the web test generate its own evidence.
- The fix is correct and minimal; the remaining defect is separate and already ledgered.

ISSUES-WRITTEN: none (ISS-WEBACTFIX-001 already filed, medium, open; rating confirmed)
