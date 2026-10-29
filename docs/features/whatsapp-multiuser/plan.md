# Plan - whatsapp-multiuser

**Status:** DRAFT, awaiting the mini-grill answers (`intent.md`) and then
`qa/gates/plan-approved-whatsapp-multiuser.md`. No unit below is buildable before that.
**Derived from:** `spec.md` (requirement ids R-n). Written against the recommended answers; the
"Answer sensitivity" table in `spec.md` says what moves if an answer differs.
**Backlog tier:** roadmap feature work (CLAUDE.md "Backlog priority override", tier 3) - but see
"Sequencing against go-live", which has to run first.
Every unstated input is **[ASSUMPTION]**.

## Conventions

- **Tier** is the criticality in the severity gate: `H` = high (tenancy, auth, consent, data
  write, or student data), `M` = medium, `L` = low.
- **Dual-check trigger** = two independent checkers, at least one adversarial about tenancy bypass
  (cross-person and cross-tenant reads, scope escalation, id guessing). Required for every unit
  that touches tenancy, auth, consent withdrawal or the student-data rule. Other units that write
  data get the full single-checker ceremony (manifest, verdict, contract, close-out). The
  adversarial hunt output is **filed**, not auto-promoted into another round, except security-class
  findings, which are never capped (D-014).
- **Edit in place.** Every file named is edited where it exists. Files marked **NEW** do not exist;
  approving this plan is permission for exactly those files and no others.
- **Fix measurement** (D-015): units that close a filed issue (U4: ISS-API-003; U5: ISS-W6-001)
  re-run that issue's recorded reproductions verbatim from `qa/issues.api.jsonl` /
  `qa/issues.w6.jsonl` and report the count by issue id.
- **Mutation runs** by checkers follow the per-mutation trap and HEAD-fidelity rules in CLAUDE.md
  (D-020 and the 2026-09-28 amendment); prefer `scripts/lib/mutate.mjs`.
- **Real-Mongo proofs.** Uniqueness, CAS and transaction behaviour cannot be shown with fakes. Those
  tests need a replica-set Mongo reachable via the existing opt-in env
  (`WA_REVIEW_TEST_MONGO_URL`, `LKB_WHATSAPP_CONSENT_MONGO_*`); they are skipped by default today
  (gap 9), so every unit below that depends on them states a real-Mongo run in its acceptance.
  Work DB only; never production.

## Sequencing against go-live (U0, not built by this plan)

These are single-owner launch items from `docs/WHATSAPP-GOLIVE-GAP.md`. This feature builds on
them and touches the same files, so they land first; this plan does not redo them.

| Dep | Gap item | Why this feature needs it |
|---|---|---|
| G-1 | Merge 83c7b50e (honest `not_configured` 503) into master (gap 4) | U2/U3 edit `store.ts` and `routes/whatsapp.ts` as changed there. |
| G-2 | Compose forwards `WHATSAPP_*` to the api container (gap 1) | U2 still reads `WHATSAPP_MONGO_*`. |
| G-3 | `lkb_prod` as one-node replica set (gap 5) | Review store/decide need transactions; scheduled sync would otherwise fail every cycle. |
| G-4 | Archiver deployed on Ubuntu with its Mongo isolated (gaps 2-3) | The transport. Owned by DevOps (U11). |
| G-5 | `w6-consent-cas` checked-PASS (commit 77ba22d8, on this branch) | U5 builds on the CAS writer. Confirm merged to master before U5. |

## Units

File ownership is exclusive per wave; two units never edit one file in the same wave.

