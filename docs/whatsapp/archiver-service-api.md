# WhatsApp archiver service API, contract v1

**Status:** DRAFT v1, unit W2a of `docs/features/whatsapp-multiuser/plan.md` (spec section 7, requirements
R-11..R-14, R-16, R-34, R-42, R-43, R-45). Nothing here is implemented. Docs only.
**Owner of this file:** the KB repo. **Implementer:** the archiver repo (`sources/whatsapp_msg`), unit W2b,
under its own governance.
**Every unstated input is [ASSUMPTION].** Where this contract chooses between readings the spec leaves open,
the choice is listed in section 13 so the archiver's maker and the human can overrule it before code starts.

## 0. What this document is, and what it is not

- It is the KB's **request**: the interface the KB needs so a person can link, select and unlink WhatsApp
  entirely inside the KB (decision Q3 = 3b), without the KB ever writing the archiver database (R-16, D-206).
- The archiver's **decision record is the archiver's own** (its `docs/DECISIONS.md` entry comes before code,
  W2b). **No archiver governance file (`ARCHITECTURE.md`, `docs/DECISIONS.md`, `contracts/`, hooks) is edited
  from this repo.** The archiver may answer this request with changes; it then amends this file by a KB change,
  never the reverse.
- The same acceptance tests (section 11) are run by the archiver's own suite (W2b) and against the KB's fake
  archiver (W3). A test is only a pass for the archiver when it ran against the real service.
- Message text, media and phone numbers never cross this API. Reading captured messages stays on the KB's
  read-only Mongo path (R-16, R-43).

Grounding: this contract was written against the archiver at `7cdf1a1` (read-only). References below are to
`sources/whatsapp_msg/src/...` and describe what exists today, so each operation is implementable by a small
service layer next to the existing UI server, not a rewrite.

## 1. What the archiver already has, and what is new

| Need | Exists today | New work implied |
|---|---|---|
| One owner per person, `ownerUserId` on every row | `db/types.ts` (`GroupDoc`, `PersonDoc`, `TrackingDoc`, `MessageDoc` all carry `ownerUserId`), unique indexes in `db/mongo.ts` | A **service owner** document in `users` with no email and no password (O1). Unique `ownerRef`. |
| One Baileys socket per owner, states, backoff | `wa/sessionManager.ts` (`SessionStatus` = connecting, awaiting_qr, connected, reconnecting, logged_out, closed; `start`, `stop`, `logout`, `statusOf`, `qr` event) | Record `updatedAt` per status change; hold the latest QR in memory only (today it is pushed to SSE and dropped). |
| QR to a browser | `api/server.ts` `GET /api/wa/stream` (SSE, cookie auth; `QRCode.toDataURL`) | Same data through a token-authenticated, non-streaming call (O2). |
| Group list, live refresh with cache fallback | `api/server.ts` `GET /api/groups` (8 s `WA_CALL_MS` bound, `$setOnInsert` keeps tracking state) | Return shape without `isPinned` (O4). |
| Marking a group | `POST /api/groups/:jid/track`, `/mode` (cookie auth, only `matchedCount` check) | Same writes behind strict validation (O5). |
| Marking people | `GET /api/groups/:jid/participants`, `POST /api/groups/:jid/people` (`deleteMany` then `insertMany`, `new ObjectId(id)` unvalidated) | Validated, atomic replace; label masking (O5). |
| Unlink | `POST /api/wa/logout` with `confirm: "UNLINK"`; `authState.destroyAuthState` moves credentials to `sessions/.trash` (D-022, up to 5 archives, restorable by `POST /api/wa/restore`) | Owner state `unlinked`, capture disabled, not restorable through any service call (O6). |
| Restart rehydration | `index.ts` starts a session for every directory in `sessions/` that has `creds.json` (`authState.linkedUserIds`) | Skip owners in state `unlinked`. |
| Capture gate | `wa/ingest.ts`: group must have `isTracked: true`; if not `trackAllSenders`, the sender must have a `tracking` row | Nothing; the service changes the same fields, so capture follows at once. |
| Auth | Cookie sessions for password users (`api/auth.ts`) | A separate token-authenticated listener (section 3). Cookie routes are untouched. |

## 2. Conventions

- **Base path** `/svc/v1`. JSON only, UTF-8. Requests with a body send `Content-Type: application/json`.
  Every response carries `X-Archiver-Api-Version: 1` and `X-Request-Id`.
- **Ids.** `ownerId` is the archiver `users._id` as 24 lowercase hex (`^[0-9a-f]{24}$`); it is the value stored as
  `ownerUserId` in every data row and read by the KB over Mongo. `ownerRef` is the KB link id, also 24 hex.
  `personId` is 24 hex. `jid` is a WhatsApp group id: `^[0-9]{5,40}(-[0-9]{1,20})?@g\.us$`. A path parameter or
  body field that does not match its pattern is `invalid_request`; it never reaches the database.
- **Timestamps** are ISO 8601 UTC strings with milliseconds (`2026-10-29T12:00:00.000Z`).
- **Strict bodies.** Unknown fields, wrong types, extra properties, arrays where an object is expected, and bodies
  over 64 KiB are rejected before any handler logic (`invalid_request`, `payload_too_large`).
- **Unknown response fields** are ignored by the KB client (additive evolution). Removing or retyping a field, or
  changing a code's meaning, is a new base path (`/svc/v2`).
- **No content.** No response and no log line contains message text, media, a full phone number, a
  WhatsApp auth state, a password hash, a cookie or the service token. The only digits of a phone number that may
  appear are the two in `accountHint` and the two in a masked person label (section 6.5).
