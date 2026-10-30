# wa-owner-resolver checker A evidence (cycle 0, head 89165c77)
Copy: `git archive 89165c77` extracted outside the bound root, link-only node_modules junctions to the main tree (its @lkb/db is identical to base 00de9d92), one fresh copy per mutant, junctions unlinked before delete. Bound tree: `git status` clean, `git hash-object` == `git rev-parse HEAD:<file>` for owner-config.ts, store.ts, production.ts, knowledge.ts, before and after.
Tests per mutant: owner-config.test.ts + store-isolation.test.ts + route-tenant.test.ts (25 tests, green in every copy before the edit).

| id | criterion | edit (single hunk, one file) | after | killed by |
|---|---|---|---|---|
| M1 | W4-1 | owner-config.ts: member `mine` = any string userId (drop `=== caller.userId`) | 3 red | "member session resolves only its own link"; "a reader returning other tenants' rows ... cannot widen"; "empty sets are refused" |
| M2 | W4-2 | store.ts ingestGroup: drop `grant.linkId !== wanted` (linkId no longer narrows) | 1 red | "a jid marked by two permitted links needs linkId" (the `linkId: L2` call turns ambiguous) |
| M3 | W4-3 | owner-config.ts createDbBackedWhatsAppOwners: swallow `parseWhatsAppOwnerMap` throw | 1 red | "parseWhatsAppOwnerMap ... an invalid map still fails" |
| M4 | W4-4 | owner-config.ts resolver: empty set throws WhatsAppUnavailableError instead of NotConfigured | 4 red | "empty sets are refused"; "no map and no links -> not_configured"; "key-authenticated group listing ..." (HTTP 503 not_configured); "env map that disagrees ..." |
| M5 | W4-5 | store.ts ingestGroup: `ownersFor(tenantId, {...scope, caller: admin key})` | 5 red | "a member's archive queries never carry another owner's id" plus 4 more W4 store tests |
| G2 | guidance | whatsAppCallerFromAuth: `admin: admin` (session without userId + whatsapp-admin becomes admin key) | 1 red | "whatsAppCallerFromAuth ... a session without userId fails closed" |
| G3 | guidance | whatsAppCallerFromAuth: any scope starting `whatsapp` counts as admin | 1 red | same test |

7/7 killed by the assertion the test is named for (not import/setup failures). Mutants beyond the floor: G2, G3 (cap 10 at L).

Independent integrated probes (throwaway test files in the copy, deleted): (1) real `createDbBackedWhatsAppOwners` + real `createMongoWhatsAppDeps`, links LA(owner a, uA), LB(owner b, uB) in T, LC(owner c) in OTHER: admin lists {a:x,a:ya,b:x,b:yb}; member uA lists {x,ya}; plain key and no caller -> NotConfigured (no legacy link); owner c never queried; admin ingest "x" -> ambiguous_link with zero fetch/write; with linkId=LB fetches only b; jid "yc" absent; member with another's linkId absent; member alone resolves "x" to a. PASS. (2) the seeded legacy link document (map owner given upper-case) validates against `schema/whatsapp_links.schema.json` with ajv (negative controls rejected). PASS.
Regression re-run in the copy: review/*.test.ts + tenant-guards scoped-write/store-guards: 183 tests, 180 pass, 0 fail, 3 skipped (opt-in real-Mongo). `tsc --noEmit` apps/api: no output (clean).
