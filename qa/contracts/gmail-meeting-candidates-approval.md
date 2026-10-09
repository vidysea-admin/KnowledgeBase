# Contract — gmail-meeting-candidates-approval

> The follow-up unit disclosed as out-of-scope in `qa/contracts/web-sessions-calendar-brain-
> richness.md`. Umesh's own answer when asked to scope the Gmail half of his ask: "gmail meeting
> but i will approve first and also like those i will approve like these meeting is realted to
> knowlegebase from next time related to it will be auto confirmed or after 2-3 times." Read as:
> scan Gmail for meeting-shaped mail → hold each as a pending candidate → a human approves or
> rejects → once a sender has earned 3 manual approvals, its future candidates auto-confirm.
> Threshold of 3 chosen from "2-3 times", the higher/safer end. Drafted by the maker; /checker
> adopts or amends on first check.

## Real credential source reused (not new)

Same `gws` CLI as the calendar unit — already OAuth'd as `umeshsugara@vidysea.com` with
`gmail.readonly` among its granted scopes. No new OAuth flow.

## Criteria (each machine-checkable)

1. **Schema** — `schema/meeting_candidates.schema.json` (one row per real Gmail message, deduped
   by `messageId`, `status ∈ {pending, approved, rejected, auto_approved}`) and
   `schema/trusted_senders.schema.json` (`senderDomain`, `approvalCount`, `autoApprove`). Both
   have `fixtures/<name>/{valid,invalid}.json` and pass `python schema/validate.py`. Both added to
   `schema/index.json` with tenant-led indexes (`meeting_candidates`: unique `tenantId+messageId`;
   `trusted_senders`: unique `tenantId+senderDomain`).
2. **Migration** — `migrations/20260904120000-meeting-candidates.cjs`, its own file (not folded
   into baseline) per ARCHITECTURE §4's "one file, one change". Idempotent, applied for real
   against the live Mongo (`npx migrate-mongo up`).
3. **Real infra bug found and fixed while applying the migration (disclosed):** neither migration
   file could actually run — `migrate-mongo`'s default `.js` extension collided with the repo
   root's `"type": "module"` `package.json`, so Node loaded them as ESM and `require()` inside
   threw. Both existing migration files renamed `.js` → `.cjs` and
   `migrate-mongo-config.cjs`'s `migrationFileExtension` updated to match — a real, necessary,
   minimal fix (not scope creep) since this unit's own migration needed to run.
4. **`packages/db/src/collections/meeting-candidates.ts`** — `createIfNew` (dedup by
   `messageId`), `listPending`, `listAll`, `decide`. **`trusted-senders.ts`** — `get`,
   `recordApproval` (increments `approvalCount`, flips `autoApprove` true at
   `AUTO_APPROVE_THRESHOLD = 3`, never flips it back off). Both exported from `@lkb/db`.
5. **`apps/api/src/gws-gmail.ts`** — `scanGmailForMeetingCandidates()`: a real, server-side
   Gmail search (`q: "newer_than:14d (meet.google.com OR zoom.us OR teams.microsoft.com)"`), then
   ~~`format=metadata` fetch per match (Subject/From only, never full body)~~ **superseded 2026-09-25
   by Amendment 1 below — `format=full`, body read.** `meetingUrl` extracted ONLY when a literal URL
   substring matches one of the three hosts ~~in the message snippet~~ **in the decoded body text
   (falling back to the snippet) — see Amendment 1** — never fabricated when absent. Never throws
   (same failure contract as `gws-calendar.ts`).
