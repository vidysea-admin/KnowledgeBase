# Plan - whatsapp-multiuser

**Status:** DRAFT v2, awaiting plan approval at `qa/gates/plan-approved-whatsapp-multiuser.md`. No
unit below is buildable before that. Revised 2026-10-29 to match the binding mini-grill answers
(`intent.md` "Decisions (2026-10-29)").
**Derived from:** `spec.md` (requirement ids R-n). Identity, login, sessions and roles come from
`docs/features/user-accounts/` (ids UA-n, units A1..A9), which is built **first**.
**Backlog tier:** roadmap feature work (CLAUDE.md "Backlog priority override", tier 3), after
user-accounts, and after the go-live sequencing below.
Every unstated input is **[ASSUMPTION]**.

## Conventions

- **Tier** is the criticality in the severity gate: `H` = high (tenancy, auth, consent, data write,
  or student data), `M` = medium, `L` = low.
- **Dual check: required** (two independent checkers, at least one adversarial about tenancy bypass:
  cross-person and cross-tenant reads, scope escalation, id guessing, QR theft) for every unit that
  touches tenancy, auth, sessions, consent or data writes. Each unit carries a **Dual-trigger** line
  naming the reason. Units that only write docs or deployment text are marked "no" with the reason.
  The adversarial hunt output is **filed**, not auto-promoted into another round, except
  security-class findings, which are never capped (D-014).
- **Edit in place.** Every file named is edited where it exists. Files marked **NEW** do not exist;
  approving this plan is permission for exactly those files and no others.
- **Fix measurement** (D-015): units that close a filed issue (W7: ISS-API-003; W8: ISS-W6-001)
  re-run that issue's recorded reproductions verbatim from `qa/issues.api.jsonl` /
  `qa/issues.w6.jsonl` and report the count by issue id.
- **Mutation runs** by checkers follow the per-mutation trap and HEAD-fidelity rules in CLAUDE.md
  (D-020 and the 2026-09-28 amendment); prefer `scripts/lib/mutate.mjs`.
- **Real-Mongo proofs.** Uniqueness, CAS and transaction behaviour cannot be shown with fakes. Those
  tests need a replica-set Mongo reachable via the existing opt-in env (`WA_REVIEW_TEST_MONGO_URL`,
  `LKB_WHATSAPP_CONSENT_MONGO_*`); they are skipped by default today (gap 9), so every unit that
  depends on them states a real-Mongo run in its acceptance. Work DB only; never production.
- **Fake archiver.** Until the archiver ships its service API and the pin is bumped, KB tests run
  against an in-repo fake that implements the contract (unit W3). A unit never claims archiver-side
  behaviour it only saw in the fake.

## Sequencing against go-live and user-accounts (not built by this plan)

| Dep | Item | Why this feature needs it |
|---|---|---|
| G-1 | Merge 83c7b50e (honest `not_configured` 503) into master (gap 4) | W4/W5 edit `store.ts` and `routes/whatsapp.ts` as changed there. |
| G-2 | Compose forwards `WHATSAPP_*` to the api container (gap 1) | W4 still reads `WHATSAPP_MONGO_*`; W3 adds two more names. |
| G-3 | `lkb_prod` as one-node replica set (gap 5) | Review store/decide need transactions; the scheduler would otherwise fail every cycle. |
| G-4 | Archiver deployed on Ubuntu with its Mongo isolated (gaps 2-3) | The transport. DevOps-owned (W13). |
| G-5 | `w6-consent-cas` checked-PASS (commit 77ba22d8, on this branch) | W8 builds on the CAS writer. Confirm merged to master before W8. |
| UA | `user-accounts` units A3 (principal, roles), A4 (login), A6 (admin) closed | Every W unit that needs a logged-in person. W1, W2a, W2b and W3 do not need accounts and may start earlier. |

## Units

File ownership is exclusive per wave; two units never edit one file in the same wave.

