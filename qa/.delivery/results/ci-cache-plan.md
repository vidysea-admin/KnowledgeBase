APPROVED — for the exact handler relocation, subject to these implementation and verification constraints. This is plan approval only.

- **Ownership:** Move `remoteRules`, `networkFailure`, and the single `rejectedRemoteAuthorities` set from `join-rules-enforce.ts:109–183` into existing `join-rules-last-valid.ts`. That module already owns snapshot persistence (`:60–108`). Remove obsolete enforcement imports; leave validators, contracts, and the static guard unchanged.
- **Boundary:** Export `remoteRules(context, notifyDegraded)`. Use a minimal structural context containing only the existing fields it reads. Its result retains `{stored, healthy?, snapshot?} | {error}`. Call it as `remoteRules(c, event => degraded(c, event))`, preserving the existing read-only suppression and alert-error handling. No reverse import from the snapshot module into enforcement, duplicate handler, or new file.
- **Behavior:** Preserve endpoint/key/tenant authority hashing, revoked-credential refusal, transient-only fallback, original one-hour expiry, hard-failure invalidation, sanitized messages, atomic persistence, `readOnly`, and exact-document reselection. This separates snapshot I/O ownership; it does not make enforcement transitively write-free.
- **Budgets:** All five supplied file hashes match disk. The movable block contains 74 nonblank lines; the destination has 105, giving **179 before type/import additions**, comfortably below the configured 300-line limit.

Required completion evidence:

1. Unchanged single-writer check **RED before → GREEN after**.
2. Existing remote/runtime, enforcement, last-valid, and authenticated-selection tests green.
3. Focused evidence for rotated/revoked credentials, read-only cache/alert behavior, original expiry, and persistence failure. Extend existing tests where coverage is absent.
4. Critical falsification in an isolated copy: bypass cached authority binding and demonstrate that the credential-change refusal assertion fails; restore and verify.
5. Dependency-cycle/structure checks and the manifest-required full `test:lint` green before any separately authorized push.

No files changed, tests executed, agents spawned, network accessed, or runtime PASS claimed.