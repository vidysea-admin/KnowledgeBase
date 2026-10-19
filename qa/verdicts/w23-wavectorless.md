# Verdict - w23-wavectorless

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: a8f1b4c060b2281cca33bf75129d382dbb1d24b1
Base: 3c99337f (cycle 0 candidate 382e0c14)
Unit: ISS-WAVECTORLESS-001, -002, -003
Reviewer note: Sonnet 5.5 review (Opus at weekly limit). Evidence: qa/.chk/c1-*.out, mut.c1m1.out (uncommitted, in lane).

## Cycle 1 evidence (independently run, timeout 600)
- Diff 382e0c14..a8f1b4c0 (apps): only consent-cas.test.ts (+17/-2): typed `bumpRevision` helper replaces the `as never` cast, plus one new test. store.ts and fixtures unchanged.
- tsc --noEmit apps/api: exit 0, no output. packages/core: exit 0, no output. (F1 cleared.)
- M1 (withdrawal filter ignores revision), per-mutation byte backup, trap INT/TERM/ERR, timeout, cmp restored, `git -c core.autocrlf=true hash-object` store.ts == HEAD blob 83c598c8 before and after: now KILLED (1 fail: "a revision bump between the withdrawal's read and write forces a retry", 11 pass of 12). Cycle 0 survivor closed.
- Test count: cycle 0 maker 104 vs now 87 is a different file selection, not deletion. Diff shows exactly one `test(` added and none removed, no .skip/.only added. My own identical glob (review/*, whatsapp/*, whatsapp-review/*, composition/integrations/*) without --test-force-exit: tests 105, pass 103, fail 0, skipped 2 (the opt-in native Mongo tests), rc 0. The libuv crash seen at cycle 0 did not recur.
- Not run: real-Mongo replica-set race (forbidden); -002 remains open on that point.
- Caller gap accepted: no production consent=false writer exists; withdrawWhatsAppSourceConsent is unwired and recorded in the manifest. A future withdrawal route must use it.

## Ledger rows
ISS-WAVECTORLESS-001 and -003: may flip to verified. ISS-WAVECTORLESS-002: may flip only with the caveat "fixture-verified; real-Mongo concurrent run and production caller outstanding"; otherwise leave open.

ISSUES-WRITTEN: none

---

# Superseded history

## Cycle 0 (superseded by cycle 1)

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 382e0c144a9cd777effe7b9bc4c88d47f46f95b3
Base: 3c99337f
Unit: ISS-WAVECTORLESS-001, -002, -003
Reviewer note: Sonnet 5.5 review (Opus at weekly limit). Consent-class unit; a second look at the tsc fix cycle by Opus is advisable if available.
Raw evidence (uncommitted, in lane): qa/.chk/*.out

#### Blocking finding (mandatory command red)
F1. `tsc --noEmit` for apps/api FAILS at the candidate (exit 2, reproduced twice, root and apps/api-local tsc 5.9.3):
`src/whatsapp/review/consent-cas.test.ts(112,50): error TS2322: Type 'string' is not assignable to type 'Condition<ObjectId> | undefined'.`
The manifest claims "apps/api tsc --noEmit: clean". That claim is false at this SHA.
Fix: in consent-cas.test.ts:112 cast the filter, e.g. `{ _id: input.source._id, tenantId: "tenant-a" } as never` (the `$inc` arg already uses `as never`). Re-run tsc for api.

#### What passed (independently run, timeout 600, from lane)
- node --test review/*.test.ts whatsapp/*.test.ts whatsapp-review/*.test.ts composition/integrations/*.test.ts: tests 105-106, pass 102, skipped 2, 0 assertion failures. Two files reported "test failed" with no assertion: libuv teardown crash `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) src\win\async.c` under --test-force-exit on a loaded Windows host (route-tenant.test.ts reproducibly; review-source.test.ts once). Neither file is in the diff; route-tenant.test.ts passes (rc 0) without --test-force-exit and review-source.test.ts passes alone (9/9). Treated as environmental, not a product failure.
- consent-race.test.ts + consent-cas.test.ts x3: 11/11 each, rc 0.
- store.test.ts 12/12; store-source-id.test.ts 6/6.
- packages/core tsc: rc 0. schema/validate.py (main .venv): PASS 46. gen-types --check: OK. lint-loc --all: OK (10 stages).
- Not run: real-Mongo replica-set race (forbidden here; maker also did not run it; ISS-002 stays open on that point).

#### Verify points
1. Fail closed: PASS for write path. checkEvidence now `consent?.given !== true` (store.ts:88). Remaining non-strict readers: whatsapp-review/review-source.ts:63 (`=== false`) and visibility/knowledge.ts:46,154 (`=== false` / `!== false`). Each is a pre-filter; the WhatsApp approval/candidate paths then call checkEvidence (knowledge.ts:69, review-source.ts), and knowledge.ts:154 sourceVisible excludes whatsapp-batch. Consent is schema-required so absent consent needs a schema bypass. Note only, not a finding.
2. CAS: revisionFilter uses `{$in:[null,0]}` for revision 0, which in real Mongo matches missing and null and 0; code relies on nothing else. Non-integer/negative revision throws. Withdrawal loop bounded (8), throws "lost the revision race" on exhaustion, tested. Fence `$set` fence-uuid and `$inc` revision are on different paths (no Mongo path conflict).
3. Fixture realism: `$inc` treats non-numeric as 0 (Mongo would error) and the fixture has no snapshot isolation, so test 1 (withdrawal between source read and fence) rejects with "authorization fence" whereas real Mongo would raise a WriteConflict, retry, and reject at checkEvidence ("evidence unavailable"). Both outcomes reject and write nothing; CAS logic is exercised either way. Session-scoped undo journal correctly keeps an out-of-session commit across rollback. Not vacuous: mutants below were caught. Residual limitation recorded, not blocking.
4. Unused function: grep of all non-test code found NO other production writer of `consent.given=false`/consent $set (only withdrawWhatsAppSourceConsent, store.ts:69; collections-router revoke writes document `status`, not consent). No unCAS'd withdrawal path exists, but `withdrawWhatsAppSourceConsent` has no production caller, so ISS-002's protocol is defined but not yet wired to any owner-facing route. Note: when a withdrawal route is built it must use this function.
5. Commands: above. tsc api RED (F1).
6. Mutations (script qa/.chk/mut.sh; per-mutation byte backup, trap INT/TERM/ERR, timeout 600, cmp, then `git -c core.autocrlf=true hash-object` == HEAD blob 83c598c8 before and after):
   - M1 (requested) withdrawal filter ignores revision: SURVIVED (11/11 pass). Note: withdrawal is monotonic so this is near-equivalent behaviorally, but no test asserts that a lost withdrawal CAS actually retries (test 2 passes with or without it). Weak-assertion note, not a security gap.
   - M2 withdrawal `$inc` dropped: CAUGHT (2 fail).
   Final store.ts hash equals HEAD blob.
7. D-015: ISS-001 floor 3/3 pass (store.test.ts names verified). ISS-003 floor 3/3 pass (store-source-id.test.ts). ISS-002 recorded repro is conceptual; covered by consent-cas.test.ts tests 1,2,6 on the fixture only; real-Mongo run named as left open.

#### Ledger rows
Do NOT flip ISS-WAVECTORLESS-001/-002/-003. After F1 is fixed and tsc api is clean, a cycle 1 re-check of that one command plus a spot rerun of consent-cas.test.ts should suffice; -002 should stay "open: real-Mongo run pending" or flip only with that caveat recorded.

ISSUES-WRITTEN: none