| # | Unit | Files (edit in place; **NEW** marked) | Req | Tier | Dual | Depends |
|---|---|---|---|---|---|---|
| W1 | `wa-links-schema` | **NEW** `schema/whatsapp_links.schema.json`, `schema/whatsapp_sync_runs.schema.json`, `schema/whatsapp_events.schema.json`; **NEW** `packages/db/src/collections/whatsapp-links.ts` (+ test); **NEW** migration (name per `scripts/lint-migrations.mjs`) creating collections and the unique partial indexes; `packages/db/src/collections/index` export line | R-2, R-33, R-36, R-29 | H | yes | G-1 |
| W2a | `wa-archiver-contract` (this repo, docs) | **NEW** `docs/whatsapp/archiver-service-api.md` (the contract of spec section 7: operations, request/response shapes, closed error codes, auth, network, idempotency, acceptance tests the archiver must pass) | R-11..R-14, R-16, R-34, section 7 | H | no (docs; reviewed by the archiver repo's checker as part of W2b) | none |
| W2b | `wa-archiver-svc-api` (**archiver repo, its own governance**) | In `sources/whatsapp_msg`: a new service listener (separate bind and token auth), handlers for the seven operations, passwordless service owners, its own tests, its own `docs/DECISIONS.md` entry first. Then, here, a **separate human-approved** submodule pin bump. This plan lists the target; it plans no edit to the archiver's governance files and does not choose its internal file layout | R-9..R-14, R-16, R-34, R-42 | H | yes, run under the archiver's own maker/checker with a second independent checker (auth, sessions, data write) | W2a |
| W3 | `wa-archiver-client` | **NEW** `apps/api/src/whatsapp/archiver/{client,config,errors,fake-archiver}.ts` + tests (contract tests run against the fake; the same suite is runnable against a real archiver with a flag); `.env.example` (`WHATSAPP_ARCHIVER_API_URL`, `WHATSAPP_ARCHIVER_API_TOKEN`: names only), `docker-compose.yml` env forwards | R-16, R-42, R-45, section 7 | H | yes (outbound credential handling, SSRF, QR secrecy) | W2a, G-2 |
| W4 | `wa-owner-resolver` | `apps/api/src/whatsapp/owner-config.ts` (link-backed resolver returning a set; env-map parsing kept as boot seed only), `apps/api/src/whatsapp/store.ts` (`ownerFor` -> permitted owner set; `listGroups`/`ingestGroup` take it; group lookup stays `groupJid && owner`), wiring at `apps/api/src/composition/production.ts:220` and `composition/integrations/knowledge.ts:68`, their tests (`owner-config.test.ts`, `store-isolation.test.ts`, `route-tenant.test.ts`) | R-24, R-25 | H | yes | W1, A3 |
| W5 | `wa-links-api` | **NEW** `apps/api/src/whatsapp/links/{router,service,notice}.ts` + tests; **NEW** `apps/api/src/whatsapp/selection/router.ts` (empty router stub that W6 fills); mount lines in `apps/api/src/composition/integrations/routes.ts:69` and `apps/api/src/server.ts`; **NEW** `docs/whatsapp/notice.md` (notice text, version = file hash) | R-1..R-6, R-9..R-14, R-24 (bind), R-44 | H | yes | W3, W4, A4, A6 |
| W6 | `wa-selection-api` | `apps/api/src/whatsapp/selection/router.ts` (fills the stub), **NEW** `apps/api/src/whatsapp/selection/service.ts` + tests | R-15..R-21 | H | yes | W5 |
| W7 | `wa-isolation-read-side` | `apps/api/src/routes/whatsapp.ts` (narrowing, `linkId`, stable 502 code: ISS-API-003), `apps/api/src/whatsapp/review/router.ts` (owner-or-admin authority, `actorId`, link id on actor), `apps/api/src/whatsapp/review/detection.ts` (verify or add cross-owner duplicate flag), `apps/api/src/visibility/knowledge.ts` and the session read path behind `GET /sessions/:id` (owner-or-admin for WhatsApp sessions), `sourceMeta.whatsappLinkId` stamped in `store.ts` ingest (after W4 closes) | R-25..R-30 | H | yes | W4, A3 |
| W8 | `wa-unlink-consent` | `apps/api/src/whatsapp/links/service.ts` (unlink/revoke/account-coupling orchestration, owned after W5 closes), `apps/api/src/whatsapp/review/quarantine.ts` and `review/store.ts` only for a link-scoped quarantine entry point, call to `withdrawWhatsAppSourceConsent`, archiver `unlinkSession` retry step | R-7, R-8, R-10, R-47 | H | yes | W5, W7, G-5 |
| W9 | `wa-sync-scheduler` | **NEW** `scripts/whatsapp/sync-links.mjs` (+ test; follows the token-owned lock protocol of `docs/t038-scheduler-service.md`), reads active links, lists each owner's marked groups, calls the same `ingestGroup` composition, reads archiver status through the W3 client, writes `whatsapp_sync_runs` and `health.*`; **NEW** `docs/whatsapp/sync.md` (operator notes) | R-31, R-33..R-35, R-37 | H | yes (data writes into tenant collections, lock correctness) | W1, W3, W4 |
| W10 | `wa-links-web` | **NEW** `apps/web/src/pages/whatsapp-links/{LinksPage,NewLinkPage,ConnectPage,ChoosePage,LinkDetailPage,ActivityPage}.tsx` + tests; **NEW** `apps/web/src/api/whatsapp-links.ts`; **NEW** QR rendering component (dependency decision H-9); `apps/web/src/App.tsx` (routes near `:111`, nav entry), `apps/web/src/pages/WhatsAppPage.tsx` (link filter) | outcomes 1, 2, 4; R-3, R-12, R-14, R-22 | H | yes (renders the QR secret; owner-only gating in the client) | W5, W6, W7, A7 |
| W11 | `wa-student-data-gate` | The exact external-model call sites found by a read-only survey first (deliverable of this unit, human-reviewed before any edit): expected under `apps/api/src/answer-policy/`, `apps/api/src/ask/`, `apps/api/src/indexing/` and the embeddings path; `studentDataFlag` carried through the claim materialiser `whatsapp/review/materializer.ts` | R-32 | H | yes | W5, W7; **Q-W1 answered; human gate on the call-site list** |
| W12 | `wa-events-feed` | `apps/api/src/whatsapp/links/service.ts` event writer (after W8), `apps/api/src/whatsapp/review/router.ts` decision event (after W7), W9 script run events, **NEW** `apps/api/src/whatsapp/links/events-router.ts`; **NEW** `docs/whatsapp/events.md` (payload contract) | R-29, R-38..R-41 | M | yes (the event writers run inside auth and consent transitions) | W7, W8, W9 |
| W13 | `wa-deploy-ops` | Docs only by the maker: `docs/DEVOPS-HANDOVER.md` WhatsApp section, `docs/whatsapp/SETUP.md` (replace the single-owner steps with the link flow and the service API token), `docker-compose.yml` (api env forward is G-2/W3; archiver service block is DevOps-owned, an enforcement path that needs `Approved-by`). Humans perform the host work | R-42, R-43, section 7 transport | M | no (docs; the transport is proven in W2b and W14) | G-3, G-4, W2b |
| W14 | `wa-live-proof` | No code. Supervised run with two real numbers (two people), evidence pasted; a fresh checker runs it | outcomes 1..6 | H | independent fresh checker, not the maker | all |

### Per-unit acceptance

**W1 wa-links-schema.** Dual-trigger: new tenant-scoped consent and ownership data model.
1. The three schemas validate samples for every state in the spec lifecycle and reject: missing
   `tenantId`, unknown fields, a non-24-hex `archiverOwnerId`, `active` without `approvedBy`/`activatedAt`,
   `studentData` outside `yes|no|unknown`, an event carrying any of the forbidden payload fields (R-39).
2. A real-Mongo test proves the unique partial indexes: a second non-terminal link for the same
   `(tenantId, userId)` is rejected; a terminal link does not block a new one; `archiverOwnerId` is
   unique across tenants (R-2); a legacy link (`userId: null`) is allowed and unique per owner.
3. `scopedCollection` accessors reject a missing/invalid tenant; a cross-tenant `findOne` by id
   returns null.
4. `whatsapp_events` exposes insert and read only; a test asserts no update/delete helper exists.
5. Migration applies and re-applies idempotently on the work DB and passes `lint-migrations`.

**W2a wa-archiver-contract.** (docs)
1. The contract names each of the seven operations with request, response and error shape, the auth
   scheme, the network/binding requirement and idempotency rule, and lists "explicitly not in the API".
2. It includes a conformance checklist the archiver's maker can turn into tests (QR never logged,
   wrong token 401 with no detail, unknown owner 404, unlink idempotent, `setGroupTracking` rejects a
   malformed jid, no response field contains message text or a phone number).
