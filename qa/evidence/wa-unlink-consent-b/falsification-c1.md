# wa-unlink-consent coordinator B - cycle 1 falsification (archive copy of b7d4f0d7 outside the bound root; green-before 6/6 on account-coupling tests incl. real Mongo)
| id | criterion | edit (single hunk) | tests run | result |
|---|---|---|---|---|
| A1 | W8-4 | admin-service disable: `event(..., {status:"disabled"})` -> no account | account-coupling + mounted-routes | red (R-10 composition, R-10 e2e disable) |
| A2 | W8-4 | reject stops passing account | account-coupling | red (reject e2e) |
| A3 | W8-4 | role change stops passing account | account-coupling | red (viewer demotion e2e) |
| A4 | W8-4 | try/catch around hook removed | account-coupling | red (failing hook never fails the action) |
| A5 | W8-4 | composition default hook `= undefined` | mounted-routes + account-coupling.mongo | red (composition default, real-Mongo composition) |
| A6 | W8-4 | composition does not pass `onAccountChange` to createAdminRouter | mounted-routes + account-coupling.mongo | red (3 tests) |
| A7 | W8-4 | `accountChanged` returns 0 always | account-coupling + mongo | red |
| A8 | W8-4 | `accountChanged` suspends even a healthy active member/admin | account-coupling | red (member<->admin keeps the link) |
| A9 | W8-4 | `suspendForAccount` lists links for `undefined` user | account-coupling + mongo | red |
| B1 | W8-6 | `followThrough` quarantine step removed | unlink.mongo.test.ts (real replica set) | red |
| B2 | W8-6 | `followThrough` consent-withdraw step removed | unlink.mongo.test.ts (real replica set) | red |

Harness: scratchpad b1/mut.py (not committed): one `.mut.bak` per mutation, restore in `finally`, 170 s subprocess timeout, no EXIT trap; after each mutant byte compare plus `git hash-object <file>` == `git rev-parse b7d4f0d7:<file>` (all 11 true). Real Mongo: own mongod 7.0.28, replica set w8bc1, 127.0.0.1:27951, throwaway lkb_test_* DBs dropped by the tests.
