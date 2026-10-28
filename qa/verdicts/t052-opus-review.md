# Checker verdict: t052-opus-review (T-052 activation security review, Opus)

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: f9c359272d641f0e00ad22152130bc0a638b1130
Checked at: 2026-10-22T02:10Z
Checker: independent, fresh context, Opus 5.5 (claude-opus-5-5), single-checker workflow, never edited candidate code
Worktree: C:\Users\product\Desktop\KnowledgeBase-lanes\w30-t052act (branch lane/w30-t052act, HEAD == origin/master f9c35927, clean before review)
ISSUES-WRITTEN: ISS-T052ACT-001 (medium, coverage class, non-blocking) in qa/issues.T052ACT.jsonl

Scope: whether the T-052 Brevo/Zoom read-only resolver and Zoom proof may have their activation constants flipped
(`REGISTRATION_LINK_RESOLUTION_ENABLED`, registration-link-resolver.ts:7; `ZOOM_PROVIDER_CORRELATION_ENABLED`,
zoom-registration-proof.ts:5). Gates: D-178 ruling 4 and D-180 ruling 1 ("flip to true only after an independent
checker PASS on this unit"). This PASS satisfies that checker precondition for these modules at this SHA. It does not
authorize any form submission, any production write or migration run, and it does not close T-052.

## Activation limits (read before flipping)

1. No production caller exists. At this SHA, `git grep` finds no non-test caller of `resolveRegistrationLink`,
   `inspectZoomRegistrationConfirmation`, `approvalResolverAuthorize` or `prepareApprovalProofAuthorize`, and no Python
   or other code reads the two constants. A flip alone therefore activates no live path. A live path still needs
   `options.enabled === true` (resolver.ts:98, proof.ts:104) plus a trusted `authorize`.
2. The first production consumer is new code and needs its own checker review. It must use `approvalResolverAuthorize` /
   `prepareApprovalProofAuthorize`, a `RegistrationApprovalLookup` adapter backed by the API store's `findMatching`
   (none exists yet), the LIVE current registration-policy hash as `policyHash`, and `prepareApprovalProofAuthorize(..., tenantId = input.tenantId, ...)`.
3. The flip commit must amend tests that assert the constants are false: registration-provider-candidates.test.ts:31 and
   :36-37, and registration-approval-authority.test.ts:38-41. It must keep the `enabled !== true -> inactive` coverage
   (candidates test :39-40).

## Must-verify results (file:line)

1. Tenant-scoped, human-only, expiry <= 30 d, revocable, no IDOR. HOLDS.
   - Tenant comes only from the verified key, never from the body: router.ts:47-52, :67. Extra body keys are refused: router.ts:58 (`shape`).
     Every store query names its tenant: store.ts:138 (get), :142 (revoke), :149 (findMatching), and `assertValidTenantId` runs at :130/:137/:141/:145.
     The authority re-checks `record.tenantId` (registration-approval-authority.ts:28), and the resolver re-checks the tenant on the returned
     authorization (resolver.ts:103-104). The proof re-checks it at proof.ts:122 and :130, and the prepared authorize at authority.ts:51 and :61.
   - Human-only: `requireScope("registration:approve")` (router.ts:54, :75) plus `humanFor`, which must return a subject (router.ts:50-51).
     `createHumanApproverLookup` returns a subject only for `reviewerKind === "human"` of the same tenant in the server-owned
     LKB_REVIEW_AUTHORITY_JSON (router.ts:33-38; review-authority/policy.ts:60-62). Composition wires it at
     composition/integrations/reviews.ts:31, and requireAuth precedes routes at server.ts:124.
   - Expiry: ttlDays is an integer in 1..30 (router.ts:61), capped by Math.min (:66). Store create rejects anything over 30 d
     (store.ts:132). The authority re-checks `approvedAt <= now < expiresAt` and `expires - approved <= 30 d` (authority.ts:29-30).
   - Revocable: POST /registration-approvals/:id/revoke (router.ts:75-82) sets `revokedAt` once (store.ts:142). Lookup requires
     `revokedAt: null` (store.ts:149), and the authority refuses a truthy revokedAt (authority.ts:28).
   - IDOR: a cross-tenant revoke matches 0 rows and returns 404 (test :152). There is no GET route. A cross-tenant use is refused at the store query and again in the authority.
2. All hashes match at use time. HOLDS.
   - Resolver: linkHash (resolver.ts:105), scopeHash (:112), policyHash plus tenant/source fields (:103-104). The authority matches
     link/scope/policy against the row (authority.ts:38-39).
   - Zoom: the binding is recomputed (proof.ts:128). The authorization's bindingHash/policyHash/policyRevision/hostScopeHash are compared (proof.ts:130-132).
     The row's bindingHash/policyHash/policyRevision/hostScopeHash are compared (authority.ts:52-55), and the store query filters on all four (store.ts:118-120, :149).
     Limitation: `policyHash` is caller-supplied, so "current policy" binding is the future consumer's duty (Activation limit 2).
3. Canonicalised before hash/compare. HOLDS. The route hashes the WHATWG `href` after refusing whitespace/backslash/control
   characters, userinfo, port and fragment (router.ts:24-30, :68). The authority refuses any input link that is not already canonical
   (authority.ts:23-26, :36), so the resolver's raw hash (resolver.ts:105) equals the canonical hash.
4. GET-only, no cookies, no credentials. HOLDS. pinnedRegistrationGet uses `method: "GET"`, `agent: false`, and only the
   accept/accept-encoding/connection headers (resolver.ts:63-66). Userinfo is refused on every hop (:121). There is no cookie jar.
   The transport test asserts the exact header set (candidates test :276).
5. DNS pinned, per-hop re-validation, private IPs refused, caps. HOLDS.
   - Pin: a custom `lookup` returns only the checked address (resolver.ts:67-68). Peer equality is checked in the transport (:72) and in the resolver (:131-132).
     TLS uses `rejectUnauthorized: true` with SNI set to the URL host (:63). The test-only `trust.ca` parameter is unreachable from the resolver (:129 passes 4 args).
   - Per hop: scheme, port, userinfo, fragment, IP literal, allowlist, initial host and loop are checked (resolver.ts:119-123). Every DNS answer must be public and match its family (:126-127).
     Redirects need exactly one clean Location (:135-137). The final hop must be a 200 on finalZoomHosts at /webinar/register/<id> (:139-140). There are at most 6 requests (:118, :135).
   - Address policy (resolver.ts:37-52) refuses v4 0/8, 10/8, 127/8, 100.64/10, 169.254/16 (metadata), 172.16/12, 192.168/16,
     192.0.0/24, 192.0.2/24, 192.88.99/24, 198.18/15, 198.51.100/24, 203.0.113/24 and >= 224. For v6 it allows only 2000::/3, minus 2002::/16,
     2001:0000-01ff::/32, 2001:db8::/32 and 3fff::/20. Any dotted (mapped/compatible) v6 form and any zone id are refused.
     The checker probe also refused ::ffff:a9fe:a9fe, ::7f00:1, fd00:ec2::254, 64:ff9b:1::1, 100::1, 2002:a9fe:a9fe::1, 127.1, 0x7f.0.0.1 and FE80::1.
   - Caps: 1 MiB total is enforced in the transport (resolver.ts:76-78) and handed out as the remaining budget per hop (:129-131). The 15 s deadline is set at :113 and
     checked per phase (:124, :128, :131), with `bounded` races (:54-58) and a transport timer (:84).
6. The test seam requires BOTH doubles, and a guard test exists. HOLDS. Resolver seam: `options.dns && options.get` (resolver.ts:96). Proof seam: `options.authorize &&
   options.readNativeEvent` (proof.ts:101), backed by the same requirement in :104. Guard tests: candidates test :323-334 (each
   single double gives inactive) and :335-346 (no production file references the seams or the TLS fixture). Mutant R10 was killed.
7. No submission or credential typing in the flip path. HOLDS. The three modules contain no form, submit, type or password logic (grep). The
   resolver only GETs, and the proof is pure (no I/O, proof.ts:100). No consumer exists (Activation limit 1). The separate Python CDP path
   (packages/meeting-bot/py/registration_cdp*.py, D-079) does not reference these modules or constants. Note: a GET of the opaque Brevo tracking link may register a
   recipient click. This is already disclosed in t052-inactive-provider-candidates, and it is not a submission.

## Checks run (independent; exit codes and full output captured in the checker scratchpad)

Node v24.19.0 at C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin. Test imports were read first: there is no
browser, OBS, Mongo or external network. The transport tests use a 127.0.0.1 HTTPS listener only.

| Command (cwd) | Exit | Result |
|---|---|---|
| `node --test --import tsx src/calendar/registration-provider-candidates.test.ts` (packages/meeting-bot) | 0 | tests 23, pass 23, fail 0 |
| `node --test --import tsx src/calendar/registration-approval-authority.test.ts` (packages/meeting-bot) | 0 | tests 8, pass 8, fail 0 |
| `node --test --import tsx src/registration-approvals/registration-approvals.test.ts` (apps/api) | 0 | tests 10, pass 10, fail 0 |
| `node <lane>/node_modules/typescript/lib/tsc.js -p packages/meeting-bot/tsconfig.json --noEmit` | 0 | 0 diagnostics (43 s) |
| `node <lane>/node_modules/typescript/lib/tsc.js -p apps/api/tsconfig.json --noEmit` | 0 | 0 diagnostics (75 s) |
| Checker probe `t052opus-probe.test.mts` (scratchpad, imports lane modules by absolute URL) | 0 | tests 2, pass 2, fail 0 |

contracts/verify_contracts.py was not run. This unit changes no contract, and the brief scoped mandatory commands to the focused tests plus tsc.

## D-020 mutation run (per-mutation byte backup, try/finally plus signal/exit restore, 240 s spawn timeout per test run, outer `timeout 5400`)

The harness was `t052opus-mut-run.mjs` in the lane root, deleted after the run. Before each mutation it checked that the blob equaled HEAD, applied the change by byte replacement of a unique
string, verified the change landed (blob differed from HEAD), ran tests, restored from that mutation's backup, and verified `git -c core.autocrlf=true hash-object == HEAD:<file>`.
The guard test was skipped during mutant runs (`--test-skip-pattern`). Run time: 190 s. RESTORE-FAILURE: none.

| Mutant | Site | Result |
|---|---|---|
| R1 drop 169.254/16 | resolver.ts:43 | KILLED |
| R2 v6 range >= 0 | resolver.ts:50 | KILLED |
| R3 drop per-hop allowlist | resolver.ts:122 | KILLED |
| R4 drop per-hop public-DNS check | resolver.ts:126 | KILLED |
| R5 drop resolver totalBytes cap | resolver.ts:131 | SURVIVED (transport cap R6 killed; resolver test vacuous; ISS-T052ACT-001) |
| R6 transport byte cap x4 | resolver.ts:78 | KILLED |
| R7 transport deadline x100 | resolver.ts:84 | KILLED |
| R7b resolver deadline 15 s -> 1500 s | resolver.ts:113 | KILLED |
| R8 linkHash compare | resolver.ts:105 | KILLED |
| R9 scopeHash compare | resolver.ts:112 | KILLED |
| R10 seam dns OR get | resolver.ts:96 | KILLED |
| R11 GET -> POST | resolver.ts:63 | KILLED |
| R12 resolver peer pin | resolver.ts:132 | KILLED |
| R14 constant gate | resolver.ts:98 | KILLED |
| R15 tenant binding | resolver.ts:103 | KILLED |
| R16 add cookie header | resolver.ts:66 | KILLED |
| Z1 binding recompute | proof.ts:128 | KILLED |
| Z2 authorization.bindingHash compare | proof.ts:131 | SURVIVED (equivalent with production authorize, which returns the attempt binding; ISS-T052ACT-001) |
| Z3 hostScopeHash compare | proof.ts:132 | KILLED |
| Z5 attempt vs input tenant | proof.ts:122 | SURVIVED (redundant with prepared authorize tenant filter authority.ts:51/:61; ISS-T052ACT-001) |
| A1 authority tenant re-check | authority.ts:28 | SURVIVED (equivalent: authorization carries record.tenantId, refused by resolver.ts:103 / authority.ts:61) |
| A2 authority revoked | authority.ts:28 | KILLED |
| A3 authority 30-day bound | authority.ts:30 | KILLED |
| A4 authority policyHash | authority.ts:39 | SURVIVED (equivalent: authorization carries record.policyHash, refused by resolver.ts:103-104) |
| A5 authority canonical-link check | authority.ts:36 | KILLED |
| A6 authority expiry | authority.ts:30 | KILLED |
| A7 authority proof bindingHash | authority.ts:54 | SURVIVED (NOT equivalent in-module; store query is the tested layer; checker probe confirms refusal; ISS-T052ACT-001) |
| A8 authority proof hostScopeHash | authority.ts:55 | SURVIVED (NOT equivalent in-module; same as A7) |
| S1 store lookup tenant | store.ts:149 | KILLED |
| S2 store lookup revoked | store.ts:149 | KILLED |
| S3 store lookup expiry | store.ts:149 | KILLED |
| S4 store revoke tenant (IDOR) | store.ts:142 | KILLED |
| S5 store create 30-day cap | store.ts:132 | KILLED |
| S6 store get tenant | store.ts:138 | KILLED |
| T1 route human-only | router.ts:36 | KILLED |
| T2 route ttl cap 30 -> 31 | router.ts:61 | KILLED |
| T3 route canonical href | router.ts:28 | KILLED |
| T4 route scope removed (POST) | router.ts:54 | KILLED |

Totals: 38 mutants, 31 killed, 7 survived. Of the 7, 2 are equivalent (A1, A4) and 3 are redundant defense-in-depth (R5, Z2, Z5). 2 are in-module re-checks
(A7, A8) whose primary layer, the store query, is tested, and the checker's own probe shows the current code refuses lying rows. Every brief-required class
(tenant scope, human-only, expiry cap, a hash compare, private-IP refusal, redirect re-check, byte cap/deadline, both-doubles guard) has at
least one KILLED mutant on its enforcing line.
Post-run hashes (autocrlf=true hash-object == HEAD): resolver d72bbbb1, proof 061572bc, authority aa2f0815, store 161492f1, router a81cddbd. All match.

## Findings

- ISS-T052ACT-001, medium, coverage class (non-security by the D-014 class table; not a vulnerability at this SHA). The proof-path approval
  re-checks (authority.ts:54-55; proof.ts:122, :131) and the resolver total-byte cap (resolver.ts:131) have no killing test. Fix direction is in
  the ledger row. Verify it inside the next unit that touches these files, at the latest the first production-consumer unit.
- No security-class finding. No acceptance violation.

## EXPLANATION (low notes, not backlog)

- An approval binds link, scope and policy but not sourceId/messageId (authority.ts:40 echoes input values). This is consistent with D-180's field list.
- `humanFor` requires `reviewerKind === "human"` but not `canReview` (router.ts:36). Whoever controls LKB_REVIEW_AUTHORITY_JSON controls approvers either way.
- A revocation that lands after prepare/authorize but during the same <= 15 s resolution or synchronous proof is not re-checked. The window is bounded.
- In the "seams inactive" test, the `live` counter (candidates test :324/:333) is never incremented. The status assertions carry that test.
- The meeting-bot `canonicalApprovalLink` is looser than the route's (no whitespace/backslash refusal). This fails closed because the route never stores such hashes.

## Runtime and token accounting (per phase; wait time excluded)

Maker usage is unknown (no maker packet; candidate is unchanged origin/master), so BOOTSTRAP_REVIEW applies with the owner-authorized escalation
(<= ~250k tokens, 3600 s) and the ratio is unverified. Helper `review_budget.py assess` exited 0: status BOOTSTRAP_REVIEW, escalated true, exceeded [].

| Phase | Active s | Tokens |
|---|---|---|
| 1 skill + decisions + source/consumer/static review | ~160 | null (unmeasured) |
| 2 focused tests (3 files) | 68 | null |
| 3 tsc x2 (background, overlapped harness authoring) | 118 | null |
| 4 mutation run (38 mutants) | 190 | null |
| 5 probe, ledger, verdict, readback | ~250 | null |
| Total | ~790 active (launch-to-verdict wall ~900) | actual_total null. The host remaining-budget counter fell by about 150k, which is not a verified actual_total |

Within the brief's ~250k cap. No checker children or retries. One probe re-run after a harness module-format error (CJS vs ESM in the scratchpad). That error was a setup issue, not a product failure.

## Evidence (checker scratchpad, not committed)

C:\Users\product\AppData\Local\Temp\claude\C--Users-product-Desktop-KnowledgeBase\13f715a1-5ee4-435f-b454-61f5702f567a\scratchpad\t052\
(registration-provider-candidates.out/.exit, registration-approval-authority.out/.exit, api.out/.exit, tsc_*.out/.exit,
mut/results.jsonl, mut/final-hashes.json, mut/*.out, mut/*.bak, probe.out/.exit, t052opus-probe.test.mts, metrics-phase-final(.result).json)