- **Errors** use one envelope and only the closed codes of section 4:
  `{"error":{"code":"<code>","requestId":"<id>"}}` plus `"retryAfterSec":<int>` on `rate_limited` and
  `store_unavailable`. There is **no free-text message field**, no stack trace, no echo of any request value.
  The KB never shows or logs an archiver body beyond the code.
- **Idempotency** (section 7) and **rate limits** (section 8) apply to every operation.
- **Correlation.** The KB may send `X-Request-Id` (`^[A-Za-z0-9_-]{8,64}$`); the archiver echoes it, otherwise
  generates one. It is a log correlation id only and carries no authority.

## 3. Transport, auth and network placement (R-42, R-43)

1. **Separate listener.** A second HTTP server instance with its own bind address and port, distinct from the UI
   server (`config.port`). It mounts **only** the `/svc/v1` routes: no `cookie-parser`, no `express.static`, no
   `/api/*` routes. The UI server mounts **no** `/svc` route. Test: a request for `/svc/v1/health` on the UI port
   is 404 with or without a token; `/api/me` and `/` on the service port are 404.
2. **Not public.** The listener binds to a private address only (loopback, a private network address or a tunnel
   interface). It **fails closed**: if the bind address, port or token is unset, too short or malformed, the
   archiver starts without the service listener and logs one line naming the missing setting (never a value).
   Binding `0.0.0.0` or `::` requires an explicit extra setting and logs a warning every boot. It is never routed
   through the public reverse proxy of the UI. Names are the archiver's choice; suggested:
   `SERVICE_API_BIND`, `SERVICE_API_PORT`, `SERVICE_API_TOKEN`, `SERVICE_API_TOKEN_NEXT`,
   `SERVICE_API_ALLOW_CIDRS`.
3. **Source allowlist.** The remote socket address must fall in `SERVICE_API_ALLOW_CIDRS` (the app host).
   `X-Forwarded-For` and similar headers are **never** trusted. A disallowed source gets the same response as a
   bad token (point 4), so the listener is not an oracle for its allowlist.
4. **Token.** `Authorization: Bearer <token>`, a server-to-server secret of at least 32 random bytes (64 hex
   characters or more), compared in constant time (compare SHA-256 digests with `timingSafeEqual`). Missing,
   malformed, wrong, wrong scheme or disallowed source all return exactly
   `401 {"error":{"code":"unauthorized","requestId":"..."}}`: same body, same headers, no `WWW-Authenticate`
   detail, no hint which check failed. Health is **not** exempt. Failed authentications are rate limited (section 8).
5. **Rotation.** The archiver accepts two tokens at once (`SERVICE_API_TOKEN`, optional
   `SERVICE_API_TOKEN_NEXT`) so the operator can rotate without downtime (W13 drill). A token is never logged;
   request logging redacts the `Authorization` header. The KB holds its copy as `WHATSAPP_ARCHIVER_API_TOKEN`
   (env only, never in the browser, never in the repo).
6. **Transport security.** TLS, or plaintext HTTP only across loopback or a private tunnel (WireGuard or same
   VPC) [ASSUMPTION, human item H-7]. The KB client refuses a non-`https` base URL unless config explicitly allows
   a private address (plan W3). The base URL is fixed configuration (`WHATSAPP_ARCHIVER_API_URL`), never built from
   request data.
7. **Boundary.** The KB uses this API for the control plane only. The data plane is the KB's read-only Mongo
   credential; the KB holds **no write credential** to the archiver database (R-43; the startup probe lives in
   the KB, not here).

## 4. Closed error codes

Any code outside this list is a contract violation by the archiver. The KB maps an unknown code to its own
`archiver_api_unexpected`.

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Token or source check failed (section 3.4). |
| `invalid_request` | 400 | Malformed JSON, unknown field, wrong type, bad id or jid, bad `personIds` shape or size. |
| `confirm_required` | 400 | `unlink` without `{"confirm":"UNLINK"}`. |
| `not_found` | 404 | Unknown path. |
| `method_not_allowed` | 405 | Known path, wrong method. |
| `owner_not_found` | 404 | No service owner with that `ownerId`. |
| `group_not_found` | 404 | The owner has no group row for that `jid` (never listed). |
| `person_not_found` | 404 | A `personId` is not a person of that owner. |
| `payload_too_large` | 413 | Body over 64 KiB. |
| `unsupported_media_type` | 415 | Body present without `application/json`. |
| `owner_unlinked` | 409 | The owner is `unlinked`; it can never start a session or change selection again. |
| `session_not_started` | 409 | QR requested while the owner has no session in memory (call O2 first). |
| `idempotency_key_reused` | 409 | Same `Idempotency-Key`, different request. |
| `request_in_progress` | 409 | Same `Idempotency-Key` still executing. |
| `rate_limited` | 429 | Over a limit in section 8; `Retry-After` header and `retryAfterSec`. |
| `store_unavailable` | 503 | The archiver database is unreachable or refused the operation; nothing was changed. |
| `internal_error` | 500 | Anything else. Never contains the cause. |

## 5. Endpoint map and the seven operations

