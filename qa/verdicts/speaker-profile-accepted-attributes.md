# Verdict: speaker-profile-accepted-attributes (U2.4), privacy review

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 13811dd186ba64d85c71237a33f32073af8ee6ba
Base: a9fac545 (lane/w16-u24attr). Reviewer: independent checker (Sonnet 5.5).

## Identity and the conflicting claim
- `git diff a9fac545 13811dd1 --name-only` lists only qa/manifests/speaker-profile-accepted-attributes.md. The candidate changes no source or test.
- The two maker claims are both literally true. At a9fac545 the exact identifier `acceptedAttributeReader` has 0 matches (grep confirms), so the earlier maker was right about the name. The capability exists under another name: apps/api/src/speaker-profiles/store.ts:18 takes `attributesReader?: AcceptedSpeakerAttributeReader` as the third argument of `createMongoSpeakerProfileDeps`. It is used in `get` (store.ts:28-34) and `getKnowledge` (store.ts:47-51). It is wired in composition/integrations/reviews.ts:24. The manifest wording is therefore correct about behaviour but names the parameter wrongly (note, not a defect).
- The SHA256 pins for store.ts, store.test.ts, attribute-authority.ts and attribute-authority.test.ts match the manifest at HEAD. The manifest line "this candidate invalidates prior store/store.test receipts by changing those files" is stale boilerplate: those files are unchanged from base.

## Required behaviour (source review, base == candidate)
- Accepted, same tenant and person, current source, valid receipt: service.ts:48 filters `tenantId === tenantId && personId === personId && status === "accepted" && current(r, authority) && acceptedReceipt(r)`. `current()` (service.ts:28-35) also binds the tenant, person, human-confirmed, non-ambiguous state, the source revision digest, the transcript hash and the exact own-block quote window. `acceptedReceipt()` requires the review history, the request hash and revision 2. mongo-store.ts uses the tenant-scoped `scopedCollection`, which is a second layer.
- Conflicts withheld: service.ts:52-53 adds a field to withheldFields when its accepted values differ. attribute-authority.ts:36 skips it, so the field is cleared.
- Withdrawn or absent values clear the field and its evidence: attribute-authority.ts:34 deletes `org`, `role` and their `*Evidence` before re-applying, so there is no fallback to the cached value.
- Reads inside the snapshot: store.ts:26-33 and 41-50 call the reader with `snapshotDb` from `withKnowledgeReadSnapshot`. The pre-snapshot pass only restricts (`if (!preflight) return null`). The reader receives a source-only authority and no relationship rows (no recursion).
- Missing reader: the legacy path is unchanged (store.ts:28, 47).

## Commands (lane apps/api, node from codex runtime, timeout 600, each run once, exit 0)
- store.test.ts: 16 tests, 16 pass.
- attribute-authority.test.ts: 2 tests, 2 pass.
- router.test.ts: 4 tests, 3 pass, 1 skipped (the private TOC test is gated by KB_U24_PRIVATE_TOC_TESTS).
- relationship-reader.test.ts: 2 tests, 2 pass.
- Total: 24 tests, 23 pass, 0 fail, 1 skipped. This matches the maker's claim. The four named nodes are among the passes. Output is in the scratchpad dir u24attr-evidence.

## Mutation (own, per-mutation byte backup, timeout, trap, HEAD-fidelity check)
- Mutant: service.ts:48 had `r.tenantId === tenantId` and `r.status === "accepted"` removed. The diff showed 1 line changed.
- Suites run against the mutant: speaker-attributes/service.test.ts (10 tests), speaker-attributes/mongo-store.test.ts (4) and speaker-profiles/attribute-authority.test.ts (2). All passed (exit 0), so the mutant SURVIVED. The 4 required files stub the reader, so they cannot reach this filter at all.
- Restored: `git hash-object` of service.ts is 4def84734ade5d087a6098ba903c080b3a130668, equal to `git rev-parse HEAD:` of the same file. The lane tree is clean.
- Interpretation: the filter is redundant with the store layer (tx.list filters by person and status, scopedCollection scopes the tenant, and `current()` binds the tenant), so there is no live disclosure path. But no test pins the explicit tenant and status guard against a hostile or foreign transaction. That is a coverage note on the producer unit (u24_quality), outside this manifest-only candidate. It is not filed as an issue.

## Not verified
Typecheck (maker claims 0 errors); the private TOC test; mounted API/UI; real Mongo transaction semantics; whether other consumers inject a reader (only reviews.ts:24 does).

ISSUES-WRITTEN: none
Ledger rows may be flipped: yes, for this manifest-only re-pin. The producer service's untested tenant/status guard is a note only.
