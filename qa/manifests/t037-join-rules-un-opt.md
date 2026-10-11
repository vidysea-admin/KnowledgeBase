# t037-join-rules-un-opt

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 (the next unblocked roadmap step: W7 gate (d) of `qa/contracts/t037-join-rules-veto-select.md`, "an un-opt operation exists, or the Approver accepts its absence in writing"); it also closes two open medium ledger rows (ISS-T037OPT-001, ISS-T037OPT-003), tier 4. Tier 1 and 2 were not consulted by this brief.
Security class: DATA-WRITE route (a new write route that changes which meetings are recorded for a tenant) - FULL ceremony, never capped.
Seam PASS count (join-rules edit-API seam): 4 PASSed verdicts name it (`t037-join-rules-edit-api` c1, `t037-join-rules-busy-status` c0, `t037-optout-meeting-identity-store` c0 and c1). The class-based cap (>= 2 PASSes) applies to NON-security findings only; a data-write route is security class, so the cap does not bind and this unit is allowed at count 4.
Lane: `lane/unopt` (worktree), ledger shard `qa/issues.unopt.jsonl` (ISS-UNOPT-001, -002), code commit 13edc8a

## Scope

One new operation on the existing router, forwarded by the production adapter. Veto-only is untouched: `applyJoinRules` and the matcher are not edited; un-opting can only leave FEWER vetoes.

`POST /calendar/join-rules/opt-outs/remove`
- Verb/path: POST, not DELETE. Every mutation in this router is a JSON-body POST; `express.json()` (server.ts:64) would parse a DELETE body, but proxies and fetch clients routinely drop DELETE bodies, and no new method means contract clause 1 (no DELETE/PATCH reaches a handler) is unchanged. Tested: DELETE/PUT/GET/PATCH on the route and DELETE on `/opt-outs` are all >= 400 and never reach a store call.
- Auth: the SAME write scope `join-rules` (`requireScope(WRITE_SCOPE)`); tenant only from `req.auth!.tenantId`. No key 401, `calendar`-only key 403 with zero store calls, `join-rules`-only key allowed (no read needed).
- Body: parsed by the ONE shared `optOutBody()` that POST /opt-outs now also uses (extracted, behaviour unchanged): keys exactly `eventId` (required, non-empty string <= 1024), `meetingUrl` (<= 2048), `sessionKey` (<= 256); unknown keys (incl. `tenantId`, `state`) 400; blank hints mean "not given".
- Response 200: `{ state, removed: { eventId: boolean, meetings: string[] } }`. `removed` reports what actually changed.

## Semantics (each decision)

1. Record id: removes that exact id from `optedOutEventIds` (exact string equality: `cal1` never removes `cal10` or `Cal1`).
2. Hints: when `meetingUrl` / `sessionKey` are given, the entries `urlEntry()` / `keyEntry()` derive (the SAME functions the opt-out stores with: no second derivation) are removed from `optedOutMeetings`, exact match only (no prefix, no case folding, no cross-tag).
3. Absent = success no-op (idempotent): 200, `removed: { eventId: false, meetings: [] }`, the store is NOT written (bytes identical, `save` not called). Distinct from a removal by `removed`.
4. ID-VS-IDENTITY LIMIT (stated plainly): the stored document does not link an id to the identities stored with it. Removing by id alone removes ONLY the id and does NOT guess which `url:` / `key:` entries belonged to it. To clear an identity the caller must pass the same hint (`meetingUrl` / `sessionKey`) it was stored with. Because `eventId` stays required (same body shape as the opt-out), clearing a stale identity alone means sending any `eventId` that is not opted out (a no-op for the id) plus the hint (ISS-UNOPT-002, low).
5. Old documents: a state without `optedOutMeetings` never gets the field from an un-opt (id removal, hint removal or no-op). If the list exists and the removal empties it, it stays as `[]` (valid; a pre-O1 build rejects the field either way, contract O1).
6. Nothing else changes: other ids, other identities, approvals, rules and every other tenant are byte-untouched (tests below).
7. Failure: the write is `saveJoinRules` (the existing locked, validating, atomic save). `locked` -> the existing table: 503 `join_rules_busy` + `Retry-After`, document byte-identical; corrupt stored file -> `deps.load` throws first: 500, bytes unchanged.

