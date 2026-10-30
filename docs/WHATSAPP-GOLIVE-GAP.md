# WhatsApp at go-live: gap report (Ubuntu docker-compose)

Date 2026-10-28, branch docs/devops-golive-2026-10-26. Static read only: no network, no Mongo,
no secret values read. Question: "WhatsApp bhi launch pe chahiye; bana hua hai na? kya remaining hai?"

Short answer: the KB side (API + web review UI) is built and unit-tested. Messages cannot get in on
the server today, because the capture component (`sources/whatsapp_msg`) has no server deployment and
the compose api container is not given any WhatsApp variable.

## 1. Built and working (code level, tests exist; none verified live)
- Routes `GET /whatsapp/groups` and `POST /whatsapp/ingest`, scope `whatsapp`:
  `apps/api/src/routes/whatsapp.ts:50-79`, mounted `apps/api/src/server.ts:155`.
- Unconfigured archive answers 503 `{error:"not_configured",feature:"whatsapp"}`:
  `routes/whatsapp.ts:43-46`, raised by `apps/api/src/whatsapp/store.ts:115,125` (no owner grant or no
  URL). This fix is commit 83c7b50e (2026-10-28), on this branch, NOT on master (master head 2026-10-22).
- Read-only reader of the archiver DB (`messages`, `people`, `groups`, `tracking`) and idempotent upsert of
  source + session + turns keyed by messageId: `store.ts:22-26,40-60,131-205`.
- Review layer: candidate detection (decisions/topics/sensitive/duplicate) `whatsapp/review/detection.ts`,
  quarantine, deletion invalidation with shrink guard `review/invalidate.ts`, approve/reject router
  `review/router.ts:20-52` (`GET/POST /whatsapp/review...`), materialiser to approved claims
  `review/materializer.ts`. Mounted in production: `composition/integrations/knowledge.ts:66-75`,
  `composition/integrations/routes.ts:69`. The review wiring overrides the plain store (no direct indexing;
  content reaches claims only after human approval).
- Web: `/whatsapp` page `apps/web/src/pages/WhatsAppPage.tsx` (list groups, Ingest button, review queue
  `pages/whatsapp/ReviewQueue.tsx:46-91` Approve/Reject) and source viewer
  `pages/whatsapp-review/ReviewSourcePage.tsx`; routes `App.tsx:111-112`. Tests exist for all of it.
- Foundation unit `whatsapp-review-foundation-20261014` checked-PASS cycle 2 (`qa/QUEUE.md:1179`).
- Archiver (`sources/whatsapp_msg`, own repo, Baileys, read-only socket): README says "working end to end,
  live capture verified". Pinned submodule commit 7cdf1a18.

## 2. Needed config (names only)
| Name | Where read | Value source | Who sets |
|---|---|---|---|
| `WHATSAPP_MONGO_URL` | `store.ts:23`, default `mongodb://127.0.0.1:27018` | URI of the archiver's Mongo | DevOps, server `.env` |
| `WHATSAPP_MONGO_DB` | `store.ts:24`, default `whatsapp_msg` | archiver DB name | DevOps |
| `WHATSAPP_TENANT_OWNER_MAP` | `production.ts:220`, `knowledge.ts:68`, `owner-config.ts:13` | JSON `[{"tenantId":..,"ownerUserId":<24-hex ObjectId>}]`; one owner per tenant; bad JSON throws at boot | Owner/Umesh: real ObjectId from the archiver `users` data, tenant `toc` |
| API key scope `whatsapp` | `requireScope("whatsapp")` | an all-scopes admin key already covers it | exists |
Archiver side (separate process, `sources/whatsapp_msg/.env.example`): `MONGO_URI`, `MONGO_DB`, `SESSIONS_DIR`,
`MEDIA_DIR`, `PORT`, `INVITE_CODE`, `SYNC_HISTORY`, `LOG_LEVEL`.
Databases: archiver data lives in its OWN Mongo (container `whatsapp-msg-mongo`, port 27018), never in
`lkb_prod`. KB writes (sources, sessions, turns, `whatsapp_review_log`, review candidates) go to `MONGODB_DB`
(`lkb_prod`). `docs/whatsapp/SETUP.md:13` records `WHATSAPP_TENANT_OWNER_MAP` ABSENT in the main `.env`.

