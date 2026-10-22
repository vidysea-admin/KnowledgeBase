# w27-speakerflake

Status: ready-for-check
Fix cycle: 0
Lane: KnowledgeBase-lanes/w27-speakerflake (branch lane/w27-speakerflake)
Base: c7574a5e88ba9f89691fc6ff4b56b324582a30ee (origin/master)
Candidate: see `git log -1` on the branch (this file is part of the commit)

## Problem
Flaky "mounted speaker workbench consumes trusted source and submits a pending proposal with hashed evidence"
(KnowledgeSpeakerProfilePage.test.tsx): `Unable to find ... checkbox "First source"` on slow CI.

## Verdict on cause
Component defect plus test race. In SpeakerRelationWorkbench.tsx the effect keyed on `a?.sourceRevisionDigest`
cleared from/to/selected/choice on first settle (undefined -> value), not only on a real change. A late passive
effect wiped the test's From/To picks. Not a fail-closed need: nothing selectable exists before the first digest.

## Changes
- SpeakerRelationWorkbench.tsx: remember the last defined digest in a ref; clear only when a defined digest is
  replaced by a different defined digest. Undefined (unsettled) never clears and does not reset the memory.
- SpeakerRelationWorkbench.test.tsx: new test (unsettle then same digest keeps picks; different digest clears).
- KnowledgeSpeakerProfilePage.test.tsx: pick From/To inside `waitFor` until the checkbox appears. No skip, no loosened assertion.

## Checks a checker must run (apps/web)
- vitest src/pages/knowledge/speaker-relations src/pages/knowledge/speakers
- tsc --noEmit -p tsconfig.json; node scripts/lint-loc.mjs --all

## Evidence
- Target test, 10 consecutive runs: 10/10 pass.
- Folders: 17 passed, 1 skipped, 1 failed. The failure is the scripted U24 artifact sha256 check; the lane checkout
  has CRLF (`git ls-files --eol`: i/lf w/crlf) so the hash differs; `git show HEAD:<file> | sha256sum` = 98948cae..., the
  expected value. Unrelated to this change (Windows autocrlf only).
- tsc exit 0. lint-loc: OK (10 stages, 0 failed).
- D-020 (script outside repo, per-mutation backup, restored, cmp ok):
  M2 remove `if (next === undefined) return;` -> new test fails (1 failed, 8 passed).
  M3 replace `prev !== undefined && prev !== next` with `false` -> new test fails (1 failed, 8 passed).
- No D-015 issue corpus (no ledger issue). No contract/ledger edits.