| Op | Purpose | Endpoint | Client method (W3) |
|---|---|---|---|
| O1 | Provision passwordless service owner | `POST /svc/v1/owners` | `ensureOwner` |
| O2 | Start link and fetch QR | `POST /svc/v1/owners/{ownerId}/session`, `GET /svc/v1/owners/{ownerId}/session/qr` | `startSession`, `getQr` |
| O3 | Link status | `GET /svc/v1/owners/{ownerId}/session` | `getSession` |
| O4 | List groups | `GET /svc/v1/owners/{ownerId}/groups` | `listGroups` |
| O5 | Set capture selection (groups and people) | `PUT /svc/v1/owners/{ownerId}/groups/{jid}/tracking`, `GET` and `PUT /svc/v1/owners/{ownerId}/groups/{jid}/people` | `setGroupTracking`, `listPeople`, `setPeople` |
| O6 | Unlink | `POST /svc/v1/owners/{ownerId}/unlink` | `unlinkSession` |
| O7 | Health | `GET /svc/v1/health` | `getHealth` |

`{jid}` is URL-encoded in the path (`@` as `%40`).

### 5.1 O1 `ensureOwner`: provision a passwordless service owner

Request: `POST /svc/v1/owners` body `{"ownerRef":"<24 hex link id>"}`.

Response `200`:

```json
{"ownerId":"<24 hex>","ownerRef":"<24 hex>","created":true,"state":"active"}
```

- **Idempotent by `ownerRef`.** The first call creates the owner and returns `created: true`; any later call
  returns the same `ownerId` with `created: false`. A race between two first calls creates one owner (unique
  index on `ownerRef`; the loser reads the winner).
- **Passwordless.** The `users` document has **no `email` and no `passwordHash`** field (absent, not empty), has
  `kind: "service"`, `ownerRef`, `state`, `createdAt`. It cannot log in: there is no email to look up, and
  `verifyUser` must treat a missing hash as a failed login (today `bcrypt.compare(password, undefined)` throws, so
  the archiver adds that guard). No `app_sessions` row is ever created for it. The existing unique index on
  `email` must become partial (`{email: {$type: "string"}}`) so several owners without an email do not collide.
  `UserDoc.passwordHash` becomes optional in the archiver's types.
- **Never reused.** A later link gets a new `ownerRef` and so a new owner. For an `unlinked` owner, O1 returns
  `state: "unlinked"` and nothing is reset.
- No email, no phone number, no label is accepted or stored. Errors: `invalid_request`, `store_unavailable`.

### 5.2 O2 `startSession` and `getQr`: start the link and fetch the QR

`POST /svc/v1/owners/{ownerId}/session`, no body (an empty object is accepted). Starts the owner's socket if it
is not running (today's `sessionManager.start`: a running session or one still connecting is a no-op; a
`logged_out` one is restarted for re-link). Response `200`:

```json
{"status":"connecting","updatedAt":"2026-10-29T12:00:00.000Z"}
```

Errors: `owner_not_found`, `owner_unlinked`, `rate_limited`, `store_unavailable`.

`GET /svc/v1/owners/{ownerId}/session/qr`. Response `200`:

```json
{"status":"awaiting_qr","qr":"<WhatsApp QR payload string>","qrDataUrl":"data:image/png;base64,...","expiresAt":"2026-10-29T12:00:20.000Z"}
```

- `qr` and `qrDataUrl` are both `null`, and `expiresAt` is `null`, whenever the status is not `awaiting_qr` or
  the held QR has expired. `qrDataUrl` is the archiver's existing `QRCode.toDataURL(qr, {margin: 1, width: 320})`
  output; supplying both lets the KB choose to render the string or show the image (plan H-9).
- `expiresAt` is the time the archiver received that QR plus 20 seconds [ASSUMPTION: the `GET /api/wa/stream`
  comment says it rotates about every 20 s]. After it, the archiver returns `null`, never a stale QR.
- No session in memory: `409 session_not_started`. The call never starts a session by itself.
- **QR secrecy** is a hard requirement, section 6.1.

### 5.3 O3 `getSession`: link status

`GET /svc/v1/owners/{ownerId}/session`. Response `200`:

```json
{"status":"connected","detail":null,"updatedAt":"2026-10-29T12:00:00.000Z","accountHint":"47"}
```

- `status` is one of `connecting | awaiting_qr | connected | reconnecting | logged_out | closed | not_started`
  (the first six are `SessionStatus`; `not_started` means the archiver holds no session for the owner, today
  `statusOf` returns `null`). `closed` is also the status of an unlinked owner.
- `detail` is `null` or one of `logged_out | bad_session | connection_replaced` (today's `setStatus` detail
  values). It never carries free text.
- `updatedAt` is the time of the last status change (new: `sessionManager` records it). For `not_started` it is
  `null`.
- `accountHint` is **exactly the last two digits** of the linked WhatsApp account's number as a 2-character
  string, present only while `status` is `connected`, else `null` or absent (R-14). It may be absent if the
  socket does not expose it. It is the only phone-derived value in the API.
- Never contains the QR. This is the call the KB scheduler and health pages use, so it must be cheap and must not
  touch WhatsApp (memory read plus one owner lookup).
- Errors: `owner_not_found`, `rate_limited`, `store_unavailable`. An unlinked owner returns `200` with
  `status: "closed"` (not an error), so the KB can read the state it caused.

### 5.4 O4 `listGroups`

`GET /svc/v1/owners/{ownerId}/groups`. Response `200`:

```json
{"source":"live","refreshedAt":"2026-10-29T12:00:00.000Z","truncated":false,
 "groups":[{"jid":"1203630000000000@g.us","subject":"Admissions desk","participantCount":42,
            "isTracked":true,"trackAllSenders":true,"membersSyncedAt":"2026-10-28T09:00:00.000Z"}]}
```

