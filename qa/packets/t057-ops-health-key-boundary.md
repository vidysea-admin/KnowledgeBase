# Checker packet: t057-ops-health-key-boundary, cycle 0

Repository: C:/Users/product/Desktop/KnowledgeBase. Maker manifest: qa/manifests/t057-ops-health-key-boundary.md. Checker owns qa/verdicts/t057-ops-health-key-boundary.md and isolated checker evidence; maker owns page/test, released common api/client.ts and auth/AuthContext.tsx with their focused test files, and its handshake files. Do not edit QA contracts, HTTP routes, trackers or global ledgers.

## Scope and ground truth

T-057, roadmap tier 3, uncapped security class. Contract qa/contracts/t057-d2-activity-health.md C7 requires old snapshots hidden immediately on key rotation/logout and stale success/error/401 unable to overwrite the current selection/key or clear replacement authentication. Full D2 producer/queue/live/browser acceptance remains separate.

Original defect: OpsHealthPage stored queue/provider/watch panels in the component using useAuth. An API-key change committed existing panel state before useEffect reset it. Logout removed panel DOM but preserved state; same-key relogin could restore it until effect reset.

## Complete changed production logic

OpsHealthPage still reads useAuth and renders the unchanged heading. Authenticated body is now a keyed OpsHealthPanels child using sessionVersion plus apiKey; unauthenticated body is the existing sign-in note. Internal OpsHealthPanels owns existing queue/provider/watch/generation state, loader effect and Refresh control. The now-nonnullable apiKey prop removes the prior early return. All three load/run callbacks, cancellation guard and panel body rendering remain unchanged. Rotation replaces the child identity before DOM commit; logout unmounts it; same-key relogin creates new state, including batched clear/set. React key/prop is not rendered as page text/attributes.

Common client keeps a private tab-local authSession object identity. New exported advanceAuthSession replaces it; apiFetch captures it before dispatch and passes it to invalidateAuth. Mismatched identity returns before storage or event side effects, while the request still rejects as401. Current-session401 uses existing compare-and-clear guards. AuthProvider explicit setApiKey/clearApiKey synchronously advances this identity and increments a new sessionVersion context value; existing setter signatures/storage guards are preserved. Version changes rerender same-key login and make page snapshots new. No token is persisted/transmitted, and no current request or HTTP authorization is relaxed.

## Tests and dependency map

- OpsHealthPage.test.tsx adds AuthControls using real AuthProvider/useAuth. Its useLayoutEffect observes committed page text before passive effects, preventing a falsely green reset-after-render test.
- Key rotation after all three loaded snapshots checks none appear in the replacement commit and all replacement requests carry its bearer key.
- Logout/same-key relogin checks no restoration of the old queue snapshot; fresh loading remains visible.
- Explicit same-key set and batched clear/set test all three snapshots are discarded despite an unchanged credential in the final commit.
- Pending old request trio resolves after replacement data: old activity 401, old provider 503, old watcher success. Actual apiFetch/AuthProvider must retain replacement localStorage/in-memory authentication and replacement empty panels.
- Existing tests retain independent failures, malformed shapes, GET/bearer requests, no-key silence, refresh, inert hostile text and /ops-health route/sidebar.
- Client and real AuthProvider tests exercise old same-key401 after restored login, followed by a new current-session401 that must still invalidate. OpsHealth also resolves all three old requests as401 after same-key relogin.

Unchanged caller: apps/web/src/App.tsx mounts OpsHealthPage through AuthProvider. AuthProvider updates keyRef synchronously and compare-and-clears failed-key storage/session; client emits failed-key invalidation only for current request sessions. Unchanged immediate dependencies: api/jobs.ts and activity-health/activityHealthClient.ts validate real API response shapes; opsHealthModel.ts reads /watch-runs and supplies existing summaries. Security flags: auth/tenancy/cross-tenant snapshot access yes; production data writes/provider execution no; credential handling existing auth only, no secret output.

## Focused commands

From apps/web: `node node_modules/vitest/vitest.mjs run src/pages/ops-health/OpsHealthPage.test.tsx src/App.routes.test.tsx src/api/client.test.ts src/auth --maxWorkers=1 --minWorkers=1`.
Shared final web typecheck: `node node_modules/typescript/lib/tsc.js --noEmit -p apps/web/tsconfig.json` from repository root, attributed /root/sendnow_maker, exit0,8.60s,no diagnostics; no repeat needed absent relevant changes.
Required contracts verifier: `python contracts/verify_contracts.py` from root, with existing empty frozen-contract/vacuity caveat.

Dependencies exist locally; no install/network/database/provider/browser required. Shared CPU coordinator granted original Vitest slot; default attempt hit esbuild spawn EPERM before tests, approved exact retry passed57/57. Receipt qa/evidence/t057-ops-health-key-boundary/maker-vitest.txt. Preserve unrelated concurrent MAIN changes. No mutation experiment is prescribed; any checker mutation must use timeout and trap-based byte restoration with verification.

Final-file hashes and exact command evidence are in the manifest. Checker must verify pins before and after check. This new C7 defect has no allocated existing issue ID; changed Auth dependencies additionally rerun the existing exact recorded ISS-ISS260-001 and ISS-WEBAUTH-002 tests/replays, not a replacement corpus. Existing task/browser gates remain open.
