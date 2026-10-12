# Verdict: iss-t045tenantid-001-tenant-scoped-source-ids

VERDICT: PASS
Cycle checked: 0
Checked commit: 0681ad66 (lane/tenantsrcid). Tier 2, security class (tenancy, data writes, migration). No Mongo used; fake DB only.

## EXPLANATION
1. Reference coverage. Session ids are random UUIDs (intake, ingest-store); chunks, claims, session_pages, tree_index, citations, jobs, usage_events and run-state reference sessionId, never sources._id. Only sessions.sourceId, gaps.sourceRef and media.sourceRef (+ media._id `${id}-media`) reference a source id; the migration rewrites all of them, tenant-filtered. watch_state.sourceId is a Drive/Gmail key, unrelated. No dangling-citation path found.
   - Idempotent (2nd/3rd run no-op, tested). Crash after journal / after delete-old is repaired by the pending-journal pass (tested; M5 kills a no-recovery mutant). Crash after insert-new, before journal done, also repaired by reading code.
   - Same bare hash in two tenants cannot exist (global _id); the single row keeps its own stored tenantId, no reassignment. Untenanted rows are reported, never guessed.
   - down() restores bare ids, refs and media from the journal for migrated rows only; natively scoped rows are untouched; re-runnable. It does not restore a journal row left in `pending`. Acceptable.
   - Scale: unbatched toArray (ISS-TENANTSRCID-003, low). Fine at current size.
2. Legacy fallback (whatsapp/store.ts): findOne filters {_id: hash, tenantId}, so tenant B cannot attach to A's legacy row; B gets a scoped row. M9 (drop tenantId) is killed.
3. Old/new reads: all read paths treat the id as opaque (brain.ts matches session.sourceId to source._id, works for either form). Same-content re-ingest of an un-migrated url/document/recording row yields a duplicate-key error, not already-ingested; this is identical to pre-change behaviour (bare _id collided before), so not a regression.
4. ISS-TENANTSRCID-001: whatsapp sessions._id/turns._id are the bare hash. If two tenants import the same groupJid and ownerUserId, B's sessions.replaceOne upsert hits E11000 on A's row: cross-tenant denial plus existence oracle, but no read or overwrite of A's data. It needs one ownerUserId mapped to two tenants; owner-config.ts does not reject that, but it is operator config. Severity medium is honest; not high. Pre-existing, not worsened here.
5. Mutations (11, per-mutation backup, restore in trap, git hash-object == HEAD blob after each, timeout 120): killed 10/11. Killed: skip gaps refs, skip sessions refs, down incomplete, no recovery, refs without tenant filter, url bare id, document bare id, whatsapp bare id, recording media bare id, legacy fallback ignoring tenant. Survivor M3 (skip media.sourceRef updateMany) is masked by the media rename loop on fixtures; filed low as ISS-TENANTSRCID-002. Harness deleted; worktree clean.
6. Evidence: ingest sources/intake/source tests 217/217; migration + usage-events tests 11/11; apps/api whatsapp tests 13/13 (ingest mapped to lane src); tsc apps/api clean with temporary paths mapping (deleted). Replay of ISS-T045TENANTID-001 scenario 4/4 adapters create for both tenants (new test file). Real-DB run still requires Umesh's approval per D-136.

ISSUES-WRITTEN: ISS-TENANTSRCID-002 (low), ISS-TENANTSRCID-003 (low)
