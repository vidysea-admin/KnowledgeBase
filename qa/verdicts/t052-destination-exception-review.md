# Checker verdict — t052-destination-exception-review

VERDICT: PASS
Cycle checked: 2
Reviewed SHA: 6bd12778f4147dfeafb4ebe619538df06b4d8828
Base SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-t052fix (branch lane/w17-t052fix)
Checked at: 2026-10-17T17:40Z
ISSUES-WRITTEN: none
Ledger rows may be flipped: this unit only (checked-PASS close-out). T-052 parent stays open; C1-C14 remain HOLD.
Activation (ruling 4): the checker-PASS precondition is SATISFIED for the two source files at 6bd12778. Activation is still subject to Umesh's D-079 PIVOT approval and to a production caller with a trusted durable `authorize`. The checker did not flip the constants. See "Cycle 2".
History: cycle 0 FAIL (4edc84b0, reviewed 9e55b642). Cycle 1 FAIL (0f15dc38, reviewed 0f71beef; header recorded below as historical).

## Cycle 1 record (historical; superseded by the header above)

Cycle 1 result: FAIL. Cycle 1 reviewed SHA: 0f71beef83cdd2159be325bfe61694e3bd117519. Checked at 2026-10-17T17:11Z.

## Identity and changed paths

- `git log 9e55b642..HEAD` contains one commit, 0f71beef. The working tree is clean for `packages/`.
- Final blobs (the raw bytes equal the HEAD blobs):

| File | Blob |
|---|---|
| resolver | 69e83252dc758b803c48649fbe3e130ee87524b1 |
| proof | 86ef4b4e02dd6bd6bf83c0d6317dcbde6e984f96 |
| test | 886ba138c18ea5c5f233b98bfcbe11af8abed739 |
| `registration-tls-test-fixture.ts` | 44411c2726cfbedb6e17279ef0f370dbaeee6235 |

- The fixture blob has mixed CRLF/LF line endings, so `-c core.autocrlf=true` hashes it differently. `--no-filters` equals HEAD.
- Constants are still `false`: resolver:7 and proof:5.
- `@lkb/core` `sender-authentication.ts` is identical in the lane and in main (0dd81672).

## Independent results

- Focused suite: `timeout 600 node --test --test-force-exit --import tsx src/calendar/registration-provider-candidates.test.ts`. Exit 0; tests 21, pass 21, fail 0.
- Typecheck: `node <lane>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`. Exit 0, no output.
- Checker probes on the candidate:
  - `probe/hop-probe.ts`: 10 attack cases plus a positive control, failures 0.
  - `probe/transport-probe.ts`, a real local TLS server on port 443 with a throwaway CA:
    - GET only
    - headers are only accept, accept-encoding, connection, host
    - `Set-Cookie` is not replayed
    - `rejected:bytes`
    - `rejected:deadline` in 518 ms
    - `ERR_TLS_CERT_ALTNAME_INVALID`
    - the 2-hop composition returns a candidate
- Checker mutations: 9 of 9 KILLED by the unit's own suite. Every mutant was restored with `cmp` ok and its HEAD hash ok.

| Mutant | Killing test |
|---|---|
| M1 extra host | "every bad redirect target ... ZERO requests" |
| M2 skip redirect re-check | same test |
| M3 POST | "transport: GET only ..." |
| M4 skip per-hop address check | "redirect target resolving to private/mixed ..." |
| M5 skip resolver peer check | "peer address that differs ..." |
| M6 resolver constant ignored | "both candidates default inactive" |
| M7 proof constant ignored | "F4: the proof module needs BOTH" |
| M8 F5 reverted | "F5: conflicting join id" |
| M9 cookie header added | "transport: GET only ..." |

- Harness note: the subshell's ERR trap restored the source as soon as the failing suite returned. The probe re-runs inside M1-M4 therefore executed on restored source. Those probe exits (0) are not mutation evidence. The kills above come from the suite, which ran while the mutant was applied.
- F1, F2, F3, F5: FIXED, verified by code reading, the kill table and the probes.

## Findings

**F4-R (medium, blocking for an activation gate): the test seam is a live-network bypass of the activation constant.**

