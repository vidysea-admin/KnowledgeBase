# WhatsApp link sync: operator notes (W9)

The scheduler is `scripts/whatsapp/sync-links.mjs`. It syncs every `active` row of `whatsapp_links`, one link at a time,
through the same reviewed ingest composition the route uses (candidates only; nothing is trusted until a person approves).

## Run

```
node --import tsx scripts/whatsapp/sync-links.mjs --once        # one cycle, then exit
node --import tsx scripts/whatsapp/sync-links.mjs               # service: repeats every WHATSAPP_SYNC_INTERVAL_MIN
```

- Database: `MONGODB_URL` plus `MONGO_WORK_DB` (or `MONGODB_DB`). `lkb` and `lkb_prod` are refused unless
  `--i-know-this-is-production=true` is also passed, which is a human-approved step (D-196). `global_university_db` is always refused.
- `WHATSAPP_SYNC_INTERVAL_MIN`: minutes between cycles, clamped to 5..1440, default 15 (R-31).
- Data plane (read-only archiver Mongo): `WHATSAPP_MONGO_URL`, `WHATSAPP_MONGO_DB`. Control plane (status, unlink retry):
  `WHATSAPP_ARCHIVER_API_URL`, `WHATSAPP_ARCHIVER_API_TOKEN`. With neither set, liveness is simply unknown and the sync still runs.
- `WHATSAPP_TENANT_OWNER_MAP` is still honoured as the one-time legacy seed. The script runs that seed (through the owner
  resolver) before it reads `whatsapp_links` for anything (ISS-WAOWNER-001).

## What one cycle does

1. Seeds the legacy owner map, then lists the tenants that have an active link.
2. Per tenant, asks the owner resolver for the active links. Requested, approved, suspended, unlinked, revoked and rejected links are never returned.
3. Per link, under a lock `data/whatsapp-sync/link-<linkId>.lock` (T-038 token-owned protocol, `docs/t038-scheduler-service.md`):
   re-reads the link (must still be `active`), polls the archiver session status, lists that owner's marked groups, ingests each
   group with a resolver pinned to this one link (it can only ever see its own owner), then writes one `whatsapp_sync_runs` row
   and the link's `health.*`. Ownership of the lock is re-checked before every write; a lost lock refuses all further writes.
4. Retries pending archiver unlinks (below).

A second instance that finds the lock held writes a `skipped` run row and moves on. A stale lock is taken over only by the
T-038 rule (same host, holder pid dead, older than the stale window); anything else leaves it alone and needs a human.

## Run record and health

- `whatsapp_sync_runs`: `status` ok|partial|failed|skipped, per group `{fetched, newTurns, candidatesCreated, skippedDeleted, errorCode}`.
  Counts are derived by comparing turn and candidate ids before and after the ingest. `errorCode` is from the closed R-33 list;
  upstream text is never stored or logged. Neither jids nor owner ids are logged.
- Caps (spec section 10): 120 s per group and 20,000 messages per group. A cap hit makes the run `partial` with `errorCode: unknown`
  (the closed list has no cap code). A timed-out ingest is detached; its late finish is an idempotent upsert, and the script skips
  that group until it settles.
- `health.lastStatus/lastStatusAt` from the archiver status; `lastRunAt`; `lastSuccessAt` only for an `ok` run.
- Flags: `needs-relink` (status `logged_out`, sync skipped, cleared when status is no longer `logged_out`), `error` (run `failed`),
  `stale` (no success for 3 cycles). `quiet` is not computed here. `needs-relink` and `error` raise one alert on each new
  transition (not on each cycle). The alert is a `console.error` line with ids only; wiring it to the Telegram channel is plan H-13.

## Archiver unlink retries (contract with W8)

A terminal link (`unlinked` or `revoked`) with `archiverUnlinkPending: true` gets `unlinkSession` on every cycle until it
succeeds (an archiver answer of "owner not found/already unlinked" counts as success), then the flag is unset. W8 owns setting
the flag and adding it to the `whatsapp_links` schema; until then there is nothing to retry.

## Not here

Event rows (`sync.completed`, `sync.failed`) are W12. Selection changes are W6. Unlink and consent orchestration is W8.
