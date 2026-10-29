# Spec - whatsapp-multiuser

**Status:** DRAFT. Behaviour is written against the **recommended** answer to each mini-grill
question in `intent.md`; if Umesh picks otherwise the affected requirement is named in
"Answer sensitivity" at the end. Nothing is built. Every unstated input is **[ASSUMPTION]**.
Requirement ids (R-n) are what `plan.md` acceptance criteria cite.

## 0. What exists and is reused (do not rebuild)

| Piece | Where | Reused as |
|---|---|---|
| Per-user capture (signup, QR, one socket per user, `ownerUserId` on every row, read-only socket) | `sources/whatsapp_msg/src/{api/server.ts,wa/sessionManager.ts,wa/readOnlySocket.ts,db/types.ts}` | The transport. Unchanged except one status-heartbeat addition (U7) made in that repo under its own governance. |
| Transport provider | Baileys (unofficial multi-device client), pinned in the archiver; submodule pin 7cdf1a18 | Only provider in scope. No official API exists for this need (archiver README). |
| KB read of archiver DB, owner-filtered | `apps/api/src/whatsapp/store.ts` (`listTrackableGroups`, `fetchWhatsAppMessages`, every query filters `ownerUserId`) | Read path. Env `WHATSAPP_MONGO_URL` / `WHATSAPP_MONGO_DB`. |
| Idempotent ingest into `sources`/`sessions`/`turns` keyed by `messageId` | `store.ts` `ingestGroup` | Write path, called per link. |
| Review layer (detection, quarantine, deletion invalidation, approve/reject, materialiser) | `apps/api/src/whatsapp/review/*`, routes `GET/POST /whatsapp/review...` | Unchanged gate. |
| Tenant-scoped storage | `@lkb/db` `scopedCollection`, `assertValidTenantId`; tenant-scoped source ids (D-136) | Every new collection uses it. |
| Consent CAS | `withdrawWhatsAppSourceConsent`, `sourceMeta.authorizationRevision` (`schema/sources.schema.json`, `review/consent-cas.test.ts`) | Unlink path; gives it its first production caller (closes ISS-W6-001). |
| Auth | API key -> `{tenantId, scopes, keyId?}`, exact-match `requireScope` (`apps/api/src/auth.ts`) | Identity and authorization. |
| Scheduler pattern | `docs/t038-scheduler-service.md` (token-owned lock, durable outcomes, overlap refusal) | Pattern to follow for the sync loop; not reused code. [ASSUMPTION] the WhatsApp sync runs as its own small service on the Ubuntu host. |

## 1. Concepts

- **Archiver owner**: a row in the archiver's `users` collection (`userId`, a 24-hex ObjectId).
  One real person, one phone number, one WhatsApp socket.
- **Link**: a KB record binding one archiver owner to one KB principal inside one tenant, with
  consent and a lifecycle. Replaces the env map as the authority for "who may be read".
- **Principal**: the API key (`keyId`) a person uses. [ASSUMPTION, Q1a] a person holds exactly one
  key; if a person has several, the link is bound to the one that requested it.
- **Roles**, expressed as scopes (exact match, as today): `whatsapp` (existing: groups, ingest,
  review), `whatsapp-link` (new: manage own links), `whatsapp-admin` (new: manage all links in the
  tenant). Existing keys keep `whatsapp`; no key gains the new scopes without admin action.
  [ASSUMPTION] scope names; confirm against the key-minting tool (`scripts/mint-key.mjs`).

## 2. Linking and unlinking (R-1 .. R-9)

States: `requested -> active -> suspended -> active` (reversible), and `requested|active|suspended
-> unlinked` or `-> revoked` (terminal). `needs-relink` is a health flag on an `active` link, not a state.

- **R-1 Request.** A holder of `whatsapp-link` posts `{archiverUserId, label, attestation}`. The
  server stores a `requested` link bound to the caller's `keyId` and `tenantId` taken from the
  verified key, never the body. Body fields beyond those are rejected.