3. It states that it is the KB's *request*; the archiver's decision record is the archiver's own, and
   that no archiver governance file is edited from this repo.

**W2b wa-archiver-svc-api.** (archiver repo; its own acceptance, listed here so this plan can verify)
1. Every conformance item from W2a passes in the archiver's own test suite plus its existing tests;
   its typecheck passes; its `docs/DECISIONS.md` entry exists before code.
2. A service owner cannot log in through the archiver's cookie routes (no password hash accepted).
3. The service listener is not reachable on the public UI port; wrong/missing token never reaches a
   handler (tested).
4. A load note: N=10 owners reconnect after a restart without a thundering herd beyond existing
   backoff; recorded in the archiver's decisions log.
5. The KB-side pin bump is a separate step, human-approved. Until then this plan's KB units use the fake.

**W3 wa-archiver-client.** Dual-trigger: outbound credential, secret QR pass-through, SSRF surface.
1. Base URL and token come only from config; the client refuses a non-`https` URL unless a private
   address is explicitly allowed by config [ASSUMPTION], never follows redirects, and never builds a
   URL from request data; ids are validated (24-hex owner id, WhatsApp jid form) before any call.
2. Every non-2xx maps to a closed error code; the archiver's body text is never echoed or logged; a
   canary token and a canary QR string never appear in logs, thrown messages or responses (test).
