# Spec - whatsapp-multiuser

**Status:** DRAFT v2. Behaviour is written against the binding answers in
`qa/gates/whatsapp-multiuser-grill-2026-10-29.md` (quoted in `intent.md` "Decisions (2026-10-29)").
Nothing is built. Every unstated input is **[ASSUMPTION]**. Requirement ids (R-n) are what
`plan.md` acceptance criteria cite. Account, login, session and role behaviour is specified in
`docs/features/user-accounts/spec.md` (ids UA-n) and only referenced here.

## 0. What exists and is reused (do not rebuild)

| Piece | Where | Reused as |
|---|---|---|
| Per-owner capture (one Baileys socket per owner, `ownerUserId` on every row, read-only socket, sessions restarted at boot) | `sources/whatsapp_msg/src/{wa/sessionManager.ts,wa/readOnlySocket.ts,db/types.ts,index.ts}` | The transport. Its selection state (`groups.isTracked`, `groups.trackAllSenders`, `tracking`) stays the archiver's. |
| Archiver account + cookie login, QR page, group picker | `sources/whatsapp_msg/src/api/{auth.ts,server.ts}`, `web/` | **Not used by people any more** (Q3=3b). Remains an operator surface. The service API of section 7 is added next to it, in that repo, under its governance. |
| KB read of archiver DB, owner-filtered | `apps/api/src/whatsapp/store.ts` (`listTrackableGroups` at `:75` reads `isTracked: true`; `fetchWhatsAppMessages`) | Data plane stays: read-only Mongo credential. Because `isTracked` is the marking, "list trackable groups" already equals "groups the owner marked important". |
| Idempotent ingest into `sources`/`sessions`/`turns` keyed by `messageId` | `store.ts` `ingestGroup` | Write path, called per link. |
| Review layer (detection, quarantine, deletion invalidation, approve/reject, materialiser) | `apps/api/src/whatsapp/review/*`, `GET/POST /whatsapp/review...` | Unchanged gate. |
| Tenant-scoped storage | `@lkb/db` `scopedCollection`, `assertValidTenantId`; tenant-scoped source ids (D-136) | Every new collection. |
| Consent CAS | `withdrawWhatsAppSourceConsent`, `sourceMeta.authorizationRevision` | Unlink path; gives it its first production caller (closes ISS-W6-001). |
| Accounts, sessions, roles, `requireScope`, `actorId` | `docs/features/user-accounts/` (UA-9, UA-13..UA-19, UA-29) | Identity and authorization. Scopes `whatsapp`, `whatsapp-link`, `whatsapp-admin` (defined there). |
| Scheduler pattern | `docs/t038-scheduler-service.md` | Pattern for the sync loop. [ASSUMPTION] it runs as its own small service on the Ubuntu host. |

## 1. Concepts

- **Link**: one KB record binding one KB **user** (`userId`) in one tenant to one archiver owner,
  with a lifecycle and a health. Replaces the env map as the authority for "who may be read".
- **Archiver owner**: a row in the archiver's `users` collection, created **by the KB through the
  service API** (R-11), one per link, never reused for a later link. The person never holds an
  archiver password. Its id (`ownerUserId`, 24-hex) is stored on the link, redacted in logs and
  never returned to non-admins.
- **Marked (important)**: the groups, and optionally people inside a group, the owner selects in the
  KB. Stored in the archiver (R-16); the KB holds no copy.
- **Roles** (UA-9): `member` can request and manage its own link; `admin` approves and sees all;
  `viewer` has no WhatsApp write powers.
- **Legacy link**: a link created by the one-time seed from `WHATSAPP_TENANT_OWNER_MAP` (R-24), with
  `userId` null, visible to admins and plain `whatsapp` API keys until an admin binds it to a user.

## 2. Lifecycle (R-1 .. R-10)

States: `requested -> approved -> active <-> suspended`; `requested -> rejected`;
`requested|approved|active|suspended -> unlinked | revoked` (terminal). `needs-relink`, `stale`,
`error`, `quiet` are health flags on an `active` link, not states.

- **R-1 Request.** A `member` (scope `whatsapp-link`) posts `{label}` and the id of the notice text
  shown (R-3). The server stores a `requested` link with `userId` and `tenantId` taken from the
  verified session, never from the body. Unknown body fields are rejected. A viewer, a pending
  user, and any API key are refused (403).