- Behaviour is today's `GET /api/groups`: when the session is `connected`, refresh the owner's rows from
  `groupFetchAllParticipating()` under an 8 s bound, preserving tracking state (`$setOnInsert` for
  `isTracked: false`, `trackAllSenders: false`); on any failure or when not connected, serve the cache.
  `source` is `live` only when the refresh succeeded within this call, else `cache`. `refreshedAt` is the time
  of the last successful refresh or `null` if never.
- A live refresh runs at most once per 30 s per owner; calls inside that window return `source: "cache"`. This
  protects the socket and WhatsApp from a polling UI.
- Order: tracked first, then `subject` ascending, then `jid`. At most 2000 groups; beyond that
  `truncated: true`.
- `isPinned` and `memberPersonIds` are not returned. `membersSyncedAt` is `null` until members were resolved.
- `subject` is third-party text. It goes to the owner's screen through the KB and is never put in a KB event or
  log (R-39); the archiver does not log it.
- A fresh owner that never connected returns `{"source":"cache","refreshedAt":null,"truncated":false,"groups":[]}`.
- Errors: `owner_not_found`, `rate_limited`, `store_unavailable`.

### 5.5 O5 `setGroupTracking`, `listPeople`, `setPeople`: capture selection

**Mark or unmark a group.** `PUT /svc/v1/owners/{ownerId}/groups/{jid}/tracking` with

```json
{"isTracked":true,"trackAllSenders":true}
```

`isTracked` is required; `trackAllSenders` is optional. Response `200`:

```json
{"jid":"1203630000000000@g.us","isTracked":true,"trackAllSenders":true,"capture":"all","changed":true}
```

- Writes `groups.isTracked` and `groups.trackAllSenders` for `(ownerId, jid)`, exactly the fields ingest reads
  (`wa/ingest.ts`), so the effect is immediate and needs no restart. Going-forward only (archiver D-005): nothing
  is back-filled when a group is marked, nothing captured is deleted when it is unmarked (R-19).
- `trackAllSenders` omitted: if the group currently has no person rows and `trackAllSenders` is false, the
  archiver sets it to `true` when marking (otherwise a marked group would capture nothing, see
  `ingest.ts:232`); in every other case the stored value is kept. The response always reports the effective
  value.
- `capture` is the effective rule: `all` (marked, all senders), `selected` (marked, `trackAllSenders` false,
  at least one person row), `none` (not marked, or marked in selected mode with zero people, which captures
  nothing; the KB warns the owner).
- `group_not_found` when the owner has no row for the `jid` (the group must have been listed once; the KB lists
  before marking). No row is ever created by this call.
- Best effort after a successful write when marking: resolve the group's members (today's `syncGroupMembers`).
  Its failure never fails the call.
- Idempotent: the same body again returns `200` with `changed: false`.
- Errors: `invalid_request`, `owner_not_found`, `owner_unlinked`, `group_not_found`, `rate_limited`,
  `store_unavailable`.

**List people of a group.** `GET /svc/v1/owners/{ownerId}/groups/{jid}/people`. Response `200`:

```json
{"source":"cache","people":[{"personId":"<24 hex>","label":"A. Sharma","isSelected":true,"hasName":true}]}
```

- Source and ordering follow today's `GET /api/groups/:jid/participants`: live member sync when connected, else
  cached `memberPersonIds`, else senders seen in captured messages (`source`: `live | cache | observed`). Selected
  first, then named, then by label. At most 5000.
- Only opaque `personId`s are exposed. `lid`, `pn`, raw participant strings and message content are never
  returned. See label rules in section 6.5.
- Errors: `invalid_request`, `owner_not_found`, `group_not_found`, `rate_limited`, `store_unavailable`.

**Replace the selected people.** `PUT /svc/v1/owners/{ownerId}/groups/{jid}/people` with

```json
{"personIds":["<24 hex>","<24 hex>"]}
```

- Replace semantics: the stored `tracking` rows for `(ownerId, jid)` become exactly this set. The array has at
  most 1000 unique ids; `[]` clears the selection. Response `200`:
  `{"jid":"...","count":2,"capture":"selected","changed":true}`.
- Every id must be a `people` document of the same owner, else `person_not_found` and **nothing is changed**.
- **Atomic from the capture path's point of view:** a concurrent ingest never observes an empty selection in the
  middle of a replace while `trackAllSenders` is false. (Use a transaction where the archiver Mongo supports it;
  otherwise insert the new rows, then delete the stale ones.)
- This call never changes `trackAllSenders` or `isTracked`. To restrict a group to chosen people the KB calls
  `setGroupTracking` with `trackAllSenders: false` and then `setPeople`; `capture` in each response tells it the
  effective result.
- Allowed on a group that is not currently marked (the choice is stored for when it is marked).
- Idempotent. Errors: `invalid_request`, `owner_not_found`, `owner_unlinked`, `group_not_found`,
  `person_not_found`, `payload_too_large`, `rate_limited`, `store_unavailable`.

### 5.6 O6 `unlinkSession`

`POST /svc/v1/owners/{ownerId}/unlink` with `{"confirm":"UNLINK"}`. Missing or different `confirm` is
`400 confirm_required` and changes nothing (the archiver's existing D-022 rule: a mistaken or automated call
fails loudly). Response `200`:

```json
{"ownerId":"<24 hex>","state":"unlinked","status":"closed","captureDisabled":true,"unlinkedAt":"2026-10-29T12:00:00.000Z"}
```

In this order, each step idempotent:

1. Mark the owner `state: "unlinked"` with `unlinkedAt` (first call only). From this instant `startSession` is
   refused (`owner_unlinked`) and boot rehydration skips the owner.