- **R-2 Attestation (per Q4a).** Request is refused unless the person attests: (i) accepts their
  own ban risk for an unofficial client; (ii) has told members of tracked groups that messages are
  archived; (iii) states `studentData: "yes" | "no" | "unknown"` for the groups they intend to
  track. Stored with the text version shown, timestamp and `keyId`. Text lives in one file so a
  change bumps the version.
- **R-3 Proof of ownership.** A person typing an archiver userId proves nothing: anyone could name
  another person's id and read their groups. Therefore **only a `whatsapp-admin` may move a link to
  `active`**, after verifying the archiver userId belongs to that person (the existing
  `docs/whatsapp/SETUP.md` step 3 method). v2 option (extension, not built): the archiver issues a
  signed one-time claim token the person pastes, removing the manual check.
- **R-4 Uniqueness.** At most one non-terminal link per archiver userId across all tenants, and one
  per `(tenantId, keyId, archiverUserId)`. This carries forward today's invariant that one owner
  maps to one tenant (`owner-config.ts`) because the session id remains the bare hash of
  `(groupJid, ownerUserId)` (comment in `store.ts`, ISS-TENANTSRCID-001). Enforced by a unique
  partial index, not application checks alone.
- **R-5 Linking the phone.** The QR scan happens in the archiver UI (Q3a). The KB never sees or
  stores a QR, an archiver password, cookie or WhatsApp auth state. The link page shows the archiver
  URL and instructions only.
- **R-6 Activation effect.** `active` makes the owner eligible for list, ingest and scheduled
  sync. No eligibility exists for `requested`, `suspended`, `unlinked`, `revoked`.
- **R-7 Unlink (by owner or admin).** Sets state `unlinked` with actor and time; stops scheduled
  sync for that link within one scheduler cycle; quarantines that link's pending candidates; for
  each source owned by the link calls the existing consent-withdraw CAS path so a concurrent
  approval cannot win (ISS-WAVECTORLESS-002). Approved claims remain unless the admin purges (Q6a).
  Idempotent: repeating an unlink is a no-op 200.
- **R-8 Revoke (admin only).** Same as unlink plus `revokedReason`; the person cannot re-request
  the same archiver userId until an admin clears the block.
- **R-9 Suspend/resume (admin only).** Pauses sync and ingest without touching consent; resume
  requires no new attestation unless its text version changed.

The archiver account itself (signup, password, WhatsApp device) is the person's to delete in the
archiver. The KB never deletes archiver data.

## 3. Isolation (R-10 .. R-17)

Isolation has three layers, each independently enforced.

- **R-10 Tenant.** Every read and write is scoped by the tenant on the verified key, using the
  existing scoped accessors. A key from tenant B receives 404 (not 403) for tenant A's link ids.
- **R-11 Owner set from links, not env.** The owner resolver returns the set of archiver owners
  from `active` links in the caller's tenant. `WHATSAPP_TENANT_OWNER_MAP` is retained only as a
  boot-time seed that creates `active` admin-attested links once, then is ignored (migration U2);
  after that it must not be a second authority.
- **R-12 Per-person narrowing.** A `whatsapp-link` caller without `whatsapp-admin` resolves only to
  links whose `keyId` equals theirs. `GET /whatsapp/groups` and `POST /whatsapp/ingest` filter to
  that subset. `groupJid` alone is never sufficient: ingest locates the group within the
  caller-permitted owners (extends today's `ownerFor` + `find(groupJid && ownerUserId)` check in
  `store.ts`). The same `groupJid` tracked by two owners yields two sources and two sessions, as
  today; they are never merged.
- **R-13 Read-side for raw sessions.** WhatsApp `sessions`/`turns`/`sources` carry the owning link
  id in `sourceMeta`. `GET /sessions/:id` and the `/whatsapp` review views return a WhatsApp
  session only to its owner key or `whatsapp-admin` (Q2a). This extends the existing read-side
  visibility and quarantine layer (`apps/api/src/visibility/`, `read-side-quarantine*.test.ts`);
  it is not a parallel check. Search/Ask see only approved, materialised claims, as today.