- **R-2 One live link per person.** At most one non-terminal link per `(tenantId, userId)`
  [ASSUMPTION: one number per person in v1], enforced by a unique partial index. A second request
  returns 409 `link_exists` (the caller sees only their own link, so nothing is revealed).
- **R-3 Notice instead of attestation (Q4=4c).** There is no attestation form. The request screen
  shows a short fixed notice: group messages from the groups you mark will be archived and visible
  to you and the admins; the archiving client is unofficial and can get a number banned; you can
  unlink any time. The notice text lives in one file; its version (file hash) and the time shown are
  stored on the link. The plan records that **Umesh accepted the privacy risk** (human item H-5);
  the person is not asked to attest anything.
- **R-4 Approval (Q4=4c).** Only an `admin` (scope `whatsapp-admin`) moves `requested -> approved`
  or `-> rejected {reason?}`. An admin cannot approve their own request unless they are the only
  admin [ASSUMPTION: at launch Umesh is the only admin; the event records requester and approver].
  Approval stores `approvedBy`, `approvedAt`, and the admin's classification of student data
  (`studentData`: `yes|no|unknown`, default per Q-W1) for R-32.
- **R-5 Connect.** `approved` only allows the connect flow (section 3). The first time the KB
  observes the archiver session as `connected`, it sets `active` and stamps `activatedAt`. A link
  not scanned within 14 days of approval expires to `unlinked` with reason `connect_timeout`
  [ASSUMPTION].
- **R-6 Activation effect.** `active` makes the link eligible for marking, listing, ingest and
  scheduled sync. No eligibility exists for `requested`, `approved`, `rejected`, `suspended`,
  `unlinked`, `revoked`.
- **R-7 Unlink (owner or admin).** Sets `unlinked` with actor, time, reason. Then, in order and each
  idempotent: stop scheduled sync for the link within one scheduler cycle; quarantine the link's
  pending candidates; for each source owned by the link call the consent-withdraw CAS path so a
  concurrent approval cannot win (ISS-WAVECTORLESS-002); ask the archiver to stop capture and log out
  the WhatsApp session (service API `unlink`, sends the archiver's required `confirm: "UNLINK"`).
  Approved claims remain, owner recorded, unless an admin purges them (Q6=6a). Repeating unlink is a
  no-op 200. If the archiver is unreachable, the link is `unlinked` in the KB (KB side authoritative
  for eligibility) and the archiver step is retried by the scheduler until it succeeds or an admin
  clears it; the person sees "capture will stop within minutes" and no data flows meanwhile because
  the KB no longer syncs it.
- **R-8 Revoke (admin only).** Same as unlink plus `revokedReason`; the person cannot request a new
  link until an admin clears the block.
- **R-9 Suspend and resume (admin only).** Pauses sync and ingest without touching consent or the
  WhatsApp session. Resume needs no new notice unless its text version changed.
- **R-10 Account coupling.** If the owning user is disabled, rejected or demoted to `viewer` (UA-19,
  UA-5), all their non-terminal links become `suspended` with reason `account_inactive`. Re-enabling
  the account does **not** resume them; the owner or an admin resumes explicitly. **Logging out of
  the KB, or the KB session expiring, never unlinks or suspends WhatsApp** (Q5: the link persists
  until the owner unlinks).

## 3. Connecting inside the KB: QR proxy (R-11 .. R-14, Q3=3b)

- **R-11 Provisioning.** On the first connect request for an `approved` link, the KB calls the
  archiver service API `ensureOwner(linkId)` (idempotent by `ownerRef = linkId`) and stores the
  returned archiver owner id on the link. The user never types or sees an archiver id.
- **R-12 QR delivery.** `GET /whatsapp/links/:id/connect` starts the archiver session if needed and
  returns `{state, qr, expiresAt}` where `qr` is the current QR payload string or null. The web page
  renders it and polls every 2-3 s [ASSUMPTION: polling, not SSE, so the existing nginx proxy and
  rate limits work unchanged] until `state` is `connected`. The QR rotates about every 20 s
  (archiver `GET /api/wa/stream` comment); the KB never caches a QR.
- **R-13 QR is a credential-equivalent; strict handling.** Whoever scans it attaches *their* phone
  to this link. Therefore: only the **owner's session principal** may fetch it (not an admin, not an
  API key, not a member of the same tenant); only while the link is `approved` or `active` with
  `needs-relink`; the response carries `Cache-Control: no-store`; the QR is never written to a log,
  an event, a database row, an error message or a browser storage area; a per-link rate limit applies
  (30 requests per minute [ASSUMPTION]); the archiver call has a short timeout and the QR is passed
  through, not retained.
