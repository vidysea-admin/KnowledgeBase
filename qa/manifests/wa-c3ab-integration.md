# Manifest — wa-c3ab-integration
**Contract:** qa/contracts/wa-key-store.md criterion `[C3AB-J1]` (line 39); the two merged units keep their own contracts qa/contracts/wa-svc-surface.md (C3A) and qa/contracts/wa-key-store.md (C3B); decision D-246 item 5
**Goal task:** none
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no
dual-note: this tree is a merge of two closed units and adds no behaviour; the joint check C3AB-J1 is the check for this tree. Both units were already dual-checked on their own heads.
**Persona walk:** skip (no screen, flow or user type changed; a merge of two service-side modules)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one mechanical merge of two closed units, one builder, no new code.

## What changed
All paths are relative to the ARCHIVER repo, `D:/KnowledgeBase/sources/whatsapp_msg`. New local branch `wave/c3ab-integration`, worktree `D:/KnowledgeBase/.worktrees/wa-c3ab`, created from `350df1670df8592b411c0f0a833895a79252caef` (C3B head). One merge commit, `git merge --no-ff wave/c3a-svc-surface` (C3A head `548921c60fc20f0e72e6ab5ef731d10be0eadbca`): merged head `808cb593fea11baff1b77c88adf7d19f44950278`, message `merge: C3A svc surface into the C3B key store for joint check C3AB-J1`. No push, no merge to the archiver's main, no archiver DECISIONS entry, the wa-c3a and wa-c3b worktrees and branches untouched.
- Ancestry: `git merge-base --is-ancestor 548921c6 HEAD` and `... 350df167 HEAD` both succeed.
- Conflicts: none. Git merged both sides with no conflict marker and nothing was edited by hand. The two units touch disjoint files (C3B: `src/wa/authState.ts`, `src/wa/authState.test.ts`; C3A: `src/api/auth.ts`, `src/api/server.ts`, `src/api/svc.ts`, `src/api/svc.test.ts`, `src/config.ts`, `src/db/mongo.ts`, `src/db/types.ts`, `src/index.ts`, `src/wa/sessionManager.ts`). The brief expected overlap in `src/index.ts` and the `sessionManager` area; there is none (C3B did not edit either).
- Resolution table (every changed file against `c4bb66b3`, blob of the merged head compared with each unit's head; each equals one side exactly):

| File | Merged blob equals | Hunk resolution |
|---|---|---|
| src/api/auth.ts, src/api/server.ts, src/api/svc.ts, src/api/svc.test.ts, src/config.ts, src/db/mongo.ts, src/db/types.ts, src/index.ts, src/wa/sessionManager.ts | C3A head | verbatim C3A (C3B did not touch the file) |
| src/wa/authState.ts, src/wa/authState.test.ts | C3B head | verbatim C3B (C3A did not touch the file) |

- Dependency comparison: `git diff --quiet c4bb66b3 548921c6 -- package.json package-lock.json` (C3A) and `git diff --quiet c4bb66b3 350df167 -- ...` (C3B) both report no change, and the two heads have identical `package.json` and `package-lock.json`. So the dependency sets are identical; `node_modules` is a real copy (`robocopy /E`, no junction, no symlink) of `D:/KnowledgeBase/.worktrees/wa-c3b/node_modules`. No `npm ci`, no install, no download, no network. No `.env` opened or copied, nothing under a `sessions/` folder opened.
- Wiring that C3AB-J1 relies on, read in the merged tree (no code written): the C3A unlink route `src/api/svc.ts:410-419` ends in `deps.sessions.destroyKeys(id)`, and the real port is `destroyKeys: (id) => destroyAuthState(id)` at `src/api/server.ts:145` (import at `:19`); boot rehydration is `rehydrateOwners({linked: m.auth.linkedUserIds, ...})` at `src/index.ts:43-47`, with `rehydrateOwners` at `src/wa/sessionManager.ts:573`; the straggler `saveCreds` is wired as `sock.ev.on('creds.update', saveCreds)` at `src/wa/sessionManager.ts:275`. `createAuthState`, `destroyAuthState`, `linkedUserIds`, `hasRestorableAuthState` and `restoreAuthState` are the exports of `src/wa/authState.ts` that C3B put behind `config.keyStore`, so with `KEY_STORE=mongo` both paths run over the database store. `src/config.ts:51,79,82` carry the `KEY_STORE` and `SESSION_KEYS_ENC_KEY` settings.

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: L (a merge of one unit that is credential handling and tenancy security class, C3B, and a service API unit, C3A; no new code)
Round: 0 files edited by hand, 11 files merged, joint criterion C3AB-J1 (not run by the builder), est 30 min
slow-plan: one test process at a time; the C3B C8d expiry probe waits for the server's TTL sweep and the C3A C8b two-process lease test takes about 100 s, so the three runs took 89 s, 187 s and 176 s.
Criteria: `C3AB-J1` (the merged tree is its precondition; the checker runs it)
Owners: one builder; no file edited.
Fan-out: none; SERIAL: one merge, one builder.
Base / checked state: base `350df167`, merged head `808cb593` on `wave/c3ab-integration`; worktree clean after every run (`git status --short` empty); `src/wa/authState.ts` blob `bcabe1d45042593d49b1bdee628413157b0d3a25` equals `git rev-parse HEAD:src/wa/authState.ts`.
Gate answers: none; consent is out of scope (D-210); no production write, no push, no deploy, no shared database, no WhatsApp, no install, no network, no junction.
Affected tests / full-suite trigger: both units' own files, plus one run of the archiver's full suite (this merges two units, one of them security class).
Tests use a loopback mongod only: started by this builder on 127.0.0.1:27345 with `--dbpath` inside the scratch folder (PID 47016, stopped by PID, dbpath removed). An earlier start (PID 40228, with a flag that does not exist on Windows) exited at once and never ran. PID 5984 belongs to someone else and was never connected to or touched. Both test files ran with `C3A_TEST_MONGO_URI` and `C3B_TEST_MONGO_URI` set, so no clause was NOT-MEASURED.
Pre-check[typecheck]: 808cb59 npm run typecheck -> exit 0, no output (cwd archiver worktree wa-c3ab) t=20 blobs=tree:808cb59
Pre-check[C3B-unit]: 808cb59 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:27345 npx tsx --test src/wa/authState.test.ts -> 93 passed, 0 failed, 0 skipped (seed 3788062401; loopback mongod 7.0.28; C3B-C8c and C3B-C8d ran) t=89 blobs=src/wa/authState.ts:bcabe1d,src/wa/authState.test.ts:C3B-head
Pre-check[C3A-unit]: 808cb59 C3A_TEST_MONGO_URI=mongodb://127.0.0.1:27345 npx tsx --test src/api/svc.test.ts -> 48 passed, 0 failed, 0 skipped (loopback mongod 7.0.28; C3A-C8b two-process lease and C3A-C8c-sigkill ran) t=187 blobs=src/api/svc.test.ts:C3A-head
Full-suite run (authorized by the caller for this merge; not a Pre-check): 808cb59 `C3A_TEST_MONGO_URI=mongodb://127.0.0.1:27345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:27345 npm test` -> 169 passed, 0 failed, 0 skipped, 0 cancelled (7 test files; log has no NOT-MEASURED line; cwd archiver worktree wa-c3ab; 176 s). Policy .7 says no builder runs a full suite; the brief for this unit allowed exactly one because it merges two units, one of them security class. It is therefore kept out of the Pre-check lines and out of `suite_runs` (see Metrics), and is disclosed here for the checker.
Pre-check[C3AB-J1]: 808cb59 C3A_TEST_MONGO_URI=mongodb://127.0.0.1:27345 npx tsx --test src/api/svc.test.ts -> 48 passed, 0 failed, 0 skipped (PRECONDITION ONLY: the merged tree typechecks and both units' own tests are green on it; the joint run C3AB-J1 is the checker's and was not run by the builder) t=187 blobs=src/api/svc.test.ts:C3A-head
Tests[C3AB-J1]: src/api/svc.test.ts (the C3A unlink route, rehydration and lease cases) and src/wa/authState.test.ts (the C3B lifecycle, LINK_GONE and isolation cases) — the two units' own suites over the merged tree show neither unit regressed by the merge; the joint cases themselves (unlink route over KEY_STORE=mongo, stragglers, rehydration starting only B) do not exist yet and are the checker's to author and run
Pre-check[ancestry]: 808cb59 git merge-base --is-ancestor 548921c6 HEAD && git merge-base --is-ancestor 350df167 HEAD -> both exit 0 t=1 blobs=tree:808cb59
Pre-check[verbatim]: 808cb59 for each of `git diff --name-only c4bb66b3 HEAD`, `git rev-parse HEAD:<f>` equals the blob at 548921c6 or at 350df167 -> 11 of 11 files equal one side exactly (9 C3A, 2 C3B) t=1 blobs=tree:808cb59
Falsification: none needed. Every file of the merge is a verbatim pick of one side (table above), so no conflict hunk was resolved by hand and there is no resolution to falsify. No mutant was run, no copy was made, and nothing was mutated in the worktree.
Falsification table:

| Conflict hunk | Resolution | Mutant | Result |
|---|---|---|---|
| (no conflicts; 11 of 11 files are verbatim picks) | verbatim pick | none | not applicable |

CORE-REQUEST: none
Missing glue: none in product code. The production path from the unlink route to `destroyAuthState`, and from boot rehydration to `linkedUserIds`, already exists and compiles (see Wiring above). What does not exist is the joint TEST itself: `src/api/svc.test.ts` uses a recording fake session port (`destroyKeys` at line 187) and runs with `KEY_STORE` cleared (line 21, and line 681 asserts `'file'`), so no test in the merged tree runs the unlink route or rehydration over `KEY_STORE=mongo`. C3AB-J1 is the criterion that supplies it, and it is the checker's to author and run (the contract says the checker runs it); the builder did not build a harness.
Observation, not built: a straggler `saveCreds` that rejects with `LINK_GONE` is attached directly as the `creds.update` listener (`src/wa/sessionManager.ts:275`), with no catch of its own. The process-level handler at `src/index.ts:142-144` logs an unhandled rejection and stays up, so a straggler does not crash the service; whether it is acceptable that the rejection is only logged there is for the checker's reading of C3AB-J1.
Metrics: start=unavailable end=unavailable wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=1 repeat_runs=0 mutations=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=0 defects=0

## How to verify (commands + expected)
All from `D:/KnowledgeBase/.worktrees/wa-c3ab`. Start your own loopback mongod (never a shared one), e.g. `mongod --dbpath <scratch>/db --bind_ip 127.0.0.1 --port <free port>`, and stop it by its own PID afterwards.
- `git log --oneline -2` -> `808cb59 merge: ...` on top of `350df16`; `git rev-parse HEAD` -> `808cb593fea11baff1b77c88adf7d19f44950278`; `git status --short` -> empty.
- `git merge-base --is-ancestor 548921c6 HEAD` and `git merge-base --is-ancestor 350df167 HEAD` -> both exit 0.
- `npm run typecheck` -> exit 0.
- `C3B_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test src/wa/authState.test.ts` -> 93 pass, 0 fail, 0 skipped (give it at least 300 s).
- `C3A_TEST_MONGO_URI=mongodb://127.0.0.1:<port> npx tsx --test src/api/svc.test.ts` -> 48 pass, 0 fail, 0 skipped (give it at least 400 s).
- `C3A_TEST_MONGO_URI=... C3B_TEST_MONGO_URI=... npm test` -> 169 pass, 0 fail, 0 skipped.
- `git diff --name-only 350df167 HEAD` -> the nine C3A files listed above and nothing else (C3B's two files are already in the base).

## Actual outputs (from the builder's own run)
On 808cb59, logs in the builder's scratch folder `C:\Users\Lenovo\AppData\Local\Temp\claude\6e9d41101c3c5a5b\3fb8d78b-cac7-406e-9e13-fe76f3d5cd42\scratchpad\c3ab-int` (`t-authstate.log`, `t-svc.log`, `t-full.log`):
```
npm run typecheck        : exit 0, no output
authState.test.ts        : ℹ tests 93  ℹ pass 93  ℹ fail 0  ℹ cancelled 0  ℹ skipped 0   (89.4 s)
svc.test.ts              : ℹ tests 48  ℹ pass 48  ℹ fail 0  ℹ cancelled 0  ℹ skipped 0   (187.4 s)
npm test (7 files)       : ℹ tests 169 ℹ pass 169 ℹ fail 0  ℹ cancelled 0  ℹ skipped 0   (176.4 s)
```
Mongod: PID 47016 on 127.0.0.1:27345 (loopback only), stopped by that PID at hand-back, dbpath removed; PID 40228 exited at once (bad flag). PID 5984 was not ours and was not touched. No process of the builder is left running.

## NOT-MEASURED
- C3AB-J1 itself: the unlink route over the real key store, the stragglers, and boot rehydration starting only B. It is the checker's run, and no test in the tree runs it yet (see Missing glue).
- A real WhatsApp socket or a real `creds.update` event; the tests use stubs on the session side.
- The merge was not run against any shared or production database.

## Not done
No mutant (none was needed, see above). No code review agent dispatched (the builder does not spawn agents; the code review named in D-246 item 5 follows from the coordinator). Nothing pushed, nothing merged to the archiver's main.

## Status: checked-PASS (C3AB-J1, cycle 0, 2026-11-26, verdict commit 12be155c; 7/7 parts met, joint harness 10/10, 7 mutants killed; issues qa/issues.C3ABINTEGRATION.jsonl 001-003. The checker's route recompute said dual:true; judged as one check per the dual-note above, since both units were dual-checked on their own heads and the merge adds no code)
