# senior-software-engineer review — ua-admin-api 7a4ed51a..cc08950f (cycle 0) — VERDICT: Warning
Tests not run by reviewer (worktree has no node_modules: ERR_MODULE_NOT_FOUND @lkb/db).
- medium admin-service.ts:206-289 — state CAS lands before the audit row, no rollback; audit failure -> 503 + missing event, and a retry then gets 409 (UA-25 / A6-2 "exactly one event").
- low admin-service.ts:252 — disable non-admin branch CAS lacks role expectation (promoted-in-race target bypasses guardAdminChange).
- low admin-service.ts:183 — revert() result ignored (possible zero-admin under cross-instance race while answering 409).
- low admin-service.ts:287-288 — supersedeTokens before insertToken, not atomic.
- open question: issue-link password_reset lets an admin mint a reset link for another admin (admin->admin takeover); spec owner to confirm.
Verified clean: session guard, Bearer stripping, tenancy scoping, strict input validation, no error leakage, issue-link origin, create-admin stdin-only password + prod opt-in.
