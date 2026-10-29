# Manifest — wa-archiver-contract
**Contract:** none specific (docs/features/whatsapp-multiuser/plan.md unit W2a; spec section 7; D-205, D-206)
**Goal task:** none
**Date:** 2026-10-29
**Status:** merged-no-check (docs-lane)
**Handshake status:** merged-no-check (docs-lane)
**Fix cycle:** 0
**Dual check:** no (docs only: no code, no auth or data write is built; the archiver implementation W2b carries its own dual check)
**Persona walk:** skip (no screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one new prose contract file; no product source edited. Docs-only: the coordinator decides whether it goes through the docs lane (this builder does not set merged-no-check).

## Criteria
- C1 The contract names each of the seven operations (provision passwordless service owner, start link and QR, link status, list groups, set capture selection for groups and people, unlink, health) with endpoint, request and response JSON, and the error codes each can return.
- C2 One closed error-code list with HTTP statuses; one error envelope with no free-text field; every code used in the operations is in the list.
- C3 Auth and placement: a separate listener and bind (not the UI port), bearer service token with identical 401 for every auth failure, source allowlist without trusting forwarded headers, fail-closed startup, token rotation, not public, TLS or private tunnel.
- C4 Idempotency (natural by state, plus an `Idempotency-Key` header with a 24 h replay window and defined conflict codes) and per-scope rate limits with numbers.
- C5 QR secrecy: memory only, short TTL (20 s), never logged, stored or replayed, `no-store`, owner-scoped rate limit.
- C6 The contract is implementable against the real archiver: each operation is mapped to the existing code (`sessionManager`, `api/server.ts`, `ingest.ts`, `authState.ts`, `db/types.ts`) and the new work (service owner, partial indexes, status `updatedAt`, in-memory QR slot) is named.
- C7 A numbered acceptance suite (wire tests reusable by W3's fake, archiver-only tests marked) covering auth, validation, provisioning, session and QR, groups and selection, unlink, idempotency, limits, health, no-content and the KB write boundary; plus a "not in the API" list and a section stating that it is the KB's request and no archiver governance file is edited.

## What changed
- NEW docs/whatsapp/archiver-service-api.md (the only file in the code commit 8f185e76): 14 sections. Operations O1 to O7 mapped to 11 endpoints under `/svc/v1`; closed list of 17 error codes; section 13 lists ten readings the contract chose where the spec is open (for example `confirm: "UNLINK"` is sent by the KB, a seventh status `not_started`, `qr` plus `qrDataUrl`, `trackAllSenders` default on mark); 53 acceptance ids AC-*.
- NEW qa/manifests/wa-archiver-contract.md (this file).
- Nothing under sources/whatsapp_msg was read for write or edited (read-only reads of `src/api/{server,auth}.ts`, `src/wa/{sessionManager,authState,ingest,identity}.ts`, `src/db/{types,mongo}.ts`, `src/config.ts`, `src/index.ts`, `src/logger.ts` at archiver commit 7cdf1a1). No product source, schema, compose or env file touched; docs/SNAPSHOT.md unchanged (still matches). Docs-only diff.

## Findings for the coordinator (from reading the archiver; no change made)
1. `verifyUser` (`api/auth.ts:46-53`) would throw (`bcrypt.compare(password, undefined)`) on a user document with no `passwordHash`; the passwordless service owner needs a guard there. The contract states it (5.1, AC-P3).
2. `users` has a unique index on `email` (`db/mongo.ts:45`); several owners with no email collide unless the index becomes partial. Stated in 5.1.
3. `ingest.ts:232` captures nothing in a marked group when `trackAllSenders` is false and no person rows exist; a naive mark would silently capture nothing. Contract choice 4 (section 13) covers it; the human should confirm.
4. `POST /api/groups/:jid/people` (`api/server.ts`) does `new ObjectId(id)` on unvalidated input and does `deleteMany` then `insertMany` (non-atomic); the contract requires validation and an atomic replace from the capture path's view (5.5, AC-G7, AC-G8).
5. `displayLabel` (`wa/identity.ts:328-335`) falls back to `+<phone>`; the contract forbids phone numbers in labels (6.5, AC-G10).
6. D-022 unlink archives credentials to `sessions/.trash` (restorable); spec section 7 says "delete credentials". Contract choice 5 asks the archiver to purge for service owners; this is the archiver's decision.
7. The spec has two readings of who supplies `confirm: "UNLINK"` (section 7 table vs R-7). Contract choice 1: the KB sends it.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 1 new prose file, 7 criteria, est 40 min, single builder, no checker dispatch by the builder
slow-plan: none (no test suite; one install and the two repo gates)
Tier: M (docs only; contract for a high-tier cross-repo security surface, hence not a docs-lane merge decision for the builder)
Base / checked state: base 69806029; doc commit 8f185e76 (blob 22ba4dfa763a144bc3cb8708c24783ff1a0e5b59 = HEAD blob); the manifest commit follows and touches only qa/.
Affected tests: none (no code). The doc has an internal consistency script (below).
Independent review: NOT run by the builder; the plan says the archiver's own checker reviews this contract as part of W2b, and the KB checker owns the check of this unit.
Falsification: not applicable, docs-only diff (no code or test to mutate); the coordinator decides docs-lane handling.
Not run / limits: nothing here is implemented or verified against a running archiver; every claim about the archiver describes its code at 7cdf1a1 read-only and is not executed. Numbers in section 8 (rate limits, 20 s QR, 30 s refresh floor, 2000/5000/1000 caps) are [ASSUMPTION] sizing for N<=10 owners.
Tests[C1]: docs/whatsapp/archiver-service-api.md sections 5.1-5.7 and AC-P1..P4, AC-S1..S3, AC-Q1..Q6, AC-G1..G11, AC-U1..U7, AC-H1..H2 — each operation has an endpoint, request, response and error list, and a numbered acceptance id
Tests[C2]: consistency script (inline python over the file, below) — every code in the section 4 table is unique, none is used outside the table, and AC-V4 pins the envelope
Tests[C3]: AC-A1..A7 (wire and archiver-only) plus section 3 points 1-7
Tests[C4]: AC-I1, AC-R1, AC-R2 plus sections 7 and 8
Tests[C5]: AC-Q1..Q6 plus section 6.1
Tests[C6]: section 1 mapping table and the per-operation "Behaviour is today's ..." statements; read against `sources/whatsapp_msg/src/**` at 7cdf1a1
Tests[C7]: 53 acceptance ids AC-* in section 11, no duplicate, every id referenced is defined (inline python, below); sections 0, 10 and 14
Pre-check[C1]: 8f185e76 grep -cE '^### 5[.][1-7] ' docs/whatsapp/archiver-service-api.md -> exit 0, ok: 7 (seven operation subsections O1..O7, 11 endpoints in the section 5 map) t=1
Pre-check[C2]: 8f185e76 inline python over docs/whatsapp/archiver-service-api.md -> exit 0, ok: 17 closed codes in the section 4 table, every snake_case code used in sections 5 to 11 is in it (the two other snake_case tokens are the KB's own code archiver_api_unavailable and the status value not_started) t=1
Pre-check[C3]: 8f185e76 grep -cE '^- AC-A[1-7] ' docs/whatsapp/archiver-service-api.md -> exit 0, ok: 7 (AC-A1..A7); section 3 points 1-7 present t=1
Pre-check[C4]: 8f185e76 grep -cE '^## [78][.] ' docs/whatsapp/archiver-service-api.md -> exit 0, ok: 2 (sections 7 Idempotency and 8 Rate limits; section 8 table has 7 limit rows) t=1
Pre-check[C5]: 8f185e76 grep -cE '^- AC-Q[1-6] |^### 6[.]1 ' docs/whatsapp/archiver-service-api.md -> exit 0, ok: 7 (section 6.1 plus AC-Q1..Q6) t=1
Pre-check[C6]: 8f185e76 sed -n over the section 1 table of docs/whatsapp/archiver-service-api.md -> exit 0, ok: 10 mapped needs, each citing an archiver file read-only at 7cdf1a1 t=1
Pre-check[C7]: 8f185e76 inline python over docs/whatsapp/archiver-service-api.md -> exit 0, ok: 53 AC ids, no duplicate, no referenced id undefined; sections 10 and 14 present t=1
Pre-check[T1]: 8f185e76 `pnpm lint:structure; node scripts/snapshot.mjs --check` -> exit 0, `lint:structure: OK (10 stages, 0 failed)` and `OK: docs/SNAPSHOT.md matches a fresh regeneration (174 lines, budget 200)` (after `pnpm install --offline --frozen-lockfile` in the worktree because node_modules was absent) t=1
mutant-cap-raise: not applicable, docs-only (no mutants run)
Metrics: builder_min=40 mutants=0 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable
