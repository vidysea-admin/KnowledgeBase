# t037-optout-meeting-identity-store

Task: T-037 (scheduler switch-over; precondition W7 of qa/contracts/t037-join-rules-veto-select.md). Lane `t037opt`, branch `lane/t037opt` from 1414d79. Class: SECURITY (join authorization) and DATA WRITE (tenant join-rules document).
Tier: 2, open HIGH issue ISS-T037W1-001. Full ceremony.

Status: ready-for-check
Fix cycle: 1

## Scope
Close ISS-T037W1-001 with design (ii): the opt-out stores the MEETING identity, so the veto no longer needs the opted-out record to be in the current selection. Library, store and API only. NOT wired into schedule-tick.ts (Approver ruling pending); `qa/contracts/`, `qa/verdicts/`, enforcement paths and ledger statuses untouched.

## Design and schema change
`JoinRuleState` gains ONE optional field, `optedOutMeetings?: readonly string[]` (new file `join-rules-optout.ts` holds all of its logic). Entries are tagged strings so the namespaces cannot collide:
- `url:<platform>:<id>`: `meetingIdentity(url)` from send-now.ts (the only URL parser), e.g. `url:zoom:123456789`.
- `key:<sessionKey>`: the record's sessionKey (shared across sources in every-webinar mode).

Validation (strict, fail closed, in `validateJoinRuleState`): array of strings, at most 500 entries, each at most 200 chars, matches `^(url|key):\S+$`, body not a degenerate literal (`null`, `undefined`, `none`, `unknown`, `0`, ...), `url:` bodies must be `<platform>:<id>`; duplicates collapse. Any malformed entry makes the state invalid; the evaluator already fails closed on an invalid state (`rules-unevaluable`, nothing joins).

Write path: `recordOptOut(state, eventId, meeting?)` (pure) and `recordTenantOptOut(stateDir, tenant, eventId, opts, meeting?)` (the existing store: same per-tenant lock, load-first, size cap, atomic rename). `meeting = { meetingUrl?, sessionKey? }`; the store derives the identity itself.