- `registration-link-resolver.ts:94` exports `resolveRegistrationLinkWithConstantForTest = resolveWithConstant`.
- `zoom-registration-proof.ts:99` exports `inspectZoomRegistrationConfirmationWithConstantForTest = inspectWithConstant`.
- Any module can call `resolveRegistrationLinkWithConstantForTest(input, {enabled: true, authorize}, true)` while `REGISTRATION_LINK_RESOLUTION_ENABLED` is `false`. That call gets the default `dns` (`lookup`) and the default `get` (`pinnedRegistrationGet`), so it makes real outbound HTTPS requests.
- Today the only importer is the test file (`git grep` over the lane, excluding qa). Neither module is exported from `packages/meeting-bot/src/index.ts`. Nothing prevents a future caller, however; the only guard is the name.
- The cycle-0 fix required the constant to gate the real network path. That is still not true. The constant also stops working as a rollback switch.

Concrete fix (no change to existing tests is needed):

1. Resolver: the seam must refuse the real transport. For example:

   ```ts
   export const resolveRegistrationLinkWithConstantForTest = (i, o, c) =>
     typeof o?.dns === "function" && typeof o?.get === "function"
       ? resolveWithConstant(i, o, c)
       : Promise.resolve({status: "inactive", reason: "approval-required"});
   ```

   Every resolver test already injects both `dns` and `get`; the transport tests call `pinnedRegistrationGet` directly.
2. Add a standing guard test that fails if any non-`*.test.ts` file under `packages/` or `scripts/` references `WithConstantForTest` or `registration-tls-test-fixture`. Use a `git grep` or fs scan.
3. Proof seam: it has no network I/O, but it produces join-authorizing proofs while the constant is false. The guard test in step 2 is sufficient for it.

Alternative: move both seams to a test-only module, for example `calendar/__test__/registration-seams.ts`. Exclude it from the build in tsconfig, and add the guard test.

**(b) Committed private key (low, not blocking):**

- Facts:
  - `registration-tls-test-fixture.ts` holds a self-signed cert, CN `lkb-test-localhost`, SAN `localhost` and `pinned.test`, and its PKCS#8 key.
  - It is passed only as the optional `trust.ca` argument in tests.
  - The resolver's own `get` call (resolver:127) passes 4 arguments and never a CA, so production never trusts it.
  - The CI workflows (`.github/workflows/ci.yml`, `docker.yml`) contain no gitleaks, trufflehog or detect-secrets step.
  - No other PEM private key exists in the repo.
- Risks:
  - The cert is **CA:TRUE with keyCertSign and 100-year validity**.
  - The file is under `src/`, so `tsconfig` `include: src/**` compiles and ships it.
  - The repo is PUBLIC. GitHub's default scanning targets provider patterns; a generic PEM key is normally a GHAS non-provider pattern, so a push block is unlikely. Third-party scanners (GitGuardian and similar) will raise alerts.
- Fix:
  - Regenerate the cert as a leaf (CA:FALSE, serverAuth, short validity).
  - Move the fixture to a test-fixtures path excluded from the build, or generate it at test time with openssl when available.
  - Add a scanner allowlist entry naming the file.
  - Normalise its line endings.

**(c) M15 residual: ACCEPTABLE.** The transport peer check (resolver:72) cannot fire in tests, because the pinned `lookup` forces the socket to the pinned address. The duplicate resolver-level check (resolver:130) is tested and kills M5. This is a defense-in-depth line without a test.

**Low notes (EXPLANATION only):**

- The maker kept its mutation scripts outside the lane; the common rules require them in the lane.
- The maker's M1-M15 table was not re-run as such. I independently ran M1-M9 above.

## Gate status

Source safety holds:

- read-only GET
- exact approved host set
- all addresses checked and pinned
- every hop re-checked
- 15 s / 1 MiB limits
- no cookies or credentials
- no logging
- tenant-bound approval

Re-check needs only:

- the F4-R seam fix and its guard test
- the 21+ test suite green
- a re-run of M1-M9

After a PASS, the activation change remains:

- resolver:7 `REGISTRATION_LINK_RESOLUTION_ENABLED` → `true`
- proof:5 `ZOOM_PROVIDER_CORRELATION_ENABLED` → `true`
- wiring a production caller that has a trusted, durable `authorize` (none exists)
- Umesh's D-079 PIVOT

