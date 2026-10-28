# fix-web-activity-health-integration-test (lane webactfix)

**Handshake status:** checked-PASS
Fix cycle: 0

## Failure (verbatim, before)
`src/pages/activity-health/ActivityHealthIntegration.test.tsx:9:31` -> `TypeError: The URL must be of scheme file`
Full apps/web suite before: Test Files 1 failed | 58 passed (59); Tests 1 failed | 624 passed (625).

## Cause
Test-side defect present since the test was introduced (5e70958 "WIP: add activity-health API router and web page", 2026-10-10); apps/web/vitest.config.ts unchanged since 05c071e (2026-09-04), so not a product regression. Under vitest `environment: "jsdom"` the global `URL` is jsdom's: `new URL("../../..", import.meta.url)` (import.meta.url is `file:///...`) resolves to `http://localhost:3000/...`, which `readFileSync` rejects. Product code untouched.
Secondary (not fixed, ISS-WEBACTFIX-001): the evidence file lives in gitignored `.cache/` and is written by the apps/api router test; absent in a fresh worktree (ENOENT).

## Change
Test only: path built with `resolve(dirname(fileURLToPath(import.meta.url)), ...)` (same target file). No assertion changed or removed.

## Evidence
Verification used the real fixture copied from the main tree `.cache/coordination` (api test could not run in this worktree: apps/api node_modules not linked).
activity-health dir: 4 files, 13/13 pass. Full apps/web after: Test Files 59 passed; Tests 625 passed (625). Other failing web tests: none.