- **R-14 Review authority.** Approve/reject is allowed for the link owner on that link's
  candidates and for `whatsapp-admin` on all. The recorded actor stays the key fingerprint
  (`actor()` in `review/router.ts`) and gains the link id.
- **R-15 Cross-owner duplicates.** If two owners captured the same message, the later candidate
  is flagged `duplicate` by the existing detector with a pointer, never auto-merged, so provenance
  of each capture is kept. [ASSUMPTION] the detector already compares across sources in a tenant;
  U4 verifies this and adds the case if not.
- **R-16 Audit.** Every state change and every admin read of another person's raw content writes
  an append-only event (section 4). No update or delete path exists for events.
- **R-17 No cross-leak through errors.** Unauthorized and nonexistent link ids are
  indistinguishable. The 502 body of `POST /whatsapp/ingest` stops echoing raw upstream error text
  (closes ISS-API-003) and returns a stable code plus `linkId`.

## 4. Tracking (R-18 .. R-24)

"Tracking" in v1 is operational (Q5a), not capture selection.

- **R-18 Sync.** A scheduler runs every 15 minutes (accepted default; value in config, bounded
  5..1440). For each `active`, non-suspended link it lists tracked groups and calls the existing
  `ingestGroup` for each, with a per-link lock so runs never overlap. One link failing never stops
  the others. Ingest is the existing idempotent upsert, so a re-run with no news changes nothing.
- **R-19 Run record.** Each link run writes one `whatsapp_sync_runs` row: `linkId`, `startedAt`,
  `endedAt`, per group `{groupJid, fetched, newTurns, candidatesCreated, skippedDeleted,
  errorCode}`, overall `status` (`ok|partial|failed|skipped`). `errorCode` is from a closed list
  (`archive_unreachable`, `not_configured`, `link_inactive`, `store_transaction_unavailable`,
  `snapshot_shrink_refused`, `unknown`); free-form upstream text is never stored or shown.
- **R-20 Liveness.** The archiver cannot currently tell the KB whether a person's WhatsApp socket
  is alive (status is in memory). The archiver adds a `wa_session_status` collection upserted on
  each status change (`connected|awaiting_qr|reconnecting|logged_out|closed`, `updatedAt`) - U7,
  in the archiver repo, under its own governance. The KB reads it read-only. Until U7 lands the
  link page shows "liveness unknown" and uses time since last captured message as a weak proxy,
  labelled as such. [ASSUMPTION] this small archiver change is acceptable; the alternative is
  logging in to the archiver with a service account, which is rejected (credential handling).
- **R-21 Health flags** on a link: `needs-relink` (status `logged_out`), `stale` (no successful
  run for 3 cycles), `quiet` (alive but no new messages for 7 days, informational), `error`
  (last run `failed`). Shown to the owner and admin; `needs-relink` and `error` raise the existing
  alert path (Telegram notifier already used for watch failures) to the admin only. [ASSUMPTION]
  alert channel reuse; no WhatsApp message is ever sent.
- **R-22 What is shown, to whom.** Owner: their links, run history, counts (messages fetched,
  candidates pending/approved/rejected), health flag, attestation record. Admin: the same for every
  link plus the event trail and a tenant roll-up. Neither sees message text on the tracking
  screens; text is behind the review/session views (R-13).
- **R-23 What is recorded** (collections, all tenant-scoped, schemas added in U1):
  `whatsapp_links`, `whatsapp_sync_runs`, `whatsapp_events` (append-only). Message content is
  recorded only in the existing `sources/sessions/turns` and review collections, never duplicated
  into tracking records. Retention of tracking rows follows the repo retention module
  (`packages/ingest/src/retention/`); [ASSUMPTION] 180 days for runs, events kept for the life of
  the link plus 1 year.
- **R-24 Counters are derived, not stored twice.** Pending/approved/rejected counts are queried
  from `whatsapp_candidates` per link; a drift between a stored counter and the source is
  impossible by construction.

## 5. Provider and transport (R-25 .. R-27)

- **R-25 Transport is the existing archiver only.** One Baileys socket per person, read-only.
  No second provider, no webhook receiver, no official API in scope. The KB talks to the archiver
  solely through its Mongo (read-only credential), never over its HTTP API and never with a
  person's cookie.
