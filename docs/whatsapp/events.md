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
- Response: `{ "events": [ ... ], "nextCursor": "<id of the last event>" | null }`, oldest first, ordered by `(at, id)`.
  `nextCursor` is `null` on an empty page; keep your own cursor and poll again.
- At-least-once: replaying from a cursor returns the same ids in the same order, plus anything appended since. Consumers
  dedupe on `id`. Responses are `Cache-Control: no-store`.
- Each event: `{ id, eventType, at, actorKind, actorId?, linkId?, data }`. The projection is an allowlist; the stored tenant id
  never leaves the service.

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