2. Set `isTracked: false` on every group of the owner, so no new message is captured even if the socket lingers.
   `tracking` rows are left as they are.
3. Log the WhatsApp device out and stop the session (today's `sessionManager.logout`; a dead socket does not
   fail the call).
4. Make the credentials unusable: the `sessions/<ownerId>` state is removed from the live location. The archiver
   **SHOULD purge** the owner's `sessions/.trash` archives too, because a service owner's unlink is a withdrawal,
   not an accident (confirm plus KB-only caller). If the archiver keeps its D-022 archive, it must be
   unreachable through any service call, operator-only and time-boxed, and recorded in its decision entry.

- Repeating the call returns `200` with the **original** `unlinkedAt`; nothing is re-run beyond re-asserting steps
  2 to 4. If step 3 or 4 fails transiently, the state stays `unlinked`, the call returns `503 store_unavailable`
  or `internal_error`, and the KB retries (R-7). A retry completes the remaining steps.
- Already captured **messages, people and groups are not deleted**. The KB never deletes archiver data; any
  purge is an operator action outside this API.
- Errors: `invalid_request`, `confirm_required`, `owner_not_found`, `rate_limited`, `store_unavailable`.

### 5.7 O7 `getHealth`

`GET /svc/v1/health`. Requires the token (no unauthenticated variant). Response `200`:

```json
{"service":"whatsapp-archiver","apiVersion":"1","status":"ok","time":"2026-10-29T12:00:00.000Z",
 "store":"ok","owners":{"active":3,"unlinked":1},
 "sessions":{"connected":2,"awaiting_qr":1,"reconnecting":0,"logged_out":0,"connecting":0,"closed":0}}
```

- `status` is `ok` or `degraded` (`store` is `down`, or any rehydration failure is outstanding). The call
  returns `200` even when degraded so the KB can show it; `store_unavailable` is for operations that need the
  store.
- Counts only. No owner ids, no jids, no labels. The KB uses it for admin diagnostics and the post-deploy check
  (W13), not as a per-person liveness signal (that is O3).

## 6. Security requirements

### 6.1 QR secrecy (R-13)

The QR is a capture credential: whoever scans it attaches their phone to the link.

- The QR and its data URL live **only in archiver process memory**, one slot per owner, replaced on each
  rotation, cleared on `connected`, on `closed`, on unlink and after `expiresAt`. Never written to Mongo, disk,
  a cache directory, a queue or a metric.
- Never logged at any level, never in an error body, never in an `X-` header, never in a URL or query string.
  This includes the Baileys child logger and the existing `qr` event path.
- The O2 QR response carries `Cache-Control: no-store` and `Pragma: no-cache`. The QR call is a `GET` and is
  **not** covered by idempotency replay (section 7), so it cannot be served from a stored response.
- Not available over SSE for service owners (the SSE route needs a cookie the owner cannot have).
- Per-owner limit 30 per minute (section 8). The KB adds its own limit and owner-only gate (plan W5).
- Delivery stays short-lived: `expiresAt - receivedAt <= 20 s`.

### 6.2 Tenancy of the archiver

Every handler resolves the owner from the path, checks the owner exists and is a **service** owner, and adds
`ownerUserId` to every query (the same discipline as `api/auth.ts` `requireAuth`, but the id comes from a
validated path parameter authenticated by the token, not from a cookie). A password (UI) owner id given to the
service API is `owner_not_found`: the service API manages service owners only, so the KB can never address a
person-owned UI account (acceptance AC-W1).

### 6.3 No other authority

The service API cannot: read messages or media, send or react to anything on WhatsApp, delete an owner or its
data, create or modify a password user, restore an archived link (`/api/wa/restore` stays cookie-only), change
group pins or person display names, or reach any owner other than the one in the path.

### 6.4 Input hardening

Path and body values are validated against the patterns of section 2 before use; no value is concatenated into
a filesystem path (the session directory comes from the validated `ownerId` only), a query or a log format
string. Mongo queries use typed `ObjectId` values built from validated hex. No regex is built from input.

### 6.5 Third-party text

`subject` and person `label` are chosen by other people. The archiver trims, strips control and bidi-override
characters and truncates (`subject` to 200, `label` to 80 characters). A `label` uses, in order, the existing
`displayName`, `savedName`, `pushName`. If the chosen text, after removing spaces, `+` and `-`, contains a run of
seven or more digits, or there is no name at all, the label is the mask `Member ..NN` where `NN` are the last two
digits of the known number or LID, or `Member` when none exists. A full number never appears. The KB renders
all of this as inert text (R-46).

## 7. Idempotency

1. The operations are idempotent by their own state: O1 by `ownerRef`, O2 start by running session, O5 by set
   semantics, O6 by owner state. Repeating a call with the same inputs never makes a second owner, session, mark
   or unlink.
2. **`Idempotency-Key` header** (optional, `^[A-Za-z0-9_-]{1,64}$`) is accepted on every `POST` and `PUT`.
   The KB sends it on O1, O2 start, O5 and O6. Suggested form: `<linkId>-<operation>-<n>`.
3. When present, the archiver stores `(key, method, path, body hash)` and the resulting status and body for 24
   hours (TTL collection or index). The same key with the same request replays the stored response with header
   `Idempotency-Replayed: true` and re-runs nothing. The same key with a different method, path or body is
   `409 idempotency_key_reused`. The same key while the first call is still running is `409 request_in_progress`
   with `Retry-After: 1`.
4. Stored responses contain no secret (mutating responses carry none). `GET` calls, in particular the QR, are
   never stored or replayed.
