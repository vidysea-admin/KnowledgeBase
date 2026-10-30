# Production alias guard — independent plan review

Verdict: **REJECTED**

Scope: plan approval only. This is an incomplete review, not an implementation FAIL or release verdict. No implementation, tests, providers, databases, network, or secrets were accessed. No blocked workflow was resumed or approved.

## Evidence and authority

- Supplied `docs/DECISIONS.md:2478-2491` (D-186) permits deployed-app writes to `lkb_prod`, but expressly retains the script/migration guard restriction and requires a later decision to change guards. Its Changes-authorized field names only `docs/GO-LIVE-UBUNTU.md`. This review cannot authorize source edits or production writes. The proposal correctly identifies the need for a later authorizing decision through `scripts/append_decision.ps1` before source edits.
- Supplied `scripts/lib/transcript-provenance.mjs:92-101` excludes `lkb` and `global_university_db` from work targets but does not exclude `lkb_prod`. The supplied legacy/backfill/script fallback paths at lines 132-165 delegate to that work guard, supporting the proposed alias-isolation defect by static inspection. The separately supplied probe result was not read or independently reproduced.
- Supplied `scripts/lib/transcript-provenance.mjs:157-165` allows the explicit production branch only for trimmed `lkb`. Extending it to `lkb_prod` changes write capability for every caller opting into `allowProduction`; this requires the later decision and concrete caller compatibility review, even though three opt-ins remain required.
- Supplied tests at `scripts/lib/transcript-provenance.test.mjs:77-83`, `scripts/lib/legacy-unbound.test.mjs:98-118`, and `scripts/lib/script-db-guard.test.mjs:16-40` support extending existing test bodies with alias cases and preserving staging/mismatch controls. No tests were run.

## Blocking review limitation

Two local read attempts failed before process creation with `helper_unknown_error: setup refresh had errors`, including an explicit PowerShell/login-false attempt. Consequently, current disk hashes, installed skill instructions, architecture, the admission gate `qa/gates/calendar-bounded-resume-20261028.md`, and actual callers could not be read. The installed project instructions supplied in the conversation were read; additional installed files could not be verified. The supplied gate assertion is acknowledged but is not independent verification. The required relevant-caller trace is incomplete. No network or alternative execution surface was used to work around that limitation.

## Required corrections/evidence before approval

1. Complete bounded local verification of the admission gate and supplied source hashes, and trace actual work/script consumers, especially manual host/pipeline startup and every relevant `allowProduction` writer. Cite caller lines showing which environment target is passed, whether production opt-in is deliberately enabled, and that returned `dbName` is honored. Identify impacted existing refusal tests precisely. Do not infer safety from helper-only inspection or reset any old review lineage/budget.
2. Keep the proposal's explicit later-decision prerequisite before any source edit. That decision must address both denying known production aliases on all work paths and adding the canonical `lkb_prod` script production selection; D-186 alone is insufficient. Preserve the deployed-app authorization and the distinction between guard capability and permission to execute writes.
3. Preserve the proposed acceptance controls: for both production aliases exercise case/trim variants through every exported work/fallback path, retain `global_university_db`/staging/mismatch controls, and test removal of each production opt-in while the selected target remains a production alias. With the flag, refuse uppercase, missing, arbitrary, and global database targets; preserve existing trim behavior and return exactly the canonical selected alias. Verify downstream refusal before connection using isolated fakes only. This review does not authorize running those checks.

The supplied proposal already addresses the principal authority concern and describes a plausible minimal repair. Rejection here reflects missing independent source/admission/caller verification, not a demonstrated defect in the proposed alias matching. No implementation approval, checked-PASS, runtime readiness, deployment readiness, or production-write permission is granted.


## Revised independent plan review — 2026-10-28

Verdict: **APPROVED** (plan only; mandatory decision prerequisite below).

The earlier incomplete REJECTED review above is retained verbatim. This revision completes its missing local source/admission/caller verification. Scope is the distinct production-alias helper repair, backlog tier 2/security. No blocked office, publication, runtime or full-branch workflow is resumed, reset or approved.

### Verified admission and authority

