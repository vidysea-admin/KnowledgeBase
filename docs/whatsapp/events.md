# WhatsApp event feed: payload contract (W12; R-38..R-41, D-211, gate H-13)

The event feed is the whole extension surface of the multi-user WhatsApp feature. Domain events are appended to the
`whatsapp_events` collection (append-only: insert and read, no update, no delete) and read through one endpoint.

## R-41 hard line

- No hook may call WhatsApp: no send, no react, no read receipt. Nothing in the feed path talks to WhatsApp or the archiver.
- No hook may export raw message text outside the tenant.
- Any future consumer that uses an external AI or other external service on WhatsApp-derived content needs its own per-use
  approval and a decisions-log entry first. The feed itself never carries content, so a consumer that needs content must call
  the scoped read API with its own credential, which applies the owner-or-admin rules and the student-data gate.
- There is no push, no webhook, no consumer registry and no outbound call in this feature. A test greps for them
  (`apps/api/src/whatsapp/events.test.ts`, C3).

## Reading the feed (R-40)

`GET /whatsapp/events?after=<cursor>&limit=<n>`

- Authorisation: the `whatsapp-admin` scope only, held by an admin session or an API key. A member, a viewer and a key
  without the scope get 403; no credential gets 401. Tenant comes from the credential only; a `tenantId` in the query is ignored.
- `after`: the `id` of the last event the consumer processed (24 hex). Omit it to start from the beginning. A malformed value
  is `400 invalid_cursor`; a well-formed id that is not an event of this tenant is `400 unknown_cursor`.
- `limit`: integer 1..500, default 100; anything else is `400 invalid_limit`.
- Response: `{ "events": [ ... ], "nextCursor": "<id of the last event>" | null }`, oldest first, ordered by `id` (not by `at`;
  see Delivery guarantee). `nextCursor` is `null` on an empty page; keep your own cursor and poll again.
- At-least-once, within the bound under Delivery guarantee: replaying from a cursor returns the same ids in the same order, plus
  anything committed since (a late-committing event can land inside the replayed range). Consumers dedupe on `id`.
  Responses are `Cache-Control: no-store`.
- Each event: `{ id, eventType, at, actorKind, actorId?, linkId?, data }`. The projection is an allowlist; the stored tenant id
  never leaves the service.

## Delivery guarantee

What the code does (`packages/db/src/collections/whatsapp-links.ts`, `events().list`): it finds the cursor event in this tenant (none: `unknown_cursor`),
then returns the events of this tenant whose `id` sorts after it, ordered by `id`, up to `limit`. Nothing else is compared.

- **Order is by event `id`.** An `id` is 24 hex characters taken by the writer just before its insert: epoch seconds (4 bytes), millisecond
  within the second (2 bytes), a per-process random part and a counter. Ids from one process strictly increase; ids from different
  processes order by their millisecond and, inside one millisecond, by the random part. Rows written before this change carry plain
  ObjectId ids, which order by their second.
- **`at` is the writer's own timestamp** and is not monotonic across the feed. The API and `scripts/whatsapp/sync-links.mjs` both write,
  so an event can carry an earlier `at` than one you already read and still be appended after it. Use `at` for display only: never as a
  cursor, a sort key or a "since" filter. (Paging by `at` used to skip such an event for good; paging by `id` delivers it, because its
  `id` is newer than your cursor.)
- **What you get:** an event that committed before your read, or after it, and whose `id` sorts after your cursor is returned by a read from that
  cursor, however old its `at`. Cursors are tenant-scoped; another tenant's event id, or an id that is no event, is `unknown_cursor`.
- **Residual window.** The `id` is taken before the insert commits, so the order is generation order, not commit order. An event whose insert
  is still in flight (a slow database, a stalled writer) when you read a later `id` can commit behind your cursor and be passed over from it.
  Host clocks that disagree (a writer whose clock is behind issues smaller ids) widen the same window by the size of the disagreement.
  Not exactly-once, and not a strict global order. An event whose write fails after its transition committed is logged and never appears
  (state is authoritative; see Event types).