5. Keys are scoped to the token, not shared across owners in a way that lets one owner's key reveal another's
   response (the stored path includes `ownerId`).

## 8. Rate limits

Counted per token unless noted. A request over the limit gets `429 rate_limited`, a `Retry-After` header and
`retryAfterSec`, and does no work. Limits are fixed-window or sliding, the archiver's choice; the numbers below
are the contract [ASSUMPTION: sized for up to 10 owners and a 2 to 3 s UI poll].

| Scope | Limit |
|---|---|
| QR (`GET .../session/qr`) | 30 per minute per owner (R-13) |
| Status (`GET .../session`) and start (`POST .../session`) | 60 per minute per owner |
| `listGroups`, `listPeople` | 12 per minute per owner |
| Mutations (O5 `PUT`s, O1) | 60 per minute per owner (O1: 30 per minute per token) |
| Unlink | 6 per minute per owner |
| Whole token | 600 per minute |
| Failed authentication | 20 per minute per source address, then `429 rate_limited` with the same body for every failure type |

Per-owner counters are keyed by the validated `ownerId` and held in a bounded structure (an unknown id must not
grow memory without limit). Time-outs: the archiver bounds every WhatsApp call at 8 s (existing `WA_CALL_MS`) and
every request at 15 s. The KB uses a 10 s default client timeout and 20 s for `listGroups`, retries only
idempotent calls, never retries or caches the QR call (plan W3).

## 9. Data-plane invariants the KB depends on

The KB reads the archiver database read-only. The archiver therefore must not, without a contract version bump,
rename or retype: `groups.{ownerUserId,jid,subject,isTracked,trackAllSenders}`, the `messages` fields in
`db/types.ts` and their `ownerUserId` + `messageId` uniqueness, `people.{ownerUserId,...}` or `users._id` as the
`ownerUserId` of all rows. The KB never calls any API to read messages. A service owner's `ownerId` is what the
KB link stores and what its resolver filters on (plan W4).

## 10. Explicitly not in the API

Reading messages, media or contacts; deleting an owner, group, person or message; sending anything to WhatsApp
(message, reaction, receipt, presence); creating or changing password users; restoring a credential archive;
listing owners; changing pin or display name; returning a phone number, a cookie, an auth state or a token;
streaming (SSE, WebSocket); webhooks or any call from the archiver to the KB.

## 11. Acceptance tests the archiver must pass

These become tests in two places: the archiver's own suite (W2b, run against its real service listener with the
Baileys socket stubbed) and the KB's contract suite (W3, run against the fake archiver; the same file is
runnable against a real archiver with a flag such as `LKB_ARCHIVER_CONTRACT_URL` plus the token in env, used in
W14). **Wire** tests are black-box HTTP and run in both. **Archiver-side** tests need access to the archiver's
process, logs or database; they run only in W2b and the fake skips them with the id listed as "archiver-only".
A KB claim that "the archiver passes AC-n" requires the real run.

Fixtures for wire tests: a way to put an owner in each status (`not_started`, `awaiting_qr` with a canary QR
`CANARY-QR-<random>`, `connected` with an `accountHint`, `logged_out`); in the real archiver this is the stubbed
`SessionManager`; in the fake it is a scripted control endpoint that is not part of the contract.

**Auth and placement**

- AC-A1 (wire) No `Authorization`, `Authorization: Basic ...`, `Bearer` with an empty or wrong token, a token one
  character off, and the token of a different length all return `401` with exactly the same body and headers
  (apart from `X-Request-Id`), and none reaches a handler (a side-effect counter stays 0).
- AC-A2 (wire) A valid token on any route succeeds; the second configured token (rotation) also succeeds.
- AC-A3 (archiver-only) The listener is not served on the UI port: `/svc/v1/health` on the UI port is 404 with
  and without the token; `/api/me` and the static UI on the service port are 404.
- AC-A4 (archiver-only) With the bind address, port or token unset or shorter than 32 bytes, no service listener
  starts, the UI still starts, and the log names the missing setting without a value.
- AC-A5 (archiver-only) A source outside the allowlist gets the AC-A1 response; `X-Forwarded-For` does not
  change that.
- AC-A6 (archiver-only) The token never appears in logs, in any response, or in the process arguments; an
  `Authorization` header sent to a failing route is absent from logs (canary token).
- AC-A7 (wire) 21 bad-token requests inside a minute from one source: the 21st gets `429 rate_limited`.

**Request hygiene**

- AC-V1 (wire) Unknown field, wrong type, malformed JSON, array body, and a body over 64 KiB are `400
  invalid_request` or `413 payload_too_large` and change nothing; a body without `application/json` is `415`.
- AC-V2 (wire) Malformed `ownerId`, `ownerRef`, `personId`, and `jid` (including `x@c.us`, a path-traversal
  string, an over-long digit run, and an uppercase-hex id) are `400 invalid_request`.
- AC-V3 (wire) Unknown path is `404 not_found`; wrong method is `405 method_not_allowed`.
- AC-V4 (wire) Every error body is exactly `{"error":{"code":...,"requestId":...}}` (plus `retryAfterSec` where
  specified), the code is in section 4, and no body contains a stack trace, a path, a request value or a
  message string. Every response carries `X-Archiver-Api-Version: 1`.

**Provisioning (O1)**

- AC-P1 (wire) `ensureOwner` twice with one `ownerRef` returns the same `ownerId`, `created` true then false.
  Two different refs give two different owners. 20 concurrent first calls with one ref yield one owner.
