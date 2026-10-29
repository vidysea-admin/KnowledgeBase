# Intent - whatsapp-multiuser

**Status:** DRAFT, planning only. Nothing here is built. Approval record to be opened at
`qa/gates/plan-approved-whatsapp-multiuser.md` after the mini-grill is answered.
**Authority:** D-205 / `qa/gates/golive-batch4-2026-10-28.md` item 3 ("3 ok", 2026-10-29):
"multiple users can link their WhatsApp numbers, tracking can be done, and various later
automation services can also be done there". Defaults already accepted in
`qa/gates/golive-decisions-2026-10-28.md`: Ubuntu host, admin QR page, review kept, 15-min sync.
**Siblings:** `spec.md` (behaviour), `plan.md` (build units). Related, not repeated here:
`docs/WHATSAPP-GOLIVE-GAP.md` (single-owner launch gaps), `docs/whatsapp/SETUP.md` (today's setup),
and the separately governed archiver repo `sources/whatsapp_msg` (its own `ARCHITECTURE.md` and
`docs/DECISIONS.md`; referenced here, never restated or edited from this repo).

Every input the human has not stated is marked **[ASSUMPTION]**.

## 1. Problem

What exists today (cited from code, not memory):

- The archiver (`sources/whatsapp_msg`) is already multi-user at the capture layer. Each person
  signs up (`src/api/server.ts:144`), scans their own QR, and gets their own Baileys socket
  (`src/wa/sessionManager.ts`, one `Session` per `userId`). Every row it stores carries
  `ownerUserId` (`src/db/types.ts`). It is structurally read-only (`src/wa/readOnlySocket.ts`).
- The KB side is single-owner. `WHATSAPP_TENANT_OWNER_MAP` maps one tenant to one archiver owner
  and one owner to one tenant; a second owner per tenant fails configuration at boot
  (`apps/api/src/whatsapp/owner-config.ts:25-26`). The map lives in server env, so adding or
  removing a person is an operator edit plus an API restart.
- The KB has no user concept. Authentication is an API key that resolves to `{tenantId, scopes,
  keyId?}` (`apps/api/src/auth.ts:11-15`). "Per user" has nothing to attach to today.
- Ingest is a manual per-group button (`POST /whatsapp/ingest`, `routes/whatsapp.ts`); there is no
  schedule. Whether a person's WhatsApp session is alive is not visible to the KB at all (session
  status lives in archiver memory, not in its Mongo).
- Consent withdrawal exists as a CAS writer with no production caller (`ISS-W6-001`), so there is
  no way for a person to stop being captured and have the KB honour it.

So: several people can already link numbers in the archiver, but the KB cannot attribute, isolate,
schedule, monitor or release them, and cannot grow into automation.

## 2. Outcomes (what "done" looks like to Umesh)

1. A named person can link their own WhatsApp number, see that it is linked and healthy, and
   unlink it, without anyone editing server env or restarting the API.
2. Two linked people cannot see each other's raw captured messages, and cannot trigger or review
   each other's groups, unless the admin role explicitly allows it. Tenant isolation stays as
   strong as today (a second tenant sees nothing).
3. Capture runs on a schedule (15 minutes, accepted default) and every run is recorded: what was
   fetched, what was new, what failed.
4. A tracking view answers "is each number linked, alive, and producing, and what did the last
   runs do" for the person and for the admin.
5. Unlinking stops capture and releases the person's consent through the existing CAS path.
6. A narrow, documented event feed exists so later automation services can subscribe without
   touching the capture or review code. No automation is built now.

## 3. Non-goals

- Sending, replying, reacting, marking read or presence in WhatsApp. The archiver is read-only
  by construction (its `ARCHITECTURE.md` H3); an automation that sends is a separate decision.
- Official WhatsApp Business Cloud API. It cannot read arbitrary group messages on a personal
  account (archiver README, "A word on risk"); there is no terms-clean path to this feature set.
- One-to-one chats and statuses. The archiver tracks groups only today. [ASSUMPTION] this stays.
- Changing the review/approve gate. Content reaches claims only after human approval, exactly as
  today (`whatsapp/review/`); multi-user does not shortcut it.
- Building any automation consumer, notifier channel (still a stub, `.env.example:121-122`) or
  AI feature on WhatsApp content.
- New user accounts, SSO or a KB login system. If Q1 needs one, that is its own feature.
- Backfilling history from before linking. Capture is going-forward-only (archiver D-005).
- Onboarding outside organisations as separate tenants. [ASSUMPTION] one production tenant
  (`toc`) with many people in it; separate-tenant users work through the same machinery but are
  not designed for here.

## 4. User types

Six types. Routes marked (exists) are in `apps/web/src/App.tsx`; the rest are proposed. The web
base path must be configurable, not hard-coded (decision 1b, 2026-10-29); all routes below are
relative to that base.

