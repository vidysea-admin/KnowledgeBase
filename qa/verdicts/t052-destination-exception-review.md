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