- AC-P2 (archiver-only) The created `users` document has no `email` and no `passwordHash` field, has
  `kind: "service"` and the `ownerRef`; two service owners coexist (the partial email index).
- AC-P3 (archiver-only) A service owner cannot log in through the cookie routes: `POST /api/auth/login` with
  every email-shaped value derived from it, and with an empty password, returns 401 and never sets `wa_sid`; no
  `app_sessions` row exists for it; a missing-hash document does not throw (no 500).
- AC-P4 (wire) After unlink, `ensureOwner` with the same ref returns the same id with `state: "unlinked"` and
  does not reset it.
- AC-W1 (wire) The `ownerId` of a password (UI) user is `404 owner_not_found` on every operation.
- AC-W2 (wire) Unknown but well-formed `ownerId` is `404 owner_not_found` on every operation, identical for an
  unlinked and a never-existing owner except where section 5 says an unlinked owner is readable (O3, O6).

**Session and QR (O2, O3)**

- AC-S1 (wire) Start on a fresh owner returns `200` and a status from the enum; start again is a no-op `200`;
  start on a `logged_out` owner restarts it; start on an unlinked owner is `409 owner_unlinked`.
- AC-S2 (wire) The status enum and `detail` values are exactly those in section 5.3; a `not_started` owner reports
  `updatedAt: null`; `accountHint` matches `^[0-9]{2}$` only when `connected`; `updatedAt` changes when the
  status changes.
- AC-S3 (wire) The status response never contains `qr`, `qrDataUrl` or any key other than those listed.
- AC-Q1 (wire) In `awaiting_qr`, the QR call returns the canary string and a `data:image/png;base64,` URL,
  `expiresAt` within 20 s of now, with `Cache-Control: no-store`.
- AC-Q2 (wire) After `expiresAt`, after `connected`, after `closed` and after unlink, the QR call returns `null`
  for `qr`, `qrDataUrl` and `expiresAt`. With no session in memory it is `409 session_not_started`.
- AC-Q3 (archiver-only) The canary QR appears in no log line (capture the logger stream at debug level), no
  database document, no file under the working directory, and no error body, including when the QR call is made
  with a bad token or a malformed owner id.
- AC-Q4 (wire) 31 QR calls inside a minute for one owner: the 31st is `429`; another owner is unaffected.
- AC-Q5 (wire) The QR response is not replayed from an idempotency store (a `GET` with `Idempotency-Key` is
  ignored or `400`, never stored).
- AC-Q6 (wire) The QR rotates: after the stub emits a second QR the call returns the new one, never the old.

**Groups and selection (O4, O5)**

- AC-G1 (wire) `listGroups` returns only the path owner's groups; a second owner's groups are never present;
  `isPinned` and `memberPersonIds` are absent; `source`, `refreshedAt`, `truncated` are present.
- AC-G2 (wire) With the session not connected, `listGroups` returns `source: "cache"` and the stored rows, and
  never hangs past 15 s (stub a socket call that never answers).
- AC-G3 (wire) Two `listGroups` calls inside 30 s trigger at most one live refresh (stub counter).
- AC-G4 (wire) `setGroupTracking` on a listed group changes `isTracked`; the same call again is `changed:
  false`; on a never-listed `jid` it is `404 group_not_found` and creates no row; on a malformed `jid` it is
  `400`.
- AC-G5 (wire) Marking with `trackAllSenders` omitted on a group with no person rows yields `trackAllSenders:
  true` and `capture: "all"`; marking with `trackAllSenders: false` and no people yields `capture: "none"`.
- AC-G6 (archiver-only) After marking, the next live message in that group from any sender is stored; after
  unmarking, the next is not (`ingest.ts` path), and previously stored messages are untouched.
- AC-G7 (wire) `setPeople` replaces the set exactly; `[]` clears it; a duplicated id is `400`; an id belonging to
  another owner or unknown is `404 person_not_found` and the stored set is unchanged; 1001 ids is `400`.
- AC-G8 (archiver-only) A concurrent `setPeople` and ingest never lets an ingest see an empty selection for a
  group in selected mode while the old set was non-empty and the new one is too.
- AC-G9 (wire) `listPeople` returns only `personId`, `label`, `isSelected`, `hasName`, plus `source`; no `lid`,
  `pn`, raw participant or text.
- AC-G10 (wire) Label rules (section 6.5): a person whose stored `pushName` is `+91 98765 43210` is labelled
  `Member ..10`, a person with no name and no number is `Member`, a name longer than 80 characters is truncated,
  control and bidi characters are removed.
- AC-G11 (wire) `setGroupTracking` and `setPeople` on an unlinked owner are `409 owner_unlinked`.

**Unlink (O6)**

- AC-U1 (wire) Without `confirm`, with `confirm: "unlink"` and with `confirm: true`: `400 confirm_required` and
  no state change (status, tracking and owner state read back unchanged).
- AC-U2 (wire) With `confirm: "UNLINK"`: `200`, owner `unlinked`, status `closed`, `captureDisabled: true`. A
  repeat returns `200` with the same `unlinkedAt` and does not call the socket logout a second time beyond
  idempotent re-assertion.
- AC-U3 (archiver-only) After unlink every group of the owner has `isTracked: false`, no new message is stored
  for it even if a stubbed socket keeps delivering, the credential directory is gone from `sessions/`, and boot
  rehydration (`linkedUserIds`) does not restart it.
- AC-U4 (archiver-only) After unlink there is no service call and no cookie call that restores the credentials
  (`/api/wa/restore` is not reachable by the service owner, the service API has no restore), and the archiver's
  decision entry states its archive policy (section 5.6, step 4).
