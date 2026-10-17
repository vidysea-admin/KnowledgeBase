# Checker verdict — t052-destination-exception-review

VERDICT: FAIL
Cycle checked: 1
Reviewed SHA: 0f71beef83cdd2159be325bfe61694e3bd117519
Base SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-t052fix (branch lane/w17-t052fix)
Prior verdict: FAIL, cycle 0, committed 4edc84b0 in lane/w17-t052review (reviewed 9e55b642)
Checked at: 2026-10-17T17:11Z
ISSUES-WRITTEN: none
Ledger rows may be flipped: NO
Activation authorized (ruling 4): NO. Both constants must stay `false`.

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
