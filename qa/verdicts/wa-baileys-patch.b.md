# Verdict: wa-baileys-patch (plan unit C2), checker B, fix cycle 0

VERDICT: PASS
TIER: L (dual check, trigger `security src/wa/baileysPatch.test.ts:583`; Policy-Version proportional-verification/2026-11-22.19)
Cycle checked: 0
Coordinator: B (blind; the other coordinator's files were not read)
Code under check: worktree `.worktrees/wa-c2`, branch `wave/c2-baileys-patch`, head `be5a090fe5e0b99a979e19cf7ec59669564fdb74`, base `583750d`
Contract: `qa/contracts/wa-baileys-patch.md` as amended at a37e9cc6 (not touched by me). No CONTRACT-GAP.
Side effects: none beyond this verdict and the checkpoint (dual-check rule). Findings below are PROPOSED-ISSUE lines only.

## SCOREBOARD

| Id | Result | My own evidence |
|---|---|---|
| C2-C1 fixture | PASS | test "C2-C1 fixture" green in my copy; falsified by F10 (`recorded` -> `own-capture`): killed by "states its source and says it is an upstream trace" |
| C2-C2 patch shape | PASS | two files, one marker line each, size cap; patched files byte-equal to HEAD blobs (SHA-256 matches manifest `7eed6e8a..`/`884102fc..`); falsified by F11 (marker removed): killed by "each file gains exactly one marker line" |
| C2-C3 (i)-(iv) | PASS (local half) | oracle `git -c core.autocrlf=false apply` vs applier on pristine copies: both give identical bytes (hashes equal), apply twice -> "already applied" exit 0, `--reverse` returns pristine bytes; falsified by F7 (`--reverse` ignored): killed. Network half (`npm ci` then the script) NOT-MEASURED |
| C2-C4(a) a1 | PASS | rc15 and rc13 in package.json with rc14 contents: exit 1, files unchanged; F6 (version check removed) killed by "C2-C4a a different installed version" |
| C2-C4(a) a2 | PASS | altered context line and altered removed line: exit 1, hashes unchanged |
| C2-C4(a) a3 | PASS | socket.js-only and mirror half-patched trees: exit 1 "mixed state", nothing written; fully patched tree: exit 0; F8 (mixed-state refusal removed) killed by the "mixed state" test |
| C2-C4(a) a4-a6 | PASS | no patch file, two patch files, `--bogus`, missing baileys, patch path is a directory, missing patches dir: each exit 1 with `patch:baileys FAILED: <cause>`, files unchanged |
| C2-C4(a) a7 | PASS | I read every error branch of the applier (lines 16-29, 35-61, 93-138, 140-167): each ends in `fail()` (exit 1); the only `process.exit(0)` is "already applied/removed" (line 134). None of the five reviewer claims is a branch that reports an error and then exits 0 (see below) |
| C2-C4(a) a8 | PASS | imports are `node:fs`, `node:path` only; none of http/https/net/dns/child_process/fetch(/WebSocket in the file |
| C2-C4(b) / C2-I1 / C2-I2 | PASS | package.json is base plus the one `patch:baileys` script line; pin is exactly `7.0.0-rc14`; lock file equals base; no postinstall, no patch-package; F9 (caret on the pin) killed by this test |
| C2-C5 | PASS | own probe (below) and tests: unpaired + QR showing, known child -> `advSecretKey` rotated, `creds.update` emitted, same ref re-rendered with the new secret, two runs give different secrets; F1 (re-render dropped) killed by "C2-C5 / C2-C7 positive" tests |
| C2-C6 (a)(b)(c) | PASS | probe S2/S3/S5/S6/S7 and tests: paired session, other notification type, unknown child, no content, oversize attribute: no cred change, no event, no QR change; F2 (rotation guard `if (false)`) killed by both "C2-C6a / C2-C7 ... creds.me set" tests |
| C2-C7 | PASS | exactly one outbound frame, the library's own ack; before the patch the unpaired case sent nothing and logged "failed to ack notification"; F3 (ack guard reverted to `me.id`) killed by the "C2-C5 / C2-C7 positive" tests |
| C2-C8 | PASS | pair-device with no notification: refs in order, original secret, 60 s then 20 s, then 408; pair-success block hash equals pristine; F4 (later QR 10 s) killed |
| C2-I1, C2-I2 | PASS | see C2-C4(b) |
| C2-I3 | PASS | `git diff --name-only 583750d HEAD` lists exactly the five files named in the manifest |
| C2-I4 | PASS | paired creds deep-equal before and after; unpaired changes only `advSecretKey` (my probe: `changedCredFields` is `["advSecretKey"]` unpaired, `[]` paired) |
| C2-I5 | PASS | no secret, QR payload or stanza content in logs (probe logs are `warn` or empty; no 40+ char base64 run and no `whatsapp.net` in my test run output) |
| C2-I6 | PASS | tests use the stubbed transport only; no `fetch`, `net`, `mongodb`, `.env`, `sessions` reference in the test file other than the forbidden-word list at line 969 |

## Probe of my own (frames and key rotation, real `makeWASocket`, only `WebSocketClient` connect/send/isOpen stubbed)
`probe.mjs`, run against a pristine and a patched copy of `node_modules`:
- Pristine, unpaired, notification `companion_reg_refresh`: 0 frames sent, log `failed to ack notification`, no cred change.
- Patched, unpaired + QR shown, either known child: exactly one frame, `ack{class=notification,type=companion_reg_refresh}`; `advSecretKey` is the only changed cred field; one `creds.update` (`advSecretKey` only); QR re-rendered with ref `REF-A` and a new secret hash.
- Patched, paired (`creds.me` set): one ack, no cred change, no event, no QR. Other notification type carrying the child (`server_sync`): ack only, no change. Unknown child, no content, attribute over 256 chars: ack plus one `warn`, no change.
- Patched, unpaired but before any pair-device frame (manifest known limit i): secret rotates, no QR to re-render, one ack. Matches the documented limit.
So the only frame the handler can send before login is the library's own ack, and key material rotates only on the allowed path (unpaired, right type, known child).

## Falsification (L cap 10, all in a throwaway copy, one mutation at a time, byte backup per mutation, restored)
F1 C2-C5, F2 C2-C6a/I4, F3 C2-C7, F4 C2-C8, F6 C2-C4a1, F7 C2-C3, F8 C2-C4a3, F9 C2-I1, F10 C2-C1, F11 C2-C2: 10 of 10 killed by the named test for that criterion (not by an import or setup failure). Restored-fidelity true for all (baseline SHA prefix or `git hash-object` vs `git rev-parse be5a090f:<path>`). Two invocations of mine (F2, F3) first failed on a shell quoting error of my runner (pipe in the test-name pattern); they were discarded and re-run correctly, results above.
Full suite on the head copy: `npm test` 83 tests, 83 pass, 0 fail, 0 skipped (my own run, one run).
Unit test file alone: 52/52 in my copy (earlier 1 red was my throwaway repo lacking an index; fixed, not a unit defect).

## Reviewer claims (second code review, Warning) judged on my evidence
None breaks a contract criterion and none is security class, so none is a FAILURE. a7 is about branches that report an error and then exit 0; the claims below are silent mis-application or crafted-input cases, not that.
1. Reproduced (crafted patch with the two socket.js hunk groups as two `diff --git` blocks for the same file, `a/dup.mjs`): the second block overwrites the first, one block's hunks survive, "applied", exit 0. The shipped patch names two distinct files, so it is not affected; C2-C3 (ii) agreement with `git apply` holds for the shipped patch. Medium PROPOSED-ISSUE.
2. By code read (lines 152-166): the file whose write throws is not in the rollback list; exit is 1 (a7 holds). Medium PROPOSED-ISSUE. Not reproduced (needs an injected write failure).
3. By code read (line 160): rollback restores the decoded text, not the bytes read. Low. Not reproduced.
4. By code read (line 77): hunk lines beyond the header counts are ignored. Low. Not reproduced.
5. Consistent with what I saw on Windows (a junction inside the target is followed by `writeFileSync`): the guard is string-based. Needs control of both the patch and the installed tree. Low.
Reviewer test notes: the half-patched test I judged is backed by the stricter "mixed state" test (F8 killed by it), so the weak-assert note is low; the claim that the a7 test depends on file order I did not verify (low, NOT-MEASURED).

## Other observations (no failure)
- Manifest M31 "equivalent mutant" claim: I think it is probably not equivalent on win32 (a segment such as `D:foo` passes the string layer and only the resolved-path layer refuses it). I did not demonstrate it. Low.
- Stray file: my own `git archive ... -o tree.tar` left an untracked `tree.tar` in the archiver worktree at 16:52 (a cwd slip). I removed it; `git status --short` there is empty and head is still be5a090f.

ISSUES-WRITTEN: none (dual check: findings are PROPOSED-ISSUE lines for the maker)

PROPOSED-ISSUE: {"severity":"medium","feature":"wa-baileys-patch","file":"patches/apply-baileys-patch.mjs:68,141-167","title":"Two diff blocks naming the same file: second write overwrites the first, only one block's hunks applied, prints applied and exits 0 (reproduced with a crafted patch; shipped patch unaffected)"}
PROPOSED-ISSUE: {"severity":"medium","feature":"wa-baileys-patch","file":"patches/apply-baileys-patch.mjs:152-166","title":"The file whose write fails is excluded from the rollback list, so a failed write can leave it truncated (exit is 1; not reproduced)"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-baileys-patch","file":"patches/apply-baileys-patch.mjs:160","title":"Rollback restores the decoded string, not the original bytes (not reproduced)"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-baileys-patch","file":"patches/apply-baileys-patch.mjs:77","title":"Hunk lines beyond the header counts are ignored, so understated counts apply a subset with exit 0 (by read; not reproduced)"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-baileys-patch","file":"patches/apply-baileys-patch.mjs:93-108","title":"Path guard is string-based and does not resolve real paths; a junction or symlink inside node_modules/baileys is followed (needs control of patch and installed tree)"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-baileys-patch","file":"qa/manifests/wa-baileys-patch.md (M31)","title":"Survivor M31 labelled equivalent; probably not equivalent on win32 for drive-letter segments such as D:foo (not demonstrated)"}

NOT-MEASURED: network half of C2-C3 (`npm ci` then the script; no network allowed); the upstream PR 2765 diff comparison via `gh api` (offline); the live pairing (plan row 11); the order-dependence of the a7 test; items 2, 3, 4 of the reviewer list by run.

EXPLANATION: Every criterion and invariant is backed by my own run: the independent `git apply` oracle for C2-C3/C2-C4, my own pristine-versus-patched probe for the frames and key rotation, 10 isolated falsifications each killed by its named test, and one full suite run (83/83). The reviewer items are crafted-input or failure-injection edge cases outside the shipped patch and outside a7's meaning; they are filed, not built, under the severity gate. The manifest's `suite_runs=2` is allowed here because the unit carries a security dual-trigger.

Metrics: tier=L coordinator=B cycle=0 mutants=10 killed=10 restored_fidelity=10/10 suite_runs=1 tests=83/83 wall_min=~35 agents=1 resumes=0