3. Timeouts and bounded retries for idempotent calls only; `getQr` is never retried or cached.
4. The fake implements all seven operations and the contract's error cases; the contract suite passes
   against the fake. Running it against a real archiver is a documented flag (used in W14).
5. `.env.example` lists the names with no values; compose forward lines are added as an enforcement
   path change with `Approved-by` (H-11).

**W4 wa-owner-resolver.** Dual-trigger: tenancy, owner resolution for raw-data reads.
1. With two active links in tenant T (owners A, B) an admin-session call lists groups for both
   owners, each group carrying its owner; a member-session call resolves only its own; no group of
   owner C (other tenant) ever appears.
2. `ingestGroup(T, jid)` for a jid marked only by A resolves A; for a jid marked by both, it requires
   `linkId` (else 409 `ambiguous_link`); for a jid marked only by C, 404 as if absent.
3. Legacy behaviour: with only the env map set and no link rows, first boot creates one `active`
   legacy link (`userId` null) per map entry and logs it; the second boot creates nothing; an env map
   that disagrees with existing links is ignored with a warning. An invalid map still fails boot.
   A plain `whatsapp` API key resolves legacy links only (R-25).
4. No link and no map -> `not_configured` exactly as today (existing tests pass unmodified).
5. Existing `store-isolation.test.ts` and `route-tenant.test.ts` pass; a new cross-owner test shows
   A's Mongo queries never carry B's `ownerUserId`.

**W5 wa-links-api.** Dual-trigger: auth, tenancy, consent entry, QR secret.
1. Request: only a member/admin session with `whatsapp-link` succeeds; a viewer, a pending user, and
   a Bearer key (any scopes) get 403; tenant in body ignored; unknown field 400; second live link 409.
2. Approval: only `whatsapp-admin` approves/rejects/suspends/resumes/revokes/binds; a member cannot
   act on any link including their own; a key from tenant B gets 404 on tenant A ids.