- **R-14 Wrong-phone guard.** The page tells the person to scan with the phone whose WhatsApp they
  want archived. After `connected`, the status call may return a short `accountHint` (last 2-4
  digits) [ASSUMPTION: the archiver can supply it; if not, the guard is the text alone]; it is shown
  to the owner only and never stored. An admin who sees an unexpected hint can revoke.

## 4. Tracking and selection (R-15 .. R-22, Q5)

"Tracking" has two parts, both required (answer 5a PLUS):

- **Health tracking (5a).** Per link: connected / needs re-scan, last successful run, last captured
  message time, counts (fetched, new, candidates pending/approved/rejected), failures, audit trail.
- **Important-only capture.** Only what the owner marks is captured.

Rules:

- **R-15 Default is nothing.** A new `active` link captures nothing until the owner marks at least
  one group. The archiver's default (`isTracked` false) already behaves so; the KB UI states it.
- **R-16 Who owns the selection (the read-only boundary, resolved).** The **archiver owns** the
  selection state (`groups.isTracked`, `groups.trackAllSenders`, `tracking`). The **KB never writes
  the archiver database**. The KB changes the selection only by calling the archiver's service API
  (section 7), which performs the write inside the archiver under its own validation and governance.
  The KB stores no mirror of the selection, so it cannot drift; it reads current state through the
  same API (for the choose screen) and through its read-only Mongo credential (for sync). Therefore
  the earlier rule "KB never calls the archiver over HTTP" (old R-25) is replaced by: *data plane =
  read-only Mongo; control plane = one authenticated service API; the KB has no write credential to
  the archiver DB* (verified by the startup probe, R-43). This needs a DECISIONS entry (H-5) because
  it supersedes the stance in `store.ts:1-8` and the previous option "5b" that was never chosen.
- **R-17 Marking groups.** The owner (only the owner; not an admin) lists their groups
  (`GET /whatsapp/links/:id/groups`, live via the service API: subject, participant count, marked,
  `trackAllSenders`) and marks or unmarks one (`PUT /whatsapp/links/:id/groups/:jid`
  `{marked, trackAllSenders?}`). `jid` is validated against the WhatsApp group form before the call.
- **R-18 Marking people.** For a marked group the owner may restrict capture to chosen people
  (`GET/PUT /whatsapp/links/:id/groups/:jid/people` with the archiver's internal `personId`s and
  labels). Default for a newly marked group: all senders [ASSUMPTION: matches the archiver's
  `trackAllSenders` option]. Person ids are opaque archiver ids; the KB never stores phone numbers.
- **R-19 Effect timing.** A change takes effect for messages received after the archiver applied it;
  nothing is back-filled for newly marked groups (archiver D-005: going-forward only). Unmarking
  stops further capture; already-captured and already-approved content is untouched (use unlink or
  an admin purge for that).
- **R-20 Admin view, not admin edit.** Admins see which groups are marked (to know what is captured)
  but cannot change a person's marks; they can suspend the link. [ASSUMPTION: marking is the
  person's judgement of importance.]
- **R-21 Audit of selection.** Every change writes an event `selection.changed` with link id, group
  count and marked count only. No group subject, jid or person label is in the event (R-29).
- **R-22 What the tracking screens show, to whom.** Owner: own link, health, runs, counts, marked
  groups. Admin: every link plus event trail and tenant roll-up. Neither tracking screen shows
  message text; text is behind the review and session views (R-26).

## 5. Isolation (R-23 .. R-30)

Three layers, each independently enforced.