6. **`apps/api/src/routes/meeting-candidates.ts`** — `POST /gmail/scan`, `GET
   /meeting-candidates`, `POST /meeting-candidates/:id/approve`, `POST
   /meeting-candidates/:id/reject`, all `requireScope("gmail")`. `scanGmail`'s real deps
   composition (`store.ts`'s `createMeetingCandidatesDeps`) checks `trusted_senders` per
   candidate BEFORE inserting — an already-trusted sender's candidate is filed straight in as
   `auto_approved`, never sitting in the pending queue. Wired into `server.ts`/`production.ts`/
   `fixtures.ts` (new `"gmail"` scope in `scripts/seed-demo-server.mjs` and
   `apps/api/src/routes/pages.ts`'s `REAL_ROUTES`).
7. **`apps/web`** — `api/meeting-candidates.ts` (4 calls), `CalendarPage.tsx` gets a "Needs
   review (from Gmail)" section: a "Scan Gmail" button, a list of pending candidates
   (subject/sender/meeting-URL-if-present) each with real Approve/Reject buttons wired to the
   real endpoints, and a one-line explanation of the 3-approval auto-confirm rule.
8. **No regression.** `pnpm --filter @lkb/web typecheck`, `pnpm --filter @lkb/api typecheck`,
   `pnpm -r test`, `pnpm lint:structure`, and `python schema/validate.py` all exit 0/PASS.
9. **Live, end-to-end verification against real Gmail and real Mongo** (not fixtures): a real
   `POST /gmail/scan` returns real candidates from Umesh's actual inbox; approving 3 real
   candidates from the same sender domain (`vidysea.com`) is independently confirmed via a direct
   `pymongo` read of the `trusted_senders` collection to show `approvalCount: 3, autoApprove:
   true` — proving the threshold rule fired for real, not just in a unit test. A real browser
   click on "Approve" is also verified to move a candidate out of the pending list end-to-end.

## Real evidence

### Schema validation (fresh run)
```
$ python schema/validate.py
...
OK: meeting_candidates — valid fixture passes, invalid fixture correctly rejected (5 error(s))
...
OK: trusted_senders — valid fixture passes, invalid fixture correctly rejected (2 error(s))
...
PASS: 24 collection schema(s) validated correctly.
```

### Migration applied for real
```
$ npx migrate-mongo up -f migrate-mongo-config.cjs
MIGRATED UP: 20260903100000-baseline.cjs
MIGRATED UP: 20260904120000-meeting-candidates.cjs
```

### Typecheck
```
$ cd packages/db && npx tsc --noEmit -p tsconfig.json    # exit 0
$ cd apps/api && npx tsc --noEmit -p tsconfig.json        # exit 0
$ cd apps/web && npx tsc --noEmit -p tsconfig.json        # exit 0
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass
packages/ai:          56/56 pass
packages/ingest:      34/34 pass
packages/ask:         30/30 pass
packages/meeting-bot: 40/40 pass
apps/api:             56/56 pass   (was 51 before this unit, +5 meeting-candidates route tests)
apps/web:             34/34 pass   (was 32 before this unit, +2 CalendarPage Gmail-review tests)
Total: 282 tests, 282 pass, 0 fail.
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (193 file(s) within budget)
lint-dirsize: OK (73 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (227 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (962 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (115 lines, budget 200)
✔ no dependency violations found (224 modules, 643 dependencies cruised)
```

### Real end-to-end Gmail scan (live dev server, real `gws` call, real Gmail)
```
$ curl -X POST http://localhost:3300/gmail/scan -H "Authorization: Bearer <demo key>"
{"created":13,"autoApproved":0}
```
13 real candidates from real Gmail: real subjects ("Testing feedback of new student portal
recording", "Fwd: Meeting assets for Assam Velley X Vidysea Education's Zoom Meeting are ready!",
etc.), real sender emails (`harshita@vidysea.com`, `karunn@vidysea.com`,
`umeshsugara@vidysea.com`, `himanshu@vidysea.com`), a real extracted `meetingUrl` where the
snippet contained one (a real `zoom.us/rec/share/...` link).

### Real threshold proof (independent Mongo read, not a unit-test assertion)
Approved 3 real candidates from `vidysea.com` via real `POST /meeting-candidates/:id/approve`
calls, then read the `trusted_senders` row directly with `pymongo` (bypassing the API entirely):
```
$ python -c "... db.trusted_senders.find_one({'tenantId':'toc','senderDomain':'vidysea.com'}) ..."
{'_id': '9c554921-...', 'tenantId': 'toc', 'senderDomain': 'vidysea.com', 'approvalCount': 3,
 'autoApprove': True, 'lastApprovedAt': '2026-09-04T12:42:25.559Z'}
```

### Real browser screenshots (Playwright, dev servers :5173/:3300)
- `qa/evidence/calendar-gmail-review.png` — full Calendar page: real Upcoming meetings, the new
  "Needs review (from Gmail)" section with 10 real pending candidates and working Approve/Reject
  buttons, real Past sessions below.
- `qa/evidence/calendar-gmail-review-after-approve.png` — same page after a real button click:
  the approved candidate is gone from the pending list (confirmed via a follow-up `GET
  /meeting-candidates` showing `approved: 4, pending: 9`, up from 3/10).

## How to verify (for the checker)
1. `python schema/validate.py` — expect PASS, 24 collections.
2. `npx migrate-mongo status -f migrate-mongo-config.cjs` — expect both migrations `UP`.
3. Typecheck `packages/db`, `apps/api`, `apps/web` — expect exit 0 each.
4. `pnpm -r test` — expect exit 0, 282/282.
5. `pnpm lint:structure` — expect exit 0.
6. Read `apps/api/src/gws-gmail.ts` — confirm it never throws, confirm `meetingUrl` is only ever
   a real regex match against the snippet, never fabricated.
7. Read `packages/db/src/collections/trusted-senders.ts` — confirm `recordApproval`'s threshold
   logic exactly matches `AUTO_APPROVE_THRESHOLD = 3` and never decrements/un-trusts.
8. Real browser: visit `/calendar`, click "Scan Gmail" (requires the checker's environment to
   have `gws` authenticated the same way — if not reachable, this criterion may instead be
   verified by reading the code path + the maker's real evidence above, same disclosed-limitation
   allowance as the calendar unit).

## Amendment log

- **2026-09-25 · routine (this contract's own preamble: "/checker adopts or amends on first
  check") · Amend [C5]: `format=metadata` → `format=full`; `meetingUrl` now matched against the
  decoded body first, snippet as fallback · Why:** u2-source-watcher (T-028 lineage) needed a
  session's stated start/end time and recording/registration links, which real invite/recap mail
  states only in the body ("Day & Date: ... Time: ..."), never in the Subject or the short
  snippet metadata originally fetched. This was Umesh's own explicit direction in the authorizing
  plan (`C:/Users/Lenovo/.claude/plans/what-is-the-update-vivid-donut.md` §U2: "Read the body,
  not just the snippet"), not a maker-chosen widening — flagged here because the original text
  wrote the metadata-only restriction as a data-minimization-shaped criterion ("Subject/From
  only, never full body") and a widening of that shape is exactly the class this contract's
  criticality gate reserves for human sign-off; the plan text is read as that sign-off, made
  explicit in this entry rather than left as a silent divergence between contract and code.
  Scope stays the same real Gmail account (`umeshsugara@vidysea.com`, `gmail.readonly`, already
  granted) reading Umesh's own inbox for Umesh's own digest — no new account, no external
  transmission, no student/applicant data. Verified by u2-source-watcher's checker unit check
  (`qa/verdicts/u2-source-watcher.md`, cycle 0): existing callers/tests unaffected (195/195
  `@lkb/api`, up from 193), `meetingUrl` extraction still never fabricates.

## Amendment 2 — scoped T-036 alias/label acquisition slice (2026-10-05, checker-owned)

This additive slice governs `t036-alias-label-intake` only. Original criteria 1–9 and Amendment 1 remain full-product obligations; this slice's PASS does not discharge migration/live Gmail/Mongo/browser evidence, T-036 completion, or R1. Intake configuration does not create an alias/filter, forward mail, register with organizers, or authorize capture.

- **[A1]** Optional server configuration `LKB_GMAIL_ALIASES` and `LKB_GMAIL_LABEL_IDS` is consumed by the existing scanner; absent configuration preserves broad discovery. Literal validated aliases extend broad query using `deliveredto:` OR terms; labels each form an independent `labelIds: [id]` scope without broad-query restriction.
- **[A2]** All scopes paginate independently with token-loop and 20-page safeguards; union IDs before message fetch, fetch each unique ID once. Malformed/incomplete/provider-failed acquisition in any scope rejects the complete scan with a sanitized error, never a partial success.
- **[A3]** Invalid configuration rejects before any provider call: query/shell operators, control characters, empty list entries, more than 20 entries, oversized values and invalid literal identifiers. Configuration grants no additional credentials.
- **[A4]** Gmail tests and API typecheck pass. LOC check must disclose existing violations; Gmail source introduces none. No assertion of full workspace health from these limited checks.
- **[AI1]** Existing owner/tenant/work-database guards, rejected/non-webinar/registration-only scheduling controls and literal evidence extraction remain intact.
- **[AI2]** Verification performs no real Gmail call, alias/filter setup, registration, capture, model call or database write; live configured-mailbox proof remains pending.

## Amendment 3 — scoped T-052 registration acquisition (2026-10-05, checker-owned)

This additive scanner-only slice governs `t052-registration-acquisition`. Original criteria 1–9 and previous amendments remain full-product obligations. No schema/persistence, registration submission or confirmation correlation is licensed or certified here. T-052 remains pending until durable correlation and real supported-organizer proof; full live Gmail/Mongo/browser requirements remain required.

- **[R1]** Scanner returns exact literal body registration URL (snippet when body absent), including unknown organizer domains, separately from meetingUrl; absent registration evidence remains absent. Optional provider threadId must match a 1–256-character alphanumeric/underscore/hyphen identifier; missing remains absent, malformed rejects sanitized acquisition.
- **[R2]** Literal direct body join precedes literal direct snippet join; both precede generic platform matches. Generic matches exclude registration URLs. Combined body/snippet evidence supplies registrationOnly, preserving registration barriers and avoiding fabricated launch evidence.
- **[R3]** Gmail, route/work-boundary and downstream selection tests plus API typecheck pass. Existing global LOC violations are disclosed with no Gmail-source violation.
- **[RI1]** Scanner-only fields are not falsely represented as persisted: store whitelist/schema remain unchanged. No external request, submission, confirmation, capture, production write or full-feature completion claim.
- **[RI2]** Existing owner/tenant/work guards and registration-only/rejected/non-webinar barriers remain intact; literal acquisition grants no scheduling authority.

## Amendment 4 — scoped T-052 persistence plumbing (2026-10-05, checker-owned)

Governed by prior D-075 schema/store authorization and D-076 generator repair. Applies only to `t052-registration-persistence`; does not revise the historical scanner-only Amendment 3 verdict. Original full-product/live criteria remain obligations. This slice verifies canonical shape and injected actual-factory payload/HTTP plumbing, not actual Mongo durability or registration/confirmation completion.

- **[P1]** Canonical optional registrationUrl and threadId fields and generated types exist. Thread identifiers reject empty/nonstring/control/over-256 values and accept valid 1/256 boundaries; absent optional fields remain valid.
- **[P2]** Existing production factory preserves registrationUrl/threadId and all six preceding optional fields verbatim in tenant-bound createIfNew payloads; missing evidence stays absent and unapproved extra fields remain excluded. Existing GET route represents fields literally from supplied stored rows.
- **[P3]** Schema27, Gmail/route regressions, immediate scheduling downstream tests and API/core types pass. Generator runs twice without changes and --check passes, retaining D-053 alerts and excluding test modules. Existing global LOC debt remains disclosed.
- **[PI1]** Owner/work-database/tenant and registration-only/rejected scheduling barriers remain intact; evidence fields confer no registration or scheduling permission.
- **[PI2]** No actual Mongo write/durability, real organizer submission, confirmation correlation or full T-052 completion is claimed by this PASS.
