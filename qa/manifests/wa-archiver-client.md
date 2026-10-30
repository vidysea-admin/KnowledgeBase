# Manifest — wa-archiver-client
**Contract:** none specific; scope `docs/features/whatsapp-multiuser/plan.md` unit W3 and its per-unit acceptance block; interface `docs/whatsapp/archiver-service-api.md` (W2a); requirements R-16, R-42, R-45 and spec section 7. Authorization: `qa/gates/plan-approved-whatsapp-multiuser.md`.
**Goal task:** whatsapp-multiuser W3 `wa-archiver-client`
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: security apps/api/src/whatsapp/archiver/client.ts:104
**Persona walk:** skip (no screen; server-side client and test fake only)
**Issues addressed:** none
**Executor:** claude-opus (maker builder, worktree wave/wa-archiver-client)
**Round:** one round, est 90 min, tier H by the security trigger (outbound credential, SSRF, QR secrecy).

## Criteria
- W3-1 Base URL and token come only from config; the client refuses a non-`https` URL unless a private address is explicitly allowed by config [ASSUMPTION], never follows redirects, and never builds a URL from request data; ids are validated (24-hex owner id, WhatsApp jid form) before any call.
- W3-2 Every non-2xx maps to a closed error code; the archiver's body text is never echoed or logged; a canary token and a canary QR string never appear in logs, thrown messages or responses (test).
- W3-3 Timeouts and bounded retries for idempotent calls only; `getQr` is never retried or cached.
- W3-4 The fake implements all seven operations and the contract's error cases; the contract suite passes against the fake. Running it against a real archiver is a documented flag (used in W14).
- W3-5 `.env.example` lists the names with no values; compose forward lines are added as an enforcement path change with `Approved-by` (H-11).

## What changed (base 00de9d92, head 2deca4fc)
All files NEW under `apps/api/src/whatsapp/archiver/` (the four the plan names, plus tests):
- `errors.ts`: closed vocabulary (17 upstream codes + `archiver_api_unavailable`, `archiver_api_unexpected`); `ArchiverError` message is its code, no body/URL/token can enter it; `mapUpstreamError` (`unauthorized` and 5xx become `archiver_api_unavailable`; `not_found`/`method_not_allowed`/`payload_too_large`/`unsupported_media_type`/unknown become `archiver_api_unexpected`).
- `config.ts`: `loadArchiverConfig(env)`; null when unset, throws (setting name only) when half-set or invalid; origin-only URL (no userinfo/path/query/fragment); https always, plain http only with `WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP=1` AND a loopback/private literal or `localhost`; link-local/metadata, unspecified, multicast, reserved refused for every scheme (IPv4-mapped IPv6 and decimal/hex/octal spellings normalised first); token 32..512 printable; token reachable only through `bearer()`, redacted in JSON and `util.inspect`; config frozen.
- `client.ts`: the ten client methods of contract section 5; fixed origin + constant path, ids validated before any fetch, `redirect: "manual"` (any 3xx refused), `cache: "no-store"`, `X-Archiver-Api-Version` must be `1`, bounded response bytes, JSON-only, strict response shapes (unknown fields dropped, echoes checked, QR triple consistent, data URL must be `image/png`), per-call timeout (10 s, 20 s for lists), at most 2 retries for GET and keyed mutations with the same `Idempotency-Key`, `getQr` never retried, optional observer receiving closed-field events only.
- `fake-archiver.ts`: in-process HTTP server on 127.0.0.1 implementing the full wire contract (auth with rotation token and uniform 401, failed-auth limit, body hygiene, closed errors, owners, session/QR with 20 s expiry, groups with 30 s live-refresh window, tracking, people with label masking, unlink, health, idempotency replay, per-scope rate limits) plus a `control` handle (not part of the contract) and `realTargetFromEnv`.
- Tests: `config.test.ts` (12), `client.test.ts` (18), `contract.test.ts` (13 + 7 skipped), `contract-ops.test.ts` (14 + 12 skipped).
- `.env.example`: two commented, valueless names `WHATSAPP_ARCHIVER_API_URL`, `WHATSAPP_ARCHIVER_API_TOKEN` with a comment block.

