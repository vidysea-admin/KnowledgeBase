# Manifest — wa-key-store
**Contract:** qa/contracts/wa-key-store.md (the criteria and invariants are on the Criteria line below; the joint check is the checker's); decisions D-227, archiver D-022/D-023/D-025, KB D-235
**Goal task:** none
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** required
dual-trigger: security src/wa/authState.ts:218
dual-note: the unit is credential handling and tenancy (contract marks C3B-C7 SECURITY CLASS). The owner check is `ownerOf` at src/wa/authState.ts:217-222 (24 lowercase hex or `BAD_OWNER`, before any backend call); every backend query carries the owner id; the AES-256-GCM calls are `seal` :236 and `unseal` :245 with owner/type/id bound as AAD (:232). The route tool printed `dual:false` for this range (see Route line), so the dual requirement here comes from the contract's SECURITY CLASS label, not from the route tool.
**Persona walk:** skip (no screen, flow or user type changed; a library module behind `createAuthState`, no UI, no HTTP route)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one spec-complete unit, two owned files, one builder (the test file and the module share every helper).

## What changed
All paths are relative to the ARCHIVER repo worktree, not the KB root. Worktree `D:/KnowledgeBase/.worktrees/wa-c3b`, base `c4bb66b3` (C3A declaration commit), head `350df1670df8592b411c0f0a833895a79252caef` (build `e05642e`, then one repair commit `350df16`, decision D-238, fix cycle stays 0). Exactly two files changed (`git diff --name-only c4bb66b3..HEAD`): `src/wa/authState.ts` (488 lines) and `src/wa/authState.test.ts` (1341 lines); together 1622 insertions and 28 deletions against the base.
- src/wa/authState.ts (edited in place) — the five existing exported functions each gained a one-line dispatch on `config.keyStore === 'mongo'` (`createAuthState`, `destroyAuthState`, `hasRestorableAuthState`, `restoreAuthState`, `linkedUserIds`); the file branch is the old code, untouched. New at the bottom: `KeyColl` interface, `keyStoreTestSeam` (`{creds, keys, now}`), `KeyStoreError` (codes `BAD_OWNER`, `KEY_MISSING`, `DECRYPT_FAILED`, `LINK_GONE`; fixed messages only), `ownerOf` (:217), `requireKey` (:224, a 32-byte Buffer or `KEY_MISSING`), `aad` (:232), `seal`/`unseal` (:236/:245, node:crypto AES-256-GCM, fresh 12-byte nonce per value, 16-byte tag, envelope `{v:1, nonce, ct, tag}` as `Binary`), `withLock` (:264, in-process per-row write order), `upsertLive` (:276, retry on E11000 up to 5), `logFailed` (:289, logs only `{what, type, errName, errCode}`), `createMongoAuthState` (:294), `mongoPrune` (:374), `isDup` (:384), `moveKeysIntoArchive` (:393), `moveKeysOutOfArchive` (:414), `mongoDestroy` (:433), `mongoHasRestorable`, `mongoRestore`, `mongoLinkedUserIds`. No new import outside `node:crypto`, `mongodb`, `@whiskeysockets/baileys` (already dependencies), the repo's config, logger and the C3A names. No package added.
- src/wa/authState.test.ts (edited in place) — the 7 existing cases now run through one test seam, `each(name, body, only?, timeout?)`, which registers the same body once per rig: `[file]`, `[fake]` (an in-memory emulation of the two collections with unique indexes, `$in/$ne/$gt/$lte`, `$set/$unset/$setOnInsert`, upsert and E11000) and `[mongo]` (the real collections on a loopback mongod, skipped as NOT-MEASURED when `C3B_TEST_MONGO_URI` is unset). Only setup helpers changed (`fakeLink`, `exists`, `readCredsText`, `halfLink`, `archiveNames`); no `assert` line of an existing case was removed or edited (the 28 removed lines are imports, the old `test(` openers, the `fs` read and `readdir` lines the helpers now wrap, and setup). New cases C3B-C1z..C3B-I5/I6 listed under Tests below. Mongo tests first call the inline `assertLoopbackMongo` and use a `whatsapp_msg_test_<random>` database.
- Design (documented in the code): a live row has `archiveId: null`; an archive stamps `archiveId` and one shared `archivedAt` on every row; the creds row is the commit point (unlink moves creds first then keys, restore moves keys first then creds). `archiveId` is deliberately NOT in the AAD, so archiving and restoring need no re-encryption. A repeated unlink with no live creds moves orphan live keys with `updatedAt <= newest archive's archivedAt` into that archive and deletes the rest; a repeated restore deletes live keys with `updatedAt > archivedAt` before moving. No transaction, no change stream.
- Not edited: `sessionManager.ts`, `config.ts`, `mongo.ts`, `types.ts`, `readOnlySocket.ts` (diff of each is empty).
- falsified (unchanged): none; every falsification ran in a throwaway COPY of the worktree (`scratchpad/c3b-build/mutcopy`, outside the repo, no `.git`, no junction), one mutation at a time, byte backup taken just before each mutation, test command under a 150 s timeout, restore in a `finally` that also fires on SIGINT and SIGTERM, then a byte compare, and at the end `git hash-object` of the copy equals the worktree's `HEAD:src/wa/authState.ts` blob.
- [ASSUMPTION] `linkedUserIds` must list owners, so it is the one ownerless query: `creds.find({archiveId: null}, {projection: {ownerUserId: 1}})` on the creds collection only. C3B-C7 says every backend query carries an owner id; this is the stated exception and the test C3B-C7d asserts there is exactly this one (see Flags).
- [ASSUMPTION] The owner-id validation (24 lowercase hex) and the key requirement apply only on the `mongo` branch. The file branch keeps accepting what it accepted, because C3B-I1 says it behaves exactly as before.
- [ASSUMPTION] The test encryption key is generated inside the test run (`randomBytes(32)`) and never printed; there is no production key anywhere in this unit.
- C3B-C6e (the "belongs to this archive" test): ruled in commit 34c987a0 (`updatedAt` against the archive's `archivedAt`, with the tie and bounds); the duplicate rule on top of it was ruled in commit e6fa7d87. Both are built and tested in the repair commit.
- C3B-C5b (cache after a rejected write): ruled in commit 34c987a0 (it binds this handle only); the library wrapper's cache is filed, not built (see Filed, not built).
- Interpretation (age rule): an archive is restorable iff its creds row exists and `archivedAt > now - ARCHIVE_MAX_AGE_DAYS x 86400 s`; the expiry index (declared by C3A) is only the sweeper, the code also enforces the limit so a row the server has not yet removed is not restorable.

## Repair before check
Decision D-238; fix cycle stays 0; one commit `350df16`; five items, each with file:line.
  1. `saveCreds` is update-only once the handle holds a creds row. `src/wa/authState.ts:306` (`let held = row !== null`), `:355-356` (update with no upsert; a zero matched count throws `KeyStoreError` code `LINK_GONE`, nothing written, logged by error class only through `logFailed` :289); `KeyColl.updateOne` returns `{matchedCount}` at `:177`; the code at `:194`. A handle opened on no row still creates the first row on its first `saveCreds` (the `held` flag is set at its first success).
  2. Duplicate rule. `src/wa/authState.ts:384` (`isDup`, code 11000), `:393` `moveKeysIntoArchive` (used by the repeat unlink at `:446`), `:414` `moveKeysOutOfArchive` (used by restore at `:479`). Both try the bulk move and on a clash finish row by row, dropping the archived twin; the live row (the newer write) survives. Every fallback query carries the owner id.
  3. Tests for C3B-C6f at `src/wa/authState.test.ts:982` (rejection, code, raw rows unchanged, not listed, restore returns true, no extra archive, archived creds returned, log by class only), `:1008` (a removed creds row also rejects; a fresh handle's first write still works and later ones update), `:1023` (a key `set` after the unlink, then a restore).
  4. Tests for the duplicate rule at `:1041` (restore) and `:1057` (repeat unlink), on the unique-enforcing fake (code 11000) and on the real loopback mongod.
  5. Tie tests with a frozen fake clock at `:1071` (repeat unlink: a key row at `archivedAt` is moved, one at `archivedAt` + 1 ms is deleted) and `:1084` (repeat restore: the row at `archivedAt` is kept, the one at +1 ms deleted). The fake `updateOne` returns `{matchedCount}` (test file) so the module's check is exercised.

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: L (credential handling and tenancy security class; encrypts every Baileys credential at rest)
Round: 2 files (1 source edited, 1 test file edited), 14 criteria and invariants, est 3 h; repair round D-238 (five items) done on top, fix cycle 0
slow-plan: one test process at a time (laptop shared); the C3B-C8d expiry probe waits for the server's TTL sweep and needs a long timeout (150 s in the test; the run took 66 s); the falsification batch took about 6 min for 32 mutants.
Criteria: `C3B-C1`, `C3B-C2`, `C3B-C3`, `C3B-C4`, `C3B-C5`, `C3B-C6`, `C3B-C7`, `C3B-C8`, `C3B-I1`, `C3B-I2`, `C3B-I3`, `C3B-I4`, `C3B-I5`, `C3B-I6`
Owners: one builder owns `src/wa/authState.ts` and `src/wa/authState.test.ts` (no file has two owners).
Fan-out: none; SERIAL: one unit, one builder, one module and its test share every helper.
Base / checked state: base c4bb66b3; head 350df16 (350df1670df8592b411c0f0a833895a79252caef); worktree clean; blobs `src/wa/authState.ts:bcabe1d45042593d49b1bdee628413157b0d3a25`, `src/wa/authState.test.ts:56d7e7852cf0f9858a1d2be6cc5a749d704be215` (each equals `git rev-parse HEAD:<file>`).
Gate answers: none; consent is out of scope (D-210); no production write, no push, no deploy, no real Mongo, no WhatsApp, no `.env` read, nothing under a `sessions` folder opened, no install, no network, no junction created.
Affected tests / full-suite trigger: `src/wa/authState.test.ts` plus `src/wa/readOnlySocket.test.ts` (I3). `npm test` was not run (instruction); the other archiver test files are untouched by this unit and import none of the changed exports' behaviour in the file mode.
Test seam (one body on every backend): `each(name, body, only?, timeout?)` in `src/wa/authState.test.ts` registers each body once per rig, `[file]` / `[fake]` / `[mongo]`; `only` restricts a case to some rigs (C1a: fake and mongo; C8c and C8d: mongo only). The module-side seam is `keyStoreTestSeam` (`{creds, keys, now}`) exported from `authState.ts`; tests inject a recording `Probe` around the fake or real collection and a fake clock.
Random tests and seeds: C3B-C1a (1000 operations; fake and mongo rigs) is the random test. Seed comes from env `C3B_SEED` (default printed at start); the run on this head used `C3B_SEED=12345`, derived per-case seed `12446`, printed as `C3B-C1a [fake] seed=12446` and `C3B-C1a [mongo] seed=12446`. Replay: `C3B_SEED=12345 npx tsx --test src/wa/authState.test.ts`. The parallel-write tests (C3B-C5c2, C3B-C5d) use fixed counts, no seed.
SignalDataTypeMap, quoted from `node_modules/baileys/lib/Types/Auth.d.ts:68-85`, each type tested in C3B-C1a and C3B-C2 (and the list itself pinned equal by C3B-C1z):
```
'pre-key': KeyPair;                                   [tested]
session: Uint8Array;                                  [tested]
'sender-key': Uint8Array;                             [tested]
'sender-key-memory': { [jid: string]: boolean };      [tested]
'app-state-sync-key': proto.Message.IAppStateSyncKeyData;  [tested, read back as AppStateSyncKeyData]
'app-state-sync-version': LTHashState;                [tested]
'lid-mapping': string;                                [tested]
'device-list': string[];                              [tested]
tctoken: { token: Buffer; timestamp?; senderTimestamp? };  [tested]
'identity-key': Uint8Array;                           [tested]
```
Tests[C3B-C1]: src/wa/authState.test.ts::"C3B-C1z", "C3B-C1a", "C3B-C1b" and the 7 existing cases — C1z pins the tested type list equal to the Auth.d.ts list; C1a runs 1000 seeded operations on the file store, the database store and a Map model (a missing id reads null); C1b reads through makeCacheableSignalKeyStore after a set or delete in the same handle; the 7 existing cases keep their assertions on all three rigs
Tests[C3B-C2]: src/wa/authState.test.ts::"C3B-C2" — creds with Buffer and nested binary fields and all 10 key types read back byte for byte on file, fake and mongo rigs; a falsy value deletes; app-state-sync-key comes back as AppStateSyncKeyData
Tests[C3B-C3]: src/wa/authState.test.ts::"C3B-C3" — raw rows hold no canary in any field, the envelope is {v:1, nonce 12 bytes, ct, tag 16 bytes}, the same value written twice stores two nonces and two ct, the same value for two owners gives different ct
Tests[C3B-C4]: src/wa/authState.test.ts::"C3B-C4a/b", "C3B-C4c", "C3B-C4d", "C3B-C4e", "C3B-C4f" — wrong key and one flipped byte of ct, tag or nonce reject with DECRYPT_FAILED, never null; a ciphertext moved to another owner, type or id rejects; undecryptable creds reject on open with nothing overwritten; no key or a key not 32 bytes rejects KEY_MISSING and never falls back to the file store; no secret in any message or log line
Tests[C3B-C5]: src/wa/authState.test.ts::"C3B-C5a", "C3B-C5b", "C3B-C5c1", "C3B-C5c2", "C3B-C5d" — a second handle sees a value once set or saveCreds resolves; a rejected write rejects and is invisible; an injected E11000 is retried; 100 parallel sets of one key leave one row and a saveCreds storm ends on the last state; 1000 reads during writes see old or new, never partial
Tests[C3B-C6]: src/wa/authState.test.ts::"C3B-C6a", "C3B-C6b", "C3B-C6c", "C3B-C6d", "C3B-C6e" (the failed-step case, the two duplicate cases, the two tie cases), "C3B-C6f" (three cases) and the 7 existing lifecycle cases — unlink archives live rows under one archiveId and returns null without creds; 6 unlinks keep the 5 newest in both collections; restore refuses a live link and otherwise restores the newest; linkedUserIds is exactly the owners with a live creds row; a failed unlink or restore leaves the owner unlinked and a repeat completes it; moving key rows into or out of an archive never fails on an (owner, type, id) clash and one decryptable row remains; a key row at archivedAt is kept or moved and one at archivedAt + 1 ms is deleted; a saveCreds after an unlink rejects LINK_GONE, writes nothing, and never lists, revives or duplicates the link
Tests[C3B-C7]: src/wa/authState.test.ts::"C3B-C7a", "C3B-C7b", "C3B-C7c", "C3B-C7d" — owner A never reaches a handle for owner B; delete, archive, prune and restore of A change none of B raw rows; an owner id that is not 24 lowercase hex is refused before any backend call; every recorded backend filter carries the owner id except exactly the two ownerless creds queries of linkedUserIds
Tests[C3B-C8]: src/wa/authState.test.ts::"C3B-C8a", "C3B-C8b", "C3B-C8c", "C3B-C8d", "C3B-C8e" — one shared archivedAt per archive and none on a live row; fake clock restorable at the limit minus 1 s and not at plus 1 s; (mongo only) expireAfterSeconds read back from the server for both collections and a past archivedAt row removed by the server within 90 s while a live row beside it stays; no other module touches the key collections
Tests[C3B-I1]: src/wa/authState.test.ts::"C3B-I1" — with the file store the five functions keep their shape; npm run typecheck is clean with sessionManager.ts unedited
Tests[C3B-I2]: src/wa/authState.test.ts — the 7 existing cases run through each() on three rigs and no assert line was removed (git diff of the test file inspected)
Tests[C3B-I3]: src/wa/readOnlySocket.test.ts — the existing read-only socket suite pins ALLOWED; the file itself has an empty diff and the changed-file list is exactly the two owned files
Tests[C3B-I4]: src/wa/authState.test.ts::"C3B-C4f", "C3B-C5b" and the after() sweep — a global sweep over every captured log line and every thrown message of the whole run looks for key hex, nonce, ciphertext and canary
Tests[C3B-I5]: src/wa/authState.test.ts::"C3B-I5/I6" — the test greps the module source for withTransaction, startSession( and .watch(; the grep Pre-check repeats it
Tests[C3B-I6]: src/wa/authState.test.ts::"C3B-I5/I6" — the loopback guard table refuses everything but 127.0.0.1 and localhost; every Mongo test asserts the host first; the file backend uses ./.test-sessions only
Red-first: `C3B_SEED=12345 npx tsx --test --test-force-exit src/wa/authState.test.ts` against the module with its five `config.keyStore` dispatch lines reverted (the pre-change behaviour of the five exported functions; `dispatch.patch` re-applied afterwards) -> `ℹ tests 79  ℹ pass 11  ℹ fail 34  ℹ skipped 34`. The 11 passes are the 7 existing cases on the `[file]` rig plus `C3B-C1z`, `C3B-C1b [file]`, `C3B-C2 [file]` and `C3B-I5/I6` (all file-store or static); every `[fake]` case (the 7 existing and every new criterion case) and `C3B-C8e` and `C3B-I1` failed; the 34 `[mongo]` cases skipped for lack of a database. Honesty on order: this is NOT strict test-first. The module and the test file were written together; the red run was made by reverting the dispatch lines of the finished module, so the red failures show the tests need the new behaviour but do not show each test was written before its code. The mutants below are the stronger evidence. The first typecheck of the test file found three `Awaitable` type errors (fixed in the test), and the C3B-C6a test needed a 5 ms wait because timestamps resolve to 1 ms. Repair round (D-238): the new tests were written first and run against the unrepaired module on the no-database command: `ℹ tests 93  ℹ pass 48  ℹ fail 4  ℹ skipped 41`; the 4 reds, all on the `[fake]` rig, were the two C3B-C6f cases that need LINK_GONE and the two C3B-C6e duplicate cases (restore, repeat unlink), each for the reason named (the stale `saveCreds` resolved and re-created a live row; the bulk move threw the unique-index error). The `[mongo]` rig was not run at that moment (no database was up), so the red-first is fake-rig only; the C3B-C6e tie cases pinned behaviour that already held and were green before and after (they are falsified by N9 and N10 instead).
Pre-check[C3B-C1]: 350df16 C3B_SEED=12345 npx tsx --test --test-force-exit src/wa/authState.test.ts -> 52 passed, 0 failed, 41 skipped (93 tests; the [mongo] rig is NOT-MEASURED, no URI; cwd archiver worktree root) t=8 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-C2]: 350df16 C3B_SEED=12345 npx tsx --test --test-force-exit src/wa/authState.test.ts -> 52 passed, 0 failed, 41 skipped (93 tests; the [mongo] rig is NOT-MEASURED, no URI; cwd archiver worktree root) t=8 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-C3]: 350df16 C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test --test-force-exit src/wa/authState.test.ts -> 93 passed, 0 failed, 0 skipped (cwd archiver worktree root, loopback mongod 7.0.24 on 127.0.0.1) t=66 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-C4]: 350df16 C3B_SEED=12345 npx tsx --test --test-force-exit src/wa/authState.test.ts -> 52 passed, 0 failed, 41 skipped (93 tests; the [mongo] rig is NOT-MEASURED, no URI; cwd archiver worktree root) t=8 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-C5]: 350df16 C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test --test-force-exit src/wa/authState.test.ts -> 93 passed, 0 failed, 0 skipped (cwd archiver worktree root, loopback mongod 7.0.24 on 127.0.0.1) t=66 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-C6]: 350df16 C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test --test-force-exit src/wa/authState.test.ts -> 93 passed, 0 failed, 0 skipped (cwd archiver worktree root, loopback mongod 7.0.24 on 127.0.0.1) t=66 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-C7]: 350df16 C3B_SEED=12345 npx tsx --test --test-force-exit src/wa/authState.test.ts -> 52 passed, 0 failed, 41 skipped (93 tests; the [mongo] rig is NOT-MEASURED, no URI; cwd archiver worktree root) t=8 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-C8]: 350df16 C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test --test-force-exit src/wa/authState.test.ts -> 93 passed, 0 failed, 0 skipped (cwd archiver worktree root, loopback mongod 7.0.24 on 127.0.0.1; C3B-C8c and C3B-C8d run only here) t=66 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-I1]: 350df16 C3B_SEED=12345 npx tsx --test --test-force-exit src/wa/authState.test.ts -> 52 passed, 0 failed, 41 skipped (93 tests; the [mongo] rig is NOT-MEASURED, no URI; cwd archiver worktree root) t=8 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78 (the five exported functions keep their shape on the file store; sessionManager.ts unedited)
Pre-check[C3B-I1]: 350df16 npm run typecheck -> exit 0, no output (cwd archiver worktree root) t=8 blobs=src/wa/authState.ts:bcabe1d
Pre-check[C3B-I2]: 350df16 git diff c4bb66b3..HEAD -- src/wa/authState.test.ts -> ok, 20 removed lines in the test file inspected, none is an assert; the 7 existing cases pass on the [file] rig in the no-database run t=1 blobs=src/wa/authState.test.ts:56d7e78
Pre-check[C3B-I3]: 350df16 npx tsx --test --test-force-exit src/wa/readOnlySocket.test.ts -> 4 passed, 0 failed (cwd archiver worktree root; the diff of readOnlySocket.ts is 0 bytes and git diff --name-only c4bb66b3..HEAD lists exactly the two owned files) t=1 blobs=src/wa/readOnlySocket.ts:unchanged
Pre-check[C3B-I4]: 350df16 C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test --test-force-exit src/wa/authState.test.ts -> 93 passed, 0 failed, 0 skipped (loopback mongod 7.0.24; the after() sweep found no secret in any captured log line or thrown message; mutant M4d, key hex logged, is killed again in the repair-round batch) t=66 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Pre-check[C3B-I5]: 350df16 C3B_SEED=12345 npx tsx --test --test-force-exit src/wa/authState.test.ts -> 52 passed, 0 failed, 41 skipped (93 tests; the [mongo] rig is NOT-MEASURED, no URI; cwd archiver worktree root) t=8 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78 (test C3B-I5/I6 passes)
Pre-check[C3B-I5]: 350df16 grep -nE 'withTransaction|startSession\(|\.watch\(' src/wa/authState.ts -> ok, no line printed (exit 1) t=1 blobs=src/wa/authState.ts:bcabe1d
Pre-check[C3B-I6]: 350df16 C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test --test-force-exit src/wa/authState.test.ts -> 93 passed, 0 failed, 0 skipped (every Mongo test asserts the loopback host first and uses a whatsapp_msg_test_<random> database on a mongod started by this builder, PID 20748, 127.0.0.1) t=66 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:56d7e78
Falsification[C3B-C1]: copy-mutant M1 `if (!r) { data[id] = null; continue; }` -> `if (!r) { continue; }` (a missing id left out instead of `null`) -> killed by "C3B-C1a" (green before 93/93 with the database, restored, hash equals HEAD)
Falsification[C3B-C2]: copy-mutant M2 the `AppStateSyncKeyData.fromObject` conversion removed -> killed by "C3B-C2" and "C3B-C1a"
Falsification[C3B-C3]: copy-mutants (a) M3 fixed all-zero nonce `Buffer.alloc(12)` instead of `randomBytes(12)` -> killed by "C3B-C3"; (b) M3b the ciphertext is the plaintext (nothing encrypted) -> killed by "C3B-C3" and 20 others
Falsification[C3B-C4]: copy-mutants (a) M4 `aad` returns an empty buffer (owner/type/id no longer bound) -> killed by "C3B-C4c"; (b) M4b undecryptable creds fall back to fresh `initAuthCreds()` -> killed by "C3B-C4a/b", "C3B-C4c", "C3B-C4d"; (c) M4c keyStore mongo with an invalid key falls back to the file store -> killed by "C3B-C4e" and "C3B-C4f"; (d) M4d the encryption key hex written to the log on a failed decrypt -> killed by "C3B-C4f" and the `after()` sweep
Falsification[C3B-C5]: copy-mutants (a) M5a duplicate-key retry removed (`attempt < 0`) -> killed by "C3B-C5c1"; (b) M5b a failed write is swallowed (`return undefined as never`) -> killed by "C3B-C5b"; (c) M5c no per-row lock (`Promise.resolve().then(fn)`) -> killed by "C3B-C5c2"; (d) M5d write-behind (`void Promise.all(tasks)`, not awaited) -> killed by 9 tests including "C3B-C2" and "C3B-C3"
Falsification[C3B-C6]: the repair-round mutants are on the next two lines; first-build copy-mutants (a) M6a prune keeps 6 (`KEEP_ARCHIVES + 1`) -> killed by "C3B-C6b" and "C3B-C8b"; (b) M6b unlink moves the key rows before the creds row -> killed by "C3B-C6e"; (c) M6c `linkedUserIds` also lists archived-only owners (`find({})`) -> killed by "C3B-C6d", "C3B-C6e", "C3B-C7b", "C3B-C7d"; (d) M6d restore overwrites a live link -> killed by "C3B-C6c" and the existing "restore refuses to clobber a link that is already live"
Falsification[C3B-C6f]: copy-mutants (a) N1 `let held = row !== null` -> `let held = false` (a handle opened on a row upserts again) -> killed by "C3B-C6f: a saveCreds after the unlink rejects LINK_GONE"; (b) N2 `res.matchedCount === 0` -> `< 0` (zero match ignored, no LINK_GONE) -> killed by 2 C3B-C6f cases; (c) N3 the update gets `{ upsert: true }` -> killed by 2 C3B-C6f cases; (d) N4 `held = true` removed after the first upsert (a pairing handle stays on the upsert path) -> killed by "C3B-C6f: a removed creds row also rejects; a fresh handle's first saveCreds still creates the row". Each: green on `350df16` (93/52/41 and 93/93), red under the mutant in the copy, restored, copy blob equals `HEAD:src/wa/authState.ts` at the end.
Falsification[C3B-C6e]: copy-mutants N5 restore rethrows the clash instead of finishing row by row, N6 the repeat unlink rethrows it, N7 the repeat unlink does not drop the archived twin, N8 restore does not drop the archived twin -> each killed by its "C3B-C6e duplicate" case, on the fake rig, and N5 to N8 were also run against the real loopback mongod with `--test-name-pattern C3B-C6` (2 failures each: the fake and the mongo case); N9 the repeat-unlink bound `$lte: archivedAt` -> `archivedAt - 1 ms` -> killed by "C3B-C6e tie: a repeat unlink moves a key row at archivedAt"; N10 the repeat-restore bound `$gt: archivedAt` -> `archivedAt - 1 ms` -> killed by "C3B-C6e tie: a repeat restore keeps a key row at archivedAt". Green before, red after, restored.
Falsification[C3B-C7]: copy-mutants (a) M7 key reads not filtered by owner (`archiveId: null, type, id` only) -> killed by "C3B-C7a" and "C3B-C7d"; (b) M7b owner id no longer validated -> killed by "C3B-C7c"
Falsification[C3B-C8]: copy-mutants (a) M8a age limit not enforced in code (`cutoff` returns epoch) -> killed by "C3B-C8b"; (b) M8b restore leaves `archivedAt` on restored rows -> killed by "C3B-C8a" and "C3B-C6e"; (c) M8c `archivedAt` differs by 1 ms between the creds row and the key rows -> killed by "C3B-C8a"; (d) M8d a live write stamps `archivedAt` -> killed by "C3B-C8a"
Falsification[C3B-I1]: none — `git diff` of the five dispatch lines is the structural check and the 7 existing cases passing on the `[file]` rig are the behavioural one (a file-store mutant was not run; see Flags)
Falsification[C3B-I2]: none — structural: no `assert` line removed from the test file
Falsification[C3B-I3]: none — structural: the empty `readOnlySocket.ts` diff and the two-file `git diff --name-only`
Falsification[C3B-I4]: M4d above is the leak mutant; the `after()` sweep fires on any key hex, nonce, ciphertext or canary left in a captured log or thrown message
Falsification[C3B-I5]: none — structural: the grep and "C3B-I5/I6"
Falsification[C3B-I6]: none — structural: the loopback guard asserts the host before any connect (its table test covers three accepted URIs on `127.0.0.1` and `localhost` and ten refused values, including `127.0.0.1.evil.com`, a `+srv` URI, a mixed host list, `[::1]` and an empty string); no mutant of the guard was run
CORE-REQUEST: none
mutant-cap-raise: the floor is one named mutant per criterion; 32 one-line mutants (the 22 of the first build re-run on the repair head, plus the 10 new N1 to N10; one batch) were run in the throwaway copy, every one killed; none survived and none needed a strengthened test. Correction: the first manifest said 24; the script and the table hold 22.
Mutation run integrity: each mutation had its own byte backup taken just before it and a restore in `finally` (plus SIGINT and SIGTERM handlers), with a byte compare after each; at the end `git hash-object` of the copy's `src/wa/authState.ts` equals `git rev-parse HEAD:src/wa/authState.ts` (bcabe1d45042593d49b1bdee628413157b0d3a25); in the worktree both owned files hash to their `HEAD` blobs (listed above). No mutation was run in the worktree.
Metrics: start=2026-11-25T00:00:00Z end=unavailable wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=32 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=32 defects=3