3. Self-approval rule: an admin approving their own request is allowed only when they are the only
   active admin, and the event records requester and approver ids. The test pins whichever rule Umesh
   confirms at plan approval.
4. Provisioning: `connect` on an `approved` link calls `ensureOwner(linkId)` once even under
   concurrent calls (real-Mongo race) and stores the id; a link in any other state is refused.
5. QR (R-13): only the owner's session can fetch; admin, other member, API key all 403/404; the
   response has `Cache-Control: no-store`; a canary QR never appears in logs/events/rows; rate limit
   returns 429; after `connected` the link becomes `active` exactly once and emits one event.
6. Adversarial brief: fetch another person's QR by id guessing, replay the connect call with a
   swapped tenant header, call connect with an API key holding every scope, approve then mutate
   `archiverOwnerId` from the body (mass assignment).
7. Account coupling hook is present (`link.suspend(reason)`) for W8 to call; nothing else here
   touches consent.

**W6 wa-selection-api.** Dual-trigger: data writes (into the archiver, via its API) that decide what is captured.
1. Only the owner's session marks/unmarks; admin, other member, viewer, and any key are refused;
   an admin can read the marked list but not change it (R-20).
2. The KB makes **no write to the archiver database** (grep-asserted in the test; the Mongo
   credential in the test is read-only and a write attempt through it fails); all selection writes go
   through the client; the KB stores no copy of the selection (no collection or field holds it).
3. `jid` and `personId` validated before the call; a jid not in the owner's `listGroups` is 404.
4. Each change writes one `selection.changed` event carrying counts only; payload test (R-39).
5. With the archiver API down: 503 `archiver_api_unavailable`, no partial local state.
6. Idempotent: marking an already-marked group changes nothing and returns 200.

**W7 wa-isolation-read-side.** Dual-trigger: tenancy and raw-content read authorization.
1. Two owners in one tenant: A's session gets A's sessions and review candidates and 404 for B's raw
   session id; an admin sees both; an admin read of B's raw content writes an audit event.
2. A viewer and a non-owner member get 404/403 on raw WhatsApp sessions, turns and candidates, and
   still get approved claims through Search/Ask (Q2=2a); never raw turns of an unapproved candidate;
   never any content from tenant B.
3. ISS-API-003: the ledger's recorded reproductions re-run verbatim; report `ISS-API-003: n/n`
   refused to echo raw upstream text; the 502 body is `{error, code, linkId}` only.
4. Cross-owner duplicate: the same message captured by A and B yields one candidate flagged
   `duplicate` with a pointer, neither auto-merged nor dropped.
5. Legacy links are admin-only to read.
6. Adversarial: guessing a candidate id from another owner, replaying an approve with a swapped
   tenant header or body, sending `groupJid` of another owner, using a Bearer key without
   `whatsapp-admin` against a non-legacy link; all fail without side effects.

**W8 wa-unlink-consent.** Dual-trigger: consent withdrawal, data state transitions.
1. Unlink: sync for the link stops within one scheduler cycle; pending candidates move to quarantine;
   each owned source goes through the consent-withdraw CAS; a racing approval loses (existing
   `consent-race` fixtures extended with the unlink path); the archiver `unlinkSession` step is
   invoked, and when the archiver is down the KB state is already `unlinked` and the step is retried.
2. Repeating unlink returns 200 and changes nothing (idempotent), including the archiver step.
3. Approved claims remain with owner recorded (Q6=6a); an admin purge is out of this unit and is named
   in the manifest as an open gap, not hidden.
4. Account coupling: disabling or demoting the owner suspends their links (R-10) and re-enabling does
   not resume them; logging out/session expiry has no effect on the link (test).
5. ISS-W6-001: the ledger repro is re-run; `withdrawWhatsAppSourceConsent` now has a non-test caller.
6. Real-Mongo concurrent test (unlink vs approve vs sync) passes and is in the evidence.

