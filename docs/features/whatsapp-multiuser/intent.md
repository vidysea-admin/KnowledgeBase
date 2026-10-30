# Intent - whatsapp-multiuser

**Status:** DRAFT v2, planning only. Revised 2026-10-29 to match the mini-grill answers; nothing is
built. Approval record to be opened at `qa/gates/plan-approved-whatsapp-multiuser.md`.
**Authority:** D-205 / `qa/gates/golive-batch4-2026-10-28.md` item 3 ("3 ok", 2026-10-29):
"multiple users can link their WhatsApp numbers, tracking can be done, and various later
automation services can also be done there". Binding answers: `qa/gates/whatsapp-multiuser-grill-2026-10-29.md`
(every Answered line, quoted in "Decisions (2026-10-29)" below). Defaults already accepted in
`qa/gates/golive-decisions-2026-10-28.md`: Ubuntu host, review kept, 15-min sync.
**Order:** this feature builds on `docs/features/user-accounts/` (real accounts first, answer Q1=1b).
Nothing here that needs a logged-in person is buildable before user-accounts units A3, A4 and A6 close.
**Siblings:** `spec.md` (behaviour), `plan.md` (build units). Related, not repeated here:
`docs/WHATSAPP-GOLIVE-GAP.md` (single-owner launch gaps), `docs/whatsapp/SETUP.md` (today's setup),
and the separately governed archiver repo `sources/whatsapp_msg` (its own `ARCHITECTURE.md` and
`docs/DECISIONS.md`; referenced here, never restated or edited from this repo; this plan only states
the API this repo needs from it).

Every input the human has not stated is marked **[ASSUMPTION]**.

## 1. Problem

What exists today (cited from code, not memory):

- The archiver (`sources/whatsapp_msg`) is already multi-user at the capture layer. Each owner has
  their own Baileys socket (`src/wa/sessionManager.ts`, one `Session` per `userId`), restarted at
  boot (`src/index.ts:24`), so a link survives restarts until it is explicitly logged out
  (`POST /api/wa/logout` demands `{"confirm":"UNLINK"}`, `src/api/server.ts:217-230`). Every row it
  stores carries `ownerUserId` (`src/db/types.ts`). It is structurally read-only toward WhatsApp
  (`src/wa/readOnlySocket.ts`, its ARCHITECTURE H3). Which groups and people are captured is the
  archiver's own state: `groups.isTracked`, `groups.trackAllSenders` and `tracking` rows, changed by
  `POST /api/groups/:jid/track|mode|people` behind the archiver's own cookie login.
- The archiver's only front door is its own web UI with its own email/password and cookie
  (`src/api/auth.ts`, `wa_sid`, 30 days). A person must sign up there, scan the QR there and pick
  groups there. The KB has no way to drive any of it.
- The KB side is single-owner. `WHATSAPP_TENANT_OWNER_MAP` maps one tenant to one archiver owner
  and one owner to one tenant; a second owner per tenant fails configuration at boot
  (`apps/api/src/whatsapp/owner-config.ts:25-26`). The map lives in server env, so adding or
  removing a person is an operator edit plus an API restart.
- The KB has no user concept (today: Bearer API key to `{tenantId, scopes, keyId?}`,
  `apps/api/src/auth.ts:11-15`). The `user-accounts` feature supplies the person.
- Ingest is a manual per-group button (`POST /whatsapp/ingest`); there is no schedule, and the KB
  cannot see whether a person's WhatsApp session is alive.
- Consent withdrawal exists as a CAS writer with no production caller (`ISS-W6-001`), so a person
  cannot stop being captured and have the KB honour it.

So: people can link in the archiver, but the KB cannot attribute, isolate, schedule, monitor,
release them, show the QR, or let them choose what matters.

## 2. Outcomes (what "done" looks like to Umesh)

1. A logged-in KB person (member role) asks to link their own WhatsApp number; an admin approves;
   the person scans the QR **inside the KB**; the link then stays alive until that person unlinks.
   No server env edit, no archiver login, no restart.
2. The person marks the groups and people that are **important**; only those are captured and
   brought into the KB. The KB shows link health (connected, needs re-scan, last run, counts).
3. Raw captured messages and the review list are visible to the **owner and to admins only**.
   Approved knowledge derived from them is visible tenant-wide like any other claim. A second tenant
   sees nothing.
4. Capture is synced on a schedule (15 minutes, accepted default) and every run is recorded.
5. Unlinking stops capture, quarantines pending candidates, withdraws consent through the existing
   CAS path, and keeps already-approved knowledge with the owner recorded (6a).
6. A narrow, documented event feed exists so later automation can subscribe without touching
   capture or review code. No automation is built now.

## 3. Non-goals

- Sending, replying, reacting, marking read or presence in WhatsApp. The archiver is read-only by
  construction (its H3); an automation that sends is a separate decision.
- Official WhatsApp Business Cloud API. It cannot read arbitrary group messages on a personal
  account (archiver README, "A word on risk").
- One-to-one chats and statuses. The archiver tracks groups only. [ASSUMPTION] this stays.
- Changing the review/approve gate. Content reaches claims only after human approval, exactly as
  today (`whatsapp/review/`).
- Building any automation consumer, notifier channel or AI feature on WhatsApp content.
- The user-account system itself (separate feature, `docs/features/user-accounts/`).
- Backfilling history from before linking (capture is going-forward-only, archiver D-005).
- Separate-tenant onboarding. [ASSUMPTION] one production tenant (`toc`) with many people in it.
- Exposing the archiver's own web UI to people. With the QR and selection inside the KB, that UI is
  an operator surface only and stays off the public internet.

## 4. User types

Routes marked (exists) are in `apps/web/src/App.tsx`; the rest are proposed. All routes are relative
to the configurable web base path (decision 1b, 2026-10-29).

| # | Type | Who | What they do | Navigation |
|---|---|---|---|---|
| T1 | **Linking member** | A KB person with role `member` and their own WhatsApp number [ASSUMPTION: staff] | Requests a link, scans the QR in the KB once approved, chooses important groups and people, sees health and runs for their own link, unlinks. Cannot see anyone else's link | `/whatsapp/links` (own link) -> `/whatsapp/links/new` (request + short notice) -> `/whatsapp/links/:id/connect` (QR) -> `/whatsapp/links/:id/choose` (important groups and people) -> `/whatsapp/links/:id` (status, runs, unlink) |
| T2 | **Tenant admin** (Umesh and admins he approves) | Users with role `admin` | Approves, suspends, resumes, revokes any link; binds a legacy seeded link to a person; sees every link's health and the event trail; reads any link's raw messages and review list | `/whatsapp/links` (all links, filter by state) -> `/whatsapp/links/:id` (approve, suspend, revoke, bind) -> `/whatsapp/activity` (audit and run history) |
| T3 | **Reviewer** | The link owner (own candidates) or an admin (all) | Works the review queue: approve or reject candidates, open the source view | `/whatsapp` (exists: groups, Ingest, review queue) -> `/whatsapp/review/:id/source` (exists) |
| T4 | **Knowledge consumer** | Any signed-in role (viewer, member, admin) | Reads only approved knowledge derived from WhatsApp, with citations; never raw chat unless they own the link or are admin | `/ask`, `/search`, `/sessions/:id` (exist; the last gains an owner-or-admin read filter for WhatsApp sessions) |
| T5 | **Viewer** | Role `viewer` | Same as T4 and nothing else: cannot link, mark, approve or ingest (server enforces read-only) | As T4 |
| T6 | **Platform operator** | DevOps for the Ubuntu server | Deploys the archiver, its Mongo and its private service API; sets env and the service token; backs up `sessions/`; has no need to read message content | No product screen. `docs/DEVOPS-HANDOVER.md`, server `.env`, `/system-status` (exists) |
| T7 | **Automation consumer** (future service principal) | A later internal service, not a person | Subscribes to the event feed by id, fetches content only through the scoped read API | No UI. `GET /whatsapp/events` (proposed) with an API key holding `whatsapp-admin` |

Persona walks needed at build time (rule for new screens): T1, T2, T3, T5.

## 5. Constraints that shape everything

- The user-level hard rules apply: WhatsApp-derived text goes to no external service without
  explicit per-use approval because tracked groups may hold student or applicant data. Umesh's
  acceptance of the privacy risk (answer 4c) covers archiving group messages; it does **not**
  replace the per-use approval for sending such text to an external AI service (see spec R-32 and
  open question Q-W1).
- The KB never writes the archiver's database. The KB reads archiver message data through a
  read-only Mongo credential (existing stance, `apps/api/src/whatsapp/store.ts:1-8`) and controls
  the archiver only through a narrow service API the archiver exposes (spec section 7). The
  archiver, not the KB, owns the capture-selection state.
- The archiver uses an unofficial client; ban risk was accepted by Umesh at launch (gap report item
  11) and, under 4c, is accepted by Umesh on behalf of each linked person; the KB shows a short
  notice and records that acceptance.
- Tenancy, auth, consent and data-write code in this feature is dual-check territory (see `plan.md`).
- Lane note: this feature touches the same WhatsApp files as the open go-live gaps (gap report items
  1, 5, 7, 8); the plan sequences those first rather than racing them.

## Decisions (2026-10-29)

The six mini-grill questions and three follow-ups are answered. Verbatim from
`qa/gates/whatsapp-multiuser-grill-2026-10-29.md` (Approver: Umesh, via chat):

- **Q1 = 1b.** "build real per-user accounts with login FIRST ('hnn yhi baa lete hai user wise');
  links bind to a user, not an API key". Effect: new feature `docs/features/user-accounts/`; every
  link carries a `userId`; API keys stay machine identities.
- **Q2 = 2a.** "the person + admins see raw messages and the review list; approved knowledge
  tenant-wide". Effect: owner-or-admin read filter on raw sessions, turns, candidates; approved
  claims visible to every signed-in role.
- **Q3 = 3b.** "QR scanned INSIDE the KnowledgeBase (KB proxies QR + status)". Effect: the KB calls
  the archiver service API for QR and status; the person never visits the archiver UI.
- **Q4 = 4c.** "no attestation; admin approval is enough". Effect: no attestation form and no
  `studentData` self-declaration. A short visible notice stays on the request screen (messages from
  the tracked groups are archived; unofficial client can get a number banned), its text version is
  stored with the link, and the plan records that **Umesh accepted the privacy risk** (a DECISIONS
  entry, human item H-5). Admin approval of each link is the gate.
- **Q5 = 5a PLUS.** "(i) tracking of the important/'main' messages, (ii) login must persist - 'one
  login stays forever possible until user logs out themselves' (applies to the WhatsApp link session
  and the user's KB login)". And the clarification: "'main messages' = only groups/people the user
  marks as important (on top of 5a health tracking)". Effect: health tracking for every link (5a)
  plus capture limited to the groups and people the owner marks as important in the KB. The marking
  must reach the archiver (it decides what is captured): spec section 7 resolves the boundary.
  Persistence: the WhatsApp link stays connected until the owner unlinks (archiver already restarts
  sessions at boot); the KB login is the user-accounts rotating session.
- **Q6 = 6a.** "Capture stops; pending candidates are quarantined; already-approved claims stay
  (owner recorded) unless the admin purges them." Unchanged from the earlier recommendation.
- **Q7.** "login = email + password (session persists until the user logs out)". Owned by
  `user-accounts`.
- **Q8.** "who can create an account = open signup; admin approves later". Owned by `user-accounts`.
- **Q9.** "roles = admin + member + viewer (viewer read-only)". Owned by `user-accounts`; only
  `member` and `admin` can link or mark; only `admin` approves links and reads others' raw messages.

Reading choices made on top of these answers (each also an **[ASSUMPTION]** until Umesh confirms in
the plan approval):

- "Admin approval is enough" (4c) is read as **admin approval of each link**, kept as a state before
  the QR is shown. It is not read as "account approval alone is enough".
- The archiver owner for a person is **created by the KB through the service API**; the person never
  holds an archiver password. This removes the typed-in archiver id and its proof-of-ownership
  problem.
- "Important" means the owner marks **groups** (and optionally specific **people** inside a marked
  group), using the archiver's existing selection model; nothing is captured until something is marked.

## Open questions

Moved to `plan.md` "Open questions": one new question for this feature (Q-W1, student-data default
without attestation), with options and a recommendation. It blocks only the student-data gate unit.
