# Reuse independently checked corpus test fixes

Status: checked-PASS
Fix cycle: 0
Priority tier: reconciliation of existing PASSed units; no new seam round.
Links: apitests cycle 0; indextests cycle 1; ISS-APITESTS-001; ISS-INDEXTESTS-002
Authorization: Umesh's execution plan; orchestrator GO for exact-source recovery on 2026-10-14.
Packet: `qa/packets/reuse-checked-corpus-tests.md`.

## Scope

Recover only three source test files into main, after confirming each root file was clean and matched its HEAD blob. No production logic, historical QA ledger/verdict, git administration, staging, commit, or media/evaluator artifacts changed.

- `apps/api/src/ask/source-context.test.ts`: exact blob from lane/apitests `020f8107`; prior cycle 0 checker PASS checked maker `bdf935fb` and blob `e4aa71d3`.
- `packages/index/src/tree/tree-real-data.test.ts`: exact blob from lane/indextests `ffce705d`; prior cycle 1 checker PASS checked `3bbbaeae`.
- `packages/index/src/pipeline/notes/judge.test.ts`: same lane, approved expected vision routing entry.

Main corpus tests now report unfinalized transcript-only ingests separately, retain completed-corpus assertions, and refuse malformed validation/one-file session shapes under the previously checked rules.

## Candidate pins

| Path | Git blob | SHA256 |
|---|---|---|
| API source-context test | `e4aa71d30e1d85db6838e2b1f0e39a3baf1ac431` | `1c0f348dff60516fa0e8bd3a381b42503aa7b6ff8533d218ed2f868dc80b795d` |
| Index tree-real-data test | `4caf51eaa925937389c56652f9a2874aa92d5ff3` | `820d6106cb3614f8e3faa68db6773524d10d39184e36eeda01c4d69708f40028` |
| Index judge test | `4aa5b93db69dfed2a5b8784990ba6daa8f89b09c` | `989d672b3dd96de6bdde272b2a9050b86923633484d7f70bbbf63409852d1643` |

Pre-recovery byte backups and machine-readable hashes: `tmp/reuse-checked-tests/`.

## Evidence and pending verification

- Preflight `git status --short -- <three candidate files>` produced no output.
- Each current git-normalized blob matched main HEAD before recovery.
- Each recovered blob matched the exact approved lane blob after recovery.
- `git diff --check -- apps/api/src/ask/source-context.test.ts packages/index/src/tree/tree-real-data.test.ts packages/index/src/pipeline/notes/judge.test.ts`: exit 0; only expected Git LF-to-CRLF conversion warnings. Source diff: 121 insertions, 10 deletions across three test files.
- Prior apitests checker evidence: targeted suite 25/25; API suite 875/875. Prior indextests cycle 1: tree main-data 11/11; index suite 677/677. These are historical checked results, not fresh runs in this session.
- Fresh main command (outer Python timeout 120 seconds): `node --import ./.cache/coordination/safe-test-runtime/register.mjs --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 apps/api/src/ask/source-context.test.ts packages/index/src/tree/tree-real-data.test.ts packages/index/src/pipeline/notes/judge.test.ts`: exit 0; tests 46, pass 46, fail/cancelled/skipped/todo 0; Node duration 5027.221ms, outer elapsed 5.171 seconds. Full output: `tmp/reuse-checked-tests/focused-tests.txt`.
- SHA256 pins verified unchanged before and after the fresh run. The corpus suites executed against main's real on-disk data, reporting both unfinalized Zoom ingests separately. API hydration and index tree/search consumption passed inside these suites; judge suite exercised summary/claims consumers with fake models only.
- `python contracts/verify_contracts.py`: exit 0; `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This empty registry result does not establish pipeline correctness. Do not infer a new independent checker PASS from maker execution or hashes alone.

## Retained limitations

- API loader treats arrays as objects; previously filed ISS-APITESTS-001 medium helper divergence remains unchanged because this is exact recovery.
- ISS-INDEXTESTS-002 policy/contract question remains open pending Umesh; prior cycle 1 PASS explicitly did not close it.
- Tests skip an unfinalized ingest with a log; this does not certify the ingest, extraction, indexing or live release.

## Independent checker request

Verify these source bytes against the named prior checked blobs; inspect main integration and run the three focused suites when a slot is authorized. Record a new cycle 0 verdict bound to these hashes. No mutation tests or new seam rounds are requested.

## Close-out

Independent `qa/verdicts/reuse-checked-corpus-tests.md` records PASS, Cycle checked: 0, with all three candidate SHA256 pins unchanged, attributed fresh main 46/46 and independent boundary probe 90/90. Matching maker manifest closed to checked-PASS on 2026-10-14. The verdict's exact-recovery/current-consumer scope and all retained limitations remain binding; no task, policy issue or operational release was closed.