**W9 wa-sync-scheduler.** Dual-trigger: data writes into tenant collections, lock correctness.
1. Fake clock: ticks at the configured cadence (clamped 5..1440 min); an active link syncs, a
   suspended/unlinked/requested/approved one never does; unmarked groups are never listed.
2. Two instances: the second refuses via the lock and records `skipped`; stale-lock handling follows t038.
3. Link A failing (`archive_unreachable`) does not stop link B; both have a `whatsapp_sync_runs` row
   with a closed-list `errorCode`; no upstream free text is stored.
4. Re-run with no new messages: zero new turns and candidates (idempotency proven by counts).
5. Per-group size/time cap yields `partial`, not a hang.
6. Status poll updates `health.lastStatus`; `logged_out` sets `needs-relink` and raises one admin alert.
7. Pending archiver `unlinkSession` retries from W8 are driven here and stop once confirmed.

**W10 wa-links-web.** Dual-trigger: renders the QR secret and owner-only controls.
1. Persona walks T1, T2, T3, T5 in a real browser against the fake archiver: T1 requests, sees
   `requested`; T2 approves; T1 opens connect, QR renders and refreshes, then `connected` flips the
   link to `active`; T1 marks a group and a person; T1 sees health; T1 unlinks; every interaction is
   asserted by state change, not by rendering; console error count 0 per page.
2. T1 sees only their own link; T2 sees all; a viewer/T5 sees a read-only page or the empty state,
   never QR or marking controls; an admin never sees the connect page for another person's link.
3. The page works under a non-root base path (decision 1b): no absolute `/whatsapp` hrefs
   (`noRootAbsoluteHrefs.test.ts` still passes).
4. The QR is held in memory only, never in storage, URL, or logs; polling stops on unmount and on
   `connected`; leaving the page discards it.
5. Tracking screens show no message text (R-22); the short notice and its version are displayed.
6. Failure states render: 503 `archiver_api_unavailable`, `needs-relink`, `liveness unknown`, expired
   approval (14 days).

**W11 wa-student-data-gate.** Dual-trigger: hard rule on student/applicant data egress.
1. Deliverable A (read-only, human gate): a table of every call site that sends WhatsApp-derived text
   to an external service (answer generation, embeddings, rerank, any export), with file:line. Umesh
   approves the table before deliverable B starts.
2. Deliverable B: for a link with `studentData` `yes` or `unknown`, derived claims never reach any
   call site in the table; a test per call site proves exclusion; for `no`, normal paths unchanged.
3. An admin per-use approval record is required to lift the exclusion; absence blocks.
4. No claim of "verified safe" without the checker re-running the survey independently.
5. The default for a new link follows the answer to Q-W1 and is asserted by a test.

**W12 wa-events-feed.** Dual-trigger: runs inside consent and auth transitions.
1. Each event type in R-38 is emitted exactly once per transition, with ids/counts/codes only; a
   payload test fails if any field matches a message text, group subject, jid, name, phone, QR data
   or archiver owner id.
2. `GET /whatsapp/events` is cursor-paged, at-least-once, scoped to `whatsapp-admin`; replay from a
   cursor returns identical ids; a member session is refused.
3. No consumer registry, webhook or outbound call exists (grep-asserted in the test).
4. `docs/whatsapp/events.md` states the payload contract and the R-41 hard line.

**W13 wa-deploy-ops** (documented, performed by humans).
Checklist with evidence slots: archiver container up with persistent `sessions/` and `media/`
volumes; archiver Mongo not reachable from the internet (port scan evidence from outside); read-only
Mongo user for the KB and a failed-write probe (R-43); archiver UI not public; **service listener
reachable only from the app host** (probe from another host fails) with TLS or a private tunnel; the
service token set on both sides and rotated once as a drill; `INVITE_CODE` set on the archiver;
`lkb_prod` replica set verified; backup of `sessions/` scheduled and a restore tested (losing it
means every person re-scans).

