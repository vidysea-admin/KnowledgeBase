# iss-t045intake-001-tenant-scoped-source-id

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: security class (tenancy, data write), never capped. Lane: lane/t045tenantid (branched from lane/t045intake 095dd312). Fixes ISS-T045INTAKE-001 (high).
Authority: D-135 (same content hash within a tenant stays idempotent; behaviour unchanged). D-135 prose says "content-hash source _id": the _id is now derived from (tenantId, content hash); flagged for the Approver as wording only.

## Scope (packages/ingest only)
- `src/source.ts`: `tenantSourceId(tenantId, hash)` = `encodeURIComponent(tenantId):hash` (injective; bare hash stays in `hash`).
- `src/sources/youtube.ts`, `src/sources/hosted-recording.ts` (OnAir + Zoom): source `_id` = tenantSourceId; media `_id` = `<sourceId>-media`, `sourceRef` = sourceId.
- `src/intake.ts`: dedupe key must equal tenantSourceId(input tenant, source.hash) else `unscoped-source` (nothing looked up or saved). So a tenant-ignoring sink cannot match another tenant's source.
- `src/intake.test.ts`: +5 tests, stub updated.

## Out of scope / NOT covered
- url, recording, document, whatsapp adapters still emit bare-hash `_id`; `apps/api/src/ingest-store.ts` (url adapter) already stores such docs, so changing them needs a migration (not done). Intake now refuses them with `unscoped-source`, which blocks routing those through intake until separately resolved. Filed ISS-T045TENANTID-001.
- No real sink, Mongo or API wiring; no existing stored data uses the three adapters (not wired anywhere).

## Evidence (packages/ingest, fixtures only)
- `node --test --import tsx src/intake.test.ts src/sources/{youtube,onair,zoom-recording}.test.ts` -> tests 44, pass 44, fail 0 (intake.test.ts now 15 tests incl. 5 new). tsc --noEmit exit 0.
- ISS-T045INTAKE-001 recorded scenario (same media in tenant-a and tenant-b against a store with a global-unique _id and a tenant-ignoring lookup): 3/3 adapters (youtube, cloudonair, zoom-recording) -> both created, distinct session and source ids, no sink-failed, no already-ingested for B; same-tenant re-ingest -> already-ingested, plans stay 2.
- Mutations (untracked harness deleted, per-mutation byte backup restored in finally): youtube bare _id KILLED; hosted bare _id KILLED; tenantSourceId drops tenant KILLED; intake scoped check removed KILLED; encodeURIComponent removed KILLED; media sourceRef bare KILLED. 6/6. Post-run `git hash-object` source.ts = a54e847e..., intake.ts = fd3d807b... (intended).
