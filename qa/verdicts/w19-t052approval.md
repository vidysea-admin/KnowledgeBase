# Verdict - w19-t052approval
**VERDICT: PASS**
**Cycle checked:** 0
**Reviewed SHA:** bcf12e5e6aafcc76278bb36b27e4e8e3dfa94386
**Base SHA:** 41ca141c (merged into lane)
**Reviewer model:** Sonnet 5.5 (DEVIATION: policy calls for Opus on security units; the Opus weekly limit is exhausted until 2026-10-21, so the Approver-side orchestrator directed a Sonnet review).
**Activation constants:** MUST NOT be flipped on the strength of this verdict. An Opus re-review of this unit is required first. This PASS covers the T-052 approval-record unit only; it is not an activation PASS.
**Ledger:** ISS-282 flip is consistent with D-180 ruling 2 and may stand. No new issues written.
ISSUES-WRITTEN: none

## Clauses and findings
1. D-180 (docs/DECISIONS.md): diff is 19 insertions, 0 deletions (additions-only). D-180 follows D-179 (base has D-178, D-179 as last). Quotes "iska bhi permit le lee" verbatim, `**Approved-by:** Umesh`. Changes-authorized covers every candidate path (schema+fixtures+index, structure.config dirsize 47->48, generated types, unapplied migration, api registration-approvals + composition, meeting-bot registration-*, qa/issues status of ISS-282). Uses `Amends` (D-178 ruling 4), no Supersedes, so no whole-decision retirement (D-130 respected).
2. Store (apps/api/src/registration-approvals/store.ts): create/get/revoke/findMatching all call assertValidTenantId and put tenantId in the filter (my probe: revoke by another tenant 404, record stays active). Create enforces expiresAt <= approvedAt + 30d, expires > approved, canonical timestamps, Zoom field all-or-none, `_id === decisionId`; probe confirmed direct `store.create` with 31 days rejects (not read-only enforcement). Route additionally caps ttlDays at integer 1..30 (0, 30.5, "30", 31 all 400); stored span exactly 30 days. Human check: `createHumanApproverLookup` yields a subject only if the server-owned LKB_REVIEW_AUTHORITY_JSON lists the key for the SAME tenant with reviewerKind "human" (config parser forbids automation with canReview). My probe: automation key, unlisted service key (scopes incl "*"), tenant-B human keyId presented under tenant A, and near-miss scope names all 403, zero rows written.
3. Route (router.ts): sits behind shared requireAuth perimeter (mountIntegratedWorkflows), `requireScope("registration:approve")` (exact match), then human check; revoke uses same authority and `store.revoke(who.tenantId, ...)` with tenant in filter, no IDOR (cross-tenant revoke 404, bot revoke 403). Unconfigured deployment gives 503 behind auth+scope. Body cannot set tenant/approver (strict shape, 400).
4. Authority module (registration-approval-authority.ts): `current()` re-checks tenant, revoked, decisionId shape, approvedBy, approvedAt<=now<expiresAt, 30-day bound; callers re-check every hash. Lying-lookup test covers each. Canonicalization probe (route canonical form vs authority acceptance/hash): path trailing slash, path case, query order, percent-case are distinct links, each approved and matched only when the caller passes that exact string (authorized end to end). Bare-host "https://x.example", uppercase host, explicit :443 and dot-segments: route approves the canonical href, authority REFUSES the non-canonical input (fail closed). Fragment: route rejects (400). Behaviour is consistent and safe; only usability note: callers must canonicalize before lookup.
5. Activation constants: REGISTRATION_LINK_RESOLUTION_ENABLED=false (registration-link-resolver.ts:7), ZOOM_PROVIDER_CORRELATION_ENABLED=false (zoom-registration-proof.ts:5); test also asserts the shipped entry point stays inactive with a valid approval.
6. ISS-282: status "resolved", fixed_date 2026-10-17, resolution text matches D-180 ruling 2 (precision resolved, auto-final gate not met, write path stays off). Note (low): "resolved" is a new status word (only row); tracker-audit passes.

## Commands (timeout 600, captured to files, all exit 0)
- apps/api registration-approvals.test.ts: 9 pass / 0 fail
- packages/meeting-bot registration-approval-authority.test.ts: 7 pass / 0 fail
- tsc --noEmit: apps/api 0, packages/meeting-bot 0, packages/core 0
- schema/validate.py (main .venv python): PASS 46 schemas
- gen-types --check: OK 46 files
- lint-loc --all: OK (10 stages, 0 failed)
- tracker-audit --gate g1,g4,g5: exit 0 (advisory G4 notes only)
- Own probe test (apps/api/.chk/probe.test.ts, since deleted): passed, results above.

## Mutations (own, D-020: per-mutation byte backup, trap INT/TERM/ERR, timeout 300, cmp + `git -c core.autocrlf=true hash-object` == HEAD blob verified for every file)
- M1 revoke IDOR (drop tenantId from revoke filter): killed (7 pass / 2 fail).
- M3 store.create TTL bound disabled: killed (8 pass / 1 fail).
- M2 router hashes raw link instead of canonical: SURVIVED (9 pass). Tests only use an already-canonical link. Not a security hole (authority rejects non-canonical input, so a raw-hash record could never authorize), but a test gap. Suggested fix, low: add a route test posting "https://X.EXAMPLE/a" and asserting stored linkHash equals sha256 of the canonical href.

## Not verified / limits
- Mongo-backed migration test (no real Mongo), real Mongo filter semantics (in-memory double only), browsers, full suites, verify_contracts.py (vacuous), Opus-grade review. Zoom proof wiring was reviewed via prepareApprovalProofAuthorize and tests, not re-mutated.
- Efficiency ratios unmeasured; token totals not exposed to the checker.