**W14 wa-live-proof.**
Two real numbers (two people, two KB accounts). Evidence: both approved and connected inside the KB
with no archiver UI visit; each sees only their own groups; cross-read attempts refused; each marks
one group and one is captured, an unmarked one is not; one scheduled sync visible in run history; one
candidate approved and surfacing in Ask with a citation (student-data default respected); the link
survives a KB logout, a KB API restart and an archiver restart; one number unlinked and its capture
stopped, verified by a new message not appearing; the event feed shows the sequence. The checker is
fresh and does not receive the maker's reasoning.

## Order and waves

```
User-accounts A1..A4, A6 (docs/features/user-accounts/plan.md) run first.
G-1..G-3 (go-live)  ->  Wave 1: W1  ||  W2a (docs)             [no auth code; may overlap user-accounts]
                         Wave 2: W2b (archiver repo)  ||  W3  ||  W4  (W4 needs A3)
                         Wave 3: W5                              (needs W3, W4, A4, A6)
                         Wave 4: W6  ||  W7  ||  W9              (disjoint files)
                         Wave 5: W8  ||  W10  ||  W11(A)         then W11(B), W12 after W8/W7/W9
                         Wave 6: W13 (human host work) -> W14 (live proof)
```

Only these edges are real; everything else runs in parallel:

- W1 -> W4, W9: they read the link collection.
- W2a -> W2b, W3: the contract is the interface between repos; implementation of W2b is not needed
  for W3 because the fake implements the same contract.
- W3 -> W5, W9: both call the archiver client.
- W4 -> W5, W7, W9: they consume the owner-set resolver; W4 -> W7 on `store.ts` (same file, one owner).
- W5 -> W6: the selection router stub and the link service exist; W6 edits only its own files.
- W5 -> W8, W8 -> W12 on `links/service.ts` (same file, sequential); W7 -> W12 on `review/router.ts`.
- W5, W6, W7 and user-accounts A7 -> W10.
- W2b gates the *live* parts of W10/W14; the KB degrades with 503 `archiver_api_unavailable` until it lands.
- W11 deliverable A can start once W5 defines `studentData`; deliverable B waits on the human gate and Q-W1.

## Open questions

**Q-W1. Without an attestation, what is a link's student-data default, and who sets it?** (blocks W11
only; every other unit proceeds)
The old design took `studentData` from the person's attestation. Answer 4c removes the attestation,
but the hard rule (no student/applicant data to an external service without per-use approval) still
binds, and Umesh's acceptance of the archiving privacy risk does not cover that egress.
- (a) The admin classifies each link when approving it; default `unknown`, which excludes the link's
  derived claims from every external-model path (answer generation, external embeddings, export)
  until the admin sets `no` or records a per-use approval. **Recommended.** Cost: WhatsApp knowledge
  does not feed external AI answers until an admin classifies the link.
- (b) A tenant-wide default `no`: WhatsApp knowledge flows to external AI paths immediately. Fastest;
  Umesh accepts that student or applicant data inside tracked groups may reach an external service,
  which the user-level rule says needs explicit per-use approval.
- (c) Always excluded: WhatsApp-derived claims never reach external AI paths in v1. Safest; Ask can
  quote them only when answered by a path that stays inside the tenant.
Recommendation: (a). (The two other open questions of this feature set, mail sender and signup domain
restriction, are in `docs/features/user-accounts/plan.md`.)

## Human-provided items (nothing here is available to the maker)