- **R-26 Deployment shape** (from the gap report, restated as constraints for T5): archiver on an
  always-on Ubuntu host in Docker with persistent `sessions/` and `media/` volumes and its own
  Mongo; that Mongo reachable only from the app host (firewall plus credentials; the ransom-attack
  risk in `docs/GO-LIVE-UBUNTU.md:30-35` applies); `INVITE_CODE` set so strangers cannot sign up;
  archiver cookie `secure` flipped on behind TLS (it is `secure:false` today,
  `src/api/auth.ts`); UI not on the public internet (Q3a). `lkb_prod` must support transactions
  (one-node replica set) because review store/decide uses them (gap 5).
- **R-27 Capacity.** One Node process holds one socket per linked person. [ASSUMPTION] up to 10
  linked people at launch; a load note (sockets, memory, reconnect storm after host restart) is a
  U7 acceptance item, not a design for hundreds.

## 6. Automation hooks: extension points only (R-28 .. R-31)

- **R-28 Event feed.** Domain events are written to `whatsapp_events` (R-16): `link.requested`,
  `link.activated`, `link.suspended`, `link.unlinked`, `link.revoked`, `sync.completed`,
  `sync.failed`, `candidate.created`, `candidate.approved`, `candidate.rejected`.
- **R-29 Payload rule.** Events carry ids, timestamps, counts and codes only. Never message text,
  names, phone numbers, group subjects or archiver userIds. A consumer that needs content must call
  the scoped read API with its own key.
- **R-30 Consumption.** `GET /whatsapp/events?after=<cursor>&limit=` for scope `whatsapp-admin`
  (or a future `whatsapp-events` scope [ASSUMPTION]); cursor-based, at-least-once, consumers
  dedupe on event id. No push, no webhooks, no registry of consumers in this feature.
- **R-31 Hard line.** No hook may call WhatsApp (send/react/read-receipt), no hook may export raw
  message text outside the tenant, and any future consumer that uses an external AI/service on
  WhatsApp-derived content needs its own per-use approval and a decisions-log entry. The event
  feed is the whole extension surface; adding a consumer is a separate feature with its own gate.

## 7. Security and privacy (R-32 .. R-39)

- **R-32 Student/applicant data never leaves without approval.** Each link carries `studentData`
  from its attestation. For `yes` or `unknown`, derived claims are marked `studentDataFlag` and
  are excluded from every external-model path (Ask answer generation, embeddings via an external
  provider, any export) until an admin records a per-use approval. For `no`, normal paths apply.
  [ASSUMPTION] the Ask/embedding paths use an external provider today (`ai-provider-seam`); U9
  verifies and names the exact call sites before build. This is a human-gated item.
- **R-33 No secrets in the KB.** No archiver password, cookie, QR, WhatsApp auth state or phone
  number is stored in KB collections or logs. The archiver userId is an opaque ObjectId; stored,
  but redacted in logs and never returned to non-admin callers.
