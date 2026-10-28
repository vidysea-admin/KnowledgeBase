# Verdict — goal-t053

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 1e15018127fb66fbc3bf4b1109c6296c7b6bfdd8
Base SHA: a9fac545
Scope: local criteria C1-C9 only (scoped PASS). P1-P4 full-parent gates remain OPEN and are not closed by this verdict.
Checker: independent checker subagent, fresh context, 2026-10-16. Security-relevant (SSRF, tenancy, data writes).
ISSUES-WRITTEN: none

## Identity

- Lane HEAD = 1e15018127fb66fbc3bf4b1109c6296c7b6bfdd8 (rechecked before persisting); apps/ packages/ clean against HEAD.
- Diff a9fac545..1e150181 (verified independently): fixtures.ts (+isIP literal-IP lookup), mongo-store.ts (4 methods made async), manifest + 2 evidence files.
- Final blobs: fixtures.ts c98697378936a101f04c9fbcc13c55c13219fb47; mongo-store.ts aae1805075a177c4a8f4b93a437021afe0b70dce; packages/ingest/src/sources/guarded-fetch.ts c81d0ee069cb228e29bf4a32f7e064ff6075754b (unchanged; identical in main).
- Environment: node from codex-primary-runtime bundle (version in node-version.txt). apps/api/node_modules/@lkb/* symlink to MAIN's packages, and main's working tree differs from the candidate in packages/index and packages/ask. The checker therefore ran tests with a loader (checker-c1/lane-pkgs.mjs) that redirects @lkb/* to the LANE's packages, and tsc twice (standard, plus a paths-mapped config onto the lane packages). M1 below proves the redirect took effect.

## Commands and results (independently produced; evidence dir qa/evidence/goal-t053/checker-c1/)

| Check | Result | Evidence |
|---|---|---|
| node --test (lane pkgs) workflow + generation + watched-job + public-preserved-review | 44/44 pass, exit 0, 194 s | green-lanepkgs.txt/.exit |
| packages/ingest guarded-fetch.test.ts | 42/42 pass, exit 0 | green-guarded-fetch.txt/.exit |
| tsc --noEmit -p apps/api/tsconfig.json | exit 0, 83 s | tsc-apps-api.txt/.exit |
| tsc on apps/api with @lkb/* mapped to lane packages | exit 0, 45 s | tsc-apps-api-lanepkgs.txt/.exit |
| vitest ConnectorsPage.test.tsx | 9/9 pass, exit 0 | ui-connectors.txt/.exit |
| contracts/verify_contracts.py | exit 0 (PASS by vacuity) | verify-contracts.txt/.exit |

## SSRF mutations (per-mutation byte backup, timeout 600, trap on EXIT/INT/TERM/ERR, HEAD-fidelity check: all restored)

- M1, private-IP check disabled in guarded-fetch.ts (`addresses.find((a) => false && isBlockedAddress(a))`): the connector test "auth, scope, body tenancy and unsafe URLs" FAILS (fetches actual 1, expected 0). KILLED.
- M2, fixture lookup reverted to the base `async () => ["93.184.216.34"]`: the same test FAILS. This confirms the maker's claim that SSRF went unexercised at base, and that the fixture fix is load-bearing.
- M3, only the first resolved address judged: 3 guard tests FAIL (ISS-007 every address, T036 mixed DNS, ISS-T036GUARD-001). KILLED.
- M4, redirect hop not re-checked (`hop > 0 ? undefined : ...`): 2 guard tests FAIL (REDIRECT to private, T036 redirect recheck). KILLED.
- Each run ends with `restored=HEAD-fidelity-OK`. Files: M*.result/.diff/.out.

## Security review (guarded fetcher, end to end)

- The watched path uses the real guard. Production wiring is wiring.ts:19, `createGuardedFetcher({lookup: resolveAll, request: httpRequest})`, and watched.ts:30 refuses a fetcher without the guard brand.
- The guard resolves every hop immediately before the request, with no cache, so DNS rebinding is covered (guarded-fetch.ts:226-242).
- It judges all returned addresses (line 239) and fails closed on an empty answer or an unparseable address.
- It pins the vetted address into the transport through a custom lookup (node-transport.ts:88-101).
- Redirects are re-resolved and re-checked on each hop. Non-http(s) targets are refused. The deadline is total across hops, and size is checked on every hop.
- isBlockedAddress covers:
  - loopback, private, 0.0.0.0/8, link-local and metadata, CGNAT, multicast and reserved
  - IPv6 ::1, ::, ULA, link-local and site-local
  - mapped, compatible, 6to4 and NAT64 addresses, judged on the embedded v4
  - Teredo
  - bracketed and zone-id forms
- The fixture's new lookup unwraps brackets, mirroring dns.lookup on literals. The fixture request still throws `unpinned` for any non-vetted address, so a guard bypass increments the counter and fails the test.

## Async store change

- listGaps, findGap, findSource and listWatched now reject with the same ConnectorWorkflowError(503, "connector_database_unconfigured") or tenant-validation error. Previously they threw synchronously. "disabled wiring, protected DBs..." asserts the rejection for undefined/lkb/LKB/global_university_db/lkb_staging and passes.
- Every caller awaits: gaps.ts:12,23,48,54; jobs.ts:30,44; router.ts:25,50,102; watched.ts:34; watched-job.ts:19. Because they await, the error codes and HTTP mapping are unchanged.
- assertWritableTenant intentionally stays synchronous.

## Criteria mapping (C1-C9)

- C1: "authenticated caller intake reaches real source/turn planner, Mongo sink and indexing consumer", production-shaped intake x2, hosted recording receipt, plus the UI 9/9. Fixtures are labelled as fixtures (fixtures.ts:2).
- C2:
  - "auth, scope, body tenancy and unsafe URLs"
  - "owner gap inventory pagination ... excludes other tenants"
  - a durable test where a forged body tenantId/actorKeyId is ignored and another tenant gets a 404 on the job check
  - the unacknowledged-gap test, where another tenant gets a distinct id
  - router.ts derives tenantId only from req.auth
- C3:
  - SSRF: M1/M2, plus the guard suite
  - credentials-in-URL rejected (400)
  - token not echoed ("public indexing degradation" asserts `private-fixture` is absent)
  - provenance: "watched snapshot validation binds exact Unicode bytes, provenance"
- C4:
  - "missing recording has durable owner/SLA and refuses nonexistent or unconsumed receipt"
  - "expiration requires overdue SLA and CAS loss is an explicit conflict"
  - "recording receipt URL cannot fabricate recording success"
  - unacknowledged insert gives 503 then an idempotent retry, with a 409 on conflict
- C5: "public indexing degradation is a source-linked gap", "production-shaped intake failure is visible", "CAS/no persistence, gap-write failure, resource cap and corrupt tenant never fabricate success", "durable worker indexing uncertainty creates one visible action gap".
- C6:
  - "watched snapshot preserves provenance, indexes changes, and skips unchanged"
  - "index failure leaves watched hash due; retry consumes ..."
  - partial/legacy consumer tests
  - watched.ts:94-104 persists lastFetch only after hasConsumedSource/recordConsumedSource
- C7: the sample run above, with commands, counts, exit codes and durations recorded. The boundary probes are mutations M1-M4.
- C8: the 7 generation.test.ts tests (persisted attempt and generation binding; stale/foreign/mixed refused; exact tree node; no uncertain takeover), plus "cached receipt refuses partial chunk turn coverage or foreign claim evidence". The real Mongo concurrent-writer and restart case remains P4.
- C9: the 4/4 public-preserved-review tests plus "canonical reviewed paraphrase retains exact current source evidence". The fixtures are synthetic and prove behavior only.

## Findings (none blocking; no new issues filed)

1. Process, required at close-out. qa/manifests/goal-t053.md:3-5 still reads `Handshake status: building / Status: building / Fix cycle: 0`. The appended section and commit message say cycle 1, ready-for-check. Fix: when closing out, set `Fix cycle: 1` and flip status to `checked-PASS` in the header fields, not only in an appended section.
2. Low, environment identity. The maker's 40/40 receipt ran against MAIN's packages through the node_modules symlink, and main differs from the candidate in packages/index and packages/ask. The checker reran against the lane packages, so the result stands. Fix: future packets should state which package root was resolved.
3. Low, note only. In production, the connector `/intake` route uses root-composed sourceIntake (source-intake/adapters.ts:101, guardUrlFetcher + Jina reader), not createGuardedFetcher. The fixture composes intake through createGuardedFetcher, so the connector SSRF test proves the guard in the fixture composition, not the production intake guard. That code is pre-existing and outside this diff, and the remote reader means the local host never connects to the user URL. C3 inherits that boundary. No unit is opened (round cap: file-don't-fix).

## Not verified / remaining gates

- P1-P4 remain open: real connectors and credentials, actual recording inventory and receipt, live watched cadence, production DB and tenant isolation.
- No live network, real Mongo or browser.
- Maker usage is unknown. The checker ran in BOOTSTRAP_REVIEW with a finite allocation from the orchestrator brief (130k tokens / 1500 s), ratio unverified (assess-phase1.out, assess-phase2.out). Actual checker tokens are unknown (null), and the debits recorded are allocations, not measurements.

## Ledger

- The goal-t053 local C1-C9 ledger/manifest rows may be flipped to checked-PASS (scoped), after correcting header finding 1.
- The full T-053 and catalogue readiness rows must NOT be flipped while P1-P4 are open.
