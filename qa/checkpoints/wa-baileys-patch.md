# Checkpoint: wa-baileys-patch (C2), coordinator A, cycle 0 - COMPLETE (no checks remaining)

## Identity
- Code: archiver repo worktree `D:/KnowledgeBase/.worktrees/wa-c2`, head `be5a090fe5e0b99a979e19cf7ec59669564fdb74`, base 583750d, contract amended at a37e9cc6.
- Blobs at head: `package.json` f4eb93a3; `patches/apply-baileys-patch.mjs` 9e007c1b; `patches/baileys+7.0.0-rc14.patch` c69d9e26; `src/wa/baileysPatch.test.ts` e40165bd; `src/wa/__fixtures__/companion_reg_refresh.redacted.json` 775a319d. Patched library SHA-256: socket.js 7eed6e8a, messages-recv.js 884102fc.
- Runtime: node v24.13.1, tsx via `npx`, throwaway copy of the head with a real `node_modules` copy; policy proportional-verification/2026-11-22.19; tier L; dual blind (coordinator A); no mongod, no network.
- Floor recompute: `tick.mjs --route 583750d..be5a090f --root <worktree>` -> floor null, dual false, no rules fired (L by cited content triggers, dual by the manifest's cited trigger line; `--lint-manifest`: ERROR builder-suite suite_runs=2, WARN stage-log-missing, no dual-no-trigger).

## Commands and results
| Command | Result |
|---|---|
| `npx tsx --test src/wa/baileysPatch.test.ts src/wa/readOnlySocket.test.ts` | 52 pass, 0 fail, 0 skipped, 31.3 s |
| `npm run typecheck` | exit 0 |
| `npm test` (once, .7 security-class L) | 83 pass, 0 fail, 0 skipped, 19.2 s, exit 0 |
| my applier probes (`probe.mjs`, `probe2.mjs`): C3 (i)-(iv) vs `git apply`, a1-a8, 18 crafted paths with canaries, item 1/4/5 | all OK; item 1, 4, 5 reproduced |
| whole-tree compare after apply then `--reverse` (`diff -rq` against a pristine copy) | identical |
| C2-C4c marker test on pristine and on patched | fails on pristine, passes on patched |
| M31 experiment (`C:foo`, `:evil` targets) | exit 1 "cannot read" |
| floor `tick.mjs --route` and `--lint-manifest` | as above |

## Mutants (throwaway copy, per-mutation byte backup, restored, hash == HEAD blob or recorded patched SHA after each)
A 32->16 bytes (C2-C5 positive) | B rotate when paired (C2-C6a, C2-I4) | C ack without `?.` (C2-C5/C7 positive) | D `qrMs` default 20000->10000 (C2-C8) | E applier trailing newline (C2-C3, 9 tests) | F version check off (C2-C4a1) | G exact-hunk check weakened (C2-C4a2) | H half-patched check off (C2-C4a3) | I fixture `own-capture` (C2-C1) | J caret pin (C2-C4b, C2-I1). 10 of 10 killed, cap 10 at L. B, G, H were re-run after fixing my own runner quoting.

## Not measured
Network half of C2-C3; PR 2765 diff comparison; live pairing; ENOSPC mid-write; `git apply` under autocrlf=true and `sendMessageAck` before login (filed elsewhere); a separate pristine-vs-patched pair for the unnotified sequence.

## Scratch
`C:\Users\Lenovo\AppData\Local\Temp\claude\6e9d41101c3c5a5b\3fb8d78b-cac7-406e-9e13-fe76f3d5cd42\scratchpad\c2-check-a\` (probe-out.txt, probe-out2.txt, mut-out.txt, mut-out2.txt, run2.txt, npmtest.txt, c4c-pristine.txt, c4c-patched.txt).