API: `POST /calendar/join-rules/opt-outs` body gains OPTIONAL `meetingUrl` (string, at most 2048) and `sessionKey` (string, at most 256); any other field is still 400; `tenantId` in the body is still 400. No new route, no new scope; tenant still from `req.auth.tenantId`. The router cannot derive the URL from the id (no calendar access; apps/* cannot import meeting-bot), so the CLIENT supplies the hints. The dep `recordOptOut` is called with two arguments exactly as before when no hint is sent.

Match: `optedOutMeetingMatch` is called by `evaluateJoinRules` (still the single matcher) right after the id opt-out, on the RAW state, so it is honoured even when the rest of the state is invalid (skip only narrows). The event's own `meetingUrl` identity is tested against `url:` entries; the event id (sourceId or sessionKey, including the sibling ids the veto already offers) against `key:` entries. `applyJoinRules` keeps its shape: veto-only, never adds, never throws. Reason `opted-out`; detail `meeting-opt-out (rule opt-out:url:zoom:123456789)`, no URL leaked.

Extra fix in `join-rules-select.ts siblingIds`: an EMPTY sessionKey no longer groups unrelated records (empty-key variant of ISS-T037W1-002, found by the property test).

## Old documents
A document without `optedOutMeetings` loads, validates and evaluates exactly as before. The key is NOT invented on load, `loadJoinRules` never writes (file bytes compared in test), and an id-only opt-out on an old document leaves the key absent. Only an opt-out carrying a derivable hint adds the field. The persisted top-level `version` stays 1: an older build reading a new document rejects the unknown state field (`rejectUnknownKeys`), i.e. fails closed, not open (rollback after a hinted opt-out needs the new build or the field removed).

Identity cannot be derived (no URL, unparseable, unknown platform, no extractor match, too long, empty or degenerate sessionKey): the opt-out stores by id exactly as today and no entry is written. At the 500-entry cap further entries are skipped but the id is still stored.

## What is NOT done
- No un-opt: the API has no operation that removes an opt-out, for ids or identities (PUT replaces rules only and keeps state). So an identity shares the id's lifecycle, and "blocked forever" is already true of ids. Filed ISS-T037OPT-001 (medium); a future un-opt must remove the id and its entries together. A test pins that no delete/patch route exists.
- apps/web (ApprovalsPanel) does not send the hints yet, so no production client stores an identity until it does (ISS-T037OPT-002, medium). W7 should only be lifted when the production opt-out path sends them.
- schedule-tick.ts not wired; production wiring of the API store deps not touched.

## Known limits (stated, not hidden)
- Recurring personal-room URL: one `url:zoom:<pmi>` identity covers every use of that room, so one opt-out blocks later meetings on the same URL (ISS-T037OPT-003, low; same family as ISS-T037W1-002). Removal-only, fail-closed.
- `key:` entries are matched against the item's sourceId/sessionKey and sibling ids, so they spread to same-meeting siblings in the selection (the id behaviour); `url:` entries match the item's own URL only.
- The hints come from the client; a wrong hint can only block more of that tenant's own meetings (veto-only, per tenant).

## Evidence (node 24 prepended; commands from the worktree)
- `cd packages/meeting-bot && timeout 150 node --test --import tsx src/calendar/join-rules-optout-meeting.test.ts src/calendar/join-rules-optout-identity.test.ts` -> `ISS-T037W1-001: 7/7`, `ISS-T037VETO-002: 5/5`, `ISS-T037VETO-001: 6/6`, `property: 3000 cases, removed 2784, of which via stored identity/sibling only 2213`, `property: 4000 cases, removed 3022, of which sibling-only 753`; 20 tests, 0 fail.
- `timeout 175 node --test --import tsx src/calendar/join-rules*.test.ts src/calendar/auto-join.test.ts src/calendar/schedule-tick.test.ts src/send-now*.test.ts` -> `ℹ tests 162 / pass 162 / fail 0`.
- `cd apps/api && timeout 170 node --test --import tsx src/join-rules/*.test.ts` -> `ℹ tests 48 / pass 48 / fail 0`. `node --test --import tsx scripts/qa/join-rules-edit-api.test.ts` -> 4/4 (real store round trip).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/meeting-bot: exit 0, no output. In apps/api: exit 0, no output.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`; packages/meeting-bot/src/calendar holds 26 files (24 + 2 added; limit 30, another lane adds 4). `node scripts/lint-loc.mjs` reports only the two pre-existing violations (speakers-llm.ts:313, sb_join.py:1142).
- Non-blank lines (repo `countLoc`): join-rules.ts 280 -> 295; join-rules-optout.ts 75 (new); join-rules-store.ts 179 -> 180; join-rules-select.ts 115; router.ts 123 -> 132; deps.ts 38. Tests: join-rules-optout-meeting.test.ts 190 (new), join-rules-optout-identity.test.ts 176 -> 179, router.test.ts 255 -> 276. All within 300 / 400.

## D-015: ISS-T037W1-001 against its own recorded reproduction
`ISS-T037W1-001: 7/7`. The recorded evidence is replayed (ledger row parsed from qa/issues.t037w1.jsonl and checked): `applyJoinRules(sel([g1 gmail, sessionKey gmail:g1, zoom 123456789]), {version:1,ownDomains:[],rules:[]}, state with optedOutEventIds ["calX"])`.
1. ledger row present with that evidence. 2. g1 alone, opt-out of calX recorded with its URL: toSchedule empty. 3. reason `opted-out` on g1. 4. detail `meeting-opt-out (rule opt-out:url:zoom:123456789)`, no URL. 5. "calX not due / feed failed": the real `selectAutoRecordItems` sees only the Gmail candidate, g1 is scheduled, then vetoed. 6. "calX skipped, g1 has another start time (different webinar key)": only the URL identity links them, vetoed. 7. The recorded id-only state (no identity stored) still lets g1 through: NAMED, open by design, it is exactly an old or hint-less opt-out (ISS-T037OPT-002), not a failure of the fix.
The `CURRENT LIMITATION` test is turned into an assertion of the fixed behaviour (id-only still misses; stored identity vetoes).

## Mutations (13; each with a byte backup PER mutation, restore in a `finally`, test run under a 150 s timeout, then `git hash-object <file>` == index blob; all 13 reported `restored+hash==index: true`; worktree clean afterwards)
- M1 urlEntry never derives: killed by `D-015 ISS-T037W1-001 replay`, `recordOptOut: stores id + url identity...`, `cross-tenant`, `store round-trip under the lock`, `property: 3000 seeded cases`.
- M2 evaluator ignores stored meetings: killed by `D-015 ISS-T037W1-001 replay`, `ISS-T037W1-001 (fixed...)`, `property: 3000`.
- M3 matcher ignores key entries: killed by `property: 3000`.
- M4 degenerate check removed: killed by `strict validation`, `degenerate identities`, `property`.
- M5 persisted entries not validated: killed by `strict validation`, `degenerate identities`, `property`.
- M6 cap removed: killed by `cap: at the limit...`.
- M7 recordOptOut drops meetings: killed by `D-015 replay`, `recordOptOut...`, `cap`, `un-opt`, `cross-tenant`, `store round-trip`.
- M8 empty sessionKey groups again: killed by `property: 3000`.
- M9 old document gains an empty array: killed by `old documents: no optedOutMeetings key...` plus 3 older store/engine tests.
- M10 store drops the hint: killed by `un-opt`, `cross-tenant`, `store round-trip`.
- M11 API ignores hints: killed by `opt-outs: optional meetingUrl / sessionKey hints...` (router.test.ts).
- M12 identities not deduplicated: killed by `recordOptOut: stores id + url identity...`.
- M13 matcher fires without checking the list: killed by `strict validation`, `cross-tenant`, `property`.
Survivors: none.

## Ledger
New lane shard qa/issues.t037opt.jsonl: ISS-T037OPT-001 (medium, no un-opt), -002 (medium, clients must send hints), -003 (low, recurring room). ISS-T037W1-001 / -002 statuses not edited (checker's call).

## Fix cycle 1 (checker cycle 0: PASS at stated scope, merge conditions 1 and 3, ISS-T037OPT-004 / -005)
Note: references above to `join-rules-optout-meeting.test.ts` now refer to the tail of `join-rules-optout-identity.test.ts` (item 1). Every assertion kept; no test title was changed.

1. DIRECTORY BUDGET. `join-rules-optout-meeting.test.ts` (10 tests, 190 non-blank lines) was folded into the existing `join-rules-optout-identity.test.ts` (already on main) and deleted; duplicate helper definitions (`ZOOM`, `sel`, `it`, `ids`, identical text) were dropped, imports merged. The new source module `join-rules-optout.ts` stays a separate file (join-rules.ts is 295/300). Arithmetic: calendar files on codex/machine-migration-2026-10-09 = 29; this lane's net addition = +1 (`join-rules-optout.ts`; the test file is folded, nothing moved or renamed) -> 29 + 1 = 30 <= 30. Lane tree now holds 25 (was 26). Non-blank lines: join-rules-optout-identity.test.ts 381/400 (was 179 + 190 = 369 before the two pins, +12 for the pins).
2. PIN TESTS (ISS-T037OPT-005). Two named tests appended: `pin ISS-T037OPT-005 (M2, exact match)` and `pin ISS-T037OPT-005 (M6, tag separation)`. They cover stored url/key entries against longer, shorter, embedded and prefixed identities, `key:X` vs URL identity X, `url:X` vs sessionKey/id X, each with exact-match controls (the same identity IS vetoed), through both `applyJoinRules` and `evaluateJoinRules`.
   Mutants re-run on `join-rules-optout.ts` (`optedOutMeetingMatch`), byte backup per mutation, 150 s timeout, restore after each, `git hash-object` == `git rev-parse HEAD:` blob (true both times):
   - M2 prefix match (`startsWith` either way): KILLED by the M2 pin (pass 21, fail 1).
   - M6 `key:`/`url:` interchangeable (compare after the tag): KILLED by the M6 pin (pass 21, fail 1).
   The other 13 mutants were not re-run: no production code they mutate changed (join-rules-optout.ts untouched; only tests were moved/added there).
3. PRODUCTION ADAPTER (ISS-T037OPT-004, W7 gate a). `scripts/webinar/join-rules-host.ts`: `recordOptOut: (t, id) => recordTenantOptOut(stateDir, t, id)` became `(t, id, meeting) => recordTenantOptOut(stateDir, t, id, {}, meeting)`. deps.ts types and the router already carried the hint; validation stays in the store/normaliser. New test in `scripts/webinar/join-rules-host.test.ts` ("ISS-T037OPT-004 end to end"): real `createServer` + real router + real `createJoinRulesDeps` + real store in a temp dir. A POST with `meetingUrl` (regional host, pwd query) stores `url:zoom:123456789`; a later selection with only the sibling g1 is vetoed `opted-out`; a `sessionKey` hint stores `key:gmail:g1`; tenant-b unaffected; an id-only POST stores no identity and the sibling still joins (0/1, open by design). Reverting the adapter line makes the test fail (1/5, run), restored afterwards (cmp equal).

## Fix cycle 1: what stays open
W7 gate (b) (no client sends hints; ISS-T037OPT-002) and gate (d) (no un-opt operation; ISS-T037OPT-001, ISS-T037OPT-003). ISS-T037W1-001 remains OPEN until a client sends hints; the recorded id-only state still reproduces. No schedule-tick wiring, no web, no contracts/verdicts/enforcement/ledger-status edits.

## Fix cycle 1: D-015
- `ISS-T037OPT-004: 5/5` (adapter end to end; 1/5 with the adapter line reverted)
- `ISS-T037OPT-005: 2/2 mutants killed`
- `ISS-T037W1-001: 5/5 hinted, 0/1 id-only (open by design)`

## Fix cycle 1: Evidence (node 24 prepended; from the worktree)
- Test counts for this unit: before 20 (identity 10 + meeting 10) + host 9 = 29; after 22 (identity file: 10 + 10 folded + 2 pins) + host 10 = 32. No test or assertion removed.
- `cd packages/meeting-bot && node --test --import tsx src/calendar/{auto-join,join-rules-optout-identity,join-rules-select,join-rules-store-lock,join-rules-store,join-rules,schedule-tick}.test.ts src/send-now-command.test.ts src/send-now.test.ts` -> tests 164, pass 164, fail 0 (cycle 0: 162 with 20 in the two files; now 22 in one).
- `cd apps/api && node --test --import tsx src/join-rules/*.test.ts` -> 48/48.
- `node --test --import tsx scripts/webinar/join-rules-host.test.ts` -> 10/10, printing `ISS-T037OPT-004: 5/5; ISS-T037W1-001: 5/5 hinted, 0/1 id-only (open by design)`. `scripts/qa/join-rules-edit-api.test.ts` 4/4.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/meeting-bot: exit 0; in apps/api: exit 0.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)` (lane tree). `node scripts/lint-loc.mjs` -> only the two pre-existing violations (speakers-llm.ts:313, sb_join.py:1142). Touched files non-blank: identity test 381, host test 279, host 156.
- Not verified: lint-dirsize on the actual merged tree (computed arithmetically: 29 + 1 = 30).