## GET exposure decision

No GET change was needed. `GET /calendar/join-rules` returns `deps.load(...)`, i.e. the validated stored `state`, which already includes `optedOutMeetings` when present (read scope `calendar`, unchanged). So an operator can already SEE every stored identity and pass it back as a hint to remove it. Entries are tenant-owned data validated on write and on load; tested that tenant B's GET never contains tenant A's entries (spy store with two tenants; and two real tenant directories at host level; mutation M7 breaks it and is killed).

## Files

- `packages/meeting-bot/src/calendar/join-rules-optout.ts` (+`removeOptOutEntries`, 95 non-blank lines): the pure state change; structural types, no new import.
- `apps/api/src/join-rules/deps.ts` (+`removeOptOut`, `OptOutRemovalValue`), `router.ts` (165 non-blank lines; the route + shared `optOutBody`, header comment updated).
- `scripts/webinar/join-rules-host.ts` (165): adapter `removeOptOut` = `loadJoinRules` -> `removeOptOutEntries` -> `saveJoinRules` only when changed. NOT edited (other lane): `join-rules-store.ts`, `join-rules-store-lock.ts`, its test, `join-rules.ts`, apps/web.
- Test stubs of `JoinRulesDeps` gained the required member: `router.test.ts`, `busy-status.test.ts` (thrower + route added to its ROUTES), `scope-write.test.ts` (route added to WRITES), `test-store.ts`, `scripts/qa/join-rules-edit-api.test.ts`. One existing test retitled: `join-rules-optout-identity.test.ts:302` ("the API has no un-opt operation" -> only the POST route removes; its assertion `!router.(delete|patch)(` is unchanged and still passes). No other existing assertion edited.

## Budgets / file counts

`packages/meeting-bot/src/calendar`: 30 of 30 files, NO file added (new meeting-bot tests appended to `join-rules-store.test.ts`, 246 non-blank lines; `join-rules-optout-identity.test.ts` stays 381). `apps/api/src/join-rules`: 9 files (+`un-opt.test.ts`, 115 non-blank). `scripts/webinar`: 24 files (none added; `join-rules-host.test.ts` 349 non-blank). `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (114 dir(s) within budget)`. `join-rules.ts` untouched.

## Evidence

```
cd packages/meeting-bot; node --test --import tsx src/calendar/join-rules*.test.ts
  ISS-T037OPT-001: 4/4
  ISS-T037OPT-003: 3/3
  property: 400 sequences, 12000 steps, 0 divergences
  ℹ tests 88  ℹ pass 88  ℹ fail 0
cd apps/api; node --test --import tsx src/join-rules/*.test.ts src/server.test.ts
  ℹ tests 83  ℹ pass 83  ℹ fail 0
node --test --import tsx scripts/webinar/join-rules-host.test.ts scripts/qa/join-rules-edit-api.test.ts
  ISS-T037OPT-004: 5/5; ISS-T037W1-001: 5/5 hinted, 0/1 id-only (open by design)
  ℹ tests 17  ℹ pass 17  ℹ fail 0
packages/meeting-bot: node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json  -> exit 0
apps/api:             node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json  -> exit 0
```

