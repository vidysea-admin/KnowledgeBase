# Verdict B (blind dual coordinator) - reindex-sync-fix
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Checked state: base be9c8608, HEAD eea47f2a (code e81f2cbf, f28b5873, 8f52d32d)
Checkpoint: none needed (budget not exhausted)

## Check plan
Tier H (prod-write opt-in path), dual. Independent: fresh test runs of both touched test files in the bound tree (read-only), `pnpm lint:structure`, diff read of session-rows.mjs / sync-session.mjs / docs, 5 falsifications in a copy (git archive + node_modules junctions), adversarial read of the guard / tenancy / write paths.

## Evidence per criterion
- C1 PASS. `node --test --import tsx scripts/webinar/session-rows.test.mjs` -> 11 pass, 0 fail (own run). `providedSessionRow` (session-rows.mjs, end of file) requires captureMode provided, no captureConsent, no audioLevel, session.json present and `_id`/`tenantId`/`sourceId` match, non-blank title, valid YYYY-MM-DD. Title-bearing path untouched (`legacy` only computed when `!source.title`). Falsification: `row.sourceId === source._id` -> `true`: KILLED (10 pass, 1 fail).
- C2 PASS. `indexExistingRows` is tenant-scoped (scopedCollection in `indexExistingInDb`), refuses missing session/source/no turns/testData outside lkb_staging, writes nothing but indexer output and `indexFailure`; `assertIndexComplete` gates on strict, turn count, tree, chunks, mode. The real throwaway-mongod test ran and passed in the bound tree. Falsifications: drop `if (!source) throw` -> KILLED; drop `c.strict !== true` -> KILLED.
- C3 PASS. `db-guard-paths.test.mjs` -> 24 pass, 0 fail (own run, ~54 s). `guardDatabase()` text is the old D-204 block moved verbatim (diff compared line by line: one `allowProduction: true`, one `isProtectedWorkDbName(`, unchanged refusal text); `--index-existing` dry run exits before the guard and connects to nothing; real run calls the guard before any connect. `scripts/lib/transcript-provenance.mjs` not in the diff. Falsification: drop the `--i-know-this-is-production` part of `productionOptIn` -> KILLED (22 pass, 2 fail).
- C4 PASS. `recordIndexFailure` writes `indexFailure {at, via, reason, generation, state, phase}` via $set, reason redacted (mongodb URLs, Bearer, key/token forms), whitespace-collapsed, capped 1000; `indexAttempt` untouched; `clearIndexFailure` $unset on success (non-fatal `.catch`). sessions schema top-level `additionalProperties: true`. Real-Mongo test asserts persistence. Falsification: cap 1000 -> 100000: KILLED.
- C5 PASS. Dry-run tests for both shapes, title-less without session.json refused, `--index-existing --dry-run` connects to nothing, usage errors: all in the 24/11 green runs; the throwaway-mongod test covers the existing-rows path.
- C6 PASS. docs/GO-LIVE-UBUNTU.md "Cutover: reindex the 3 FAILED sessions" lists the dry-run and real command per session (Visa, UCAS via `--index`; Zoom p2 via `--index-existing --tenant vidysea`), prerequisites (turn-timing blocker, count + mongodump, re-run rule), and the `db.sessions.findOne(..., {indexFailure: 1, ...})` read.
- Floor: `pnpm lint:structure` -> `lint:structure: OK (10 stages, 0 failed)`. sync-session.mjs 309 lines, session-rows.mjs 279 (budget met by the maker's claim; lint passes).

## Falsifications (copy, per-mutation byte backup, `git hash-object` == `git rev-parse HEAD:<file>` after each, all restored=true)
5/5 KILLED: C1 sourceId match, C2 source-missing refusal, C2 strict gate, C4 reason cap, C3 opt-in flag part. The bound tree was never mutated.

## Adversarial hunt (auth / tenancy / data-write)
No bypass found: tenant regex + scopedCollection stops cross-tenant index-existing; no path reaches connect without the single guard; testData refused outside staging; legacy shape cannot admit silent/captured/consented/mismatched sources. Observations (non-blocking, all low):
PROPOSED-ISSUE: {"sev":"low","title":"sync --index on a migrated source $sets participants:[] and platform:'unknown' (session.json carries neither), overwriting any richer prod values","where":"scripts/webinar/sync-session.mjs sessionDoc (participants from meta.people=[]) / session-rows.mjs legacy meta","fix_direction":"omit participants/platform from $set when legacyProvided, or prefer --index-existing; disclosed in the runbook only as 're-sets from the files'"}
PROPOSED-ISSUE: {"sev":"low","title":"assertIndexComplete accepts retrievalMode undefined; if the indexer commits and the gate then throws, status.index is already done while the script exits non-zero and records indexFailure","where":"scripts/webinar/session-rows.mjs assertIndexComplete","fix_direction":"pin retrievalMode explicitly at both call sites; note in the runbook that indexFailure with status.index=done means gate-failed-after-commit"}

## Result
VERDICT: PASS
SCOREBOARD: 6/6 criteria met, floor met
TIER: H (production-write opt-in path, dual check)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (operator CLI)
LIVE-BROWSER: not-applicable (scripts/ and docs/ only)
ISSUES-WRITTEN: none (dual coordinator; 2 PROPOSED-ISSUE lines above, both low, not blocking)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All six criteria are evidenced by my own runs (11/11, 24/24, lint:structure OK) and 5 independent falsifications in a copy, all killed and byte-verified restored. The D-204 guard is moved verbatim and shared by both modes; no second opt-in or weakened refusal. The real reindex of lkb_prod is not covered here and remains blocked on the human-approved turns.json timing repair named in the manifest.
Metrics: start=2026-10-29T06:43:00Z end=2026-10-29T06:54:30Z wall_min=12 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable builder_min=150 check_min=12 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=690 mutants=5 defects_unit=0 defects_6c=0
