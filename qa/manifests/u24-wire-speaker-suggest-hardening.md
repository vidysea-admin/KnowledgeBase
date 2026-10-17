# u24-wire-speaker-suggest-hardening

**Handshake status:** checked-PASS
Fix cycle: 0
Lane: lane/w17-wu24. Base a0391420. Candidate SHA: see the lane's single commit (git log -1). Tier: ledger fix (ISS-WU24-001 medium, -002/-003 low); data-write class, so full ceremony. No contract, DECISIONS, composition or server.ts edit. session.ts untouched (327 lines before and after).

## Changes
- apps/api/src/indexing/speaker-suggest.ts: (001) result `error` is now the error CLASS name, never the provider message; a degraded run logs one warn with the grounder reason code; failure still logs once with ids and class only. (003) AbortController: on timeout the run is aborted and the background run checks the signal before building or inserting docs, so an abandoned run writes nothing; the abandoned promise has a no-op catch.
- apps/api/src/indexing/speaker-suggest.test.ts: +4 tests (find() throws, degraded log, constant 300000, default-timeout fake-timer abandonment).
- (002) production default already covered by `resolveSuggestSpeakers` test from cycle 1; its mutation re-run here.

## D-015 corpus (rows' own repros)
- ISS-WU24-001: 2/2 (find() throwing Db -> logged once, no message; 'rethrow instead of return' mutation already killed by cycle-1 test, re-verified by the find() test).
- ISS-WU24-002: 1/1 (`options ?? true` mutation).
- ISS-WU24-003: 2/2 (constant 300_000 -> 3_000_000; background insert after timeout).

## Mutations (per-mutation byte backup + trap; HEAD-fidelity hash checked)
001 message in result: KILLED. 001 degraded log removed: KILLED. 002 default ON: KILLED. 003 constant x10: KILLED (2 fail). 003 abort check removed: KILLED (after strengthening the test with a gated scripted model).

## Checker should run
`node --test --import tsx src/indexing/speaker-suggest.test.ts` and `session.test.ts` in apps/api; tsc --noEmit -p apps/api; node scripts/lint-loc.mjs --all.