- AC-U5 (archiver-only) A failing socket logout or a transient database error during unlink leaves the owner in
  `unlinked`, returns a section 4 code, and a retry completes the remaining steps and returns `200`.
- AC-U6 (archiver-only) Unlinking owner A changes nothing for owner B (groups, tracking, session, credentials).
- AC-U7 (archiver-only) Messages, people and groups of the unlinked owner are still present afterwards.

**Idempotency and limits**

- AC-I1 (wire) The same `Idempotency-Key` and request replays the first response with `Idempotency-Replayed:
  true` and no second side effect; same key with a different body or path is `409 idempotency_key_reused`; same
  key while running is `409 request_in_progress`.
- AC-R1 (wire) Each limit row in section 8 returns `429 rate_limited` with `Retry-After` at the stated count and
  not before; counters of one owner never limit another.
- AC-R2 (archiver-only) 10,000 requests with distinct unknown owner ids do not grow archiver memory without
  bound.

**Health (O7)**

- AC-H1 (wire) Health requires the token (401 without). Response matches section 5.7, counts only; with the store
  down it is `200` with `status: "degraded"` and `store: "down"`, while an operation that needs the store is
  `503 store_unavailable`.
- AC-H2 (wire) Health contains no owner id, jid, label or free text.

**No content, boundary and load**

- AC-N1 (wire) Over every operation and every status, no response body or header contains message text, a full
  phone number (a run of seven or more digits other than inside a 24-hex id, an ISO timestamp or a data URL),
  a password hash, a cookie or the token. A seeded message with text `CANARY-MSG-<random>` and a seeded person
  with number `919812345678` never appear in any service response.
- AC-N2 (archiver-only) No handler in the service listener imports or calls the message, media or send paths
  (static check: the module imports only the owner, group, tracking, people and session-manager APIs).
- AC-B1 (KB side, W6) The KB holds no write credential: a write through the KB's Mongo credential is refused.
  Not an archiver test, listed so the boundary has a test owner.
- AC-L1 (archiver-only) Load note recorded in the archiver's decisions log: N=10 owners reconnecting after a
  restart do not open sockets all at once beyond the existing backoff (stagger or a start-up concurrency cap is
  allowed and stays inside this contract).

## 12. Versioning and evolution

- `apiVersion` "1" is in every response header and in `getHealth`. The KB client refuses a response whose header
  is not `1` and treats it as `archiver_api_unavailable` with a version-mismatch log (code only).
- Additive changes (new optional request field, new response field, new status value the KB can ignore) are
  allowed within v1 only if this document is amended first. A new error code, a status value the KB does not
  handle, or a changed meaning is a new path version.
- The KB submodule pin is bumped only by a separate human-approved step after the archiver's decision entry and
  tests exist (plan W2b point 5). Until then the KB uses the fake and shows `archiver_api_unavailable`.

## 13. Readings this contract chose (overrule before W2b starts)

| # | Spec text | Contract choice |
|---|---|---|
| 1 | Section 7 table: archiver "enforces its own `confirm: "UNLINK"` rule internally"; R-7: the KB "sends the archiver's required `confirm: "UNLINK"`" | The KB **sends** `{"confirm":"UNLINK"}` and the archiver rejects without it (stronger; satisfies both readings). |
| 2 | R-34 lists six statuses | A seventh, `not_started`, is added for "no session in memory" (today's `null`). |
| 3 | R-12 "QR payload string"; plan H-9 "or the archiver returns a ready image" | Both are returned, `qr` and `qrDataUrl`, so H-9 can go either way without a contract change. |
| 4 | R-18 "default for a newly marked group: all senders" | If `trackAllSenders` is omitted and no person rows exist, the archiver sets it `true` on mark; otherwise a marked group would capture nothing (`ingest.ts:232`). |
| 5 | Section 7: "delete credentials" | Credentials leave the live location; the D-022 archive is purged by the archiver (SHOULD) or kept operator-only and unreachable (section 5.6). |
| 6 | R-14 `accountHint` last 2 to 4 digits | Exactly the last 2 digits, only while connected, optional. |
| 7 | Spec lists seven table rows | Seven **operations** (O1 to O7) are grouped; the HTTP surface is eleven endpoints (section 5). Health is added as its own operation. |
| 8 | `listGroups` "live list from the socket or cached metadata" | Live refresh at most once per 30 s per owner; `source` and `refreshedAt` say which. |
| 9 | Not stated | Service owners are the only owners addressable here; a password (UI) owner id is `owner_not_found`. |
| 10 | Not stated | Idempotency keys are accepted on all `POST`/`PUT`, replayed for 24 h; the QR is never replayed. |

## 14. Traceability

| Requirement | Where |
|---|---|
| R-11 provisioning | 5.1, AC-P1..P4 |
| R-12, R-13 QR delivery and secrecy | 5.2, 6.1, AC-Q1..Q6 |
| R-14 wrong-phone guard | 5.3 `accountHint`, AC-S2 |
| R-16, R-43 boundary | 0, 3.7, 9, AC-N2, AC-B1 |
| R-15..R-19 selection | 5.4, 5.5, AC-G1..G11 |
| R-34 liveness | 5.3, 5.7 |
| R-7 unlink order | 5.6, AC-U1..U7 |
| R-42, R-45 secrets, input hardening, no SSRF | 3, 6.4, AC-A1..A7, AC-V1..V4 |
| Section 7 "not in the API" | 10, AC-N1, AC-N2 |
