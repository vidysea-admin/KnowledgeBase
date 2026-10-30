# Verdict (coordinator A) — wa-links-api

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Base: aacb9213  Head: 8ca1dcc5 (code head 4facc1bf)  Tier: L (dual; auth|tenancy `apps/api/src/whatsapp/links/router.ts:61`)
Date: 2026-10-30  Bound root: D:/KnowledgeBase/.worktrees/wa-links-api  Contract: plan.md W5 (items 1-7) + spec R-1..R-6, R-9..R-14, R-24 (bind), R-44; no qa/contracts file.

## Check plan (step 0)
Instruments: (1) re-run the manifest verify commands on a `git archive` copy of 8ca1dcc5 outside the bound root; (2) real Mongo on my own throwaway LOCAL replica-set mongod (127.0.0.1:27555, rs `rsw5a`, PID started and killed by me, no production); (3) one falsification per criterion in the copy (D-020: per-mutation byte backup, restore in `finally`, `git hash-object` == `git rev-parse HEAD:<file>`); (4) full read of service.ts, router.ts, notice.ts, the routes.ts diff and the diff scope; (5) tsc and lint:structure. api-only: no browser walk. No full suite. Consent is out of scope (D-210).

## Results
- Re-run (copy): service+router+notice tests 27 pass, 0 fail (links.mongo skipped without a URL). mounted-routes/server/admin-router 37 pass. `tsc --noEmit -p apps/api` exit 0. lint-loc: loc, dirsize, root, dupes, migrations, codex-hooks, snapshot OK; the `dependencies` stage reports 402 violations all under `apps/web/*` (the copy has no web node_modules; rig artefact, none in api or packages); the new files import only `@lkb/db`, `../../auth.js`, `../../composition/logger.js` and `../archiver/*`, so no boundary or cycle edge is introduced.
- Diff scope: 13 files, all listed under the manifest's What changed; the only edit to an existing file is the one-line `routes.ts` mount. No consent, no W1 schema, no migration change.
- Real Mongo: `links.mongo.test.ts` FAILS AS WRITTEN (`migration.up` refuses the random db name: "explicit isolated work database and Mongo URL required"). With the copy changed to call the unguarded `applyWhatsappLinks(db)` it PASSES (one live link out of 6 concurrent requests, approve CAS 1 of 3, concurrent connects, one `link.connected` event, cross-link `archiverOwnerId` uniqueness). My own probe on the real schemas (copy, not committed): every event type accepted by the closed schema, self-approved event `{requesterId, approverId, reason:"self_approved"}`, concurrent connects call `ensureOwner` once, expiry connect 409 `approval_expired` and link unlinked, legacy bind ok and a second live link for the user -> `link_exists`, no `qr` substring in any row.

