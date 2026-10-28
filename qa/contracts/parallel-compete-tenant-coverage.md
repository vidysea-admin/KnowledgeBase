# Contract — parallel-compete-tenant-coverage

Supplementary security regression coverage only, checked independently in normal mode on
2026-10-09. Extends compete-screen C3/C5 and developer-api C2 without replacing their release
criteria. Owns only acceptance criteria for `apps/api/src/routes/compete.test.ts`.

1. Seed actual existing evaluations for tenants A and B in the existing tenant-aware fake.
2. Authorized B targets A's existing ID while forging body tenant A: HTTP 404 with exact
   not-found response; store receives authenticated B; both original rows remain identical.
3. A's ask-only key targets A: HTTP 403 before any store attempt; both rows remain identical.
4. Authorized A and B each update their own existing evaluation successfully despite forging
   the other tenant in the body. Store arguments use authenticated owner; only the expected
   answer/score fields change. Positive controls exclude deny-everyone implementations.
5. Final row count remains two; exactly three authorized score attempts occur. No insert is
   accepted as a scoring side effect.
6. Real Express route/auth/scope handlers execute. Fake store must match inspected production
   targeting: tenant plus ID, update existing row, false on unmatched row. Mongo integration is
   outside this contract.
7. Bounded one-file Node test run passes with concurrency 1, 45-second suite timeout; new
   regression has 10-second test timeout and 3-second request aborts. Record command/output
   and tested SHA256 in the verdict. No providers, live database, browser or mutations.