- **Consumer rule (closes the window).** Always dedupe on `id`. Keep a settled resume point: after each poll, resume from the newest event
  whose `id` time (first 8 hex characters, epoch seconds) is at least a settle period old (60 seconds is a safe default: longer than any
  insert should stay in flight or any clock should drift), and drop ids you have already processed. The feed then re-delivers the last settle
  period on each poll and misses nothing unless an insert stays in flight, or a clock is off, by more than the settle period.

## Payload rule (R-39)

`data` carries ids, counts and codes only. It never carries message text, names, link labels, phone numbers, group subjects,
group jids, QR data or archiver owner ids. This is enforced three ways: the collection schema is closed
(`schema/whatsapp_events.schema.json`), the writer refuses any key outside the allowlist (`EVENT_DATA_KEYS`,
`FORBIDDEN_EVENT_FIELDS` in `packages/db/src/collections/whatsapp-links.ts`), and the feed projects only allowlisted keys.

`data` keys: `fromState`, `toState` (link states), `reason`, `errorCode` (lowercase codes), `requesterId`, `approverId`,
`targetUserId`, `runId`, `candidateId` (opaque ids), `groupCount`, `markedCount`, `fetched`, `newTurns`, `candidatesCreated`, `count` (integers).
`actorId` is a user id (`user:<id>`) or an API key id or fingerprint; it is absent for the system actor.

## Event types

Each is written once per transition, after the state change has committed. A failed event write is logged by code
(`event_write_failed`) and never fails or undoes the transition; state is authoritative.

| eventType | written when | data |
|---|---|---|
| `link.requested` / `approved` / `rejected` / `connected` / `suspended` / `resumed` / `unlinked` / `revoked` | the link CAS transition wins (`links/service.ts`); an idempotent repeat or a refusal writes nothing | `fromState`, `toState`, `reason`, requester/approver ids |
| `link.needs_relink` | the sync scheduler raises the `needs-relink` health flag (the archiver session is logged out); once per transition, not per cycle | `reason: logged_out` |
| `selection.changed` | an owner changes which groups or people are captured | `groupCount`, `markedCount`, `count` |
| `sync.completed` | a sync run of one link is recorded with status `ok` | `groupCount`, `fetched`, `newTurns`, `candidatesCreated`, `runId` |
| `sync.failed` | a sync run is recorded with status `failed` or `partial` | the counts above plus `errorCode` from the closed list (`archive_unreachable`, `archiver_api_unreachable`, `not_configured`, `link_inactive`, `store_transaction_unavailable`, `snapshot_shrink_refused`, `unknown`) |
| `candidate.created` | one ingest proposed new review candidates (one event per ingest, not per candidate; re-proposing existing ones writes nothing) | `count` |
| `candidate.approved` / `candidate.rejected` | the decision that wins the transition (an owner-or-admin decision on one candidate); a repeat, a conflict and a refusal write nothing | `candidateId` |
| `admin.raw_read` | an admin reads another person's raw content (R-29 audit) | `candidateId` or `count` |

A skipped sync run (lock held, link inactive, logged out) is not a sync result and writes no `sync.*` event. A bulk quarantine of a
link's pending candidates by an unlink or revoke is covered by that link's `link.unlinked` / `link.revoked` event and writes no `candidate.rejected`.

## Admin alerts (gate H-13)

Admin-only alerts (needs-relink, repeated sync failure) go to in-app admin notifications only: the feed above is that list
(admin scope, tenant-scoped, never shown to non-admins). `scripts/whatsapp/sync-links.mjs` raises them through a small sink
(`createAdminAlertSink`, channels are plain async functions), so email or another channel can be added later without touching
the callers. No email and no Telegram sender exists today. A needs-relink alert is a `link.needs_relink` event; an error alert is
the failed run's own `sync.failed` event.
