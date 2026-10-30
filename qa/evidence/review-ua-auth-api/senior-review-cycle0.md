# senior-software-engineer review — ua-auth-api 7a4ed51a..f4790297 (cycle 0) — VERDICT: Warning
Tests not run by reviewer (worktree has no node_modules: express-rate-limit import fails).
- medium auth-service.ts:195-207 — login vs concurrent reset/change: sessions.create after verify without re-read, so a session created after revokeAllForUser survives; rehash write (needsRehash) has no CAS on passwordHash and can overwrite a fresh reset. Fix: CAS rehash on old hash; re-read user after create, revoke if passwordChangedAt newer or status changed. ~80% confidence, not reproduced.
- medium real-Mongo gap: auth-service.mongo.test.ts never run against a server (throttle CAS filter, $unset, E11000 via scopedCollection.insertOne). Run before merge.
- low auth-service.ts:173-176,258-265 — verify token consumed before user validated (burned on stale user).
- low auth-service.ts:252-271 — successful reset does not clear throttle row.
By design: email-keyed lockout DoS (UA-24); subjectHash keyed on AUTH_CSRF_SECRET (rotation clears lockouts — doc for ops); per-instance in-memory window limiters.
Verified sound: tenancy, Bearer refusal, enumeration resistance, lockout unique index, HMAC subject, opaque errors, single-use reset token.