## Evidence
Pre-check[W3-1]: 2deca4fc node --test --import tsx apps/api/src/whatsapp/archiver/client.test.ts apps/api/src/whatsapp/archiver/config.test.ts -> 30 passed, 0 failed
Pre-check[W3-2]: 2deca4fc node --test --import tsx apps/api/src/whatsapp/archiver/client.test.ts -> 18 passed, 0 failed
Pre-check[W3-3]: 2deca4fc node --test --import tsx apps/api/src/whatsapp/archiver/client.test.ts -> 18 passed, 0 failed
Pre-check[W3-4]: 2deca4fc node --test --import tsx apps/api/src/whatsapp/archiver/contract.test.ts apps/api/src/whatsapp/archiver/contract-ops.test.ts -> 27 passed, 0 failed (19 skipped by design: 18 archiver-only/W6-owned items, 1 real-archiver run without the flag)
Pre-check[W3-5]: 2deca4fc grep -cE "^# WHATSAPP_ARCHIVER_API_(URL|TOKEN)=$" .env.example -> 2 passed, 0 failed (and grep -cE "WHATSAPP_ARCHIVER_API_[A-Z_]+=." returns 0: no value on either name). The compose half of W3-5 is NOT done: see open point 1.
Full directory: node --test --import tsx apps/api/src/whatsapp/archiver/*.test.ts -> 76 tests, 57 pass, 0 fail, 19 skipped. `tsc --noEmit` over the directory (temporary tsconfig, removed) exit 0; `node scripts/lint-loc.mjs` and `node scripts/lint-dirsize.mjs` OK.
Tests[W3-1]: apps/api/src/whatsapp/archiver/client.test.ts apps/api/src/whatsapp/archiver/config.test.ts — id validation with a zero-fetch spy, request shape, redirect target never contacted, URL/token policy including metadata and alternative IP spellings
Tests[W3-2]: apps/api/src/whatsapp/archiver/client.test.ts — closed-code table, hostile error bodies, canary token and canary QR swept over console, stdout/stderr, observer events, errors (message, JSON, inspect, stack)
Tests[W3-3]: apps/api/src/whatsapp/archiver/client.test.ts — timeout against a server that never answers, retry/no-retry table, same idempotency key across attempts, getQr one request per call
Tests[W3-4]: apps/api/src/whatsapp/archiver/contract.test.ts apps/api/src/whatsapp/archiver/contract-ops.test.ts — the wire acceptance items AC-A1,A2,A7,V1-V4,P1,P4,W1,W2,H1,H2,S1-S3,Q1,Q2,Q4,Q5,Q6,G1-G5,G7,G9,G10,G11,U1,U2,I1,R1,N1 against the fake
Tests[W3-5]: .env.example — the two names; no test file (documentation line, checked by the grep above)
Falsification[W3-1]: `redirect: "manual"` -> `"follow"` in client.ts (per-mutation byte backup, restored, `cmp` equal, `git hash-object` == `HEAD:` blob) -> 2 red (request shape; redirect target contacted). Removing the `range === "blocked"` refusal in config.ts -> 2 red (metadata range; alternative IP spellings). Restored -> 30 green.
Falsification[W3-2]: in client.ts, copy the response body text into the mapped error's message -> 2 red (hostile bodies; canary sweep). Restored -> 18 green.
Falsification[W3-3]: `getQr` `retry: false` -> `true` -> 1 red (never retried). Replacing the per-call abort timer with 1e9 ms -> the suite hangs and is killed by the 90 s `timeout` (red). Both restored, hashes equal HEAD.
Falsification[W3-4]: in the fake, drop the `confirm !== "UNLINK"` check -> AC-U1 red by assertion. Restored -> 27 green.
Falsification[W3-5]: adding a value to either name makes the second grep non-zero (not run as a mutation; documentation line only).

## Open points (declared, not defects)
1. **Compose forward lines (H-11, enforcement path, not edited by this unit).** `docker-compose.yml` `api` service `environment:` currently ends the WhatsApp group with `WHATSAPP_MONGO_URL:`, `WHATSAPP_MONGO_DB:`, `WHATSAPP_TENANT_OWNER_MAP:` (map form, null value, so an absent name stays undefined). The exact lines to add after line 85, with `Approved-by: Umesh` on the authorizing D-entry:
   `      WHATSAPP_ARCHIVER_API_URL:`
   `      WHATSAPP_ARCHIVER_API_TOKEN:`
   Never `${NAME:-}`: it defines an empty string, and `config.ts` throws when exactly one of the two is empty or set. Add `      WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP:` only if the transport is plain http over a private tunnel (point 2). W3-5's compose half is open until that human gate.
2. **Undeclared extra env name.** Policy "private address explicitly allowed by config" needed a switch; I named it `WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP=1` (read only by `config.ts`, default off, not listed in `.env.example` because the brief names only two). Decision for Umesh: keep it, rename it, or drop plain-http support and require https (TLS) to the archiver in all environments.
3. **Added tests beyond a single file.** Four test files plus the fake; `fake-archiver.ts` exports `realTargetFromEnv` (the documented flag `LKB_ARCHIVER_CONTRACT_URL` + `LKB_ARCHIVER_CONTRACT_TOKEN`). The real run is untested here by design (no archiver exists until W2b); against a real archiver the suite creates owners, so it is staging-only, and its rate-limit waits are real time.
4. **Fixture-dependent items run only on the fake.** The archiver-only items (AC-A3..A6, P2, P3, G6, G8, U3..U7, Q3, R2, N2, L1) are listed as skipped; AC-B1 belongs to W6. Nothing here claims archiver-side behaviour.
5. **Ordering the contract leaves open.** The fake answers 404 `owner_not_found` before body-level 400 `invalid_request` for a nonexistent owner (id-pattern 400s come first). AC-V2's personId case therefore uses an existing owner. The real archiver may order these differently; the client does not depend on it.
6. **Test-first honesty.** Config, client and contract tests were written after the implementation in the same session (the session was interrupted once); the red evidence is the falsification runs above, not a recorded failing-first run.
7. **Junctions** created for test runs (`node_modules`, `apps/api/node_modules`) are removed link-only before handoff.
