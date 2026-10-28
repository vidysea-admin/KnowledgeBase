# Manifest — t028-env-compose
**Contract:** none (config unit; acceptance = gate answers in qa/gates/golive-decisions-2026-10-28.md batch 2: Q1 T-028 vars "main .env mai hi rakho"; Q4 WhatsApp must ship at launch)
**Goal task:** T-028 (env wiring only)
**Date:** 2026-10-28
**Status:** checked-PASS (qa/verdicts/t028-env-compose.md, efa24fe4, cycle 0)
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no (config; no auth logic changes)
**Persona walk:** skip (no new screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-opus-subagent (maker build)
**Executor rationale:** single small config seam; no external executor warranted.

Lane: t028 (worktree .worktrees/t028-env-compose, branch wave/t028-env-compose, base 02dd58b7, code commit e301052d).

## What changed
- docker-compose.yml (api service `environment:`): the five T-028 names `LKB_HOSTING_STATE_DIR`, `LKB_COUNSELLOR_STATE_DIR`, `LKB_HOSTING_ENCRYPTION_KEY`, `LKB_HOSTING_BOOTSTRAP_ADMINS`, `LKB_HOSTING_WEBHOOK_ORIGINS` and `WHATSAPP_MONGO_URL`, `WHATSAPP_MONGO_DB`, `WHATSAPP_TENANT_OWNER_MAP` are value-less map entries (`NAME:`). A name absent from `.env` is unresolved, which `docker compose config` renders as `null` and which compose omits from the container; it is never an empty string. No `${NAME:-}` is used for any of them.
- Why undefined-when-absent is load-bearing: hosting/config.ts:12 and the T-028 gate in composition/integrations/hosting.ts:59 + source-jobs.ts:48 treat a defined-but-incomplete value (even "") as misconfiguration -> auth routes 503; whatsapp/store.ts:23-24 uses `process.env.WHATSAPP_MONGO_URL ?? default`, so "" would defeat the 127.0.0.1:27018 / whatsapp_msg defaults; owner-config.ts:15 already tolerates ""/undefined for the owner map, but pass-through keeps all eight uniform.
- DECISION on `.env.t028`: the `env_file` (`.env.t028`, required:false) is REMOVED, not kept as fallback. Measured with `docker compose config` against a scratch `.env.t028`: once the api `environment:` map lists the names as value-less, an unresolved entry renders `null` and SHADOWS the env_file value, so a retained fallback would silently do nothing while looking supported (worse than removal). Old deployments are safe: the file was never created on any server yet (docs/REMAINING-PLAN-2026-10-28.md H2 was still pending), and with the names absent T-028 is simply off (`/api/keys` 503 hosting_unavailable by design; Ask unaffected). The compose comment and GO-LIVE-UBUNTU section 9 tell anyone who already has the file to move its five lines into `.env`.
- The whole `.env` is NOT passed via `env_file` (would leak MONGO_WORK_DB, LKB_I_KNOW_THIS_IS_PRODUCTION handling into the container); the test pins this.
- Hazard found and documented: a BLANK `NAME=` line in `.env` DEFINES an empty string (verified: `WHATSAPP_MONGO_URL=` and `LKB_HOSTING_STATE_DIR=` render `""`). `.env.example` had blank `WHATSAPP_MONGO_URL=` / `WHATSAPP_MONGO_DB=` / `WHATSAPP_TENANT_OWNER_MAP=` lines, which a `cp .env.example .env` would turn into empty strings; they are now commented out with an explanation (copying `.env.example` stays safe).
- docs/GO-LIVE-UBUNTU.md: step list 2 and 4, section 1 compose-version note (the `required:false` reason is gone), section 2 names list (adds the WhatsApp rows and the five T-028 names), section 9 T-028 bullet (main `.env`, `.env.t028` retired), D-192 line ("the main `.env`"). `.env.example` T-028 comment block rewritten. docs/REMAINING-PLAN-2026-10-28.md H2 line updated. package.json `test:lint` gains the new test file.
- scripts/operations/compose-t028-env.test.mjs (new, 76 lines): 3 static tests (8 names value-less in the api `environment` map; no value or `${VAR:-}` on any of them; no `env_file` / no `.env.t028` in the api service) + 3 behaviour tests that run `docker compose config --format json` in a temp dir with a FAKE `.env` and the host env scrubbed of the 8 names (all set / none set / T-028-only and WhatsApp-only); skipped when docker is absent. Placed in scripts/operations because scripts/qa and scripts/lib are at their 30-file dirsize budget.

## docker compose config evidence (fake placeholder values only, scratch dir outside the repo; the repo's .env was never read)
- None set (`.env` = MONGODB_URL, MONGODB_DB, OLLAMA_API_KEY fakes only), `docker compose config`, api environment excerpt:
  `LKB_COUNSELLOR_STATE_DIR: null`, `LKB_HOSTING_BOOTSTRAP_ADMINS: null`, `LKB_HOSTING_ENCRYPTION_KEY: null`, `LKB_HOSTING_STATE_DIR: null`, `LKB_HOSTING_WEBHOOK_ORIGINS: null`, `WHATSAPP_MONGO_DB: null`, `WHATSAPP_MONGO_URL: null`, `WHATSAPP_TENANT_OWNER_MAP: null`, `PORT: "3300"` (null = unset in the container; the same 8 are the only nulls).
- All set (test case 1, `NAME=fake-NAME` for the eight): each renders `fake-<NAME>` verbatim (test "all 8 set in .env -> forwarded verbatim", green).
- Present subset (test case 3): only the five T-028 names set -> they render `fake-...`, the three WhatsApp names stay null; only WhatsApp set -> the reverse. Green.
- Legacy shadowing probe: `.env.t028` containing `LKB_HOSTING_STATE_DIR=legacy-a` with the value-less map entry still present -> `LKB_HOSTING_STATE_DIR: null` (hence the env_file removal above).
- Blank-line probe: `WHATSAPP_MONGO_URL=` and `LKB_HOSTING_STATE_DIR=` lines in `.env` -> `""` (hence the `.env.example` commenting and the docs warning).
- Docker daemon is NOT running on this machine (`docker images` -> cannot connect to the engine), so no container was started: container-side absence rests on compose's documented rule that unresolved value-less entries are omitted, plus the `config` rendering above. Checker may confirm on the server with `docker compose exec api env | grep -c -E '^(LKB_HOSTING|LKB_COUNSELLOR|WHATSAPP_)'` -> 0 when `.env` lacks them.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 6 files, 3 criteria, est 45 min - single builder, per-file node --test runs, no checker dispatch by the builder
slow-plan: n/a (config-only, one seam)
Tier: L (config; no auth, tenancy, consent or data-write logic changed; not a dual-check trigger)
Base / checked state: base 02dd58b7; code commit e301052d on wave/t028-env-compose (the manifest commit follows and touches only qa/).
Affected tests: scripts/operations/compose-t028-env.test.mjs (new), scripts/lib/dbguard2.test.mjs (reads docker-compose.yml migrate/api slice), apps/api/src/composition/vectorless-routing.test.ts (reads docker-compose.yml).
Baseline reds (identical at base 02dd58b7, unrelated): `lint:structure` stage loc: packages/meeting-bot/src/capture/record-finalize.ts:304 (budget 300).
Independent review: NOT run by the builder (writer never reviews its own output); the checker owns review.
Known limits: no container was started (docker daemon down); the container-side behaviour of a null environment entry is taken from `docker compose config` rendering plus compose's documented rule. A blank `NAME=` line in a hand-edited `.env` still defines an empty string by compose semantics; guarded by comments/docs, not code.
Tests[C1]: scripts/operations/compose-t028-env.test.mjs::"C1/C2 static: the 8 names are value-less pass-through entries", "C1/C2 static: none of the 8 names carries a value or ${VAR:-} default", "C1 static: the api service has no env_file", "C1/C2 behaviour: all 8 set", "C1/C2 behaviour: none set -> all 8 stay UNDEFINED", "C1/C2 behaviour: only the 5 T-028 names set"
Tests[C2]: scripts/operations/compose-t028-env.test.mjs::"C1/C2 static: the 8 names are value-less pass-through entries", "C1/C2 static: none of the 8 names carries a value or ${VAR:-} default", "C1/C2 behaviour: all 8 set", "C1/C2 behaviour: none set -> all 8 stay UNDEFINED", "C1/C2 behaviour: only the 5 T-028 names set ... and vice versa"
Tests[C3]: docs/GO-LIVE-UBUNTU.md + .env.example + docs/REMAINING-PLAN-2026-10-28.md read-through (grep for remaining `.env.t028` mentions: only the explicit "retired" notes) — no executable test for prose
Pre-check[C1]: e301052d node --test --import tsx --test-name-pattern="C1" scripts/operations/compose-t028-env.test.mjs -> exit 0, 6 passed, 0 failed t=1 blobs=scripts/operations/compose-t028-env.test.mjs:12f161e1,docker-compose.yml:64e96887
Pre-check[C2]: e301052d node --test --import tsx --test-name-pattern="C2" scripts/operations/compose-t028-env.test.mjs -> exit 0, 5 passed, 0 failed t=1 blobs=scripts/operations/compose-t028-env.test.mjs:12f161e1,docker-compose.yml:64e96887
Pre-check[C3]: e301052d grep -c -F "main server" docs/GO-LIVE-UBUNTU.md -> exit 0, 2 passed, 0 failed (2 matches; 0 at base 02dd58b7; remaining env.t028 mentions are only the retired notes) t=1 blobs=docs/GO-LIVE-UBUNTU.md:2916d144
Metrics: builder_min=45 mutants=5 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Falsifications (one per criterion)
Done in a throwaway COPY (`.mut-copy/` inside the worktree, deleted afterwards; it holds no node_modules) of docker-compose.yml + the test, one mutation at a time, a fresh copy per mutation from the working file, `timeout 120`, no trap; the real compose and test files were never mutated (`git status` clean after).

| Criterion | falsifying edit | test file | observed |
|---|---|---|---|
| C1 | `LKB_HOSTING_STATE_DIR:` -> `LKB_HOSTING_STATE_DIR: ${LKB_HOSTING_STATE_DIR:-}` | compose-t028-env.test.mjs | pass 2 / fail 4 incl. "value-less", "carries a value", "none set -> UNDEFINED" |
| C1 | drop the `LKB_HOSTING_ENCRYPTION_KEY:` entry | compose-t028-env.test.mjs | pass 3 / fail 3 incl. "value-less", "all 8 set", "only the 5 T-028 names set" |
| C1 | add `env_file: - .env` to the api service | compose-t028-env.test.mjs | pass 5 / fail 1: "the api service has no env_file" |
| C2 | `WHATSAPP_MONGO_URL:` -> `WHATSAPP_MONGO_URL: ${WHATSAPP_MONGO_URL:-}` | compose-t028-env.test.mjs | pass 2 / fail 4 incl. "value-less", "carries a value", "none set -> UNDEFINED" |
| C2 | drop the `WHATSAPP_TENANT_OWNER_MAP:` entry | compose-t028-env.test.mjs | pass 3 / fail 3 incl. "value-less", "all 8 set", "only the 5 T-028 names set" |
| C3 | prose criterion: restore the base GO-LIVE-UBUNTU.md (`git show 02dd58b7:docs/GO-LIVE-UBUNTU.md`) and re-run the Pre-check[C3] grep | grep | 0 matches at base vs 4 now; base still says "create `.env.t028`" at lines 34 and 251 |

## How to verify
- From the worktree root, one file per run: `node --test --import tsx scripts/operations/compose-t028-env.test.mjs` -> 6 pass, 0 fail (needs docker CLI; the 3 behaviour tests self-skip without it). `scripts/lib/dbguard2.test.mjs` -> 12 pass; `apps/api/src/composition/vectorless-routing.test.ts` -> 3 pass.
- Red-before evidence: the test was written first against the base compose: static value-less test and behaviour "all 8 set" failed (names not forwarded), "none set" failed at the first run (null-vs-undefined handling in the assertion was then corrected to treat compose's `null` as unset).
- `node scripts/lint-dirsize.mjs --all` -> OK (the first placement under scripts/qa and scripts/lib broke the 30-file budget; moved to scripts/operations).
- Red-team the docs: `git grep -n "env.t028"` (excluding docs/DECISIONS.md and qa/) should return only "retired" notes (docker-compose.yml, .env.example, docs/GO-LIVE-UBUNTU.md) and nothing instructing to create the file.
- Server-side acceptance (human gate, not run here): after adding the five names (or none) and the WhatsApp names to the server `.env`, `docker compose config | sed -n '/^  api:/,/^  web:/p'` and `docker compose exec api env`.
- No CORE-REQUEST: no file owned by another lane was touched; no push, no merge.
