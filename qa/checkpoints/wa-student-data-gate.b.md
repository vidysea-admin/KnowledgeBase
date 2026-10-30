# Checkpoint (coordinator B) — wa-student-data-gate, cycle 0

Env fingerprint: Windows 11, node v24.13.1, tsx 4.23.13, `git archive` of 70d8ac64 (head) and ba7d5249 (base) outside the bound root with junctioned node_modules (main tree), junctions removed with `cmd /c rmdir`. No Mongo started, no production, no `.env` read, no push.
Code hashes: knowledge.ts, store.ts, production.ts, source-context.ts, native-source-context.ts, native.ts, reader.ts, session.ts, message-vertical.test.ts blobs equal `git rev-parse 70d8ac64:<path>` after every mutant (12 of 12).
Attribution: coordinator B (claude-sonnet-subagent), own runs only; coordinator A's evidence not read.

| Check | Command / scope | Result |
|---|---|---|
| unit | `node --test --import tsx` on external-model-gate, external-model-tree, external-model-hydrators, external-model-reader (copy) | 19, 9, 16, 6 pass; 0 fail |
| full suite | `node --test --import tsx --test-concurrency=4 "apps/api/src/**/*.test.ts"` (head copy) | 2495 tests, 2424 pass, 38 skip, 33 fail |
| base-vs-head | the 20 failing files run one by one in base copy and head copy | identical (1 test, 0 pass, 1 fail at module load, files missing from the partial copy); 0 differences |
| tsc | `tsc --noEmit -p apps/api/tsconfig.json` (head copy) | 3 TS2307 for missing scripts/qa files only |
| lint:structure | `node scripts/lint-loc.mjs --all` (bound root, read only) | 7 stages OK; snapshot and tracker fail (pre-existing); dependencies not runnable (dependency-cruiser absent) |
| own probes | `chkb-probe.test.ts` (9 tests, scratchpad, not committed) | 9 pass; observations P-A (terminal link state eligible), P-B (non-native sourceId-only node kept) |
| falsification | 12 mutants, one or more per W-1..W-7, second run | 12 killed; first batch void (harness codec bug), discarded |

Scratch: `.../scratchpad/sdg-b-run/` (ref, mut, basecopy, mutate.py, runmuts2.sh, muts2.out, cmp.out, chkb-probe.test.ts).
