# Verdict: wa-web (W10 wa-links-web), checker a

Verdict: PASS
Cycle checked: 0
Base: 80073a37  Head: c772be75  Tier: L  Mode: A (dual check, coordinator a)
Policy: proportional-verification/2026-10-19.17

## Check plan
Re-run manifest verify commands in an isolated copy; one named falsification per criterion W10-1..W10-8; own browser walk with a stubbed API (real API unreachable: routers unmounted in production, ISS-WASEL-001).

## Scoreboard
| Criterion | Re-run | Falsification (copy only) | Result |
|---|---|---|---|
| W10-1 persona flows (request, approve, connect, choose, unlink) | tests + browser walk | m1 unlink without 2nd click | RED (intended test), PASS |
| W10-2 owner edits, admin read-only | tests + walk (T2, T5) | m2 `canEdit = list !== null` | RED, PASS |
| W10-3 no root-absolute links | noRootAbsoluteHrefs test | m3 `<a href="/...">` | RED, PASS |
| W10-4 QR never in DOM/storage/URL | tests + walk canary | m4 sessionStorage write | RED, PASS |
| W10-5 notice shown, POST body label+noticeVersion | tests + walk | m5 drop version line | RED, PASS |
| W10-6 failure states | tests + walk (503, expired, needs-relink, liveness) | m6 `expired = false` | RED, PASS |
| W10-7 H-9 pin qrcode-generator 2.0.4 | pin test; tarball integrity = lockfile; MIT | m7 `~2.0.4` | RED, PASS |
| W10-8 ISS-WALINKS-009 | walk gaps 3017/3018/3023 ms; stops on unmount/connected | m9c call-site `wait = 1000` RED; m8a constant 3000->2000 SURVIVED | PASS with P1 |
| W10-8 ISS-WASEL-002 | walk order PUT group(false) -> PUT people -> GET groups | m9b drop the group call RED | PASS |

Re-runs: vitest 27 + 34 green, tsc 0 errors. Diff scope: 18 files, matches the manifest; no console., fetch, http(s) literal or innerHTML in new source. Bound tree untouched (hash-object == HEAD blob).

## Findings (PROPOSED-ISSUE; no ledger rows written)
- P1 low: the 3 s poll floor is not pinned by a literal. WhatsAppLinksPages.test.tsx:186,190,229 use `QR_POLL_MIN_MS` imported from the module, so changing the constant to 2000 passes (mutant m8a survived). Assert 3000 literally.
- P2 low: admin gating is client-side `role === 'admin'`; server scopes (`whatsapp-admin`) are the real gate, so this is UX only. Note, no action.
- P3 low: ActivityPage and the WhatsAppPage link filter are not built (declared in the manifest). Track as follow-up units.
- P4 low: ISS-WASEL-002 order-swap mutant (people before group) was not run; the removal mutant and the walk sequence cover it.

## Capability coverage / gaps
Live browser (Mode D) against a route-intercepted fake API, 4 personas, 38/38 steps, 0 page errors (console errors are only the faked 4xx/5xx). Not covered: real API walk (routers unmounted in production, ISS-WASEL-001) and the real archiver contract.

Executor: checker a (Sonnet), isolated copy; Metrics: mutations=10 suite_runs=0 wall_min=36 check_s=2160
