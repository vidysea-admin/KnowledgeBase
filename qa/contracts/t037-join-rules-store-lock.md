# Contract — t037-join-rules-store-lock (T-037, store concurrency slice)

> Ground truth for `packages/meeting-bot/src/calendar/join-rules-store.ts` and `join-rules-store-lock.ts`. Written by the checker; the maker never edits it.
> Extends `qa/contracts/t037-join-rules-persistence.md` (its criteria 1-4 still hold). Security class, uncapped.

## Security property
An acknowledged write (a call that returned without throwing) is never lost: not by a concurrent process, not by a crash, not by a reader. A write that did not happen throws a `JoinRulesStoreError`. The rules file is never missing, truncated or partial after any failure, and a reader sees either the previous or the new complete, valid document. (A missing file reads as "no rules", so a deleted-then-failed rename would silently turn a tenant's refusals into joins.)

## Criteria
1. **Mutual exclusion across processes.** `saveJoinRules`, `recordTenantApproval` and `recordTenantOptOut` hold an exclusive per-tenant lock `<stateDir>/join-rules/<tenant>.lock` (created with `wx`) around the whole read-validate-modify-write. N real processes recording distinct entries for one tenant, with no test hook, end with exactly the acknowledged entries present, a document that passes the engine validators, and no `.lock` or `.tmp` left.
2. **Failure is loud and clean.** Lock wait exceeded -> `JoinRulesStoreError` `locked`, nothing written, the other holder's lock untouched. A hard create failure -> `lock-failed`. The lock is released in a `finally` after success, validation error, refused load and failed rename. A call that throws left no entry in the file.
3. **Tenants are independent.** Contention on one tenant does not delay or fail writes to another.
4. **No stealing.** A lock older than the stale threshold (default 30 s; from the `at` stamp, else mtime) is reported with its path, age, content and the manual step (confirm the pid is gone, delete that file, retry) and is never removed by the store. Garbage, empty, array or `null` lock content produces only `locked`, never another error type. Manual deletion restores service.
5. **Lock path safety.** The lock file name is derived only from the validated tenant id; nothing outside `<stateDir>/join-rules/` can be created or deleted.
6. **Rename retry.** A rename that fails with EPERM/EACCES/EBUSY is retried for at most ~3 s under the lock. On exhaustion or any other rename error: `write-failed`, temp file removed, ORIGINAL file byte-identical. The target is never unlinked, truncated or renamed away at any point (no delete-then-rename).
7. **Readers.** `loadJoinRules` takes no lock. During concurrent writes every read returns a valid complete document or throws a clean store error; it never returns "no rules" for a tenant that has rules, and never exposes a temp file or partial write.
8. **Overwrite protection.** `saveJoinRules` refuses by default an existing file that is unreadable, corrupt, oversized, schema-invalid or embeds another tenant (the load error is thrown, nothing written); a non-regular file is refused always; `{overwriteInvalid: true}` replaces it. The record helpers cannot be given `overwriteInvalid`.
9. **API compatibility.** Public functions stay synchronous; existing error codes keep their meaning; added codes are only `locked` and `lock-failed`; the signature gains only trailing optional options, so `(dir, tenant, value)` callers are unaffected.
10. **Test-only hooks unreachable in production.** `afterRead` and `rename` exist only as per-call option fields; no environment variable or default turns either on.
11. **Operator recovery (precondition for unattended wiring, not for this unit).** A holder killed while holding the lock blocks all writes for that tenant, including opt-outs, until a human deletes the lock. The service must either alert on `locked`/stale errors with the runbook, or the store must recover automatically (see ISS-T037LOCK-001).
12. **Tests.** Cover 1-8 with real processes. Mutations that must fail the suite: no lock acquisition, lock opened without `wx`, stale-lock stealing, rename failure swallowed, load-first refusal skipped, target deleted before rename.