| # | Unit | Files (edit in place; **NEW** marked) | Req | Tier | Dual | Depends |
|---|---|---|---|---|---|---|
| U1 | `wa-links-schema` | **NEW** `schema/whatsapp_links.schema.json`, **NEW** `schema/whatsapp_sync_runs.schema.json`, **NEW** `schema/whatsapp_events.schema.json`; **NEW** `packages/db/src/collections/whatsapp-links.ts` (+ test); **NEW** migration in the repo migrations folder creating collections and the unique partial index (name per `scripts/lint-migrations.mjs` convention); `packages/db/src/collections/index` export line | R-4, R-16, R-19, R-23 | H | yes | G-1 |
| U2 | `wa-owner-resolver` | `apps/api/src/whatsapp/owner-config.ts` (add link-backed resolver returning a set; keep env-map parsing as boot seed, `:25-26` rule retained only for the seed), `apps/api/src/whatsapp/store.ts` (`ownerFor` -> permitted owner set; `listGroups`/`ingestGroup` take it; group lookup stays `groupJid && owner`), wiring at `apps/api/src/composition/production.ts:220` and `composition/integrations/knowledge.ts:68`, their existing tests (`owner-config.test.ts`, `store-isolation.test.ts`, `route-tenant.test.ts`) | R-11, R-12 | H | yes | U1 |
| U3 | `wa-links-api` | **NEW** `apps/api/src/whatsapp/links/{router,service,attestation}.ts` + tests; mount line in `apps/api/src/composition/integrations/routes.ts:69` and `apps/api/src/server.ts`; `scripts/mint-key.mjs` (add `whatsapp-link`, `whatsapp-admin` scope names, no automatic grant); attestation text as one **NEW** `docs/whatsapp/attestation.md` read at build time (version = file hash) | R-1..R-9, R-35, R-36 | H | yes | U2 |
| U4 | `wa-isolation-read-side` | `apps/api/src/routes/whatsapp.ts` (narrowing, `linkId`, stable 502 code: ISS-API-003), `apps/api/src/whatsapp/review/router.ts` (owner-or-admin authority, link id on actor), `apps/api/src/whatsapp/review/detection.ts` (verify or add cross-owner duplicate flag), `apps/api/src/visibility/knowledge.ts` and the session read path behind `GET /sessions/:id` (owner-or-admin for WhatsApp sessions), `sourceMeta.whatsappLinkId` stamped in `store.ts` ingest | R-10, R-12..R-15, R-17 | H | yes | U2 |
| U5 | `wa-unlink-consent` | `apps/api/src/whatsapp/links/service.ts` (unlink/revoke orchestration, owned after U3 closes), `apps/api/src/whatsapp/review/quarantine.ts` and `review/store.ts` only for a link-scoped quarantine entry point, call to `withdrawWhatsAppSourceConsent` | R-7, R-8, R-38 | H | yes | U3, U4, G-5 |
| U6 | `wa-sync-scheduler` | **NEW** `scripts/whatsapp/sync-links.mjs` (+ test, follows the token-owned lock protocol of `docs/t038-scheduler-service.md`), reads active links, calls the same `ingestGroup` composition, writes `whatsapp_sync_runs`; **NEW** `docs/whatsapp/sync.md` (operator notes) | R-18, R-19, R-21 (error codes) | H | yes | U1, U2 |
| U7 | `wa-archiver-status-heartbeat` | **In `sources/whatsapp_msg`, its own repo and governance:** `src/wa/sessionManager.ts` (emit status change), `src/db/mongo.ts` + `src/db/types.ts` (add `wa_session_status` with index), `src/index.ts` wiring; its own `docs/DECISIONS.md` entry first, its own tests (it has 35). Then, in this repo, a **separate human-approved** submodule pin bump | R-20, R-27 | M | no (archiver's own check) | none |
| U8 | `wa-links-web` | **NEW** `apps/web/src/pages/whatsapp-links/{LinksPage,NewLinkPage,LinkDetailPage}.tsx` + tests; **NEW** `apps/web/src/api/whatsapp-links.ts`; `apps/web/src/App.tsx` (routes near `:111`, nav entry), `apps/web/src/pages/WhatsAppPage.tsx` (link filter); also `/whatsapp/activity` | outcomes 1, 4; R-22 | M | no | U3, U4 |
| U9 | `wa-student-data-gate` | The exact external-model call sites found by a read-only survey first (deliverable of this unit, human-reviewed before any edit): expected under `apps/api/src/answer-policy/`, `apps/api/src/ask/`, `apps/api/src/indexing/` and the embeddings path; `studentDataFlag` carried through claim materialiser `whatsapp/review/materializer.ts` | R-32 | H | yes | U3, U4; **human gate on the call-site list** |
| U10 | `wa-events-feed` | `apps/api/src/whatsapp/links/service.ts` event writer (after U5), `apps/api/src/whatsapp/review/router.ts` decision event (after U4), U6 script run events, **NEW** `apps/api/src/whatsapp/links/events-router.ts`; `docs/whatsapp/events.md` (payload contract, R-29) | R-16, R-28..R-31 | M | no (full single-checker ceremony; payload test asserts no text/names/ids of archiver) | U4, U5, U6 |
| U11 | `wa-deploy-ops` | Docs only by the maker: `docs/DEVOPS-HANDOVER.md` WhatsApp section, `docs/whatsapp/SETUP.md` (replace single-owner steps with link flow), `docker-compose.yml` (api env forward is G-2; archiver service block is DevOps-owned, enforcement path - needs `Approved-by`). Human/DevOps performs the host work | R-26 | M | no | G-3, G-4 |
| U12 | `wa-live-proof` | No code. Supervised run with two real numbers, evidence pasted; checker runs Mode D | outcomes 1..6 | H | independent fresh checker, not the maker | all |

### Per-unit acceptance

**U1 wa-links-schema.**
1. The three schemas validate samples for every state in R-states and reject: missing `tenantId`,
   unknown fields, a non-24-hex `archiverUserId`, a link with `active` but no `activatedBy`.
2. A real-Mongo test proves the unique partial index: a second non-terminal link for the same
   `archiverUserId` is rejected even with a different tenant and different `keyId` (R-4); a
   terminal link does not block a new one.
3. `scopedCollection` accessors reject a missing/invalid tenant (`assertValidTenantId`); a cross-tenant
   `findOne` by id returns null.
4. `whatsapp_events` exposes insert and read only; a test asserts no update/delete helper exists.
5. Migration applies and re-applies idempotently on the work DB and passes `lint-migrations`.

**U2 wa-owner-resolver.**
1. With two active links in tenant T (owners A, B) a `whatsapp`-scope call lists groups for both
   owners, each group carrying its owner; no group of owner C (other tenant) appears.
2. `ingestGroup(T, jid)` for a jid tracked only by A resolves A; for a jid tracked by both, it
   requires `linkId` (else 409 `ambiguous_link`); for a jid tracked only by C, 404 as if absent.
3. Seed behaviour: with only the env map set and no link rows, first boot creates one `active`
   link per map entry and logs it; second boot creates nothing; an env map that disagrees with
   existing links is ignored with a warning (R-11). Invalid map still fails boot as today.
4. No link and no map -> `not_configured` exactly as today (existing tests keep passing unmodified).
5. Existing `store-isolation.test.ts` and `route-tenant.test.ts` pass; a new cross-owner test shows
   A's Mongo queries never carry B's `ownerUserId`.

**U3 wa-links-api.**
1. Request without all three attestation parts -> 400; with an unknown body field -> 400; tenant
   in body ignored (tenant always from key).
2. `whatsapp-link` key can read and unlink only its own links (others 404, indistinguishable from
   nonexistent); cannot activate, suspend or revoke (403); cannot grant itself any scope.
3. `whatsapp-admin` key can activate, suspend, resume, revoke, list all in tenant; a key from
   tenant B gets 404 on tenant A ids.
4. Self-approval: a key holding both scopes activating its own link is refused unless the admin
   path is used by a different key. [ASSUMPTION] at launch Umesh is the only admin and also a
   linking person, so the chosen rule is "an admin may activate their own link; the event records
   requester and activator key ids". The test pins whichever rule Umesh confirms at plan approval.
5. Duplicate request for an in-use `archiverUserId` -> 409 without revealing whose it is.
6. Every transition writes exactly one event (U10 writer stubbed here, asserted by count).
7. Real-Mongo: concurrent activate+unlink of one link ends in a single consistent terminal state.

**U4 wa-isolation-read-side.**
1. Two owners in one tenant: key of A gets A's sessions and review candidates, 404 for B's raw
   session id, and `GET /whatsapp/groups` shows only A's; admin sees both; admin read of B's raw
   content writes an audit event.
2. Search/Ask return approved claims from both owners to any tenant key (Q2a), never raw turns of
   an unapproved candidate, and never any content from tenant B.
3. ISS-API-003: the ledger's recorded reproductions re-run verbatim; report `ISS-API-003: n/n`
   refused to echo raw upstream text; 502 body is `{error, code, linkId}` only.
4. Cross-owner duplicate: the same message captured by A and B yields one candidate flagged
   `duplicate` with pointer, neither auto-merged nor dropped.
5. Adversarial: guessing a candidate id from another owner, replaying an approve with a swapped
   tenant header or body, and sending `groupJid` of another owner all fail without side effects.

**U5 wa-unlink-consent.**
1. Unlink: sync for that link stops within one scheduler cycle; pending candidates move to
   quarantine; each owned source goes through the consent-withdraw CAS; a racing approval loses (use
   the existing `consent-race` fixtures, extended with the unlink path).
2. Repeating unlink returns 200 and changes nothing (idempotent).
3. Approved claims remain with owner recorded (Q6a); admin purge is out of this unit and named in
   the unit's manifest as an open gap, not hidden.
4. ISS-W6-001: the ledger repro re-run; `withdrawWhatsAppSourceConsent` now has a non-test caller.
5. Real-Mongo concurrent test per R-7 passes and is included in the evidence.

**U6 wa-sync-scheduler.**
1. Fake clock: ticks at the configured cadence (clamped 5..1440 min); an active link syncs, a
   suspended/unlinked/requested one never does.
2. Two instances: second refuses via the lock and records `skipped`; stale-lock handling follows t038.
3. Link A failing (`archive_unreachable`) does not stop link B; both have a `whatsapp_sync_runs`
   row with a closed-list `errorCode`; no upstream free text is stored.
4. Re-run with no new messages: zero new turns, zero new candidates (idempotency proven by counts).
5. Per-group size/time cap yields `partial`, not a hang.

**U7 wa-archiver-status-heartbeat** (in the archiver repo; its own acceptance).
1. A status transition (`connecting -> awaiting_qr -> connected -> logged_out`) upserts one row per
   user in `wa_session_status` with `updatedAt`; no QR data, no tokens in the row.
2. Archiver's existing 35 tests plus new tests pass; typecheck passes; its D-entry exists first.
3. A load note: N=10 simulated users reconnect after a restart without a thundering herd beyond the
   existing backoff; recorded in its decisions log.
4. KB pin bump is a separate step, human-approved.

**U8 wa-links-web.**
1. Persona walks T1, T2, T3 in a real browser: T1 requests a link and sees `requested`; T2
   activates; T1 sees `active` and health; T1 unlinks; every interaction asserted by its state
   change, not by rendering; console error count 0 per page.
2. T1 sees only their links; T2 sees all; a T4-only key gets the gate/empty state, not link data.
3. The page works under a non-root base path (decision 1b): the base is read from the existing
   configurable base mechanism, no absolute `/whatsapp` hrefs in new code.
4. Tracking screens show no message text (R-22); the attestation text and version are displayed.
5. Failure states render: 503 `not_configured`, `needs-relink`, `liveness unknown`.

**U9 wa-student-data-gate.**
1. Deliverable A (read-only, human gate): a table of every call site that sends WhatsApp-derived
   text to an external service (answer generation, embeddings, rerank, any export), with file:line.
   Umesh approves the table before deliverable B starts.
2. Deliverable B: for a link with `studentData` of `yes` or `unknown`, derived claims never reach
   any call site in the table; test per call site proves exclusion; for `no`, normal paths unchanged.
3. An admin per-use approval record is required to lift the exclusion; absence blocks.
4. No claim of "verified safe" without the checker re-running the survey independently.

**U10 wa-events-feed.**
1. Each event type in R-28 is emitted exactly once per transition, with ids/counts/codes only; a
   payload test fails if any field matches a message text, group subject, name, phone or archiver id.
2. `GET /whatsapp/events` is cursor-paged, at-least-once, scoped to `whatsapp-admin`; replay from a
   cursor returns identical ids.
3. No consumer registry, webhook or outbound call exists (grep-asserted in the test).
4. `docs/whatsapp/events.md` states the payload contract and the R-31 hard line.

**U11 wa-deploy-ops** (documented, performed by humans).
Checklist with evidence slots: archiver container up with persistent `sessions/` and `media/`
volumes; archiver Mongo not reachable from the internet (port scan evidence from outside);
read-only Mongo user for the KB and a failed-write probe; `INVITE_CODE` set; archiver UI behind
VPN/allowlist with TLS and `secure` cookies; `lkb_prod` replica set verified; backup of `sessions/`
scheduled and a restore tested (losing it means every person re-scans).

**U12 wa-live-proof.**
Two real numbers (two people). Evidence: both linked and activated; each sees only their own
groups; cross-read attempts refused; one scheduled sync visible in run history; one candidate
approved and surfacing in Ask with a citation; one number unlinked and its capture stopped,
verified by a new message not appearing; event feed shows the sequence. Checker is fresh and does
not receive the maker's reasoning.

## Order and waves

```
G-1..G-3 (go-live)  ->  Wave 1: U1  ||  U7 (archiver repo)  ||  U11 prep (docs)
                         Wave 2: U2
                         Wave 3: U3  ||  U4  ||  U6          (disjoint files; see below)
                         Wave 4: U5  ||  U8  ||  U9(A)       then U9(B), U10 after U5/U4/U6
                         Wave 5: U11 (human host work) -> U12 (live proof)
```

Only these edges are real; everything else runs in parallel:

- U1 -> U2: U2 reads the link collection.
- U2 -> U3, U4, U6: they consume the owner-set resolver.
- U2 -> U4 on `store.ts`: same file, so U4 starts after U2 closes (one owner).
- U4 -> U10 on `review/router.ts`: same file, sequential.
- U3 -> U5 on `links/service.ts`: same file, sequential.
- U5 -> U10 on `links/service.ts`: sequential.
- U3 and U4 do not share a file (`routes.ts` mount is U3 only; `routes/whatsapp.ts` is U4 only).
- U7 is independent but gates the liveness part of U8/U12; U8 ships without it showing
  "liveness unknown" (R-20).
- U9 deliverable A can start as soon as U3 defines `studentData`; deliverable B waits on the human gate.

## Human-provided items (nothing here is available to the maker)

| # | Item | Needed by | Notes |
|---|---|---|---|
| H-1 | Answers to the six mini-grill questions | before any unit | `intent.md`. |
| H-2 | Plan approval at `qa/gates/plan-approved-whatsapp-multiuser.md`, including permission for the **NEW** files above | before U1 | |
| H-3 | Schema approval for the three new collections, retention numbers (180 d runs, events life+1 y), 14-day request expiry | before U1 | Schema-yes units need their own approval line. |
| H-4 | DECISIONS entries via `scripts/append_decision.ps1`: links as authority replacing the env map; new scopes; event feed boundary; student-data rule | before U2/U3/U9/U10 | Entries touching the enforcement path carry `Approved-by: Umesh`. |
| H-5 | Provider account: **none required** (Baileys is unofficial and needs no account or key). The human items are each person's own phone, a WhatsApp account in good standing, and their own acceptance of ban risk | U12 | |
| H-6 | Archiver hosting: Ubuntu host (accepted default), Docker, persistent volumes, TLS or VPN for its UI, firewall to the app host, `INVITE_CODE`, a read-only Mongo user and its connection string | U11 | Values go to server `.env` by DevOps; never to chat or this repo. |
| H-7 | Archiver userId of the first admin, verified per `docs/whatsapp/SETUP.md` step 3, and the list of the first N people | U2 seed, U12 | [ASSUMPTION] N <= 10. |
| H-8 | Minting `whatsapp-link` / `whatsapp-admin` keys for named people | U12 | Admin tool run by Umesh. |
| H-9 | Archiver-repo approval: its own D-entry for U7 and the submodule pin bump here | U7 | Different repo, different Approver check. |
| H-10 | Student-data classification per link, approval of the call-site table (U9-A), and any per-use egress approval | U9 | Hard rule. |
| H-11 | Decide who may purge approved claims on unlink (admin only, per Q6a) and whether a purge unit is wanted later | after U5 | Out of scope otherwise. |
| H-12 | Confirmation that the existing Telegram alert channel may carry admin-only link alerts (R-21) | U6/U10 | |

## Risks the plan carries openly

- **Isolation by convention is the failure to avoid.** Raw WhatsApp text is the most sensitive data
  in the KB. U4 is the largest risk; its adversarial checker brief starts from "assume the
  resolver is wrong" and tries cross-owner and cross-tenant reads through every route that can
  return a session, turn, candidate or source.
- **KB identity is an API key.** If a key is shared or leaked, that person's link is exposed; Q1b
  (real accounts) is the real fix and is deliberately out of scope. A revoked key must disable the
  link's owner-side powers at once (verify in U3; `keyId` is optional in `VerifiedKey`, so U3
  must handle a key without one by refusing link actions).
- **Unofficial client.** Account bans are outside our control; the plan makes them visible and
  recoverable (`needs-relink`, session backup) rather than preventable.
- **Cross-repo coupling.** U7 changes a separately governed repo and depends on a pin bump; the KB
  must degrade (R-20) when the archiver is older.
- **go-live overlap.** The same files carry open go-live items; the sequencing section is the
  mitigation. If go-live slips, this feature waits; it never merges ahead of gap items 4 and 5.
