# Verdict — api-honest-status
**Cycle checked:** 0
**VERDICT: PASS**
**Checker:** A (fresh, bound to D:/KnowledgeBase, worktree .worktrees/api-honest-status)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** 338d2178..a3eb7d10 (product code identical to manifest code SHA 83c7b50e; a3eb7d10 adds only qa files)

## Independent evidence (re-run by checker, one file per invocation, timeout 240s, tree untouched)
- C1: routes/whatsapp.test.ts 13/13 pass. Body is the fixed {error:"not_configured",feature:"whatsapp"} for GET /whatsapp/groups and POST /whatsapp/ingest; no-leak assertion present (secret, ECONNREFUSED, mongodb://, host, owner id).
- C2: same file (configured-but-down keeps whatsapp_unavailable; spoofed errors stay 500) + whatsapp/store-mongo-snapshot.test.ts 1/1 pass.
- C3: routes/stubs.test.ts 1/1 pass. 401 no key, 403 wrong scope, 503 exact body across 5 route/method pairs through real createServer perimeter. server.ts:124-127 confirms mountIntegratedWorkflows runs after requireAuth + rate limiter; configured path still mounts the real router.
- C4: routes/health.test.ts 25/25 pass (incl. new AC-4 and existing ISS-368/R2 cases). /health body stays whitelisted; 503 {db:"error"} on probe throw, 503 {db:"ok"} on detector throw.
- tsc --noEmit -p apps/api/tsconfig.json exit 0.

## Falsification (throwaway copy apps/api-chkcopy, junction node_modules; per-mutation byte backup restored; verified by git hash-object == git rev-parse HEAD:path; copy removed, junction unlinked via rmdir, target node_modules intact, bound tree never mutated)
- C1: whatsapp.ts NotConfigured branch -> `if (false)`: whatsapp.test.ts RED (3 fails: tests 8, 12, 13). Restored cae6562baa0f == HEAD.
- C2: store.ts env check dropped (always NotConfigured): RED (tests 9, 13). Restored 64a32869c6c3 == HEAD.
- C3: routes.ts else-branch removed: stubs.test.ts RED. Restored b3312306cf47 == HEAD.
- C3 (auth bypass probe): requireScope('sources') removed from the fallback: stubs.test.ts RED (403 case caught). Restored.
- C4: health.ts try/catch around checkHealth removed: RED (AC-4 test 25). Restored 267338b03da6 == HEAD.
- C4 (detector): `catch { unreadable = 1 }` -> `unreadable = 0` (would report all-fresh on detector failure): RED (AC-4 test 25). Restored.
- Note: in the copy, health tests 23/24 (Dockerfile HEALTHCHECK) also failed under mutation runs because the copy omits apps/api/Dockerfile; they pass 25/25 in the real tree. Not a product defect, not counted as the catching test.

## Adversarial bypass hunt (auth / tenancy / data-write)
- /connector-workflow fallback: mounted after requireAuth with requireScope('sources'); deny-only, reads/writes nothing; unauthenticated and wrong-scope callers cannot reach the 503 (probed by C3 + scope-removal mutant). No bypass found.
- WhatsApp: owner resolution and tenant binding untouched; NotConfigured only changes the 503 body. The not_configured vs whatsapp_unavailable split reveals only the caller's own tenant's configuration state to a holder of the whatsapp scope; no cross-tenant disclosure. Error body is a fixed literal, so no host/URL/owner id/driver text.
- /health: unauthenticated by design (pre-existing, before requireAuth); body remains a whitelisted {db}; thrown error text is not echoed. No leak.
- No data-write logic added.

## Issues
ISSUES-WRITTEN: none
Maker-filed ISS-API-001..003 (low/low/medium) reviewed; they are out-of-scope observations, not blockers for C1..C4. ISS-API-003 (502 whatsapp_ingest_failed echoing upstream err.message) is pre-existing, outside the unit's criteria, medium severity but not auth/tenancy class beyond an info-leak to an already-authenticated whatsapp-scope caller; remains filed, not a pulled unit under the repo's severity gate.
PROPOSED-ISSUE: none

## Metrics
check_min=14 mutations=6 suite_runs=0 repeat_runs=0 cycle=0 files_run=4 tsc=1
