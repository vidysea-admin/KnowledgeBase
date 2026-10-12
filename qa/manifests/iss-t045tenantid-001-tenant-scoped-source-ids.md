# iss-t045tenantid-001-tenant-scoped-source-ids

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 2 (open high issue ISS-T045TENANTID-001, security class: tenancy). Full ceremony. Lane: lane/tenantsrcid, ledger shard qa/issues.tenantsrcid.jsonl. Authority: D-136 (pending append). Verdict by the checker only; ISS-T045TENANTID-001 ledger row status NOT changed here.

## Scope
url, recording, document and whatsapp adapters now emit `_id = tenantSourceId(tenantId, hash)` (hash kept in `hash`); recording media `_id = ${source._id}-media`. youtube/onair/zoom unchanged. Migration `migrations/20261012150000-tenant-scoped-source-ids.cjs` rewrites stored bare-hash ids and references (sources._id, sessions.sourceId, gaps.sourceRef, media.sourceRef, media._id). Never run against any DB (fake DB only). Reads accept both forms: `apps/api/src/whatsapp/store.ts` reuses a legacy bare row until migrated (writing the scoped id would trip the unique {tenantId, hash} index). `ingest-store.ts` needs no change (insertOne already collides on the same content in the same tenant under either form); brain.ts/intake/scripts treat the id as opaque.

## Files
packages/ingest/src/sources/{url,recording,document,whatsapp}.ts; packages/ingest/src/sources/tenant-scoped-ids.test.ts (new); migrations/20261012150000-tenant-scoped-source-ids.cjs + tenant-scoped-source-ids.migration.test.mjs (new); apps/api/src/whatsapp/store.ts + store-source-id.test.ts (new); three whatsapp store test fakes gained `findOne` (store-snapshot, store-isolation, store-mongo-snapshot); qa ledger shard + this manifest. apps/api files touched: only apps/api/src/whatsapp/*.

## Migration design
Only `_id === hash` with a 64-hex hash is touched (not `gdrive-*`, `<session>-src`, already scoped). Tenant = the row's stored tenantId; a row without one is reported (warn + report.untenanted), never guessed. Old doc journaled to `source_id_migration_journal` before delete-old/insert-new (the unique {tenantId, hash} index forbids both at once), so a crash is repaired by the next run. References are tenant-filtered updateMany (no-op once applied). down() restores from the journal (only rows this migration moved).

## Criteria
1. Each of the 4 adapters: two tenants, same content -> different scoped ids, hash equal, media tied to it.
2. Issue scenario replayed through intakeFromSource per adapter: both tenants created, same-tenant re-ingest already-ingested.
3. Legacy row still resolves in the whatsapp store; another tenant's legacy row does not capture.
4. Migration (fake DB with _id and {tenantId, hash} uniqueness): rewrites ids and references, idempotent, reports untenanted, crash-recoverable, down restores.

## Reproductions
ISS-T045TENANTID-001 records one scenario (url adapter stores bare hash; intake refuses with unscoped-source): replayed for all 4 adapters, 4/4 now create for both tenants (url, recording, document, whatsapp).

## Evidence
```
packages/ingest: sources/*.test.ts + intake.test.ts + source.test.ts   ℹ tests 217 ℹ pass 217 ℹ fail 0   (new file: 8 tests)
migrations/tenant-scoped-source-ids.migration.test.mjs + usage-events  ℹ tests 11 ℹ pass 11 ℹ fail 0   (8 new)
apps/api/src/whatsapp/store-*.test.ts + route-tenant (ingest mapped to lane src)  ℹ tests 11 ℹ pass 11 ; same 3 store files vs main-tree ingest: 7/7
tsc --noEmit: packages/ingest clean; apps/api clean with a temporary paths mapping for @lkb/ingest (deleted)
```
Mutations (per-mutation backup in finally, git hash-object restored == pre-mutation): 8/8 killed: reference updates lose tenant filter; url adapter bare id; whatsapp adapter bare id; recording media id bare; whatsapp store ignores legacy row; media not renamed; untenanted guessed; journal recovery skipped.

## Not done / residual
ISS-TENANTSRCID-001 (medium, policy): whatsapp session id and turn ids stay bare. Migration never run on a real DB. Full monorepo suites not run.
