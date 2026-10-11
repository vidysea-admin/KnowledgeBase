# Contract - tenant-id-validity (auth and data layers)
Written by the independent checker for auth-require-tenant-on-key (2026-10-11). Ground truth; the maker never edits it.

1. A tenant id is `typeof === "string"`, length >= 1, equal to its own trim(), with no character in U+0000-001F, U+007F-009F, U+2028, U+2029. No stricter pattern: real ids include toc, tenant-1, tA, t, system, synthetic-capture.
2. requireAuth: a key record that is not an object or whose tenantId is not a valid tenant id gets exactly the unknown-key 401 (status, headers, body bytes identical), after the store lookup, with no log and no throw; req.auth stays unset and next is never called.
3. scopedCollection coll(tenant) and withTenant throw `tenantId is required` for any non-valid tenant (undefined, null, "", whitespace, control chars, number, boolean, bigint, symbol, function, array, plain or operator object, Date, RegExp, String wrapper, objects with toString/Symbol.toPrimitive, Proxy) before any driver call. No filter handed to the driver may contain an operator object under tenantId.
4. Every helper that merges or builds a `{tenantId}` filter or document in packages/db goes through assertValidTenantId. Sites outside packages/db that hand-build tenant filters must take their tenant from req.auth (validated) or a validated string.
5. Defence in depth: a route-level test must exercise the handler with auth bypassed and an invalid tenant and assert no tenant data is read; an auth-level 401 test alone does not satisfy this.
6. A fix for a filed issue is measured against that issue's recorded reproductions verbatim (D-015).
7. (cycle 1) The route-level defence-in-depth test of clause 5 must execute the PRODUCTION tree-store code (createMongoTreeStore().load), through a hermetic fake client, not a hand-written copy of it; a hard-coded tenant, operator-spread or coerced tenant in the real load must fail a behavioural test (a source-text pin alone does not satisfy this).
8. (cycle 1) A merge condition stated as an expected test result (for example skipped 0, fail 0) must be verified by simulating the post-merge state before it is stated.
