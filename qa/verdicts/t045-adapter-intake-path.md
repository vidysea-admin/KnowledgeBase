# Verdict: t045-adapter-intake-path

VERDICT: PASS
Cycle checked: 0
Commit checked: fd01f630

EXPLANATION:
Tenancy (priority). The planner's dedupe lookup IS tenant-scoped: `findSessionBySource(tenantId, source._id)` always receives the input tenant, and the adapter source must match that tenant (`tenant-mismatch` otherwise). Probe (untracked, deleted): with a tenant-confined sink, tenant B ingesting A's bytes gets `created` with its own session id, never A's, and lookups were recorded as ["A","B"]. No session id or existence is returned across tenants by the planner. Tenant scoping is the sink's job by contract (documented "Must be tenant-confined"); if a sink ignores the tenant, B receives A's session id (probed). That is a caller-contract dependency, not a planner leak, and the planner keeps that surface minimal (tenantId is passed explicitly), but nothing enforces it, so the wiring unit must test its real sink for it.
Residual hole (not in this unit's code, upgraded ISS-T045INTAKE-001 to HIGH): source `_id` is the bare content hash. Probe with tenant-scoped find plus a global unique `_id` store: B's ingest of identical bytes fails `sink-failed` exactly when another tenant holds it (existence oracle and cross-tenant denial); an upserting save would overwrite A's source. The maker's test "same media in another tenant -> created" passes only because the in-memory sink has no unique index, so it overstates safety. Not a FAIL because this unit persists nothing and wires nothing, but it must be fixed before any real sink or API wiring (security class, uncapped).
D-135 conformance: OK. Same content-hash source in the same tenant returns the existing session id, `status: "already-ingested"`, no toTurns, no save, no delete. D-135 is ACTIVE on main (Approved-by Umesh).
Assumptions: zero turns refused, tenant required, dedupe after fetch (one download, no re-transcribe) are consistent with the seam; none contradicts contracts. Note: dedupe-after-fetch means the consent/download path runs on every re-ingest.
No network: tests use fakes only (fake exec/downloader/reader/hasher/fetcher/sink).
Mutations (per-mutation byte backup, restore in finally, hash-object == HEAD blob 84a7e6e7 after each): drop tenant from lookup KILLED; dedupe disabled KILLED; no-turns check removed KILLED; tenant-mismatch check removed KILLED; dedupe also calling save KILLED. Harness and probe deleted.
tsc --noEmit exit 0; intake/source/registry tests 18/18 pass.

ISSUES-WRITTEN: ISS-T045INTAKE-001 upgraded medium -> high (security class, blocks wiring); no new rows.
