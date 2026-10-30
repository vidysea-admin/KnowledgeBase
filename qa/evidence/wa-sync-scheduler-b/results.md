# wa-sync-scheduler coordinator B - evidence (cycle 0, head b2fe2241)

Environment note: the bound worktree has no `apps/api/node_modules` (the `@lkb/*` workspace links), so 4 wired-deps tests fail there with
ERR_MODULE_NOT_FOUND (`@lkb/db`). All runs below used a throwaway `git archive HEAD` copy outside the bound root with node_modules junctions
(links to the main tree's installed packages, `@lkb/*` pointed at the copy's own packages). Tree blob equals HEAD blob throughout
(`sync-links.mjs` 5e1f721fce00c7d61d15a64845322bd0cd39b337, checked after every mutation).

## Re-run of the manifest verify commands (copy, replica set on 127.0.0.1:27199, private mongod started by this check and stopped)
- `node --test --import tsx scripts/whatsapp/sync-links.test.mjs` -> 20 passed, 0 failed
- `W9_TEST_MONGO_URL=mongodb://127.0.0.1:27199/?replicaSet=w9bchk node --test --import tsx scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs` -> 21 passed, 0 failed

## Falsification (per-mutation backup, restore in finally, HEAD-fidelity after each)
| id | criterion | mutation | green-before | after | restore |
|---|---|---|---|---|---|
| W9-1a | W9-1 | remove 5..1440 clamp | 1/0 | 0 pass, 1 red (cadence) | HEAD-OK |
| W9-1b | W9-1 (extra) | drop `state !== "active"` / owner re-check | 1/0 | red (active-only test) | HEAD-OK |
| W9-2 | W9-2 | held lock ignored (`catch { token = "x" }`) | 1/0 | red (two instances) | HEAD-OK |
| W9-3 | W9-3 | rethrow out of runCycle's per-link catch | 1/0 | red (store failure) | HEAD-OK |
| W9-3b | W9-3 (extra) | classifyError fallthrough returns `error.message` | 1/0 | red (closed list) | HEAD-OK |
| W9-4 | W9-4 | newTurns = all turns | 2/0 | 1 red (idempotent re-run) | HEAD-OK |
| W9-5 | W9-5 | cap hit no longer sets hitCap (becomes failed) | 3/0 | 2 red (time cap, size cap) | HEAD-OK |
| W9-6 | W9-6 | needs-relink never raised | 1/0 | red (status poll) | HEAD-OK |
| W9-7 | W9-7 | confirmUnlink skipped | 1/0 | red (retry until confirmed) | HEAD-OK |
| W9-8 | W9-8 | seed before first read removed | 2/0 | 1 red (ISS-WAOWNER-001 test) | HEAD-OK |
| M1c | builder survivor | scheduler's own owner filter in `listGroups` removed | 1/0 | green (survives) | HEAD-OK |
| MO1 | builder survivor | env-map tenant union removed from `listTenantIds` | 2/0 | green (survives) | HEAD-OK |

M1c: equivalent. `store.ts:146` filters rows to the queried owner, and the pinned resolver returns exactly one grant, so the removed filter is redundant.
MO1: NOT redundant. See probe 2: the union is the only reason an env-map tenant with no active link is visited, so it alone decides whether that
tenant's pending archiver unlinks are driven. No test pins it.

## Probe 1: tenant whose only link is `unlinked` with `archiverUnlinkPending: true` (real Mongo, copy) -> `probe-single-link-tenant.mjs`
```
strict insert rejected: Document failed validation        (field not in the W1 schema yet; declared open point 1; inserted with bypassDocumentValidation)
tenants listed: []
pendingUnlinks(solo-tenant) directly: [{"linkId":"aaaaaaaaaaaaaaaaaaaaaaaa","ownerUserId":"111111111111111111111111"}]
unlink calls after a full cycle: []
flag still set: true
```
## Probe 2: same row but the tenant is in WHATSAPP_TENANT_OWNER_MAP -> `probe-env-tenant.mjs`
```
raw distinct(active): []
tenants listed: ["env-tenant"]
log: link aaaaaaaaaaaaaaaaaaaaaaaa archiver unlink confirmed
unlink calls after a full cycle: [["unlink","111111111111111111111111"]]
flag still set: undefined
```