Evidence is in this lane under `qa/evidence/t052-destination-exception-review-c1/`:

- `baseline.{out,exit}`
- `typecheck.{out,exit}`
- `hop-probe.original.out`
- `transport-probe.original.out`
- `mutate-c1.log`
- `mut-*`
- `probe/*.ts`, `probe/mutate-c1.sh` (the throwaway CA and server keys were deleted)

Not verified:

- live Brevo/Zoom DNS and TLS
- activation wiring and durable consume/replay (they do not exist)
- full T-052 C1-C14 acceptance (remains HOLD)

Budget: maker usage is unknown, so the ratio is unverified. Checker tokens and time are not host-measured and are recorded as null. `review_budget.py assess` was not run per phase; this is recorded as a process miss.

## Cycle 2 (reviewed 6bd12778f4147dfeafb4ebe619538df06b4d8828, on top of 0f71beef)

**Identity.** `git log` shows 6bd12778 directly on 0f15dc38 (the cycle-1 verdict) and 0f71beef. The diff 0f71beef..6bd12778 touches:
- the two seam lines (resolver:94-96, proof:99-101)
- the test file (+2 tests; it now reads the PEMs at runtime)
- the deleted `src/calendar/registration-tls-test-fixture.ts`
- the new `packages/meeting-bot/__fixtures__/registration-tls/{TEST-ONLY-cert.pem,TEST-ONLY-key.pem,README.txt}`
- the manifest

The maker did not modify the verdict file. Both constants are still `false` (resolver:7, proof:5). Final blobs equal HEAD under `-c core.autocrlf=true`:

| File | Blob |
|---|---|
| resolver | fad36f430a48cb8f2ca88566b3efea9cf5810cfc |
| proof | 061572bcfc93b3b55db4e01ecc8300bc6ed7c546 |
| test | f6d2380a982940ea235ca3f1d5c128b56514a8c3 |

