# Manifest — Ask body tenant-override guard

**Contract:** `qa/contracts/hybrid-retrieval.md` C6 (authenticated tenant binding)
**Goal task:** U1.5 / U3.1 tenant-safe counselor answers
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-188 (low)
**Status:** checked-PASS (cycle 1 — `qa/verdicts/ask-body-tenant-override-guard.md`)

## Why

`POST /ask` correctly binds retrieval to `req.auth.tenantId`, but the existing binding tests did
not send a body-level tenant override. A future change that preferred `req.body.tenantId` would let
an authenticated caller select another tenant's corpus while all 173 API tests remained green.

## Change, in place

The existing `askAs` helper in `apps/api/src/ask-arms.test.ts` accepts an optional request body.
The existing two-tenant ISS-169 test now authenticates with `key-a` while sending
`tenantId: "tenant-b"`, then requires the recorded retrieval bindings to remain
`["tenant-a", "tenant-b"]` for the key-A and key-B requests respectively.

No production code, route behavior, schema, database, UI, or source corpus changed.

## Acceptance evidence produced by the maker

1. Focused baseline passed 1/1:
   `node --test --import tsx --test-name-pattern="arms are bound PER REQUEST"
   src/ask-arms.test.ts` from `apps/api`.
2. Exact mutation replay: temporarily changed `routes/ask.ts` to prefer body `tenantId` over the
   verified key. The focused test failed 0/1: actual bindings were
   `["tenant-b", "tenant-b"]`, expected `["tenant-a", "tenant-b"]`.
3. Restore proof: `git hash-object apps/api/src/routes/ask.ts` equals
   `git rev-parse HEAD:apps/api/src/routes/ask.ts` at
   `43b43fe302fe2625b8a1a7c567f7621ccbadcc1f`.
4. Post-restore focused test passed 1/1 and the full API suite passed 173/173.
5. API TypeScript check passed; `git diff --check` reported no whitespace errors.
6. `npm run lint:structure` passed: 288 files and 78 directories within budget, tracker gates
   G1/G4 green, and zero dependency violations across 305 modules.
7. Fresh senior engineering review returned `VERDICT: Approve` with no findings. It confirmed the
   HTTP 200 plus ordered `boundWith` and `calledWith` assertions make both reachability and correct
   tenant use non-vacuous.

## Checker dispatch

Mode A. Independently inspect the hostile request and ordered binding assertion, run focused/full
API tests and typecheck, replay the exact body-override mutation in `apps/api/src/routes/ask.ts`,
and restore it byte-identically. No live browser run is required because the UI and shipped route
behavior are unchanged.

## Close-out

Fresh checker PASSed cycle 1 against `qa/contracts/hybrid-retrieval.md` C6 and I5. The exact
body-preference mutation changed the observed arm bindings from `["tenant-a","tenant-b"]` to
`["tenant-b","tenant-b"]` and reddened the named focused test. After byte-identical restoration,
the focused test passed 1/1, the full API suite passed 173/173, API typecheck exited 0, and the full
structure gate passed. ISS-188 moved open -> fixed (not verified).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
