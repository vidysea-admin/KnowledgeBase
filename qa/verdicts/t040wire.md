# Verdict: t040wire

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
Class: data write, full ceremony. Authority read: manifest, D-126/D-144/D-151/D-162, t040 contracts. @lkb/* in the lane resolve to the main tree, so a temporary paths tsconfig (deleted) was used.

Suites (serial, no Chrome): packages/index 657/657; apps/api 867/867 (D2_FIXTURE_PYTHON set); scripts/webinar 161/161; tsc packages/index exit 0 and apps/api (paths) exit 0; lint-loc --all OK (10 stages, 0 failed).

Checker-authored adversarial tests (tenant-aware in-memory claims/session_pages, colliding ids; discarded, not committed):
- Tenant t run with tenant B rows sharing sessionId and even the same _id ("dup", "pA"): B rows untouched. Issued deletes carry tenantId (claims: {_id:{$in},evidence.sessionId,tenantId}; pages: {sessionId,_id:{$in},tenantId}); the tenant is merged by scopedCollection.deleteMany, not by the helper.
- Insert-first order confirmed for pages and claims. insertMany that throws after a partial write: no delete issued. A crash between insert and delete leaves duplicates; the next run prunes all needs-review rows by _id, so it self-heals. Documented in grounded-write.ts.
- A conflicting claim is preserved. A fresh claim differing only in case or whitespace is skipped (norm), so a near-duplicate cannot replace a verified or conflicting row. Skipping is the safe direction; punctuation-different near-duplicates are inserted alongside, never replacing.
- Flag-off: grounded = strict && dropUnverified; the legacy deleteMany/insertOne is under if(!grounded); groundedNotes key absent when off (tested). Strict path without dropUnverified unchanged.
- Citations: kept notes come only through the unchanged strict verifier (turn ids/tStart/tEnd real; invented ids dropped); the wire test asserts every citation resolves.
- Judge throw: strict preflight throws before any write. Cost cap: not inert. judge.ts estimates cost from tokens when the provider reports costUsd 0 (ISS-T040JUDGE-001 fix); cap 0 through indexSession: judge never called, nothing written.

Mutations (8, hash changed and restored, every file hash equals pre-run): M1 tenant dropped from scoped deleteMany KILLED; M2 claims delete-before-insert KILLED; M3 preserve filter prunes verified KILLED; M4 flag default on KILLED; M5 cost cap inert KILLED; M6 delete without _id KILLED; M7 page delete-first KILLED; M8 judgeMaxCostUsd not passed to extractClaims SURVIVED. 7/8 killed.

Note, not blocking: the M8 survivor (cap pass-through not pinned by a committed test) and the cap being per extraction rather than per session are filed as medium ISS-T040WIRE-001.

ISSUES-WRITTEN: ISS-T040WIRE-001 (medium, qa/issues.T040WIRE.jsonl)