| # | Type | Who | What they do | Navigation |
|---|---|---|---|---|
| T1 | **Linking member** | A Vidysea/TOC staff person with their own WhatsApp number [ASSUMPTION] | Requests a link for their number, completes the QR scan, ticks the risk and group-notice attestation, sees status and last runs for their own number, unlinks | `/whatsapp/links` (own links) -> `/whatsapp/links/new` (request + attestation) -> external archiver QR page -> back to `/whatsapp/links` -> `/whatsapp/links/:id` (status, runs, unlink) |
| T2 | **Tenant admin** (Umesh) | The Approver | Verifies and activates pending links (checks the archiver userId is that person's), suspends or revokes any link, sees every link's health, sets the sync cadence, sees the audit trail | `/whatsapp/links` (all links, filter by status) -> `/whatsapp/links/:id` (activate, suspend, revoke) -> `/whatsapp/activity` (audit and run history) |
| T3 | **Reviewer** | Whoever may approve WhatsApp candidates; may be T1 for their own groups or T2 for all [ASSUMPTION, per Q2] | Works the review queue: approve or reject candidates, open the source view | `/whatsapp` (exists: groups, Ingest, review queue) -> `/whatsapp/review/:id/source` (exists) |
| T4 | **Knowledge consumer** | Anyone with Ask/search access | Reads only approved knowledge derived from WhatsApp, with citations; never sees raw chat unless they own the link or are admin | `/ask`, `/search`, `/sessions/:id` (all exist; the last gains a per-owner read filter for WhatsApp sessions) |
| T5 | **Platform operator** | DevOps for the Ubuntu server | Deploys the archiver and its Mongo, sets env, secures the archiver UI, backs up `sessions/`, watches infrastructure health; has no need to read message content | No product screen. `docs/DEVOPS-HANDOVER.md`, server `.env`, `/system-status` (exists) |
| T6 | **Automation consumer** (future service principal) | A later internal service, not a person | Subscribes to the event feed by id, fetches content only through the scoped read API | No UI. `GET /whatsapp/events` (proposed), registered by T2 |

Persona walks needed at build time (this repo's rule for new screens): T1, T2, T3.

## 5. Constraints that shape everything

- The user-level hard rules apply: nothing from a WhatsApp group goes to an external service
  without explicit per-use approval, because tracked groups may contain student or applicant data.
- The archiver stays read-only toward WhatsApp and toward the KB. The KB reads its Mongo with a
  read-only credential and never imports its code (existing stance, `apps/api/src/whatsapp/store.ts:1-8`).
- The archiver uses an unofficial client; ban risk was accepted by Umesh at launch (gap report
  item 11). Under multi-user every linked person stakes their own number, so the risk must be
  accepted per person.
- Tenancy, auth and data-write code in this feature is dual-check territory (see `plan.md`).
- Lane note: this feature touches the same WhatsApp files as the open go-live gaps (gap report
  items 1, 5, 7, 8); the plan sequences those first rather than racing them.

## Mini-grill questions

Only what blocks the spec. Recommended option first.

1. **What identifies a "user" on the KB side?** The KB has API keys, not accounts.
   (a) One API key per person; a link is bound to that key's id. No new auth system. **Recommended.**
   (b) Build real user accounts and login first (large, separate feature, delays this by weeks).
   (c) Admin-managed only: no self-service, the admin creates and owns every link for people.
2. **Within the tenant, who may see a linked person's raw messages and review queue?**
   (a) The owner plus tenant admins; approved knowledge is visible tenant-wide like any claim. **Recommended.**
   (b) Everyone in the tenant (simple, but weakens "per-user isolation").
   (c) Owner only, admins excluded (strongest, but nobody can recover a departed person's queue).
3. **Where does the person scan their QR?**
   (a) The archiver's own web UI, kept off the public internet (VPN or allowlisted proxy, TLS,
       signup closed by invite code); the KB shows link status read-only. Least build. **Recommended for v1.**
   (b) A KB-embedded flow that proxies the QR and status (nicer, more build, larger attack surface).
   (c) Admin scans every QR (matches today's "admin QR page" default but contradicts per-person ownership).
4. **What must a person attest before a link activates?**
   (a) Both: they accept their own ban risk, and they have told group members that messages are
       archived; they also state whether the tracked groups may hold student or applicant data.
       Recorded on the link. **Recommended.**
   (b) Ban-risk acceptance only.
   (c) Nothing beyond the admin's approval.
5. **What does "tracking" mean in v1?**
   (a) Operational tracking: link health, last sync, counts, failures, audit trail. Choosing which
       groups and people to capture stays in the archiver UI. **Recommended.**
   (b) Also let the KB change the capture selection (the KB would write to the archiver DB, which
       breaks the read-only boundary and needs a human-approved decision first).
6. **What happens to captured content when a person unlinks?**
   (a) Capture stops; pending candidates are quarantined; already-approved claims stay (owner
       recorded) unless the admin purges them. **Recommended.**
   (b) Purge everything derived from that number, including approved claims and sources.
   (c) Ask the person at unlink time.