- Read installed AGENTS.md, ARCHITECTURE.md:1-95, the relevant TASKS.md entries, installed senior-software-engineer skill, and the brain INDEX routing surface. This fresh reviewer did not author the proposal. The explicit no-delegation instruction governs this review.
- qa/gates/calendar-bounded-resume-20261028.md:3-5 explicitly admits this distinct five-minute review after the prior automatic admission rejection. That rejection and the prior incomplete verdict remain historical facts; no protection was disabled.
- All six supplied source SHA-256 values match disk: DECISIONS, proposal, helper and the three targeted test files. The stored probe's helper hash also matches. Its recorded lkb_prod/LKB_PROD acceptance agrees with static guard inspection; the probe was read, never executed or independently reproduced.
- D-186 (docs/DECISIONS.md:2478-2490) grants deployed-app writes to lkb_prod, but Rule 2 expressly reserves guard changes for a later decision; Changes-authorized names only the go-live document. D-117:1845 retains the local no-production-write boundary. APPROVED here authorizes no source edit or write execution. BEFORE source edits, the owner must append a later authorizing decision using scripts/append_decision.ps1, explicitly covering both the work-path deny-list addition and canonical lkb_prod script capability. The decision must preserve app authority and cannot manufacture human authorization for an actual production write.

### Source and consumer evidence

- scripts/lib/transcript-provenance.mjs:92-101 omits lkb_prod from both protection lists. Legacy/backfill fallback delegates at :133/:145 and script fallback at :163. The proposed case-insensitive alias denial after existing trim closes this demonstrated helper seam without a naming heuristic or configurable bypass.
- scripts/webinar/manual-jobs/host.ts:38-44 gates before authority construction and copies the returned dbName into child MONGODB_DB. scripts/webinar/run-pipeline.mjs:56-69 gates work capture before live proof; run-pipeline-deps.mjs:60-65 uses protection before the Gmail scan POST. sync-session.mjs:159-167 gates the resolved work target before retention/file/DB effects. These paths will reject lkb_prod with the shared change. Parent-production/child-work composition remains a separate unresolved workflow.
- Production-enabled consumers honor the returned target: mint-key.mjs:50-59 connects then deletes/inserts API keys; watch-config.mjs:40-41 delegates and watch-store.mjs:9/:44 plus watch-reingest.mjs:36-37 connect using that target; operations/recover-index-attempt.mjs:105-114 guards before loadDb/connect and retains its separate apply controls. eval-recall.mjs:55-57 and live-verify.mjs:112-117 use the selected target for reads. join-rules-api-host.ts:48-63 guards then connects with target.url/target.dbName. Thus adding canonical lkb_prod to the explicit production branch expands real writer capability, not just a harmless name check; the later decision must acknowledge these consumers. No caller rewrite is needed merely to honor the selected alias.
- docs/GO-LIVE-UBUNTU.md:67-70/:130 currently recommends MONGO_WORK_DB=lkb_prod. The planned in-place compatibility correction must remove that recommendation for work/test captures, distinguish app production from script opt-ins, and preserve isolated capture requirements.

### Mandatory implementation acceptance, within this approved plan

1. Keep the named existing helper functions and extend existing test bodies. Cover both aliases and trim/case variants through isProtectedWorkDbName, work, legacy, both backfill modes and script fallback. Keep the staging opt-in variants, global database refusal, invalid URL/name, and mismatched selected/work controls. No weakening of existing cases.
2. Production selection requires allowProduction, the exact flag and an explicit trimmed canonical MONGODB_DB of lkb or lkb_prod. Return that selected canonical name. Independently remove each opt-in while the selected name stays production; refuse missing/uppercase/arbitrary/global names with the flag and missing/invalid URLs. Preserve existing whitespace semantics. A flag is capability selection, not approval to execute a write.
3. In addition to the three proposed test files, retain and verify the existing relevant downstream checks: scripts/lib/dbguard2.test.mjs:25-52 and scripts/webinar/manual-jobs/host.test.ts:148-170; extend the existing refusal corpus with lkb_prod variants and assert refusal before authority/connection. scripts/webinar/db-guard-paths.test.mjs:93-97/:132-138 contains stale literal source-pattern checks (direct connect/process.env versus current runtime.connect/env at host :48/:63). Do not claim this suite green or delete its guarantees: update those existing assertions to the actual injected startup and preserve guard-before-connect/returned-target proof within the subsequent authorized maker scope. No test execution is authorized by this reviewer assignment.
4. Keep migration behavior outside this helper approval. config/migrate-mongo-config.cjs:14-30 independently duplicates the guard and currently accepts lkb_prod without the production flag; its comment :8-9 claiming the same rule will diverge further. This is a concrete residual data-write exposure, not fixed by this proposal. Record it for separately authorized repair; this helper unit must never claim all script/migration production isolation or whole-goal security completion. Do not silently broaden migration production permission.
5. Final independent implementation checking, required falsifications with safe restoration, and existing integration/publication gates remain required. No checked-PASS, deployment/runtime readiness or production promotion follows from this plan approval.

### Review execution limits

Only bounded filesystem reads/hash calculations and this append were performed through node_repl. No shell, tests, imports of product code, mutation runs, providers, database connections, network, secret files, source edits or agents. The only owned write is this verdict. No runtime configuration or deployed target was verified.