- **R-23 Tenant.** Every read and write is scoped by the tenant on the verified principal using the
  existing scoped accessors. A principal from tenant B gets 404 (not 403) for tenant A link ids.
- **R-24 Owner set from links, not env.** The owner resolver returns the archiver owner ids of
  `active` links permitted to the caller. `WHATSAPP_TENANT_OWNER_MAP` remains only as a boot-time
  seed that creates one `active` **legacy** link per map entry once, then is ignored with a boot
  warning if it disagrees with existing links. Legacy links have `userId: null`; they are readable by
  admins and by API keys holding `whatsapp` (continuity for today's scripts), and an admin can bind
  one to a user (`POST /whatsapp/links/:id/bind {userId}`), after which it follows the normal rules.
- **R-25 Per-person narrowing.** A session principal without `whatsapp-admin` resolves only to its
  own link. An admin session resolves to every `active` link in the tenant. A Bearer key resolves
  to legacy links only, and to all links if it also holds `whatsapp-admin`. `GET /whatsapp/groups`
  and `POST /whatsapp/ingest` filter to that set; `groupJid` alone is never sufficient (ingest locates
  the group within the caller-permitted owners, extending today's `ownerFor` + `find(groupJid &&
  ownerUserId)` check in `store.ts`). The same `groupJid` marked by two owners yields two sources and
  two sessions, never merged.
- **R-26 Read-side for raw sessions (Q2=2a).** WhatsApp `sessions`/`turns`/`sources` carry the owning
  link id in `sourceMeta`. `GET /sessions/:id` and the `/whatsapp` review views return a WhatsApp
  session only to its owner or an admin (the owner = the session principal whose `userId` equals the
  link's; a legacy link has no owner and is admin-only). This extends the existing read-side
  visibility and quarantine layer (`apps/api/src/visibility/`, `read-side-quarantine*.test.ts`); it is
  not a parallel check. Search and Ask see only approved, materialised claims, as today, tenant-wide.
- **R-27 Review authority.** Approve/reject is allowed for the link owner on that link's candidates
  and for an admin on all. The recorded actor is `actorId` (UA-29) plus the link id. Viewers and
  non-owner members are refused.
- **R-28 Cross-owner duplicates.** If two owners captured the same message, the later candidate is
  flagged `duplicate` by the existing detector with a pointer, never auto-merged, so each capture's
  provenance is kept. [ASSUMPTION] the detector already compares across sources in a tenant; the
  isolation unit verifies this and adds the case if not.
- **R-29 Audit.** Every state change, every selection change and every admin read of another
  person's raw content writes an append-only event (section 8). No update or delete path exists.
- **R-30 No cross-leak through errors.** Unauthorized and nonexistent link ids are indistinguishable.
  The 502 body of `POST /whatsapp/ingest` stops echoing raw upstream error text (closes ISS-API-003)
  and returns a stable code plus `linkId`.

## 6. Sync and run records (R-31 .. R-37)

- **R-31 Sync.** A scheduler runs every 15 minutes (accepted default; configurable, bounded
  5..1440). For each `active`, non-suspended link it lists the owner's marked groups (the existing
  `listTrackableGroups`) and calls `ingestGroup` for each, with a per-link lock so runs never
  overlap. One link failing never stops the others. Ingest is the existing idempotent upsert, so a
  run with no news changes nothing.
- **R-32 Student/applicant data (hard rule, no attestation).** There is no self-declaration any
  more, so each link carries an **admin-set** `studentData` classification (R-4), default decided by
  Q-W1 (recommended: `unknown`). For `yes` or `unknown`, claims derived from the link are marked
  `studentDataFlag` and excluded from every external-model path (Ask answer generation, embeddings
  through an external provider, any export) until an admin records a per-use approval. For `no`,
  normal paths apply. Umesh's acceptance of the archiving privacy risk (4c) does not lift this: the
  user-level rule requires per-use approval before student or applicant data reaches an external
  service. [ASSUMPTION] the Ask/embedding paths use an external provider today (`ai-provider-seam`);
  the student-data unit verifies and names the exact call sites before build (human-gated).
- **R-33 Run record.** Each link run writes one `whatsapp_sync_runs` row: `linkId`, `startedAt`,
  `endedAt`, per group `{groupJid, fetched, newTurns, candidatesCreated, skippedDeleted, errorCode}`,
  overall `status` (`ok|partial|failed|skipped`). `errorCode` is from a closed list
  (`archive_unreachable`, `archiver_api_unreachable`, `not_configured`, `link_inactive`,
  `store_transaction_unavailable`, `snapshot_shrink_refused`, `unknown`); upstream free text is never
  stored or shown.
- **R-34 Liveness (replaces the earlier heartbeat collection).** Each run, and each page load of the
  link detail, asks the archiver service API for the session status
  (`connecting|awaiting_qr|connected|reconnecting|logged_out|closed`, `updatedAt`). The KB stores the
  last observed status and time on the link (`health.lastStatus`, `health.lastStatusAt`) so tracking
  screens and the admin roll-up read KB data only. No separate archiver collection is needed. If the
  archiver API is unreachable the page shows "liveness unknown" and uses time since the last captured
  message as a labelled weak proxy.
- **R-35 Health flags.** `needs-relink` (status `logged_out`), `stale` (no successful run for 3
  cycles), `quiet` (alive but no new messages for 7 days, informational), `error` (last run `failed`).
  Shown to the owner and admin; `needs-relink` and `error` raise the existing alert path (Telegram
  notifier used for watch failures) to admins only. [ASSUMPTION] alert channel reuse; no WhatsApp
  message is ever sent. Re-scan uses the same connect flow (R-12) from the link page.
- **R-36 What is recorded.** Collections, all tenant-scoped (schemas in unit W1): `whatsapp_links`,
  `whatsapp_sync_runs`, `whatsapp_events` (append-only). Message content is recorded only in the
  existing `sources/sessions/turns` and review collections, never duplicated into tracking records.
  Retention follows the repo retention module (`packages/ingest/src/retention/`); [ASSUMPTION] 180
  days for runs, events kept for the life of the link plus 1 year.
- **R-37 Counters are derived.** Pending/approved/rejected counts are queried from
  `whatsapp_candidates` per link; a stored counter cannot drift because none is stored.

## 7. Archiver service API: what this repo needs from `sources/whatsapp_msg` (cross-repo)

The archiver is a separate repo with its own governance (own `ARCHITECTURE.md`, `docs/DECISIONS.md`,
Approver check). This plan **specifies the contract the KB needs**, written down in the KB-owned
`docs/whatsapp/archiver-service-api.md` (unit W2a) as the hand-off; the archiver implements it
under its own decision entry (unit W2b). Nothing here edits the archiver's governance files.

Transport and trust: a separate listener bound to the private network only (not the public web UI
port), `Authorization: Bearer <WHATSAPP_ARCHIVER_API_TOKEN>` (a server-to-server secret, rotated by
the operator, held only in server env on both sides), source-IP allowlist of the app host, TLS or a
private tunnel [ASSUMPTION: WireGuard or same-VPC; human item]. The token never reaches the browser;
the browser talks to the KB only. No message text, no media and no phone number crosses this API.
Errors are closed codes. All writes are idempotent. Closed list of operations (v1):

| Operation | Purpose | Notes |
|---|---|---|
| `ensureOwner(ownerRef)` | Create or fetch the archiver owner for a link; returns `ownerUserId` | Idempotent by `ownerRef` (= KB link id). Creates a **passwordless service owner** (no login possible). Refuses duplicates by ref. |
| `startSession(ownerUserId)` / `getSession(ownerUserId)` | Start the Baileys session; read `{status, updatedAt, accountHint?}` | Status enum as R-34. |
| `getQr(ownerUserId)` | Current QR payload or null, with expiry | Never logged; rate limited at the archiver too. |
| `unlinkSession(ownerUserId)` | Log the WhatsApp device out, delete credentials, disable all capture | Archiver enforces its own `confirm: "UNLINK"` rule internally; idempotent. |
| `listGroups(ownerUserId)` | `[{jid, subject, participantCount, isTracked, trackAllSenders, membersSyncedAt}]` | Live list from the socket or cached metadata. |
| `setGroupTracking(ownerUserId, jid, {isTracked, trackAllSenders})` | Mark or unmark a group | Validates `jid`; the write happens inside the archiver. |
| `listPeople(ownerUserId, jid)` / `setPeople(ownerUserId, jid, personIds[])` | Per-group person selection | Opaque internal `personId`s plus label; no phone numbers. |

Explicitly **not** in the API: reading messages (stays on the read-only Mongo path), deleting an
owner or its data (the KB never deletes archiver data), sending anything to WhatsApp, creating
passworded users. Capacity [ASSUMPTION]: up to 10 linked people at launch; N=10 reconnect after a
host restart without a thundering herd beyond the existing backoff is an archiver acceptance item.
Until the archiver ships this API (and the submodule pin is bumped by a separate human-approved
step), the KB runs against a **fake archiver** in tests and the live screens show "connect service
not available" (503 `archiver_api_unavailable`); nothing falls back to the archiver's own UI.

## 8. Automation hooks: extension points only (R-38 .. R-41)

- **R-38 Event feed.** Domain events are written to `whatsapp_events`: `link.requested`,
  `link.approved`, `link.rejected`, `link.connected`, `link.suspended`, `link.resumed`,
  `link.unlinked`, `link.revoked`, `link.needs_relink`, `selection.changed`, `sync.completed`,
  `sync.failed`, `candidate.created`, `candidate.approved`, `candidate.rejected`.
- **R-39 Payload rule.** Events carry ids, timestamps, counts and codes only. Never message text,
  names, phone numbers, group subjects, jids, QR data or archiver owner ids. A consumer that needs
  content must call the scoped read API with its own credential.
- **R-40 Consumption.** `GET /whatsapp/events?after=<cursor>&limit=` for `whatsapp-admin` (an admin
  session or an API key holding the scope); cursor-based, at-least-once; consumers dedupe on event id.
  No push, no webhooks, no consumer registry in this feature.
- **R-41 Hard line.** No hook may call WhatsApp (send/react/read-receipt), no hook may export raw
  text outside the tenant, and any future consumer that uses an external AI/service on
  WhatsApp-derived content needs its own per-use approval and a decisions-log entry. The event feed
  is the whole extension surface.

## 9. Security and privacy (R-42 .. R-49)

- **R-42 No secrets in the KB beyond the service token.** No archiver password (none exists for
  service owners), cookie, WhatsApp auth state or phone number is stored in KB collections or logs.
  The service token lives in env only and is redacted in logs, errors and the failure responses.
- **R-43 Read-only toward the archiver DB.** The Mongo credential used by the KB has `read` on the
  archiver DB only (extends today's stance); a startup probe proves a write is refused (the boundary
  proof for R-16).
- **R-44 Least privilege.** A default `member` has `whatsapp` and `whatsapp-link`; `whatsapp-admin`
  only for admins (UA-9); API keys never gain these scopes by any API path.
- **R-45 Input hardening.** All bodies strict-schema, unknown fields rejected; ids validated (24-hex
  link/owner ids, WhatsApp jid form, existing `isValidTenantId`); no id from the body selects a tenant;
  the archiver base URL is a fixed config value, never request-derived (no SSRF).
- **R-46 Third-party content in groups** (media, filenames, mime) stays inert as the archiver
  enforces; the KB shows attachment names as text only.
- **R-47 Deletion upstream** is honoured: the existing invalidation with shrink guard
  (`review/invalidate.ts`) runs per link each sync.
- **R-48 Accepted residual risks.** (i) Unofficial client may get a number banned: accepted by Umesh
  (4c), not mitigated by the KB, made visible (`needs-relink`). (ii) Archiving other group members'
  messages without attestation: accepted by Umesh (4c); mitigated only by the notice, admin approval,
  the owner-and-admin visibility rule and the unlink path. Both recorded in a DECISIONS entry.
- **R-49 Notice integrity.** Changing the notice text bumps its version; links approved under an
  older version keep working (resume needs no re-acknowledgement unless an admin decides) and the
  version stored on each link says what that person saw.

## 10. Failure modes (what the system does, so no case is guesswork)

| Case | Behaviour |
|---|---|
| Archiver Mongo unreachable | Run `failed`, `archive_unreachable`; flag `error`; routes answer 503 `whatsapp_unavailable` (configured) or `not_configured`; no partial writes. |
| Archiver service API unreachable or token wrong | Connect/choose/unlink-step return 503 `archiver_api_unavailable`; sync of already marked groups continues (data plane is separate); admin alerted after 3 cycles; no QR is cached or invented. |
| Person's WhatsApp logs out / banned | Status `logged_out` -> flag `needs-relink`; sync skipped (`link_inactive`); admin alerted; person re-scans from the link page; flag clears on `connected`. Ban guidance text names it as a likely cause. |
| QR never scanned | Link stays `approved`; expires after 14 days (R-5); events retained. |
| Wrong person scans the QR | The link would capture the wrong phone; guard is R-13 (owner-only fetch) and R-14 (hint); admin can revoke. |
| Person marks a group they should not | Nothing prior is lost; unmark stops it; pending candidates can be rejected; unlink quarantines everything. |
| Unlink during a running sync | Per-link lock plus consent CAS: the running ingest finishes its snapshot; its approvals fail the CAS; nothing new is scheduled. |
| Admin suspends a link mid-run | Same as above. |
| Owner's KB account disabled | Links `suspended` (R-10); WhatsApp session stays connected at the archiver but nothing is synced. |
| Overlapping scheduler instances | Token-owned lock (t038 pattern); the second refuses and logs `skipped`. |
| `lkb_prod` standalone (no transactions) | Review insert/decide returns 503/502 today; run records `store_transaction_unavailable`; deployment checklist blocks go-live without a replica set. |
| Large backlog on first sync | Ingest is a full snapshot per group; per-group cap and timeout [ASSUMPTION 20k messages / 120 s] with `partial` status. |
| Deleted-message wave | Existing shrink guard refuses a >50% delete (`snapshot_shrink_refused`), run `partial`, admin sees it. |
| Archiver restarts | It restarts all sessions at boot (`src/index.ts:24`); no re-scan unless WhatsApp invalidated the device; the `sessions/` volume backup is a go-live item. |
| `WHATSAPP_TENANT_OWNER_MAP` still set after migration | Ignored with a boot warning; links are authoritative (R-24). |
| Clock skew between hosts | App host clock only for run and event times; archiver times never compared for ordering. |

## 11. Surfaces

- API (all under the existing `/whatsapp`, scope-guarded, tenant from the principal):
  `GET/POST /whatsapp/links`, `GET /whatsapp/links/:id`,
  `POST /whatsapp/links/:id/{approve,reject,suspend,resume,unlink,revoke,bind}`,
  `GET /whatsapp/links/:id/connect` (QR + state), `GET /whatsapp/links/:id/runs`,
  `GET /whatsapp/links/:id/groups`, `PUT /whatsapp/links/:id/groups/:jid`,
  `GET/PUT /whatsapp/links/:id/groups/:jid/people`, `GET /whatsapp/events`.
  `GET /whatsapp/groups` and `POST /whatsapp/ingest` keep their shape; `ingest` body stays
  `{groupJid}` and gains an optional `linkId` when the caller has more than one permitted link.
- Web: `/whatsapp/links`, `/whatsapp/links/new`, `/whatsapp/links/:id`, `/whatsapp/links/:id/connect`,
  `/whatsapp/links/:id/choose`, `/whatsapp/activity`; `/whatsapp` gets a link filter. Base path configurable.
- Scheduler: one service, run via the Ubuntu compose stack (T6 owns deployment).
- Outbound: KB API to the archiver service API (section 7) and the read-only Mongo connection.

## 12. Decisions to requirements (traceability)

| Answer | Requirements |
|---|---|
| Q1 = 1b (accounts first, link binds to a user) | R-1, R-2, R-10, R-24..R-27; whole `user-accounts` feature |
| Q2 = 2a (owner + admins raw, tenant-wide approved) | R-26, R-27, R-22 |
| Q3 = 3b (QR inside KB) | R-11 to R-14, section 7 |
| Q4 = 4c (no attestation, admin approval enough, privacy risk accepted) | R-3, R-4, R-32, R-48 |
| Q5 = 5a PLUS (health + important-only; login persists) | R-15..R-22, R-31..R-35, R-10 |
| Q6 = 6a | R-7, R-8 |
| Q7, Q8, Q9 | `user-accounts` UA-1..UA-9 |