## How to verify (commands + expected)
All from the archiver worktree root `D:/KnowledgeBase/.worktrees/wa-c3b`.
- `C3B_SEED=12345 npx tsx --test --test-force-exit src/wa/authState.test.ts` -> expected: 93 tests, 52 pass, 0 fail, 41 skipped (every `[mongo]` rig case and the two mongo-only cases print `NOT-MEASURED: no loopback mongod`)
- With a loopback mongod only (start your own; never a shared one): `C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test --test-force-exit src/wa/authState.test.ts` (give it a timeout of at least 300 s; the C3B-C8d TTL probe waits for the server's sweep) -> expected: 93 pass, 0 fail, 0 skipped, about 66 s. The tests use a random `whatsapp_msg_test_<random>` database and drop it afterwards.
- `npx tsx --test --test-force-exit src/wa/readOnlySocket.test.ts` -> expected: 4 pass
- `npm run typecheck` -> expected: no output, exit 0
- `git diff --name-only c4bb66b3..HEAD` -> expected: `src/wa/authState.test.ts` and `src/wa/authState.ts` only
- `git diff c4bb66b3..HEAD -- src/wa/readOnlySocket.ts src/wa/sessionManager.ts src/config.ts src/db/mongo.ts src/db/types.ts` -> expected: empty
- `grep -nE 'withTransaction|startSession\(|\.watch\(' src/wa/authState.ts` -> expected: no output
- Replay of the random test: `C3B_SEED=12345` as above (case seed 12446).
- Mutants: each row of the table below is a one-line edit of `src/wa/authState.ts`; apply it in a COPY (not the worktree), run the no-database command, expect the named test red, then discard the copy.

## Actual outputs (from maker's own run)
On 350df16:
```
tsc (npm run typecheck)                          : exit 0, no output
no database, C3B_SEED=12345                      : ℹ tests 93  ℹ pass 52  ℹ fail 0  ℹ cancelled 0  ℹ skipped 41   (7.5 s)
loopback mongod 7.0.24, 127.0.0.1:<port>         : ℹ tests 93  ℹ pass 93  ℹ fail 0  ℹ cancelled 0  ℹ skipped 0    (66.3 s)
  seed line                                      : C3B seed=12345 ... loopback mongod: yes ; C3B-C1a [fake] seed=12446 ; C3B-C1a [mongo] seed=12446
readOnlySocket.test.ts                           : ℹ tests 4  ℹ pass 4  ℹ fail 0  (0.4 s)
git diff --name-only c4bb66b3..HEAD              : src/wa/authState.test.ts, src/wa/authState.ts
readOnlySocket.ts / sessionManager.ts diff bytes : 0 / 0
I5 grep                                          : (empty)
```
Red-first (the unmodified module): `ℹ tests 79  ℹ pass 11  ℹ fail 34  ℹ skipped 34`.
Mongod: started by this builder as PID 20748 on 127.0.0.1:60363 (the first build used PID 29324, already stopped; two earlier starts exited at once and never ran); PID 5984 belongs to someone else and was never connected to or touched. PID 20748 is stopped at hand-back.
Route tool: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --route c4bb66b3..HEAD --root "D:/KnowledgeBase/.worktrees/wa-c3b"` -> `{"floor":null,"dual":false,"rules_fired":[]}`.

Mutant table (copy of the worktree, no-database command, `C3B_SEED=12345`; all 32 killed on `350df16`):
| Id | Criterion | Mutation | Killed by |
|---|---|---|---|
| M1 | C3B-C1 | missing id left out of `get()` | C3B-C1a |
| M2 | C3B-C2 | `AppStateSyncKeyData.fromObject` removed | C3B-C1a, C3B-C2 |
| M3 | C3B-C3 | nonce `Buffer.alloc(12)` | C3B-C3 |
| M3b | C3B-C3 | `ct` = plaintext | C3B-C3 +20 (21 fail) |
| M4 | C3B-C4c | `aad` empty | C3B-C4c |
| M4b | C3B-C4d | bad creds fall back to `initAuthCreds()` | C3B-C4a/b, C4c, C4d |
| M4c | C3B-C4e | invalid key falls back to file store | C3B-C4e, C4f |
| M4d | C3B-C4f / I4 | key hex logged on decrypt failure | C3B-C4f, `after()` sweep |
| M5a | C3B-C5c | E11000 retry removed | C3B-C5c1 |
| M5b | C3B-C5b | failed write swallowed | C3B-C5b |
| M5c | C3B-C5c | no per-row lock | C3B-C5c2 |
| M5d | C3B-C5a | write-behind | 9 tests (C1b, C2, C3, C4c, ...) |
| M6a | C3B-C6b | prune keeps 6 | C3B-C6b, C8b, existing prune case |
| M6b | C3B-C6e | unlink moves keys before creds | C3B-C6e |
| M6c | C3B-C6d | `linkedUserIds` lists archived-only owners | C3B-C6d, C6e, C7b, C7d, +1 |
| M6d | C3B-C6c | restore overwrites a live link | C3B-C6c, existing clobber case |
| M7 | C3B-C7 | key read not filtered by owner | C3B-C7a, C7d |
| M7b | C3B-C7c | owner id not validated | C3B-C7c |
| M8a | C3B-C8b | age limit not enforced | C3B-C8b |
| M8b | C3B-C8a | restore keeps `archivedAt` | C3B-C8a, C6e |
| M8c | C3B-C8a | `archivedAt` differs creds vs keys | C3B-C8a |
| M8d | C3B-C8a | live write stamps `archivedAt` | C3B-C8a |
| N1 | C3B-C6f | `held` never true, a handle opened on a row upserts | C3B-C6f |
| N2 | C3B-C6f | zero matched count ignored | C3B-C6f (2 cases) |
| N3 | C3B-C6f | update path upserts | C3B-C6f (2 cases) |
| N4 | C3B-C6f | `held` not set after the first save | C3B-C6f |
| N5 | C3B-C6e | restore rethrows the clash | C3B-C6e duplicate (restore); also on mongod |
| N6 | C3B-C6e | repeat unlink rethrows the clash | C3B-C6e duplicate (unlink); also on mongod |
| N7 | C3B-C6e | unlink does not drop the archived twin | C3B-C6e duplicate (unlink); also on mongod |
| N8 | C3B-C6e | restore does not drop the archived twin | C3B-C6e duplicate (restore); also on mongod |
| N9 | C3B-C6e | tie: row at archivedAt not moved | C3B-C6e tie (unlink) |
| N10 | C3B-C6e | tie: row at archivedAt deleted by restore | C3B-C6e tie (restore) |

## Capability coverage (each new claim -> its isolating falsification)
| Claim | Test | Falsification |
|---|---|---|
| Same results as the file store and a Map model, missing id is `null` | C3B-C1a, C1z, C1b | M1 |
| Every value kind round-trips, `app-state-sync-key` is `AppStateSyncKeyData` | C3B-C2 | M2 |
| Nothing readable at rest, fresh nonce per write | C3B-C3 | M3, M3b |
| Wrong key, tampering, wrong row all reject, never "no key" | C3B-C4a-d | M4, M4b |
| No key means no fallback to the file store | C3B-C4e | M4c |
| No secret in a log or error | C3B-C4f, `after()` sweep | M4d |
| Write-through, rejected write rejects, retry on duplicate key, ordered writes | C3B-C5a, C5b, C5c1, C5c2 | M5a, M5b, M5c, M5d |
| Archive, prune to 5, restore, list owners, repeatable half-finished steps | C3B-C6a-e | M6a, M6b, M6c, M6d |
| A late `saveCreds` never revives an archived link (LINK_GONE) | C3B-C6f | N1, N2, N3, N4 |
| A key move never fails on a clash; the tie rule holds | C3B-C6e duplicate and tie | N5 to N10 |
| Owner isolation, owner id format | C3B-C7a-d | M7, M7b |
| One `archivedAt` per archive, never on a live row, age limit | C3B-C8a, C8b | M8a, M8b, M8c, M8d |
| Expiry index and server expiry | C3B-C8c, C8d (loopback only) | none (see NOT-MEASURED) |

## Live browser evidence
Not UI-touching. No browser, no WhatsApp, no real database.

## NOT-MEASURED
- A real WhatsApp link: no Baileys socket was used; the store was driven through the same `get`/`set`/`saveCreds` calls Baileys makes, by tests and by `makeCacheableSignalKeyStore` (C3B-C1b).
- A replica set or a hosted database (Atlas or the vendor's Mongo): everything ran on one standalone loopback mongod 7.0.24. Behaviour under a primary step-down, a write concern other than the default, or network latency is not measured.
- The production encryption key: tests use a key generated inside the run; key rotation, key storage and the real `KEY_ENCRYPTION_KEY` value are not exercised.
- The joint check C3AB-J1 (C3A's unlink route and boot rehydration running through this key store): belongs to the checker, not run here.
- C3B-C8c and C3B-C8d without a database: skipped and reported as `NOT-MEASURED` in the no-database run; they were run, and passed, in the loopback run.
- No mutant targets the expiry index clauses (C3B-C8c, C3B-C8d): the indexes are declared by C3A in `mongo.ts`, which this unit does not own; the tests read them back from the server.
- No mutant of the file store branch (C3B-I1): its protection is the 7 existing cases on the `[file]` rig plus the empty `sessionManager.ts` diff.

## Filed, not built
Four items named by the coordinator as not to build; the main session writes the ledger rows. Nothing below was changed.
- Refusing a key `set` after an unlink: a late `set` still writes a live key row (the test at `src/wa/authState.test.ts:1023` shows it changes neither the listing nor restorability and a restore still returns true).
- The library wrapper's cache after a rejected write (`makeCacheableSignalKeyStore`; Flags 1).
- Leftover live key rows read by a relink: a live key row written after an unlink can be read by a later fresh link of the same owner.
- Key deletion after a crash mid-restore, including the optional `$min` idea: a restore that crashes after the keys moved out but before the creds moved leaves the state a repeat completes, but the live-key debris rule is the `updatedAt` one only.
The file-backed store is not changed.

## Not done
- Mongo-rig red-first for the repair tests was not observed (no mongod was up for that run); the same bodies pass on the real mongod, and N5 to N8 are red on it.
- C3B-C6e tie cases were green before the code change by design (they pin existing behaviour); they are falsified by N9 and N10.
- No test for the library wrapper, the late key `set` refusal, or the relink read of leftover keys (filed above).
- `npm test` (full archiver suite) was not run (instruction).

## Flags for the coordinator and checker
1. **`makeCacheableSignalKeyStore` caches before the store write (library behaviour, filed not built).** Baileys wraps `auth.keys` in it at socket creation. Its `set` updates the cache first and then calls `store.set`, so a rejected database write leaves the rejected value in that wrapper's cache until it expires. The handle itself is correct (C3B-C5b: a second handle and the database never see the value). C3B-C5b says the value must not be "served from the cache by the same handle"; that holds for this module's handle, not for the library's wrapper around it. Not built: it needs a change in the library or in `sessionManager.ts`, which this unit may not edit.
2. **A straggling `saveCreds` after an unlink (superseded).** Flagged in the first build as a gap (the database store upserted and could re-create a live creds row). Built in the repair round under C3B-C6f: `saveCreds` on a handle that holds a row is update-only and rejects `LINK_GONE` when no live row matches (`src/wa/authState.ts:355-356`). Left to the caller: the library's `creds.update` handler sees a rejected promise from a straggler; the module logs it by error class (`logFailed`) and rethrows. The joint check C3AB-J1 should confirm the unlink order still ends the socket first.
3. **`updatedAt` has 1 ms resolution and uses the local clock (the rule is ruled, the window remains).** The orphan rule (repeat unlink) and the debris rule (repeat restore) compare a live key row's `updatedAt` with an archive's `archivedAt`. A key written within the same millisecond as the unlink, or under clock skew between two archiver processes, is classified on the wrong side. The single-writer lease (C3A) makes two processes unlikely; the window is real for one process.
4. **The one ownerless query.** `linkedUserIds` reads `creds.find({archiveId: null}, {projection: {ownerUserId: 1}})` and nothing else without an owner id. C3B-C7 as written says every query carries an owner id; the function exists to list owners, so this is the [ASSUMPTION] reading, enforced by "C3B-C7d" (exactly two such recorded queries across the test's two `linkedUserIds` calls, both on the creds collection, both `{archiveId: null}`).
5. **Owner validation is mongo-only.** The file backend still accepts any string as `userId` (C3B-I1: unchanged). On the file backend an id like `../x` is not refused by this unit. Pre-existing behaviour, not changed.
6. **Tests need a long timeout for C3B-C8d.** Run the loopback command with a timeout of at least 300 s.

## Status: ready-for-check
