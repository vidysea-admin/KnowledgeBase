# Manifest: iss-webactfix-001-committed-fixture

**Lane:** webfixture
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Fixes:** ISS-WEBACTFIX-001 (medium; row lives on lane/webactfix, qa/issues.webactfix.jsonl)
**Base:** lane/webactfix 485e080 (path fix not yet merged to master when this lane started; wait budget of 30 min exhausted)

## Change
- New `apps/web/test-fixtures/t057-d2-runtime-output.json`: byte copy of the real output of the apps/api activity-health router test (2770 bytes). Sanitisation review: contains only synthetic ids (sha-like / 000..0N), fixture dates, `upload_queue_fixture01`, status/attempt counters; no keys, tokens, tenant data or claimTokens. No edits were needed.
- `apps/web/.../ActivityHealthIntegration.test.tsx`: reads the committed fixture instead of gitignored `.cache/coordination/...` (path only; assertions untouched).
- `apps/api/src/activity-health/router.test.ts`: no longer writes into `.cache`; instead asserts (a) the structural shape (every path + primitive type, null folded) of the generated output equals the fixture's, (b) producerWorkerProof / selectedDatabase / httpStatus equal the fixture's. `UPDATE_WEB_FIXTURE=1` regenerates the fixture.

## Evidence
- Clean state (no `.cache` in worktree): web `ActivityHealthIntegration.test.tsx` 2/2 passed.
- Full apps/web suite: 59 files, 625/625 passed.
- apps/api `router.test.ts` (needs Python: `D2_FIXTURE_PYTHON` pointed at main tree .venv): 3/3 passed against the committed fixture.
- Drift mutation: deleting every `automaticRetryCount` from the fixture makes the api test fail with "drifted from the API output shape"; fixture restored, git hash-object verified equal.
- Known limit: shape guard is path/type level; per-row value differences (e.g. one row missing a key others have) are not detected by design (rows are merged per path).
