# t037-optout-meeting-identity-store

Task: T-037 (scheduler switch-over; precondition W7 of qa/contracts/t037-join-rules-veto-select.md). Lane `t037opt`, branch `lane/t037opt` from 1414d79. Class: SECURITY (join authorization) and DATA WRITE (tenant join-rules document).
Tier: 2, open HIGH issue ISS-T037W1-001. Full ceremony.

Status: ready-for-check
Fix cycle: 0

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
