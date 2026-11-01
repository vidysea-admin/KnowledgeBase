# Checkpoint (coordinator A) — wa-composition-wiring, cycle 0

Env fingerprint: Windows 11, node v24.13.1, tsx via main-tree node_modules, `git archive` of 1726a3a5 (and d0416a8e for base) under D:/kb-scratch/wcw-a with junctioned node_modules (root, apps/api, apps/web, packages/*); main-tree `packages/` equals base for this unit. TMP/TEMP on D:. No mongod, no production access, no `.env` read, no push.
Code hashes: knowledge.ts and routes.ts blobs equal `git rev-parse HEAD:<path>` after every mutant (5 of 5, `git hash-object`, plus `cmp` against the byte backup).
Attribution: coordinator A (claude-sonnet-subagent), own runs only; coordinator B's verdict/evidence not read.

| Check | Command / scope | Result |
|---|---|---|
| unit | `node --test --import tsx apps/api/src/composition/integrations/whatsapp-wiring.test.ts` (copy) | 2 pass, 0 fail |
| C3 set | router, events-router, selection router, mounted-routes, production, events, service, wiring | 74 pass, 0 fail |
| broad | full `apps/api` `src/**/*.test.ts` | 2693 tests, 2641 pass, 14 fail; the same 14 are red on the base archive (no mongod, missing data dirs) |
| tsc | `tsc --noEmit -p apps/api/tsconfig.json` | 1 error in an unrelated file (qa fixture absent from the archive) |
| lint-loc | `node scripts/lint-loc.mjs` | OK |
| falsification | 5 mutants (1 C1, 2 C2, 2 C3) | 5 killed |
| bypass | scratch probe tests via real createServer (anon, wrong-scope, viewer, case/encoding/method variants; configured vs unconfigured differential 136 req; partial composition) | no open route; 8 safe-direction diffs; 1 low gap (P2) |

Cleanup: the copies' node_modules junctions are removed with `cmd /c rmdir` (link only) before the scratch tree is deleted.
Not done: no real-Mongo run, no ledger rows written, no push, no Dockerfile/compose edit (DevOps, H-11).