- **R-34 Read-only toward the archiver.** The Mongo credential used by the KB has `read` on the
  archiver DB only (extends today's stance; verified by a startup probe that a write is refused).
- **R-35 Least privilege roles.** Default key has no `whatsapp-link` or `whatsapp-admin`. Only an
  admin-run tool mints those scopes; no API path grants a scope.
- **R-36 Input hardening.** All bodies strict-schema, unknown fields rejected; ids validated
  (24-hex for archiver ids, existing `isValidTenantId`); no id from the body selects a tenant.
- **R-37 Third-party content in groups** (media, filenames, mime) stays inert as the archiver
  already enforces; the KB shows attachment names as text only.
- **R-38 Deletion upstream** is honoured: the existing invalidation with shrink guard
  (`review/invalidate.ts`) runs per link each sync.
- **R-39 Accepted residual risk.** Unofficial client may get a person's number banned; recorded
  per person in R-2(i). Not mitigated by the KB.

## 8. Failure modes (what the system does, so no case is guesswork)

| Case | Behaviour |
|---|---|
| Archiver Mongo unreachable | Run `failed`, `archive_unreachable`; link flag `error`; route returns 503 `whatsapp_unavailable` (configured) or `not_configured` (no URL); no partial writes. |
| Person's WhatsApp logs out / session killed | Heartbeat `logged_out` -> flag `needs-relink`; sync skipped (`link_inactive` reason `needs-relink`); admin alerted; person re-scans in archiver; flag clears on `connected`. |
| QR never scanned | Link stays `requested`; no data exists; requests expire after 14 days [ASSUMPTION], retained in events. |
| Account banned by WhatsApp | Same signal as logged out; admin guidance text names ban as a likely cause. No retry storm: backoff is the archiver's. |
| Two people name the same archiver userId | Second request refused by R-4 index; admin sees the conflict. |
| Person names someone else's userId | Cannot activate (R-3); admin check is the control. |
| Unlink during a running sync | Per-link lock plus consent CAS: the running ingest finishes its snapshot; its approvals fail the CAS; nothing new is scheduled. |
| Admin suspends a link mid-run | Same as above. |
| Overlapping scheduler instances | Token-owned lock (t038 pattern); the second refuses and logs `skipped`. |
| `lkb_prod` standalone (no transactions) | Review insert/decide returns 503/502 today; run records `store_transaction_unavailable`; deployment checklist blocks go-live without replica set. |
| Large backlog on first sync | Ingest is a full snapshot per group today; per-group size cap and timeout [ASSUMPTION 20k messages / 120 s] with `partial` status. |
| Deleted-message wave | Existing shrink guard refuses a >50% delete (`snapshot_shrink_refused`), run `partial`, admin sees it. |
| Event feed consumer lags or replays | At-least-once with stable ids; retention keeps events long enough (R-23). |
| Clock skew between hosts | Run and event times use the app host clock only; archiver times are never compared for ordering. |
| `WHATSAPP_TENANT_OWNER_MAP` still set after migration | Ignored with a boot warning; links are authoritative (R-11). |

## 9. Surfaces

- API (all new routes under existing `/whatsapp`, scope-guarded, tenant from key):
  `GET/POST /whatsapp/links`, `GET /whatsapp/links/:id`, `POST /whatsapp/links/:id/{activate,suspend,resume,unlink,revoke}`,
  `GET /whatsapp/links/:id/runs`, `GET /whatsapp/events`. `GET /whatsapp/groups` and
  `POST /whatsapp/ingest` keep their shape; `ingest` body stays `{groupJid}` and gains an optional
  `linkId` when the caller has more than one permitted link.
- Web: `/whatsapp/links`, `/whatsapp/links/new`, `/whatsapp/links/:id`, `/whatsapp/activity`
  (section 4 of `intent.md`); `/whatsapp` gets a link filter. Base path configurable.
- Scheduler: one service, run via the Ubuntu compose stack (T5 owns deployment).

## 10. Answer sensitivity (what changes if Umesh picks otherwise)

| Q | If not the recommendation | Spec impact |
|---|---|---|
| 1b | Real accounts first | Blocks the feature behind an auth project; R-1, R-12, R-14 rebind to user id. |
| 1c | Admin-managed only | R-1/R-2 move to admin; no `whatsapp-link` scope; R-12 narrowing disappears; smaller build. |
| 2b / 2c | Everyone / owner only | R-13/R-14 simplify (2b) or drop admin read (2c); 2c needs a recovery path for departed owners. |
| 3b | KB-embedded QR | New proxy surface, SSE, much stronger auth review; adds a unit and raises tier. |
| 3c | Admin scans all | Contradicts R-12 per-person model; links become admin-held. |
| 4b / 4c | Lighter attestation | Removes R-2(ii)/(iii) and R-32's source of truth; R-32 then needs a tenant-wide default. Not advised: leaves the student-data rule unenforced. |
| 5b | KB edits capture selection | Needs a human-approved decision to let the KB write to the archiver DB; new unit, tier H, breaks R-34. |
| 6b / 6c | Purge / ask | R-7 gains a purge job over claims, evidence, chunks and vectors (large, tier H); 6c adds a UI choice. |
