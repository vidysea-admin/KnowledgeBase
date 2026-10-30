# Verdict (coordinator B) — wa-links-api

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Base: aacb9213  Head: 8ca1dcc5 (code head 4facc1bf)  Tier: L (dual; auth|tenancy `apps/api/src/whatsapp/links/service.ts`, `router.ts:61`)
Date: 2026-10-30  Bound root: D:/KnowledgeBase/.worktrees/wa-links-api  Contract: plan.md W5 (items 1-7) + spec R-*; no qa/contracts file.

## Check plan (step 0)
Instruments: (1) re-run the manifest's tests on a `git archive` copy of 8ca1dcc5 outside the bound root; (2) real-Mongo on a throwaway LOCAL mongod (127.0.0.1:27919, PID started and killed by me, db `lkb_test_wa_links_deadbeef`, no production); (3) one falsification per criterion in the copy (D-020: per-mutation backup, restore in `finally`, `git hash-object` == `git rev-parse 8ca1dcc5:<file>`); (4) full read of service.ts, router.ts, notice.ts, routes.ts diff; (5) lint/tsc/mounted-surface tests. api-only: no browser walk. No full suite.

## Results
- Re-run (copy): service+router+notice 27 passed, 0 failed (links.mongo skipped without URL). mounted-routes + server + admin-router: 37 passed. `tsc --noEmit -p apps/api` exit 0 (no output). lint-loc/dirsize/root/dupes/migrations/codex-hooks/snapshot OK. The `dependencies` stage cannot run on the copy (dependency-cruiser follows the junctioned `@lkb/*` links to absolute main-tree paths: ENOENT, copy artefact); read instead: new files import only `@lkb/db`, `../../auth.js`, `../../composition/logger.js` (no imports back), `../archiver/*`; no package-boundary or cycle edge introduced.
- Real Mongo (local): `links.mongo.test.ts` FAILS AS WRITTEN at `migration.up` ("explicit isolated work database and Mongo URL required"): the migration guard needs `MONGO_WORK_DB` == db name, the test uses a random name (see P2). In my copy only, with the name taken from `MONGO_WORK_DB`, it PASSES: 6 concurrent requests -> exactly 1 live link (unique partial index, `link_exists` for the rest); approve CAS 1 of 3; 5 concurrent connects all ok; one `link.connected` event; cross-link `archiverOwnerId` conflict.
- My own real-Mongo probe (copy, not committed): all event types accepted by the closed schema and written (requested 6, approved 4, rejected, revoked 2, unlinked 2, connected 2, suspended 1 by system actor, resumed 1); self-approved event = `{requesterId:u-admin, approverId:u-admin, reason:self_approved}`; 8 concurrent connects on one approved link -> `ensureOwner` called once, link active once; expiry connect -> 409 `approval_expired` and link `unlinked`; revoke sets `blocksNewRequests`, the next request is 403 `link_blocked`; relink path (needs-relink flag cleared); legacy bind on the real schema ok, binding a user who already has a live link -> `link_exists` (index-decided); no "qr" substring in any row; no log lines.

## Falsification (copy; 8 mutants, cap 10; all restored, HEAD-fidelity True each)
| Crit | Mutant | Result |
|---|---|---|
| W5-1 | drop `!p.link` in `request` | KILLED (A1 request) |
| W5-2 | `toLinkView` always spreads ADMIN_ONLY | KILLED (A4 views, A2/A3/A4 HTTP) |
| W5-3 | response `selfApproved:false` | KILLED (H-4 service + HTTP) |
| W5-4 | remove the re-read inside `provision` | SURVIVED (P4) |
| W5-5 | admin allowed through `owns` in `connect` | KILLED (A5 x2) |
| W5-5 | drop `Cache-Control: no-store` router.use | KILLED (A1 create, A5 fake-archiver) |
| W5-6 | allow `archiverOwnerId` in approve body | KILLED (adversarial) |
| W5-7 | drop `REASON_RE` test in `suspendForAccount` | SURVIVED (P3); production behaviour verified correct by a direct run (free text -> 0, code -> 1) |
Builder survivor (W5-7, `state !== "active"` removed): JUDGED EQUIVALENT. Both stores apply `from:["active"]` in the CAS (service.ts:214; Mongo filter `state:{$in}`, memory `tr.from.includes`), so a non-active link cannot move; defence in depth only.

## Criteria
W5-1 MET (request needs session+`whatsapp-link`; key/viewer/pending 403; strict body 400; 409 `link_exists` index-decided; 409 `notice_changed`; 429+Retry-After). W5-2 MET (admin gates, CAS, tenant-scoped `get`, allowlist views, owner-or-admin idempotent unlink). W5-3 MET with deviation P1. W5-4 MET (proved on real Mongo). W5-5 MET (owner-only, no-store on every `/whatsapp/links` response, QR never persisted/logged/evented, per-link 429 after the owner check so strangers cannot spend it, one activation event). W5-6 MET (tenant only from verified `req.auth`; CSRF matrix over every mutating route; strict bodies). W5-7 MET (hook exists, ACTIVE only, system actor, code-form reason, W8-ready). W5-8 MET (mount through `mountIntegratedWorkflows`, 503 placeholder, selection stub; unwired production declared).

