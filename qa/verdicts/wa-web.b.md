# Verdict wa-web (coordinator b, blind, dual check)
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Head checked: c772be75 (base 80073a37). Contract: plan.md unit W10 (acceptance 1-6, W10-7 gate H-9, W10-8 ledger items) + spec.md R-3, R-12, R-13, R-14, R-22. No qa/contracts file exists; the plan acceptance list is the contract.

Check plan: (1) re-run manifest verify commands in an independent git-archive copy; (2) tsc; (3) dependency pin and lockfile integrity vs the npm tarball; (4) one falsification per criterion (D-020 per-mutation copy, HEAD blob checked equal before mutating); (5) live browser walk, stub API; (6) code read of the changed files.

VERDICT: PASS
SCOREBOARD: 8/8 criteria met, 4/4 invariants hold (read-only toward bound tree, owner-gated connect, QR memory-only, 3 s poll floor)
TIER: L (auth: apps/web/src/pages/whatsapp-links/QrCode.tsx:31 renders the pairing credential; dependency add qrcode-generator 2.0.4)
FAILURES (if any):
- none blocking. Non-blocking, as PROPOSED-ISSUE below (P1, P2).
CAPABILITY-COVERAGE: 8/8 criteria reproduced by my own re-run or mutation; real-API walk is UNVERIFIED-by-checker (1: ISS-WASEL-001, routers not mounted in production composition, named gap)
LIVE-BROWSER: qa/evidence/browser-wa-web-2026-10-30-checker-b/ (Browser pane, Vite dev server, stub API; real-API walk is a named gap)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet (build unit) (checker: claude-sonnet-subagent)

## Evidence
- Pre-check re-run (archive copy, vitest): WhatsAppLinksPages 22, QrCode 5, noRootAbsoluteHrefs/App.routes/App.wiring/responsive 34 -> 61 passed, 0 failed. `tsc --noEmit -p apps/web/tsconfig.json` exit 0.
- Dependency (W10-7/H-9): package.json `"qrcode-generator": "2.0.4"` exact; lockfile importer specifier, package entry and snapshot present; the lockfile sha512 equals the npm tarball I fetched and hashed myself; licence MIT; no runtime deps. The QR is drawn as an SVG path from the module matrix: no innerHTML, no network, fixed aria-label (QrCode.tsx), no storage use.
- Falsifications (copy of c772be75, copy blob == HEAD blob, green before, red after, 10 mutants, cap 10):
  W10-1 noticeVersion blanked -> red (notice+version test). W10-2 canEdit forced for admin -> red. W10-3 `<Link>` -> absolute `<a href>` -> red (noRootAbsoluteHrefs). W10-4 drop clearTimeout on unmount -> red. W10-5 version slice(0,0) -> red. W10-6 expiry comparison inverted -> red. W10-7 lockfile specifier `^2.0.4` -> red (exact-version test). W10-8b `trackAllSenders:false` -> true -> red (ISS-WASEL-002). W10-8c poll floor `let wait = 1000` in ConnectPage -> red (3 s test). W10-8a constant 3000 -> 2000 -> SURVIVED (P1).
- Live walk (stub, not real API): T1 request (body carries only label+noticeVersion), T2 approve, T1 connect (starting, QR, QR replaced, connected stops the poll and clears the QR), mark and choose people with the ISS-WASEL-002 wire order seen (PUT marked/trackAllSenders:false, PUT people, GET people), health and injected 503 / needs-relink / expired-approval states, two-step unlink, T5 viewer read-only (no list request, /new refused, /connect not found, no QR in DOM). Cadence from stub server timestamps: /connect hits >= 3 s apart. Console: only the injected 503/404s. Not walked live: T3 isolation, admin-on-another's-link (unit tests + mutation W10-2 cover them).
- Criteria: W10-1 live walk + tests; W10-2 tests, mutation 2, viewer walk; W10-3 mutation 3; W10-4 mutation 4 + code read (cleanup clears timer, stop() clears QR, 400/401/403/404/409 stop the poll); W10-5 notice shown, no message text surfaces; W10-6 mutation 6 + injected 503 live; W10-7 above; W10-8 mutations 8b, 8c.

## Named gaps
- Real-API walk (links + selection routers not mounted in production composition, ISS-WASEL-001, a later wiring unit; manifest's Persona walk is `deferred` with that cause). Non-root base path not exercised live (covered by noRootAbsoluteHrefs mutation 3 red).

PROPOSED-ISSUE: {"id":"P1","sev":"low","criterion":"W10-8","summary":"Tests import QR_POLL_MIN_MS and use QR_POLL_MIN_MS-1 / *4-1, so the 3 s floor is never pinned to a literal: constant 3000 -> 2000 survives (mutant W10-8a). Behaviour at head is correct (constant is 3000; ConnectPage uses it; mutation 8c is caught).","fix_direction":"Assert the literal 3000 once in WhatsAppLinksPages.test.tsx (or advance fake timers by 2999 / 3000 ms).","file":"apps/web/src/pages/whatsapp-links/WhatsAppLinksPages.test.tsx"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","criterion":"W10-2","summary":"ChoosePage derives canEdit = list?.canEdit === true, so while the groups call is loading or has failed the owner reads 'Only the owner can change them' (wording only; no control is exposed that should not be).","fix_direction":"Show the owner-only sentence only once list is loaded and canEdit is false.","file":"apps/web/src/pages/whatsapp-links/ChoosePage.tsx"}

EXPLANATION: Every W10 criterion and both ledger items (ISS-WALINKS-009 poll floor and terminal stop; ISS-WASEL-002 ordering) held under my own re-run, ten falsifying mutants (nine red, the survivor is a test-weakness P1 with the behaviour proven by mutant 8c) and a live browser walk; the dependency is exact-pinned and its integrity verified against the registry. The only gap is the real-API walk, which the manifest defers to the wiring unit.
Metrics: start=2026-10-30T19:42:00+05:30 end=2026-10-30T20:24:00+05:30 wall_min=42 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable builder_min=unavailable check_min=42 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2520 mutants=10 defects_unit=0 defects_6c=0
