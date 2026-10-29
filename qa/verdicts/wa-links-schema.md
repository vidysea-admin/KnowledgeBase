# Verdict - wa-links-schema (coordinator A, blind dual check)

**Cycle checked:** 0
**Verdict:** PASS
**Checked state:** 1a0d1480 (code 7d171cff), base 69806029. Policy-Version: proportional-verification/2026-10-19.17

## Check plan
Re-run all unit tests against my own throwaway mongo:7 (127.0.0.1:27793), run the lints, 11 falsifications in a scratch copy, then an adversarial probe of the validator and unique partial indexes on real Mongo. Read the whole product diff (3 schemas, accessor module, migration, index.json). The builder's mutation table was not reused.

VERDICT: PASS
SCOREBOARD: 5/5 criteria met, 0 invariants broken
TIER: H/L (tenancy, consent and ownership data model; dual-trigger packages/db/src/collections/whatsapp-links.ts:44)

## Evidence (own runs)
- C1: `node --test migrations/whatsapp-links.migration.test.mjs` -> 7 pass, 0 fail, 0 skip. `python schema/validate.py` -> `PASS: 49 collection schema(s) validated correctly.` Probe on real Mongo (validationAction error/strict on all 3): missing userId, empty userId, non-hex-lowercase owner, owner null, active without activatedAt, studentData `maybe`, unknown field, free-text suspendedReason, terminal with live:true, live state with live:false, event data.text, event free-text reason, event extra top-level `jid`, array data, negative and fractional count: all rejected (code 121).
- C2: probe on real Mongo: second live link same (tenant,user) -> 11000; same user other tenant OK; revoked row then new live link OK; two legacy `userId:null` links with distinct owners OK; same owner twice -> 11000; owner reused across tenants -> 11000; owner reused by a terminal row -> 11000; raw tenantId move onto a colliding user -> 11000.
- C3: `cd packages/db; node --test --import tsx src/collections/whatsapp-links.test.ts` -> 7 pass. `tsc --noEmit -p packages/db` exit 0. Read scopedCollection (tenantScope.ts): tenant ANDed into every filter, stamped last on inserts, pinned in updates; `list` cursor lookup is tenant-scoped (cross-tenant cursor -> unknown cursor).
- C4: events accessor is a frozen object with insert/get/list only; inner scoped collection is not exposed. Surface test and payload tests pass.
- C5: real-Mongo apply twice (index set unchanged), guard test passes, `node scripts/lint-migrations.mjs` -> `lint-migrations: OK (11590 file(s) scanned)`. `gen-types --check` OK (49), `snapshot --check` OK (177 lines).
- Scope: 16 non-fixture files changed, all within the manifest's declared scope; no users schema, API route, compose or DECISIONS edit. Worktree clean; blob hashes of schema/index.json and the migration equal HEAD.

## Falsification (scratch copy, per-mutation byte backup, restored; `git hash-object --no-filters` copy == worktree file, and worktree blobs == HEAD)
KILLED: C1 owner pattern weakened (4 fail); C1 tenantId dropped from required (4); C1 active clause without approvedBy (3); C2 live_user index made global (3); C2 archiver index given `live:true` filter (3); C3 getLink bypasses scoped accessor (1); C4 events accessor exposes updateOne (1); C4 `jid` added to EVENT_DATA_KEYS (1); C5 staging DB no longer refused (1); C5 index spec dropped, non-unique (2).
SURVIVED: C3-adjacent, `findLiveLinkForUser` without `live: true` (exit 0). That helper is outside criteria C1-C5 and has no assertion; filed as a low PROPOSED-ISSUE (P3).

## Adversarial notes (non-blocking, none reachable from a request path in this unit)
- P1 (medium): Mongo `$jsonSchema` `pattern` is PCRE, where `$` matches before a final newline. `archiverOwnerId: "<24 hex>\n"` is ACCEPTED by the collection validator (probe, real Mongo) although ajv rejects it. It is a distinct key to the unique index, so "never reused" (R-2) can be evaded by an id with a trailing newline. Same quirk applies to every `^...$` pattern (`_id`, linkId, codes). Reachable only by a trusted-code write whose value comes from the archiver API (W5), hence not a FAIL here. Fix direction: trim/validate in `insertLink` (and the W5 writer) or use a pattern that PCRE and ECMAScript agree on, plus a test row.
- P2 (low): `userId`, `requesterId`, `targetUserId` are free strings; uniqueness is literal, so `U1`, `u1 ` and `u1` are three people for R-2. The users id format belongs to A1; W5 must canonicalise. Likewise a digits-only `requesterId` such as `919876543210` passes the R-39 pattern (an id pattern cannot tell a phone from an id); the in-code guard checks keys and scalar type only, value shape is left to the validator.
- P3 (low): see SURVIVED above; add a test that a user with a terminal and a live link gets the live one.
- P4 (low): Mongo drops `format: date-time`, so `at`/`createdAt` accept any string (probe: `at: "not-a-date"` accepted) while events paging orders by `at`. The accessor defaults `at` to ISO and a caller-supplied `at` is not validated.
- Open points 1, 4, 5, 6 of the manifest (H-3 approval evidence, blocksNewRequests enforcement, DB role without update/delete, no sync-run writer) are deployment or later-unit items, accepted as stated.

PROPOSED-ISSUE: {"issue":"P1","sev":"medium","files":["schema/whatsapp_links.schema.json","packages/db/src/collections/whatsapp-links.ts"],"title":"Mongo PCRE $ accepts trailing newline in archiverOwnerId and other ^...$ patterns, evading unique/never-reused","repro":"applyWhatsappLinks on mock mongo:7, insert active link with archiverOwnerId = 24hex+'\n' -> accepted","fix_direction":"validate/trim in insertLink and W5 writer; add real-Mongo test row"}
PROPOSED-ISSUE: {"issue":"P2","sev":"low","files":["schema/whatsapp_links.schema.json"],"title":"userId uniqueness is literal (case/whitespace variants are distinct people); digits-only requesterId passes R-39 pattern","fix_direction":"canonicalise userId in W5; keep as note"}
PROPOSED-ISSUE: {"issue":"P3","sev":"low","files":["packages/db/src/collections/whatsapp-links.ts"],"title":"findLiveLinkForUser live:true filter is unasserted (mutant survives)","fix_direction":"add a terminal-plus-live test"}
PROPOSED-ISSUE: {"issue":"P4","sev":"low","files":["schema/whatsapp_events.schema.json","packages/db/src/collections/whatsapp-links.ts"],"title":"date-time format not enforced by Mongo validator; event cursor order depends on at string","fix_direction":"validate at in the events accessor"}

CAPABILITY-COVERAGE: not-applicable (no screen, flow or browser surface)
LIVE-BROWSER: not-applicable (data model and accessors only)
ISSUES-WRITTEN: none (dual check: findings are PROPOSED-ISSUE lines above)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every criterion was evidenced by my own runs on a real Mongo and ten of eleven falsifications were killed; the survivor is an unasserted helper outside C1-C5. The one defect worth the maker's attention is the PCRE trailing-newline gap (P1), which weakens the validator-side enforcement of the 24-hex rule but is not reachable from a user request in this unit.
Metrics: start=2026-10-29T09:30:00Z end=2026-10-29T10:05:00Z wall_min=35 agent_min=unavailable blocked_min=0 suite_runs=2 repeat_runs=0 mutations=11 cycle=0 resumes=0 tokens=unavailable builder_min=95 check_min=35 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2100 mutants=11 defects_unit=0 defects_6c=0