## Open points 1-11 (judged)
1 schema gap: accepted, see P1. 2 no admin way to clear `blocksNewRequests`: product gap, not a criterion; covered by P6. 3 resume admin-only: matches W5 item 2. 4/5/6/7 W8 or best-effort by design, accepted (state is authoritative; events proven written on real Mongo). 8/9 Docker notice + production wiring: fails closed (503), accepted for this unit, P6. 10 key with `whatsapp-admin` can act: accepted (actor is the key id, never a requester/owner). 11 untouched files: confirmed not in the diff.

## Notes (not findings)
Consent code untouched (D-210). QR limit 30/min equals 2 s polling exactly; W10 must poll slower.

PROPOSED-ISSUE: {"id":"P1","sev":"medium","class":"schema","title":"Gate H-4 asks for a `selfApproved: true` flag on the link row and approval event; W1 schemas have none, so it is `reason:\"self_approved\"` plus equal requesterId/approverId, and the flag exists only in the HTTP response","fix_direction":"W1 schema amendment (boolean on event, or on the row), then record it in service.approve","files":"apps/api/src/whatsapp/links/service.ts:178, schema/whatsapp_events.schema.json"}
PROPOSED-ISSUE: {"id":"P2","sev":"medium","class":"test-infra","title":"links.mongo.test.ts can never pass as written: the migration guard (assertIsolatedWorkTarget) requires MONGO_WORK_DB and MONGODB_URL to name the database, the test creates a random `lkb_test_wa_links_<hex>` name; the manifest instruction (set WA_REVIEW_TEST_MONGO_URL) is insufficient and the real-Mongo proof was never executable by the builder","fix_direction":"take the db name from MONGO_WORK_DB (assert the lkb_test_wa_links_ prefix) and document the three env vars","files":"apps/api/src/whatsapp/links/links.mongo.test.ts:27"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","class":"test-gap","title":"R-10 free-text-reason refusal is unpinned: the assertion runs after the only active link is already suspended, so removing the REASON_RE check survives","fix_direction":"assert the refusal on a fresh active link and check it stays active","files":"apps/api/src/whatsapp/links/service.test.ts:226"}
PROPOSED-ISSUE: {"id":"P4","sev":"low","class":"test-gap","title":"The staggered late caller in provision (re-read before ensureOwner) is unpinned; removing it survives. Production relies on archiver idempotency by key plus the setOwnerId CAS","fix_direction":"add a sequential-after-concurrent connect case asserting ensureOwner count stays 1","files":"apps/api/src/whatsapp/links/service.ts:127"}
PROPOSED-ISSUE: {"id":"P5","sev":"low","class":"correctness-race","title":"provision ignores setOwnerId 'gone': if an admin revokes/unlinks between the connect state check and setOwnerId, the caller still gets a QR for a dead link and an archiver owner is created but never stored; also GET /connect mutates (provision, startSession, activation) outside CSRF coverage","fix_direction":"treat 'gone' as 409 invalid_state before returning the owner id; consider POST for connect (W10 contract)","files":"apps/api/src/whatsapp/links/service.ts:130"}
PROPOSED-ISSUE: {"id":"P6","sev":"medium","class":"wiring","title":"Feature unreachable in production: nothing calls buildWhatsAppLinks (503 workflow_unavailable), WHATSAPP_ARCHIVER_API_* unset, docs/whatsapp/notice.md not in the Docker image, and no admin path clears blocksNewRequests","fix_direction":"queue a wiring unit (composition/production.ts, Dockerfile COPY or WHATSAPP_NOTICE_PATH mount, env) before W10; add an admin clear-block action","files":"apps/api/src/composition/production.ts, Dockerfile"}

VERDICT: PASS
SCOREBOARD: 8/8 criteria met (W5-1..W5-8), 0/0 invariants
TIER: L (auth/tenancy/QR secret in links/service.ts and router.ts; dual-trigger cited)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api-only)
LIVE-BROWSER: not-applicable (no UI surface)
ISSUES-WRITTEN: none (dual coordinator; PROPOSED-ISSUE P1-P6 above)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: Independent re-run, a local real-Mongo run and 8 per-criterion mutants found no defect that breaks a W5 acceptance item; the four tenancy/auth/QR properties hold on real Mongo and over HTTP. The gated real-Mongo test is unrunnable as written (P2) and two mutants survive on test gaps (P3, P4); none is a product defect.
Metrics: start=2026-10-30T12:52:52Z end=2026-10-30T13:08:00Z wall_min=15 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=910 mutants=8 defects_unit=0 defects_6c=0
