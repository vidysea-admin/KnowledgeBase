# Verdict — wa-selection-api (coordinator B, dual check)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Bound root: D:/KnowledgeBase/.worktrees/wa-selection-api · Base 8ca1dcc5 · Head 225fcfee · Integration branch docs/devops-golive-2026-10-26
Contract: plan.md W6 acceptance 1-6 + spec R-15..R-21, R-39 (no qa/contracts file). Gate wa-revoked-link-read-access (Answered: active only, admin passes).

## Check plan (step 0)
Diff = 4 files: selection/router.ts, NEW selection/service.ts, NEW selection/router.test.ts, manifest. API only, no UI, no browser walk, no persona walk. Signals: logic changed (affected tests + falsification), tenancy/data-write trigger (service.ts:54, security read of the changed lines), event write to Mongo (real-Mongo probe on a local throwaway mongod), criterion 2 second half (read-only credential probe, local only). No LLM/prompt, no data artifact. Single coordinator, no sub-checkers (serial: shared fake-archiver port and one mongod).
TIER: L (tenancy and authority decision in apps/api/src/whatsapp/selection/service.ts:54, selection writes into the archiver).

## Steps and evidence
1. Re-ran the manifest verify command in a `git archive` copy of 225fcfee outside the bound root (junctions for node_modules, `@lkb/*` pointed at the copy's own packages): selection/router.test.ts 17 pass 0 fail. Regression set (selection router + links router + links service) 41 pass 0 fail. tsc --noEmit exit 0 (only with the casing flag, copy artefact, see checkpoint).
2. Diff-scope read (4c): read service.ts (153 lines) and router.ts (94) in full, and the whole test file. No file outside the declared scope changed (links/*, routes.ts, server.ts, W7 files untouched).
3. Falsification (per-mutation from the HEAD blob, 120 s timeout, restore after each, `git hash-object` equal to `git rev-parse 225fcfee:` after each, no run-scoped backup, no EXIT trap). Seven runs, all RED, all restored hash-equal:
   - W6-1 M1 removed the admin-write refusal (service.ts:61): 2 red (C1 refusals, C1 gate). M7 admin may read people: red (C1 refusals).
   - W6-2 M2 added a `mongodb` import to service.ts: red (C2 source assertion).
   - W6-3 M3 skipped the in-list group check on write: red (C3 jid not in this owner's list).
   - W6-4 M4 put `jid` into the event data: red (C4/C6 events).
   - W6-5 M5 swallowed an archiver error as success in setGroup (the mutant the builder could not apply): 2 red (C5 archiver down, archiver_owner_unavailable).
   - W6-6 M6 dropped the `same` short-circuit: red (C4/C6 events, extra archiver write seen by the spy).
4. Real local Mongo (never production): own mongod on 127.0.0.1:27999, throwaway DB `lkb_test_wa_links_chkb`, migration `applyWhatsappLinks` applied, production factory `buildWhatsAppSelection`, in-repo fake archiver. Owner mark persisted exactly one `selection.changed` event through the real $jsonSchema validator with data `{groupCount:1, markedCount:1}`, no jid or subject in the event, `whatsapp_links` and `whatsapp_sync_runs` byte-identical before and after, idempotent repeat wrote no event, admin non-owner write 403, other-tenant read 404, admin marked-only read ok.
5. Read-only credential (criterion 2, second half): same mongod restarted with --auth, a `read`-role user on the throwaway DB: reads succeed; insertOne, updateOne, deleteOne and createCollection all refused (code 13 Unauthorized). This shows the Mongo property the criterion relies on; it does not prove how the real archiver credential is provisioned (that is the R-43 startup probe, W13/W14).
6. Security read of changed lines (service.ts:54-67): tenant comes only from Principal and the link lookup is tenant-scoped (other tenant is null so 404); owner needs session + `whatsapp-link` scope + userId equal to the link's userId; non-owner non-admin gets 404 (existence hidden); admin non-owner gets read of marked groups only and 403 on every write and on the people routes; a key never writes (line 56); archiverOwnerId is read only from the link row; jid and person ids are regex-validated before any archiver call; in-list check before every write; the event holds ids and counts only (R-39) and the event insert is the only KB write. No cross-tenant path, no mass-assignment (strict bodies), CSRF and viewer read-only come from the shared guards and are exercised through the real createServer. I found no defect.

## Criteria
| ID | Criterion | Result |
|---|---|---|
| W6-1 | owner-only mark/unmark; admin, other member, viewer, any key refused; admin reads marked list only | MET (tests + M1, M7) |
| W6-2 | no KB write to the archiver DB; writes through the client; no stored copy; read-only credential fails a write | MET (source assertion + M2; link rows byte-identical, real Mongo; credential probe on local Mongo) |
| W6-3 | jid and personId validated before the call; jid not in owner's listGroups is 404 | MET (M3) |
| W6-4 | one counts-only `selection.changed` per change | MET (M4; real-Mongo validator accepts it) |
| W6-5 | archiver down gives 503 archiver_api_unavailable, no partial local state | MET (M5) |
| W6-6 | idempotent, 200, changed:false | MET (M6) |
Gate wa-revoked-link-read-access: MET (owner of any non-active link 409 link_not_active, admin passes, admin-owner of a non-active link may read, not write).
[ASSUMPTION] choices (409 link_not_active, 409 group_not_marked, admin sees marked only and never people): inside the spec, not defects.

## Not claimed
Production wiring: `composition/integrations/routes.ts:74` still passes no deps, so in a running server these routes answer 404 until the composition wires `buildWhatsAppSelection`. That is a declared, plan-conformant boundary (W6 does not own routes.ts), not a W6 defect; it is a gap for the next unit (P1). Archiver-side behaviour is proven only against the in-repo fake.

PROPOSED-ISSUE: {"id":"P1","sev":"medium","area":"composition","title":"WhatsApp selection routes are not mounted in production: routes.ts:74 calls createWhatsAppSelectionRouter() with no deps, so /whatsapp/links/:id/groups* return 404; wiring buildWhatsAppSelection (and updating the links/router.test.ts:154 empty-router pin) needs an owner before W10 ships","fix_direction":"add an IntegratedWorkflows field built next to buildWhatsAppLinks and pass it in; give it a wiring test through the real composition"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","area":"selection","title":"Admin view returns groupCount (all groups, marked or not) while hiding unmarked groups, so it discloses how many unmarked groups the owner has; R-20 says admins see which groups are marked","fix_direction":"for the admin view return only markedCount, or document the total as intended"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","area":"tests","title":"The criterion-2 read-only-credential failed-write probe has no standing test; only a Mongo-level run on a local --auth mongod (this check) shows a read role is refused. Belongs with the R-43 startup probe","fix_direction":"cover in W13/W14 with the probe against the real archiver credential"}
PROPOSED-ISSUE: {"id":"P4","sev":"low","area":"process","title":"Builder wrote implementation before tests (declared, not strict TDD); the 17 tests were nevertheless falsified (7/7 mutants red here)","fix_direction":"none needed; note only"}

VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 1/1 gate invariants hold
TIER: L (tenancy and archiver data-write authority, apps/api/src/whatsapp/selection/service.ts:54)
FAILURES (if any): none
CAPABILITY-COVERAGE: not-applicable (api only, no capability matrix)
LIVE-BROWSER: not-applicable (apps/api/src/whatsapp/selection/*.ts, no UI)
ISSUES-WRITTEN: none (dual coordinator: P1 medium, P2 to P4 low in PROPOSED-ISSUE lines above; the maker mints ids after both PASS)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: Every W6 acceptance item and the revoked-link gate is evidenced by my own re-run of the 17 tests plus seven isolated, restored mutants that all went red, and a real local Mongo run shows the production factory writes exactly one valid counts-only event and nothing else. The one real gap, that the routes are not mounted in production, is a declared boundary of this unit and is raised as P1, not a FAIL.
Metrics: start=2026-10-30T18:35:00+05:30 end=2026-10-30T18:56:00+05:30 wall_min=21 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1260 mutants=1 defects_unit=0 defects_6c=0
