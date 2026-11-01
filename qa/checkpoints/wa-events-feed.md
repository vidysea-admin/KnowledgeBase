# Checkpoint (coordinator A) — wa-events-feed, cycle 0

Env fingerprint: Windows 11, node v24.13.1, tsx 4.23.13, `git archive` of 4f2fbe9d outside the bound root with junctioned node_modules (root, apps/api, packages/*); main-tree `packages/` equals base for this unit. No mongod, no production access, no `.env` read, no push.
Code hashes: events-router.ts, review/router.ts, review/ingest.ts, sync-links.mjs, docs/whatsapp/events.md blobs equal `git rev-parse HEAD:<path>` (via `git hash-object --path`) after every mutant (10 of 10); archive files are CRLF, so a plain `--stdin` hash differs and was not used.
Attribution: coordinator A (claude-sonnet-subagent), own runs only; coordinator B's verdict/evidence not read.

| Check | Command / scope | Result |
|---|---|---|
| unit | `node --test --import tsx apps/api/src/whatsapp/events.test.ts apps/api/src/whatsapp/links/events-router.test.ts scripts/whatsapp/sync-links.test.mjs` (copy) | 45 pass, 0 fail (9 + 8 + 28) |
| broad | `apps/api/src/whatsapp/**`, `composition/**`, `whatsapp-review/**` `*.test.ts` | 380 tests, 355 pass, 0 fail, 25 skipped |
| tsc | `tsc --noEmit -p apps/api/tsconfig.json` | exit 0 |
| lint:structure | `node scripts/lint-loc.mjs --all` | 9/10 stages OK; dependencies not runnable on the junctioned copy (ENOENT through the junction) |
| falsification | 10 mutants (3 C1, 3 C2, 3 C3, 1 C4) | 7 killed, 2 survived (C3 bypass: child_process, dynamic https import), 1 control red for the wrong reason |
| delivery probe | scratch test, late earlier-`at` event vs advanced cursor (not committed) | event skipped from the cursor; only a full replay sees it (P1) |

Mutation harness: per-mutation byte backup, real `timeout 240`, no EXIT trap, `cmp` and HEAD-fidelity after each run; script and outputs live in the session scratchpad, outside the bound tree.
Cleanup: the copy's node_modules junctions are removed with `cmd /c rmdir` before the copy is deleted.
Not done: no real-Mongo run (P4 would need one), no ledger rows written, no push.
