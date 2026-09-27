# Manifest — orphaned-scratch-tenant-cleanup

**Contract:** qa/contracts/ingest-indexing-pipeline.md (data-hygiene housekeeping; no criterion
changes)
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-067

## Why

ISS-067 (filed by the checker during `tree-index-tenant-id-migration`): two orphaned
scratch-tenant `tree_index` documents were left in the live `lkb` database by an earlier
checker's live two-tenant proof for `tenant-scoped-writes` (ISS-060), whose cleanup missed the
`tree_index` collection. That unit's own migration correctly left them alone — a schema
migration should only add/backfill fields, never delete rows — and filed the cleanup as its own
deliberate unit instead of silently bundling a delete into an unrelated migration.

## What changed

Nothing in the codebase. This unit performs a one-time, surgical, live-database delete of
exactly the two documents named in ISS-067, run against production Mongo
(`mongodb://13.202.206.101:27017`, db `lkb`) with the user's explicit confirmation (this is an
irreversible production write, so it was gated rather than run automatically).

Script (run once from `apps/api/src/_temp-cleanup-iss067.mjs`, deleted immediately after —
nothing new is committed to the repo):
- Looked up both target documents **by `node_id`** (`tenant:chk060-A-aa9c3020` and
  `tenant:chk060-A-fc1ebd22`), not by hand-typed `_id` string, to avoid an ObjectId/string
  mismatch silently matching nothing.
- Asserted each found document's `tenantId` field equals the tenant suffix of its own `node_id`
  before deleting anything — a mismatch would have aborted the whole run.
- `deleteMany({ node_id: { $in: [...] } })`, asserted `deletedCount === 2`.
- Re-queried both `node_id`s after the delete — confirmed absent.
- Re-counted `tree_index` docs matching `/^tenant:chk060-A-/` — confirmed 0.
- Counted total `tree_index` docs after cleanup — 1 (the real `toc` tenant's root — the only
  legitimate document left in the collection).

## Evidence

Live run output (production Mongo, `npx tsx apps/api/src/_temp-cleanup-iss067.mjs`):

```
--- before ---
tenant:chk060-A-aa9c3020 exists: true _id=6a9ea31c8dfa86dc4dd2d2dd tenantId=chk060-A-aa9c3020
tenant:chk060-A-fc1ebd22 exists: true _id=6a9ea3288dfa86dc4dd2d35d tenantId=chk060-A-fc1ebd22
deleteMany result: {"acknowledged":true,"deletedCount":2}
--- after ---
tenant:chk060-A-aa9c3020 exists: false
tenant:chk060-A-fc1ebd22 exists: false
remaining chk060-A-* docs: 0
total tree_index docs after cleanup: 1
```

The `_id`s recovered live (`6a9ea31c8dfa86dc4dd2d2dd`, `6a9ea3288dfa86dc4dd2d35d`) match ISS-067's
filed evidence exactly, confirming these are the same two documents the checker found, not a
different pair matched by coincidence.

## How to verify (checker)

1. **Confirm zero code/schema diff** — `git status` / `git diff` should show no tracked file
   changed by this unit (it is a pure data operation). The only artifact is this manifest +
   `qa/issues.jsonl` update.
2. **Live re-query production** (read-only): `countDocuments({node_id: {$regex: /^tenant:chk060-A-/}})`
   on `lkb.tree_index` should be `0`; `countDocuments({})` on the same collection should be `1`
   and that one document's `node_id` should be the real `toc` tenant's root
   (`tenant:toc`-prefixed), not a scratch tenant.
3. **Confirm no collateral damage**: `countDocuments({tenantId: {$in: ["chk060-A-aa9c3020",
   "chk060-A-fc1ebd22"]}})` across every other collection (`sessions`, `claims`, `turns`,
   `session_pages`, `sources`) should still be `0` — unchanged from ISS-067's original filing,
   proving nothing else was ever touched by this or the original scratch run.
4. **Ledger**: `ISS-067` should be `status: fixed`, `fixed_date` set, with this manifest's path
   in evidence.

## Risk / rollback

Irreversible (a live delete against production). Mitigated by: surgical `node_id` targeting (no
pattern-wide delete), pre-delete assertion that the found doc's `tenantId` matches expectation,
zero real data ever depended on these two tenants (independently confirmed twice now — once by
the original ISS-067 filing, once implicitly by this unit finding the exact same `_id`s
unchanged), and explicit user confirmation obtained before running (production Mongo writes are
a hard-boundary action per project rules, not something run without asking).

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
