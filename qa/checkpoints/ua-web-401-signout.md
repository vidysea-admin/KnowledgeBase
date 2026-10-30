# Checkpoint: ua-web-401-signout (coordinator A)

**Cycle checked:** 0 · **Base:** d0416a8e · **Head:** c28164fd · **Policy:** proportional-verification/2026-10-19.17 · **Result:** PASS (verdict qa/verdicts/ua-web-401-signout.md)

Evidence identity: code = `git archive` of HEAD c28164fd (apps/web, config, packages) in D:/kb-scratch/uaw-a/head; runner = vitest 2.1.8 via junction to the main tree's node_modules; `qrcode-generator` aliased to a stub in a scratch-only vitest config; env = Windows 11, jsdom.

| Check | Command / scope | Result |
|---|---|---|
| Broad run | `vitest run src/api src/auth src/App.accounts.test.tsx src/pages/meeting-bot` | 25 files, 273 passed |
| Own probes | `src/api/uaw-a.probe.test.ts` (scratch only) | 9 passed (hung-probe behaviour documented, P1) |
| Typecheck | `tsc --noEmit -p apps/web` | 1 error: qrcode-generator (known gap) |
| Falsification C1 | call site reverted to invalidateAuth | 12 red; restored, cmp equal, blob == HEAD |
| Falsification C2 | probe 401 ignored | 5 red; restored, cmp equal, blob == HEAD |
| Falsification C3 | verified_key_identity_required invalidates directly | N/N test red naming R6; restored, cmp equal, blob == HEAD |

Reuse: none for B (blind). Leftovers: scratch copy at D:/kb-scratch/uaw-a (two node_modules junctions, unlinked with cmd rmdir before deleting).