## Falsification (copy; 10 runs, all restored, HEAD-fidelity True each)
| Crit | Mutant | Result |
|---|---|---|
| W5-1 | notice-version check off (`if (false) return`) | KILLED |
| W5-2 | `owns` accepts any member | KILLED |
| W5-2 | `unlink` drops the owner-or-admin check | KILLED |
| W5-3 | self-approval detection off (`self = false`) | KILLED |
| W5-4 | remove the re-read inside `provision` | SURVIVED (P3) |
| W5-5 | QR written to the log | KILLED |
| W5-6 | 503 handler leaks `String(e)` | KILLED |
| W5-7 | drop `REASON_RE` test in `suspendForAccount` | SURVIVED (P2) |
| W5-7 | drop only the `state !== "active"` test (the builder's survivor) | SURVIVED, JUDGED EQUIVALENT |
| W5-7 | widen the CAS `from` to LIVE_STATES and drop the state test | KILLED |

Builder survivor (W5-7): equivalent. Both stores apply the `from:["active"]` filter inside the CAS (service.ts:214), so the explicit state test only avoids a pointless round trip; widening the CAS as well is killed, which confirms the CAS is the real guard and is pinned.

## Criteria
W5-1 MET. W5-2 MET. W5-3 MET with deviation P4 (gate asks for a `selfApproved` flag on the row/event; the schema has none). W5-4 MET (once under concurrency, proved on real Mongo). W5-5 MET (owner-only, no-store, QR never stored/logged/evented, per-link 429, one activation event). W5-6 MET (tenant only from verified `req.auth`, CSRF through the shared guard, strict bodies, `archiverOwnerId` not assignable). W5-7 MET (ACTIVE only, system actor, code-form reason). W5-8 MET (mounted via `mountIntegratedWorkflows`, 503 placeholder, selection stub, tsc and structure lint green).

## Open points 1-11 (judged)
1 accepted (P4). 2 no admin path to clear `blocksNewRequests`: product gap, not a W5 criterion. 3 resume admin-only: matches plan item 2. 4-7 W8 or best-effort by design; state is authoritative. 8-9 Docker notice file and production wiring: fail closed (503), accepted for this unit (P6). 10 a key holding `whatsapp-admin` can act: accepted, the actor is the key id and never an owner or requester. 11 untouched files: confirmed not in the diff.

## Notes (not findings)
`unlink` does not require `p.actor`; an admin key without a key id would write `unlinkedBy "key:null"` (cosmetic, P5). Spec R-10 says "all non-terminal" links while the plan and gate say ACTIVE only; the code follows the gate (`wa-revoked-link-read-access`). The 503 placeholder returns 403 to a key lacking the scope before it reaches the 503; trivial. Consent code untouched.

PROPOSED-ISSUE: {"id":"P1","sev":"medium","class":"test-infra","title":"links.mongo.test.ts can never pass as written: it calls the guarded migration.up with a random database name, so the builder's real-Mongo evidence was never executable; WA_REVIEW_TEST_MONGO_URL alone is insufficient","fix_direction":"call applyWhatsappLinks(db) (or take the name from MONGO_WORK_DB) and document the env vars","files":"apps/api/src/whatsapp/links/links.mongo.test.ts"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","class":"test-gap","title":"The free-text-reason refusal in suspendForAccount is unpinned: the assertion runs after the only active link is already suspended, so deleting the REASON_RE check survives","fix_direction":"assert the refusal on a fresh active link and check it stays active","files":"apps/api/src/whatsapp/links/service.test.ts:226"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","class":"test-gap","title":"The store re-read in provision (late caller after a completed provision) is unpinned; removing it survives","fix_direction":"add a sequential-after-concurrent connect case asserting ensureOwner stays at 1","files":"apps/api/src/whatsapp/links/service.ts:127"}
PROPOSED-ISSUE: {"id":"P4","sev":"medium","class":"schema","title":"Gate H-4 asks for selfApproved:true on the row and the approval event; the closed W1 schemas have no such field, so it is recorded as reason \"self_approved\" with equal requesterId/approverId and the flag exists only in the HTTP response","fix_direction":"W1 schema amendment, then record it in service.approve","files":"apps/api/src/whatsapp/links/service.ts:172, schema/whatsapp_events.schema.json"}
PROPOSED-ISSUE: {"id":"P5","sev":"low","class":"hardening","title":"unlink does not require p.actor, so an admin key without a key id records unlinkedBy \"key:null\"","fix_direction":"refuse or substitute a stable key identity before writing the actor","files":"apps/api/src/whatsapp/links/service.ts"}
PROPOSED-ISSUE: {"id":"P6","sev":"medium","class":"wiring","title":"Feature unreachable in production: nothing calls buildWhatsAppLinks (503 workflow_unavailable), archiver env unset, notice.md not in the image, no admin path clears blocksNewRequests","fix_direction":"queue a wiring unit before W10","files":"apps/api/src/composition/production.ts, Dockerfile"}

VERDICT: PASS
SCOREBOARD: 8/8 criteria met (W5-1..W5-8), 0/0 invariants
TIER: L (auth/tenancy/QR secret in links/service.ts and router.ts; dual-trigger cited)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api-only)
LIVE-BROWSER: not-applicable (no UI surface)
ISSUES-WRITTEN: none (dual coordinator; PROPOSED-ISSUE P1-P6 above)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: Independent re-run, a local real-Mongo run and per-criterion falsification found no defect that breaks a W5 acceptance item; tenancy, auth, CAS and QR-secrecy properties hold over HTTP and on real Mongo. The gated real-Mongo test is unrunnable as written (P1) and two mutants survive on test gaps (P2, P3); the builder's W5-7 survivor is equivalent. None blocks the unit.
Metrics: start=2026-10-30T12:52:32Z end=2026-10-30T13:14:30Z wall_min=22 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1318 mutants=10 defects_unit=0 defects_6c=0