**Mandatory runs** (from packages/meeting-bot, node v24.19.0):
- `timeout 600 node --test --test-force-exit --import tsx src/calendar/registration-provider-candidates.test.ts`: exit 0; tests 23, pass 23, fail 0.
- `timeout 600 node <lane>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: exit 0, empty output.

**Probes on the candidate:**
- hop-probe: failures 0.
- transport-probe on a real local TLS server: ok (GET only, no cookie replay, bytes/deadline/altname rejections, 2-hop candidate).

**Mutations.** `probe/mutate-c2.sh` keeps a per-mutation byte backup and uses a trap on EXIT/INT/TERM/ERR with `timeout`. The probes run BEFORE the suite, and failing commands are wrapped as `|| r=$?`, so the ERR trap cannot restore early (this fixes the cycle-1 harness artifact). Every mutant was restored with `cmp` ok and its HEAD hash ok.

| Mutant | Unit suite | Checker probe |
|---|---|---|
| M1 extra host | KILLED | hop-probe KILLED |
| M2 skip redirect re-check | KILLED | hop-probe KILLED |
| M3 POST | KILLED | transport-probe KILLED |
| M4 skip per-hop address check | KILLED | hop-probe KILLED |
| M5 resolver peer check | KILLED | - |
| M6 resolver constant ignored | KILLED | - |
| M7 proof constant ignored | KILLED | - |
| M8 F5 reverted | KILLED | - |
| M9 cookie header | KILLED | - |
| M10 resolver seam active without doubles | KILLED ("seams are inactive unless BOTH dns and get doubles are injected") | - |
| M11 proof seam active without doubles | survived, EQUIVALENT: `inspectWithConstant` itself already refuses without `authorize` and `readNativeEvent` (proof:105), so the outer check is redundant | - |

**Guard test.** Coverage was checked by creating a non-test file that references `resolveRegistrationLinkWithConstantForTest`, running the suite, then deleting the file (verified removed):

| Probe | Location | Result |
|---|---|---|
| G1 | `packages/meeting-bot/src/calendar/zz-checker-guard-probe.ts` | KILLED by "guard: no production file references ..." |
| G2 | `apps/api/src/zz-checker-guard-probe.ts` | NOT detected |
| G3 | `packages/meeting-bot/zz-checker-guard-probe.ts` | NOT detected |

The guard is not trivially satisfied:
- it walks all of `meeting-bot/src` recursively
- it allows only the two defining files
- it matches the seam name and the fixture path

Its scope, however, is meeting-bot/src only. `apps/api/src/join-rules/deps.ts` already deep-imports meeting-bot src, so a cross-package caller would not be caught.
- Fix (low, non-blocking): widen the walk to the repo's `packages/`, `apps/` and `scripts/`, excluding node_modules, dist and test files.

**Can the injected-doubles rule be spoofed?** Yes. Resolver:96 checks only the truthiness of `options.dns && options.get`. A caller passing `dns: h => lookup(h, {all: true, verbatim: true})` and `get: pinnedRegistrationGet` (both exported or available) would reach live egress with the constant false.

Judgement: this does NOT block.
- The cycle-1 defect was that a plain call with only `enabled` and `authorize` silently used the real transport. That is now closed (M10 proves the refusal).
- What remains needs deliberate code that hand-wires the production transport into a function named `...ForTest`, against the doc comment and the guard. That is the same intent and review visibility as editing resolver:7, which no runtime check can prevent.
- The guard-scope widening above further reduces the accidental cross-package path.

**Committed test key in a PUBLIC repo: acceptable.**
- `openssl x509` shows:
  - self-signed `CN=lkb-test-leaf`
  - **CA:FALSE** (critical); KeyUsage digitalSignature, keyEncipherment
  - EKU serverAuth only
  - SAN `localhost` and `pinned.test`
  - valid 2026-10-17 to 2036-10-14
- The key's public half matches the cert (sha256 e41d3377...).
- Tests only use it as the explicit `trust.ca` argument. The production `get` call passes no CA.
- It is a non-CA leaf for loopback and test names, so it cannot sign other certificates. It is only trusted by code that explicitly pins this exact cert, so disclosure gives an attacker nothing.
- It is outside tsconfig `include` (src/**), so it is never compiled. The Dockerfile copies `packages/`, so the PEM ships as an inert file in images.
- No other PEM private key exists in the repo. CI runs no secret scanner. Third-party scanners may still raise a generic-private-key alert.
- Recommendation (low): add a scanner allowlist entry for this path, or exclude `__fixtures__` in `.dockerignore`.

**M15 residual** (transport-level peer check at resolver:72): still ACCEPTABLE. It cannot be reached under a pinned lookup; the resolver-level check is tested (M5).

**Low notes (EXPLANATION only, no new issues):**
- The seam test's `let live = 0` counter is never incremented, so `assert.equal(live, 0)` is vacuous. The real assertions are the `inactive` statuses, and M10 confirms they bite.
- M11 is an equivalent mutant.
- The maker's own mutation scripts are kept outside the lane.

**Cycle-2 conclusion: PASS** for the scope of this gate:
- the two source files' read-only destination exception
- SSRF, redirect, transport, no-credential, no-logging and tenant-binding controls
- the inactive-by-default constants
- the regression protection

**Activation.** Ruling 4's checker-PASS precondition is now satisfied. The activation change is:
- `packages/meeting-bot/src/calendar/registration-link-resolver.ts:7`: `REGISTRATION_LINK_RESOLUTION_ENABLED` `false` → `true`
- `packages/meeting-bot/src/calendar/zoom-registration-proof.ts:5`: `ZOOM_PROVIDER_CORRELATION_ENABLED` `false` → `true`
- a production caller using the PUBLIC `resolveRegistrationLink`/`inspectZoomRegistrationConfirmation` (never the seams), with a trusted durable `authorize` approval lookup, `readNativeEvent`, and consume/replay persistence. None exists at 6bd12778.

The gate proposal (`qa/gates/t052-zoom-confirmation-and-brevo-resolution.md`, untracked in main) still records the policy transition as awaiting Umesh. This PASS does not supply that approval, does not authorize any form submission or production write, and does not close T-052 (C1-C14 remain HOLD). The checker has NOT flipped the constants.

**Evidence** is in this lane under `qa/evidence/t052-destination-exception-review-c2/`:
- `baseline.{out,exit}`
- `typecheck.{out,exit}`
- `hop-probe.original.out`, `transport-probe.original.out`
- `mutate-c2.log`
- `mut-*.{summary,test.out,test.exit,hop.*,transport.*}`
- `probe/{hop-probe.ts,transport-probe.ts,mutate-c2.sh,ca.crt,srv.crt}` (the throwaway CA and server keys were deleted)

**Not verified:** live Brevo/Zoom DNS and TLS (no network), the caller wiring and durable consume path (they do not exist), and the maker's own M1-M16 table as such.

**Budget:** maker usage is unknown, so the ratio is unverified. Checker tokens and time are not host-measured and are recorded as null. `review_budget.py assess` was not run per phase; this is recorded as a process miss.


---

## Superseded history

# Checker verdict — t052-destination-exception-review

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Base SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54 (existing-source review; base = candidate)
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-t052review (branch lane/w17-t052review)
Checked at: 2026-10-17T16:47Z
ISSUES-WRITTEN: none (findings below are for the maker's fix cycle; the brief limits the checker's writes to the verdict and evidence)
Ledger rows may be flipped: NO. Activation of the D-079 Brevo/Zoom destination exception (ruling 4) is NOT authorized by this verdict.

## Scope and identity

- Reviewed files (blob ids at the reviewed SHA, HEAD fidelity re-verified after all mutations):
  - `packages/meeting-bot/src/calendar/registration-link-resolver.ts`, blob 3113636283f12aec7942f65306da7249249c5ec8
  - `packages/meeting-bot/src/calendar/zoom-registration-proof.ts`, blob db039d5811104b283420a484846b4592866e29fa
  - their only test, `packages/meeting-bot/src/calendar/registration-provider-candidates.test.ts`, blob 6ab1286c1e030b0735c7b4c5f3cf8828bbe2de42
- Consumers: `git grep` at 9e55b642 finds no production importer of either module. Only the test file imports them, so both are inactive in practice.
- Inputs read:
  - `qa/contracts/goal-t052.md`
  - D-079 (`docs/DECISIONS.md:1570`)
  - the gate proposal `qa/gates/t052-zoom-confirmation-and-brevo-resolution.md`. It is NOT tracked at 9e55b642; it exists untracked in the main tree only, sha256 4f49ccc2144945908ed78332ef39ef2a9643d01699f02e51dd2176b08a780f3d.
- `@lkb/core` `assessSender` resolves through the node_modules junction to the main tree. Its blob 0dd8167256ab0da43d8eead5fe0c6d7d27c7061f is identical in the lane and in main.

## Property checklist (source behaviour)

| Property | Result | Evidence |
|---|---|---|
| Read-only, no POST, no form submission | holds in source | resolver:63 hard-codes `method:"GET"`. Real-transport probe A/E observed only GET. There is no body write and no form code. zoom-registration-proof.ts does no network I/O. |
| Exact host chain (Brevo tracking to Zoom registration) | holds, as an approved host SET, not an ordered chain | Hop 0 must equal the literal `b64wc.r.a.d.sendibm1.com` (resolver:99,114). Every hop must be in `allowedHosts` (resolver:114). The final hop must be in `finalZoomHosts` ⊂ zoom.us/*.zoom.us (resolver:102-103) with path `/webinar/register/<code>` and status 200 (resolver:131-132). The host set is bound to the approval through `scopeHash` (resolver:104). |
| SSRF: all resolved addresses judged, DNS pinned, peer verified | holds | resolver:117-119 checks every answer and `family`. resolver:121 pins `addresses[0]`. The peer is checked in both the transport (resolver:72) and the resolver (resolver:124). Reserved v4/v6 ranges are at resolver:37-52. |
| Every redirect hop re-checked (URL, scheme, port, credentials, fragment, IP literal, allowlist, DNS) and hop count capped | holds in source | Redirects loop back to the top of the loop (resolver:110-129). At most 5 redirects / 6 requests. Exactly one Location; loops are refused. Checker hop-probe on the original source: 10/10 attack cases refused with zero requests to the bad hop, and the positive 3-hop control returned a candidate. |
| Timeout and byte cap | holds | 15 s total deadline (resolver:105,116,120,123) plus a socket timer (resolver:84). 1 MiB cumulative cap (resolver:61,78,121,123). Real transport: `rejected:bytes`, and `rejected:deadline` in 537 ms on a 500 ms budget. |
| No credentials or cookies sent | holds | `agent:false`. Fixed headers: accept, accept-encoding, connection. URL userinfo is refused. Real-transport probe: header names were only accept/accept-encoding/connection/host. A `Set-Cookie` on hop 1 was NOT replayed on hop 2. |
| TLS hostname verification under a pinned IP | holds | Probe D: `ERR_TLS_CERT_ALTNAME_INVALID` for a host the certificate does not cover. |
| No PII in logs | holds | Neither file contains `console.`/`process.std`. Refusal reasons are finite constants, and every exception is swallowed into `resolution-refused`/`proof-unavailable`. The full URL and body are returned only in the private proof object. |
| Tenant-scoped | holds (depends on the trusted `authorize` lookup) | The resolver binds tenant/source/message/sourceHash/policyHash/linkHash/scopeHash (resolver:95-104). The proof binds tenant/source/bindingHash/policy/revision/hostScopeHash (proof:113-123). Recipient and mailbox must match. |
| INACTIVE by default | holds today, but the constant is bypassable (see F4) | resolver:7 and proof:5 are `false`. Standing test 1 confirms zero DNS/HTTP calls. No production consumer exists. |

**No exploitable SSRF or egress defect was found in the source logic.** The FAIL is about the standing regression protection for a security-class activation, plus one hardening item. This is a proven, reproducible gap: every security mutation survives the unit's own tests.

## Mutation results (independent; per-mutation byte backup, `timeout`, trap on EXIT/INT/TERM/ERR, cmp + HEAD-fidelity)

| Mutant | Edit | Unit's own suite (11 tests) | Checker probe |
|---|---|---|---|
| M1 allow extra host | drop `!input.allowedHosts.includes(url.hostname)` (resolver:114) | **SURVIVED** (pass 11, exit 0) | KILLED by hop-probe (2 failures) |
| M2 skip redirect re-check | URL validation only when `hop === 0` (resolver:113) | **SURVIVED** (pass 11, exit 0) | KILLED by hop-probe (6 failures) |
| M3 allow POST | `method:"POST"` (resolver:63) | **SURVIVED** (pass 11, exit 0) | KILLED by transport-probe (`'POST' !== 'GET'`, exit 1) |
| M4 skip per-hop address check | address validation only on hop 0 (resolver:118) | **SURVIVED** (pass 11, exit 0) | KILLED by hop-probe (3 failures) |
| M5 skip resolver peer check | planned | not run: the harness pre-state guard refused it (see Environment note) | n/a |

Restoration: each mutant was restored from its own backup (`cmp` ok). The final `git hash-object` of all three files equals the HEAD blobs above.

## Findings and concrete fixes

- **F1 (high, security regression gap): redirect tests are vacuous.** `registration-provider-candidates.test.ts:58-65` injects a `get` that returns the same 302 for every URL. Each bad Location is therefore refused by loop detection (`seen`, resolver:114) or by the final-host check, never by per-hop validation. That is why M1 and M2 survive.
  - Fix: `get` must redirect only from the initial URL.
  - For each bad Location, assert `refused` AND that no `get`/`dns` call was made for the bad hop.
  - Bad Locations to cover: unlisted host, unlisted zoom subdomain, http, port, userinfo, IP literal.
  - The pattern is in `qa/evidence/t052-destination-exception-review/probe/hop-probe.ts` in this lane.
- **F2 (high, security regression gap): no test covers per-hop DNS validation after a redirect.** Test line 53 only covers hop 0. Fix: add a per-host DNS map in which the redirect target (zoom.us) resolves to a private, mixed (public + 169.254.169.254) or `::ffff:` answer. Assert refused with zero requests to hop 1. This must kill M4.
- **F3 (high, security regression gap): the real transport `pinnedRegistrationGet` (resolver:60-87) has zero test coverage.** Every test injects `get`, so method, headers/cookies, pinned lookup, TLS hostname verification, byte cap, deadline and peer check are unguarded. M3 survives.
  - Fix: add a test that starts a local HTTPS server with a throwaway CA (passed via `NODE_EXTRA_CA_CERTS` in a child process, or a test-only `ca` parameter) and asserts:
    - GET only
    - no cookie/authorization headers
    - `Set-Cookie` is not replayed
    - byte-cap and deadline rejection
    - altname mismatch rejection
  - The pattern is in `probe/transport-probe.ts`.
- **F4 (medium, hardening): the INACTIVE constant is not the activation switch.** resolver:90 and proof:95 use `options.enabled ?? CONSTANT`, so any future caller that passes `enabled:true` with an `authorize` callback activates live network egress while the constant still reads `false`.
  - Fix: make the constant gate the real network path. For example, refuse unless `REGISTRATION_LINK_RESOLUTION_ENABLED === true` whenever `options.get`/`options.dns` are not injected. Tests that inject both keep working.
  - Apply the equivalent change in the proof module.
- **F5 (low/medium, gate step 4 conformance):** zoom-registration-proof.ts:83 collects provider IDs only from `allowedZoomHosts`. A conflicting `/j/<otherId>` link on an unlisted `*.zoom.us` host is ignored instead of refused, while the gate says "conflicting or unidentifiable provider IDs refuse". This is from code reading and was not probed. Fix: collect IDs from any `zoom.us`/`*.zoom.us` host, keep the button-host restriction, and add a test.
- Note, not a defect: the host constraint is an approved exact-host set bound by `scopeHash`, not an ordered chain. The approval lookup must therefore approve exactly `{b64wc.r.a.d.sendibm1.com, <zoom registration host>}` and nothing broader.

## Activation change (for after a PASS on a fixed cycle; not authorized now)

1. `packages/meeting-bot/src/calendar/registration-link-resolver.ts:7`: `REGISTRATION_LINK_RESOLUTION_ENABLED = false` → `true`.
2. `packages/meeting-bot/src/calendar/zoom-registration-proof.ts:5`: `ZOOM_PROVIDER_CORRELATION_ENABLED = false` → `true`.
3. A production consumer must be wired with a trusted, durable `authorize` approval lookup (and, for the proof, `readNativeEvent`). None exists at 9e55b642. Per the gate, this also needs durable consume/replay integration and Umesh's D-079 PIVOT approval.

Line numbers may move in the fix cycle; the re-check must re-pin them.

## Commands and evidence (lane-relative, `qa/evidence/t052-destination-exception-review/`)

- Toolchain: node v24.19.0 (`C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`), tsx through node_modules junctions into the main tree.
- Baseline: `timeout 600 node --test --test-force-exit --import tsx src/calendar/registration-provider-candidates.test.ts` (from packages/meeting-bot). Result: exit 0, tests 11, pass 11. Files: `baseline.out`, `baseline.exit`.
- Real-transport probe: `NODE_EXTRA_CA_CERTS=probe/ca.crt timeout 120 node --import tsx probe/transport-probe.ts probe 443`. Result: exit 0, cases A-E ok. Files: `probe.out`, `probe.exit`. The throwaway CA and server keys were deleted after the runs.
- Hop probe on original source: `timeout 300 node --import tsx probe/hop-probe.ts`. Result: exit 0, failures 0. Files: `hop-probe.original.out`, `hop-probe.original.exit`.
- Mutations: `probe/mutate.sh` (unit suite; M3 also runs the transport probe) and `probe/mutate2.sh` (hop probe). Outputs: `mutate.log`, `mutate2.log`, `mut-*.{test,probe}.{out,exit}`, `mut-*.summary`, `mut2-*`.
- Not verified:
  - live DNS/TLS against the real Brevo/Zoom hosts (no network, by rule)
  - the M5 mutant
  - F5 behaviour by execution
  - typecheck (no code changed)
  - durable activation/consume integration (it does not exist yet)
  - T-052 C1-C14 full acceptance, which is out of scope for this source gate and remains HOLD in the parent contract.

## Environment note

During the run, `C:/Users/product/Desktop/KnowledgeBase/.git/config` began reporting `core.autocrlf=false`; the system gitconfig has `true`. The checker did not make this change. The worktree was checked out with CRLF under `true`, so plain `git hash-object` stopped matching the HEAD blobs mid-run. The harness's pre-state guard then refused M5 rather than mutate an unverified file. The bytes were unchanged throughout (`cmp` ok). Fidelity was re-verified with `git -c core.autocrlf=true hash-object`.

## Budget

Maker usage is unknown (this is an existing-source review with no maker packet), so the ratio is unverified. Checker tokens and active time were not measured by the host, so they are recorded as null. `review_budget.py assess` was not run per phase; this is recorded as a process miss, not waived. The brief's budget was about 150k tokens.
