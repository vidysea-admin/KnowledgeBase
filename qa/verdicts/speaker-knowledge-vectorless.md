# Verdict - speaker-knowledge-vectorless

VERDICT: PASS (scoped to the pure projection and bounded lexical router)
Cycle checked: 1
Reviewed SHA: 06619856fead052a59e9744fd48940b318b34d71
Base SHA: a9fac545 (source and test byte-identical at base; candidate diff is manifest only, 10 lines)
Source hashes (git hash-object after all mutations, equals HEAD blob): packages/index/src/graph/speaker-knowledge.ts 295c3f19ac3e0d10f9edb9e043d56507dc928cd1

## Independently verified (this checker)
- Focused test: `node --test --test-force-exit --import tsx src/graph/speaker-knowledge.test.ts` in packages/index -> exit 0, 11 pass / 0 fail (qa/evidence/speaker-knowledge-vectorless-c1/base-green.txt). Matches the maker claim.
- Mutations (own script, per-mutation byte backup, timeout 600, trap on INT/TERM/ERR, cmp + hash-object restore; qa/evidence/speaker-knowledge-vectorless-c1/summary.txt):
  - M1 drop visibleSessionIds gate (`visible.has(s._id)` -> true): RED, "tenant, visibility withdrawal and source deletion..." fails.
  - M2 drop `status !== "accepted"` relationship gate: RED, "only explicitly accepted exact current evidence..." fails.
  - M3 drop tenant filter on turns: RED, "colliding tenant metadata and source ids..." fails.
  - All restored; final blob equals HEAD blob.
- contracts/verify_contracts.py -> exit 0 (vacuous: no frozen contracts).

## Contract clauses
1 Confirmed identity only: identityStatus comes from buildSpeakerProfile (human-confirmed or deterministic floor); suggested -> unresolved, no person/statement/session nodes, router returns nothing (test 2). Tenant isolation: test 9. COVERED.
2 Read authority before projection: sessions, turns, claims, suggestions are filtered by tenant and caller visibleSessionIds before buildSpeakerProfile; claim evidence must be in a visible session. COVERED for the helper.
3 Source-backed: claim quotes must be literal substrings of the current turn; relationships need accepted status, tenant, two surviving attributed statements, own evidence locator, exact quote and current transcriptHash; no similarity edges. Tests 4, 5, 10. COVERED.
4 Freshness: revision digest changes on withdrawal, status change, deletion; duplicate claim ids refuse. COVERED.
5 Bounds: row-count refusals, 512KiB serialized cap, routing 8/6000 default and 20/12000 cap, NaN -> 0, Unicode/Devanagari/Hinglish routing. COVERED.

## Privacy angle (approved or public evidence only)
The helper itself holds no approval state; it narrows by the caller-supplied visibleSessionIds and claim status "verified", then delegates attribution to the profile. The privacy guarantee therefore comes from the consumer, which I read statically:
- apps/api/src/speaker-profiles/store.ts readSpeakerProfileInput: sessions kept only if visibility.sessionVisible (apps/api/src/visibility/knowledge.ts: false for whatsapp-batch sources and for consent.given === false); claims only if visibility.claimVisible (current-row recheck, turn quote match, WhatsApp approval chain); topics only if all sessionRefs visible; a final post-read session recheck; speaker org/role/confidence dropped if memberVisible fails. getKnowledge also runs a preflight, then re-derives inside withKnowledgeReadSnapshot, and passes visibleSessionIds = already-filtered sessions.
- Withdrawn or private statements therefore cannot reach the view: pending, withdrawn and WhatsApp-batch sessions never enter input.sessions; revoked/suggested relationships are withheld.
- router.ts requires scope "sessions", validates personId shape, checks view.tenantId/personId against the authenticated tenant, sets Cache-Control private/no-store, and returns 503 on error.
- packages/index/src/index.ts lines 45-46 export the three functions/types; no other consumer behavior changed. speaker-relations/service.ts consumes the view type via RelationshipAuthority.

## Not verified / limits
- apps/api consumer tests (router.test.ts, store.test.ts) could not run: lane has no installed apps/api deps (ERR_MODULE_NOT_FOUND express/mongodb; environment gap, not a product failure; qa/evidence/speaker-knowledge-vectorless-c1/consumer-*.txt). Consumer review above is static only. Remaining gate: run those two files in a provisioned tree (the parent/root broker).
- tsc not rerun; maker reports 3 errors in src/eval outside this unit (not checked).
- Parent gates stay open per the contract: corpus precision, human confirmation, mounted browser, live staging, graph persistence producer.
- Low note (no ledger entry): knowledge reuse of the helper by a new caller without a visibility-filtered session list would be unprotected, since visibleSessionIds is trusted. The existing consumers pass it correctly.

ISSUES-WRITTEN: none
Ledger rows may be flipped: the unit's own scoped row only (pure projection/router). Do not flip parent T-055/T-056 or consumer/mounted rows.
