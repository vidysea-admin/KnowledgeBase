# Verdict: iss-t050adapter-001-002-runner-tenant-refs-and-warning

VERDICT: PASS
Cycle checked: 0
Checked commit: e23959b1 (lane/t050fix)

EXPLANATION:
- Queue enforcement (file-job-queue.ts `owned`): `ref.tenantId !== undefined && j.tenantId !== ref.tenantId` gives not-found. An OMITTED tenantId is a wildcard (matches any tenant), so the adapter-level guarantee does matter. The maker's claim "queue enforces tenant" is true only when a tenant is supplied. Empty string or invalid tenant is refused (`refError`: invalid-input); only `undefined` skips the check. The new tests kill every drop-tenant mutant, so the guarantee is pinned. job-queue is unchanged vs main (no diff).
- Warnings: surfaced on all five mutate() paths (step, heartbeat, succeed, fail, skip) and on submit-created. Not on claim, nor step complete/failed-terminal/waiting: those perform no store save, so no warning exists. Submit "exists" paths also save nothing. Additive: optional field, absent when none; tsc exit 0.
- Replay ISS-T050ADAPTER-001: 4/4 recorded mutants killed. ISS-T050ADAPTER-002: 1/1 (drop warning) killed.
- Own mutations, 11/11 killed (90 s timeout, per-mutation backup restored in finally, hash == HEAD blob, harness deleted): complete / fail run-missing / fail bad-payload / fail plan-invalid drop tenant; complete with wrong tenant "tB"; refOf drops tenant; mutate drops warning; submit drops warning; ok() ignores warning; test spy ignoring tenant on complete; on fail.
- tsc exit 0. pipeline-runner tests 22/22 x5. job-queue suites (9 files) and run-state suites (11 files) all green.
- Notes (not backlog): the failed-terminal done-vs-dead owner question stays open for Umesh; warnings are returned, not logged (graph wiring must log them). Ledger rows not edited by the maker; closing them is the integrator's step.

ISSUES-WRITTEN: none
