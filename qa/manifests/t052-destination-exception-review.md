# Manifest — t052-destination-exception-review (fix cycle 1)

**Status:** ready-for-check
**Fix cycle:** 1
**Base SHA:** 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
**Lane:** C:\Users\product\Desktop\KnowledgeBase-lanes\w17-t052fix (branch lane/w17-t052fix)
**Contract:** qa/contracts/goal-t052.md; D-079; ruling 4 (activation only after an independent checker PASS on THIS cycle).
**Prior verdict:** qa/verdicts/t052-destination-exception-review.md (FAIL, cycle 0, reviewed 9e55b642).

## Changed paths (packages/meeting-bot/src/calendar/)
- registration-link-resolver.ts: F4 gate, optional `trust.ca` param on `pinnedRegistrationGet` (production never passes it).
- zoom-registration-proof.ts: F4 gate, F5 provider-id collection from any zoom.us / *.zoom.us host.
- registration-provider-candidates.test.ts: F1, F2, F3, F4, F5 tests (21 tests, was 11).
- registration-tls-test-fixture.ts (new): THROWAWAY self-signed cert+key (SAN localhost, pinned.test) for local transport tests only.

## NOT done on purpose
Activation constants (resolver:7 REGISTRATION_LINK_RESOLUTION_ENABLED, proof:5 ZOOM_PROVIDER_CORRELATION_ENABLED) remain `false`. No caller wired. Activation only after checker PASS.

## Design note for the checker
F4 requires `CONSTANT && options.enabled === true`. With the constant false no test could reach the active path, so each module exports a `...WithConstantForTest` seam taking the constant as an argument; the public function passes the real constant. The seam is a deliberate bypass surface: please judge whether it is acceptable or must be replaced (e.g. by a module-level setter, or by a test-only import path). The public functions are proven inactive by test.

## Fix map
- F1: hopRecorder redirects only from the initial URL; 15 bad Locations each assert refused AND requests == [initial] AND DNS lookups == [initial host]; positive control follows a valid hop.
- F2: 9 private addresses (127/8, 10/8, 169.254, 172.16, 192.168, ::1, fc00::1, fe80::1, ::ffff:127.0.0.1) as sole or mixed answer for the redirect target: refused, zero requests to the hop; family-lie case.
- F3: local HTTPS (127.0.0.1) tests of `pinnedRegistrationGet` with injected CA: GET only, header names exactly accept/accept-encoding/connection/host (no cookie/authorization), pin wins over real DNS (pinned.test unresolvable; localhost with pin 127.0.0.2 fails), hostname mismatch + untrusted CA rejected with zero HTTP requests, 1 MiB cap (1 MiB+1 rejected, exactly 1 MiB ok, remaining-bytes budget), 300 ms deadline. Resolver hands each hop <=15000 ms and remaining bytes (1 MiB minus consumed).
- F4: public functions inactive even with enabled:true + full injection; enabled undefined/false/"true"/1 inactive; constant false inactive.
- F5: conflicting /j/ and /w/ id on unlisted us02web.zoom.us refuses; same id still candidate.
- Extra: peer address differing from pinned answer (public 8.8.8.8) refused on initial and final hop.

## Checks a checker must run
- `cd packages/meeting-bot; node --test --test-force-exit --import tsx src/calendar/registration-provider-candidates.test.ts` (binds 127.0.0.1 ephemeral ports only).
- `node <repo>\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json`.
- Re-run mutations M1-M15 below (D-020 per-mutation backup + HEAD hash check).
- Confirm constants still false: `git diff 9e55b642 -- packages/meeting-bot/src/calendar | grep ENABLED`.

## Evidence
- Focused suite: tests 21, pass 21, fail 0. tsc --noEmit: exit 0, no output. lint-loc --all: no output for these files.
- Mutations (unit's own tests only; per-mutation backup, timeout 180, trap on INT/TERM/ERR, cmp, then git hash-object check):

| Mutant | Result |
|---|---|
| M1 extra host allowed | KILLED (1 fail) |
| M2 redirect re-check skipped | KILLED |
| M3 POST | KILLED |
| M4 per-hop address check skipped | KILLED |
| M5 resolver peer check removed | KILLED (after adding peer-mismatch test; survived before) |
| M6 constant ignored (resolver) | KILLED |
| M7 enabled-not-required (resolver) | KILLED |
| M8/M9 same for proof | KILLED |
| M10 F5 revert (listed hosts only) | KILLED |
| M11 byte cap removed | KILLED |
| M12 deadline timer removed | KILLED (timeout exit 124) |
| M13 TLS verification off | KILLED |
| M14 DNS pin lookup removed | KILLED (4 fails) |
| M15 transport-level peer check removed | SURVIVED: unreachable, since the pinned lookup forces the connection to the pinned address so remoteAddress cannot differ; the resolver peer check (M5) is the tested control. Residual: defense-in-depth line has no test. |

- Final hashes (git hash-object, intended post-fix blobs): resolver 69e83252dc758b803c48649fbe3e130ee87524b1, proof 86ef4b4e02dd6bd6bf83c0d6317dcbde6e984f96. Mutation scripts kept outside the lane.

## Not verified
Live DNS/TLS against real Brevo/Zoom hosts (no network); activation wiring, durable approval lookup, consume/replay (do not exist); M15.