## 3. Not built or broken
| # | Gap | Evidence | Size |
|---|---|---|---|
| 1 | CLOSED 2026-10-29 for the single-owner names: compose now forwards `WHATSAPP_MONGO_URL`, `WHATSAPP_MONGO_DB`, `WHATSAPP_TENANT_OWNER_MAP` to api as value-less pass-through (`docker-compose.yml:83-85`, api `environment`), and `env_file` is gone. Any name a server needs beyond these (the multi-user archiver API URL and token) is added by unit W3 of the plan of record, `docs/features/whatsapp-multiuser/plan.md` (gate G-2 there is this gap; the multi-user design is `spec.md` and `intent.md` in the same folder, built after `docs/features/user-accounts/`). Server `.env` must not carry blank `WHATSAPP_*=` lines: `docs/GO-LIVE-UBUNTU.md` section 2 | S (done) |
| 2 | No server deployment of the archiver. It needs an always-on host, a persistent `sessions/` dir (linked-device auth), `media/`, its own Mongo, and a one-time QR scan by the phone owner. No Dockerfile or compose in the submodule; README runs it with `npm run dev` + a local docker Mongo | `sources/whatsapp_msg/README.md` "Running it"; `ls` shows no Dockerfile; local `sessions/` and `.env` present | M-L |
| 3 | Archiver Mongo must be reachable from the api container and not exposed to the internet (same ransom-attack risk as section 0 item 1 of GO-LIVE-UBUNTU) | `docs/GO-LIVE-UBUNTU.md:30-35` | S-M |
| 4 | Live `/api/whatsapp/groups` is 500 today; `lkb-live.knowledge.md` finding (WHATSAPP_MONGO_URL unset). Deployed build predates 83c7b50e, so master needs this branch merged to give an honest 503 | `references/portals/lkb-live.knowledge.md` Findings + page matrix `/whatsapp`; `git branch --contains 83c7b50e` excludes master | S (merge) |
| 5 | Review store inserts candidates and decides inside Mongo transactions. A standalone mongod answers 503/502 for WhatsApp review. Ingest then fails as `whatsapp_ingest_failed` | `whatsapp/review/store.ts:150,172`; `docs/GO-LIVE-UBUNTU.md:189-191` | M (convert lkb_prod host to one-node replica set, GO-LIVE section 6a) or L (code) |
| 6 | Ingest is manual only (button per group, snapshot of all text messages). No scheduler or incremental sync; media-only and deleted messages are skipped | `store.ts:40-60`; no scheduler references WhatsApp in `scripts/` | M if wanted |
| 7 | Source-consent withdrawal has no production entry point (ISS-W6-001 medium) and withdrawal vs approval lacks a shared CAS protocol (ISS-WAVECTORLESS-002 HIGH). Product decision needed on who may withdraw | `qa/issues.w6.jsonl`, `qa/issues.WAVECTORLESS.jsonl` | M-L; human gate |
| 8 | `POST /whatsapp/ingest` echoes raw upstream error text on 502 (ISS-API-003 medium) | `qa/issues.api.jsonl` | S |
| 9 | Live end-to-end never exercised: no real archive, owner map unset, real-Mongo tests (`wire-mongo.test.ts`, `consent-race-mongo.test.ts`) need `WA_REVIEW_TEST_MONGO_URL` / `LKB_WHATSAPP_CONSENT_MONGO_*` and are skipped by default | those test files; `lkb-live.knowledge.md` | M (one live proof run) |
| 10 | Notifier WhatsApp channel is a stub (sends nothing). Not needed for ingestion | `.env.example:121-122` | out of scope |
| 11 | Account-ban risk: archiver uses an unofficial client (ToS violation); the owner accepts it per README "A word on risk" | `sources/whatsapp_msg/README.md` | decision, not work |
Other open WhatsApp items are low severity (ISS-VECTOR-001, ISS-WA-REVIEW-WIRE-007). T-007 is still `in_progress` in
`TASKS.md:55`.

## 4. Recommended minimum for launch
Option A (recommended, lowest risk): launch with WhatsApp page unused. After merging this branch, `/api/whatsapp/groups` answers
a clean 503 `not_configured` and the UI shows it. Item 4 only. Tell stakeholders WhatsApp is "phase 2".

Option B (WhatsApp live at launch), in order:
1. Merge 83c7b50e to master (gap 4). S.
2. Decide archiver host. Simplest: keep it on the existing always-on machine that already holds the linked-device
   session and its Mongo; expose that Mongo only to the app server by firewall plus credentials (gaps 2-3). M.
3. Compose already forwards `WHATSAPP_MONGO_URL`, `WHATSAPP_MONGO_DB`, `WHATSAPP_TENANT_OWNER_MAP` (gap 1, closed); add them to the
   server `.env` (values from the owner); `docker compose up -d --build api`. S.
4. Make `lkb_prod` a replica set or confirm it is one (gap 5). M. Verify with `curl -H "Authorization: Bearer <key>"
   https://<server>/api/whatsapp/groups` returning 200 with groups.
5. One supervised live proof: ingest one real group, check candidates appear, approve one, confirm it surfaces in Ask. M.
6. Human gate before go-live: withdrawal policy (gap 7) and ban-risk acceptance (gap 11).
