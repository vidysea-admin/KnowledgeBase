# Verdict — t028-env-compose
**Cycle checked:** 0
**Coordinator:** A
**Policy-Version:** proportional-verification/2026-10-19.17
**Checked state:** HEAD 9b3295c0 (code commit e301052d, base 02dd58b7); docker-compose.yml blob 64e96887, compose-t028-env.test.mjs blob 12f161e1 (identity matches manifest pre-checks)
**VERDICT:** PASS

## Criteria
- C1 (5 T-028 names forwarded from main .env, undefined when absent): PASS. Independent run `node --test --import tsx scripts/operations/compose-t028-env.test.mjs` -> 6 pass, 0 fail, 0 skipped (docker 29.6.1 present, behaviour tests executed, not skipped). `docker compose config` rendering with fake `.env`: all-set verbatim, none-set null, subset isolation.
- C2 (3 WhatsApp names, same semantics): PASS. Same run; WhatsApp-only and T-028-only subsets isolate correctly; no `${NAME:-}` anywhere.
- C3 (docs/.env.example consistent, `.env.t028` retired): PASS. Diff read; `git grep env.t028` outside DECISIONS/qa returns only explicit "retired" notes plus the test's own comment. No instruction to create the file remains. `.env.example` blank lines commented (copy-safe).
- Neighbouring tests reading docker-compose.yml: dbguard2.test.mjs 12/12, vectorless-routing.test.ts 3/3.

## Falsifications (scratch copies outside the worktree, fresh copy per mutant, timeout 120)
| Criterion | mutant | result |
|---|---|---|
| C1 | `LKB_HOSTING_STATE_DIR: ${LKB_HOSTING_STATE_DIR:-}` | pass 2 / fail 4 (caught) |
| C2 | delete `WHATSAPP_TENANT_OWNER_MAP:` | pass 3 / fail 3 (caught) |
| C2 | `WHATSAPP_MONGO_URL: ""` | caught (5 fail) |
| C1 | add `env_file: - .env` to api | pass 5 / fail 1 (caught) |
Mutation hygiene: mutations applied only to copies; worktree untouched. `git hash-object` equals `git rev-parse HEAD:<file>` for docker-compose.yml (64e96887) and the test (12f161e1); `git status` clean before verdict write. Scratch copies deleted (no node_modules in them).

## Adversarial notes (no auth/tenancy/data-write logic changed; Tier L accepted)
- Hazard class is the empty-string-defines-value case: covered by static + behaviour tests and docs. A blank `NAME=` hand-edited into the server `.env`, or an exported empty host shell variable at `docker compose up` time, still defines "" (compose semantics); guarded only by comments/docs. Not code-fixable inside this seam; low severity.
- Container-side omission of a null env entry was not verified by starting a container (no live container run in this check); it rests on `config` rendering and compose's documented rule, as the manifest states.
- Baseline red `lint:structure` record-finalize.ts:304 is pre-existing at base and unrelated.

## PROPOSED-ISSUE
PROPOSED-ISSUE: severity=low class=docs-ops: server acceptance step `docker compose exec api env | grep -c -E '^(LKB_HOSTING|LKB_COUNSELLOR|WHATSAPP_)'` -> 0 is still unrun (human gate); also warn that an exported empty host shell var defines "" for these names. File-don't-fix; not a unit.

ISSUES-WRITTEN: none
Metrics: check_min=9 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=3 mutants=4 tokens=unavailable
