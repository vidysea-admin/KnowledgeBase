# Contract - require-scope-exact-match (apps/api/src/auth.ts requireScope / requireAuth)

> Ground truth derived by the checker from ISS-TESTGAPS-001 (string `scopes` substring-matched under `.includes`)
> and the value matrix run on 5350f68. Security class (central authorisation): never capped. The maker never edits this file.

## Criteria (each machine-checkable)

1. `requireScope(s)` calls next ONLY when `req.auth.scopes` is a real array holding an element strictly equal (`===`) to `s`.
   Exact scope alone, among others, and duplicated all pass.
2. Every other value is refused 403 with next never called, no throw, no 500: any string (equal to, containing, comma- or
   space-joined with the scope), null, undefined, number, boolean, `{}`, `{includes:()=>true}`, array-like objects, `Set`,
   arrays of String wrapper objects, nested arrays, objects whose toString returns the scope, different case or surrounding
   whitespace, empty array, missing `req.auth`.
3. The 403 body is exactly `{error:"forbidden", message}` and does not echo the scopes the key holds.
4. ISS-TESTGAPS-001's two recorded reproductions are refused verbatim: `"calendar:read"` vs `requireScope("calendar")` and
   `"join-rules calendar keys"` vs `requireScope("keys")`.
5. `requireAuth` never splits, trims, wraps or `Array.from`s a scopes value. A value that is not an array of strings
   authenticates as a key with `scopes: []` (every scoped route 403s); a well-formed record is passed through unchanged.
6. Every call site passes a non-empty string literal or constant. Known hardening gap: `requireScope("")` lets a key holding
   `""` through; no call site does this.
7. A key record with no valid tenant (missing, null, empty, non-string tenantId) must NOT authenticate (open: ISS-AUTHSCOPE-001).
8. The unit's regression test must fail on the pre-fix `.includes` implementation (>= 4 failures against 8a05ccf's auth.ts).
9. Later units that touch scope matching re-run: require-scope.test.ts, join-rules/*, server, keys, calendar and every route test.