D-015 (the ledger's recorded reproductions replayed, counted by issue id, in `join-rules-store.test.ts`):
- `ISS-T037OPT-001: 4/4` - (1) the record id is removable; (2) the `url:` identity is removable; (3) the `key:` identity is removable; (4) the "no un-opt route exists" pin is replaced by the route (the router has `opt-outs/remove` and no delete/patch).
- `ISS-T037OPT-003: 3/3` - the recurring personal room `https://zoom.us/my/room.name`: (1) joins before any opt-out; (2) after opting out one occurrence with the URL a later meeting on the room is vetoed (`meeting-opt-out`, the recorded block); (3) after the un-opt with the same hint both the later meeting and the original id join again.
Neither row records numbered attack corpora, so none is omitted. Both stay `open` in the ledger (status changes are the checker's).

Tests (names): meeting-bot `join-rules-store.test.ts` (pure exactness, id-alone, old document, hostile hints, two tenants, failed write/corrupt, seeded property vs a hand-written Set model incl. "field exists iff a hint was ever stored" and approvals unchanged); api `un-opt.test.ts` (auth 401/403, method variants, tenant from key incl. query and body, idempotence with no write, hostile bodies 400 with zero store calls, tagged-string injection, GET own identities only); host `join-rules-host.test.ts` (real router + adapter + store, two tenant dirs: opt out with hint -> sibling vetoed -> un-opt same hint -> sibling free, other tenant byte-identical, rules/approvals untouched; stale lock -> 503 busy, bytes identical, then success; corrupt file 500; old document never gains the field).

## Mutations (harness in the scratchpad, not committed; per-mutation byte backup, restore in `finally`, 170 s SIGKILL timeout per run; after EACH, `git hash-object <file>` == `git rev-parse HEAD:<file>` verified)

| mutation | suite | result | killed by (first names) |
|---|---|---|---|
| M1 remove route without the write scope (`calendar` only) | api | fail 3 | `auth: no key / bad key 401, read-only key 403, ...`; `a calendar-only (read) key gets 403 on PUT and both POSTs...` |
| M2 tenant from the query string | api | fail 1 | `query string, headers and path never select a tenant...` |
| M3 removes ALL identities, not the matching ones | meeting-bot | fail 4 | `un-opt is exact: ...`; `un-opt by id alone never guesses identities...`; `hostile hints and ids...` |
| M4 removes another record's opt-out (all ids) | meeting-bot | fail 3 | `un-opt is exact...`; `property: ...` |
| M5 prefix match on removal (ids and identities) | meeting-bot | fail 2 | `un-opt is exact...`; `property: ...` |
| M6 write bypassing the lock path (direct `writeFileSync`) | host | fail 1 | `un-opt while the tenant lock is held: 503 join_rules_busy, the document is byte-identical...` |
| M7 GET loads another tenant (leak) | api / host | fail 1 / fail 1 | `GET exposes the caller's own stored identities...` / `un-opt end to end: ...` |
| M8 hints ignored (id-only) | meeting-bot | fail 7 | both D-015 replays, `un-opt is exact...` |
| M9 invents `optedOutMeetings` on an old document | meeting-bot | fail 2 | `old document (no optedOutMeetings)...`; `property: ...` |
| M10 second derivation (raw hint instead of `urlEntry`) | meeting-bot | fail 5 | both D-015 replays, `un-opt is exact...` |

11 runs (10 mutations + M7 at host level), 11 killed, all restores matched the HEAD blob.

## NOT done / limits

- apps/web editor page (another lane): no remove button yet; the API and GET are what it needs.
- W7 gate (b) (the production opt-out client sends `meetingUrl` and `sessionKey`, ISS-T037OPT-002) is NOT addressed. Gate (d) is addressed by this unit (an un-opt operation exists) but W7 stays open until (b) holds; no wiring switch-over here.
- Load -> save in the adapter is not one critical section across processes (ISS-UNOPT-001, medium: needs a mutate helper exported from `join-rules-store.ts`, which this lane may not edit). Safe today (single host via pid lock + per-tenant in-process serialisation), same as PUT.
- ISS-UNOPT-002 (low): clearing an identity alone needs a throwaway `eventId`.
- Not run: browser, web tests, full suites, DB. Contracts, verdicts and enforcement paths untouched; no new rule matching or approval logic.