| # | Item | Needed by | Notes |
|---|---|---|---|
| H-1 | Answer to Q-W1 | before W11 | |
| H-2 | Plan approval at `qa/gates/plan-approved-whatsapp-multiuser.md`, including permission for the **NEW** files above, and confirmation of the two readings in `intent.md` (admin approval is per link; KB provisions the archiver owner) | before W1 | |
| H-3 | Schema approval for the three new collections; retention numbers (180 d runs, events life + 1 y); 14-day approval expiry | before W1 | Schema-yes units need their own approval line. |
| H-4 | Self-approval rule when Umesh is the only admin (allowed with a recorded requester and approver, or a second admin required) | before W5 | |
| H-5 | DECISIONS entries via `scripts/append_decision.ps1`: (i) links bind to a user and replace the env map; (ii) **KB controls the archiver only through a service API; the archiver owns capture selection; the KB has no write credential to its DB** (supersedes the read-only-over-Mongo-only stance and the never-chosen 5b); (iii) **Umesh accepted the archiving privacy risk and the unofficial-client ban risk on behalf of linked people, no attestation (4c)**; (iv) student-data rule (per Q-W1); (v) event feed boundary. Entries touching the enforcement path carry `Approved-by: Umesh` | before W3/W4/W5/W11/W12 | |
| H-6 | Archiver-repo approval: its own D-entry for W2b and the later submodule pin bump here | W2b | Different repo, different Approver check. |
| H-7 | Archiver hosting: Ubuntu host (accepted default), Docker, persistent volumes, TLS or private tunnel for the **service listener**, firewall so only the app host reaches it, `INVITE_CODE`, the read-only Mongo user and its connection string, and `WHATSAPP_ARCHIVER_API_TOKEN` (generated by DevOps, in both server `.env` files, never in chat or this repo) | W13 | |
| H-8 | Domain, cookie and proxy settings for sessions (owned by `user-accounts` H-7) | W10, W14 | |
| H-9 | Dependency approval for a QR rendering library in `apps/web` (exact pin), or acceptance that the archiver returns a ready image | W10 | [ASSUMPTION] a vetted small library; decision recorded. |
| H-10 | Student-data classification per link (admin action at approval), approval of the call-site table (W11 A), and any per-use egress approval | W11 | Hard rule. |
| H-11 | `docker-compose.yml` and `.env.example` env forwards for the new names are enforcement-path-adjacent: `Approved-by` where required | W3, W13 | |
| H-12 | Decide who may purge approved claims on unlink (admin only, per 6a) and whether a purge unit is wanted later | after W8 | Out of scope otherwise. |
| H-13 | Confirmation that the existing Telegram alert channel may carry admin-only link alerts | W9, W12 | |
| H-14 | The first people (KB accounts) who will link, and their phones for W14; each is a person with a WhatsApp account in good standing | W14 | [ASSUMPTION] N <= 10 at launch. |
| H-15 | Provider account: **none required** (Baileys is unofficial; no key). The mail sender for accounts is in `user-accounts` H-1 | n/a | |

## Risks the plan carries openly

- **Isolation by convention is the failure to avoid.** Raw WhatsApp text is the most sensitive data
  in the KB. W7 is the largest read-side risk; its adversarial checker starts from "assume the
  resolver is wrong" and tries cross-owner and cross-tenant reads through every route that can return
  a session, turn, candidate or source.
- **The QR is a capture credential.** If the wrong person can fetch it, the wrong phone is archived
  under someone's link. W5/W10 gate it to the owner session only; this is the new attack surface of
  answer 3b and gets the adversarial brief.
- **KB-driven selection crosses a boundary that used to be one-way.** Mitigated by the archiver
  owning the state, a narrow closed API, no write credential, a fake-backed contract, and a DECISIONS
  entry; the residual risk is a compromised service token (rotated by the operator, source-IP
  restricted).
- **Dependence on the archiver repo.** W2b is implemented under another repo's governance and needs a
  pin bump; until then live screens degrade (503) and only the fake proves behaviour. Nothing here
  is allowed to claim the archiver side is verified from the fake.
- **No attestation.** Group members' messages are archived on Umesh's acceptance (4c); the controls
  left are the notice, admin approval, owner-and-admin visibility and unlink. Recorded, not hidden.
- **Unofficial client.** Account bans are outside our control; the plan makes them visible and
  recoverable (`needs-relink`, session backup) rather than preventable.
- **Auth is a hard dependency.** A defect in `user-accounts` becomes a WhatsApp privacy defect;
  W-units that need a principal wait for A3/A4/A6, and the final proof (W14) re-verifies isolation
  with real logins.
- **go-live overlap.** The same files carry open go-live items; the sequencing section is the
  mitigation. If go-live slips, this feature waits; it never merges ahead of gap items 4 and 5.
