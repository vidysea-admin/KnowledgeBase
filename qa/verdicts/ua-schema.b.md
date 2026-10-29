# Verdict - ua-schema (coordinator B, blind dual check)
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Judged: HEAD 3f7b3f29 (code e71d5625), diff 1c864477..HEAD. Verdict path: qa/verdicts/ua-schema.b.md. No other verdict read.

## Check plan
Tier L (tenancy/auth data model, dual-trigger users.ts:28 read: it is the `scopedCollection<Users>` tenancy accessor line). Independently ran every acceptance command (maker evidence not reused: manifest has no input-identity block); read all 5 stores, 5 schemas, migration, mongo test; one falsification per criterion in a COPY (scratchpad/ckB, node_modules via junctions), per-mutation byte backup, restore verified with `git hash-object` == `git rev-parse HEAD:<file>` (all equal, worktree `git status` clean).

## Independent evidence
- C1 `python schema/validate.py` -> PASS 51 schemas; fixtures: users valid for unverified/pending/active admin|member|viewer/rejected/disabled; invalid for missing tenant, unknown field, role outside enum, active without role, active null role; sessions invalid without familyId. Live validator: mongo test "users validator..." and "sessions validator..." green (error 121).
- C2 real mongod 127.0.0.1:27018, throwaway DB, `node --test --import tsx src/collections/user-accounts.mongo.test.ts` -> 9 pass 0 fail. Case, NFKC composition, spaces and different-tenant collisions all E11000; tokenHash unique on sessions and tokens across tenants.
- C3 `user-accounts.test.ts` 12 pass 0 fail; mongo cross-tenant test green for all five collections.
- C4 handle keys == [find, insert]; no mutating auth-event export.
- C5 TTL test green in 26 s: past-purgeAt session/token/throttle/event removed; active 400-day session and future-purgeAt rows kept.
- C6 `migrations/user-accounts.migration.test.mjs` 5/5; `lint-migrations` OK (11602 files); migration applied twice on real Mongo, down refused.
- T: `gen-types --check` OK, `snapshot --check` OK, `lint-dirsize` OK (structure.config.json change is dirsize overrides only, 48->53, collections 37).
- Normaliser guard: 0 of 196k code points break `isNormalizedEmail` idempotence (NFKC+lower), so the store cannot reject a legitimate A2 output or accept a non-normal form.

## Falsifications (copy, 7 mutants, all restored hash-equal)
| C | mutant | result |
|---|---|---|
| C1 | user_sessions.schema `familyId` dropped from required | validate.py exit 1 (invalid.json unexpectedly PASSED) |
| C2 | users unique index made per-tenant `{tenantId,emailNormalized}` (the weak form) | mongo 3 fail incl. the UA-2 collision test |
| C3 | findSessionById tenant -> "shared" (fail-closed) | SURVIVED (12/12 pass), see P1 |
| C3b | findSessionById unscoped raw `db.collection` (leak) | cross-tenant test fails (11/12) |
| C4 | auth_events handle gains a deleteMany helper | C4 test fails (11/12) |
| C5 | user_sessions TTL `expireAfterSeconds` removed | TTL test fails at the 150 s ceiling + index test |
| C6 | `collMod` branch disabled (re-apply creates) | idempotency test fails; also validationAction warn -> 3 mongo fails |

## Adversarial hunt (tenancy / data-write)
Every store call routes through scopedCollection (tenant forced, operators refused); no unscoped tokenHash lookup exists (open A3 question is disclosed, not a defect here). Inputs to find/consume/revoke are type- and regex-checked (no operator injection). consumeToken is one atomic CAS (12-way race test green). Active session cannot carry purgeAt (dependentRequired in schema and Mongo validator). No path stores plaintext password (PHC regex), raw token (sha256 only), raw email of unknown account (subjectHash), full IP or raw UA. Migration guard refuses non-work DBs and `down`. No bypass found.

PROPOSED-ISSUE: {"id":"P1","severity":"low","criterion":"C3","title":"findSessionById has no same-tenant positive control: a mutant ignoring the tenant (fail-closed) passes both test files","fix_direction":"assert findSessionById(tenant-a, id) returns the row in user-accounts.test.ts and the mongo test","evidence":"mutant return userSessions(\"shared\", db).findOne(...) in user-sessions.ts findSessionById -> 12/12 pass; the leaking variant is caught"}
PROPOSED-ISSUE: {"id":"P2","severity":"low","criterion":"C5","title":"throttle invariant purgeAt >= lockedUntil lives only in buildThrottle; authThrottles() hands A4 a raw scoped updateOne, so a later lock update can leave purgeAt earlier than lockedUntil and let TTL drop a live lock","fix_direction":"add a store helper for lock updates that recomputes purgeAt via throttlePurgeAt, or make A4's unit assert it","evidence":"auth-throttles.ts:26-30, :34-47; schema cannot express the cross-field rule"}

VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 3/3 invariants hold (types, dirsize/snapshot, lint-migrations)
TIER: L (tenancy/auth data model plus a migration)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: not-applicable (no screen or capability table)
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (dual coordinator; P1, P2 proposed above)
EXECUTOR: claude-sonnet-subagent (maker-builder) (checker: claude-sonnet-subagent)
EXPLANATION: All six criteria independently reproduced including real-Mongo unique, TTL and migration idempotence; each criterion's falsification bit except one fail-closed C3 mutant that survives for lack of a positive control (low, non-blocking), and the leaking variant is caught. No cross-tenant read or secret-storage path found.
Metrics: start=2026-10-29T04:42:00Z end=2026-10-29T04:55:22Z wall_min=13 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=800 check_min=13 mutants=7 defects_unit=0 defects_6c=0
