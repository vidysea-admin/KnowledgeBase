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
