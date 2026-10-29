# Verdict - ua-credentials (coordinator A, dual check)
Cycle checked: 0
Checked code SHA: 2584ac94 (HEAD ceb6351a adds only qa/). Base 1c864477. Policy-Version: proportional-verification/2026-10-19.17

Check plan: re-run the 4 test files (one per node:test invocation, 200 s timeout) + tsc; per criterion one floor falsification in a scratchpad COPY (node_modules junction), per-mutation byte backup, `git hash-object --path` equal to `git rev-parse HEAD:<file>` after each restore; adversarial fuzz of email/password/token paths (all code points, two-char NFKC sequences, 200k random emails, policy bypasses, verify timing). Worktree stayed clean (`git status` empty).

VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 0/0 invariants
TIER: L (auth/password storage + token secrecy, dual-trigger apps/api/src/user-accounts/password.ts:38)
FAILURES (if any):
- none blocking. Findings are non-blocking and filed as PROPOSED-ISSUE below.
CAPABILITY-COVERAGE: not-applicable (library modules, no route mounted)
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## Evidence (independent)
- password.test.ts 13/13, email.test.ts 43/43, password-policy.test.ts 12/12, tokens.test.ts 8/8; `tsc --noEmit -p apps/api/tsconfig.json` exit 0.
- Fresh hash: `$argon2id$v=19$m=19456,p=1,t=2$<16B salt>$<tag>`; needsRehash false; verify ok / wrong / oversize / lone-surrogate / garbage / empty / undefined -> true / false / false / false / false / false / false; NFC vs NFD passphrase verify equal; embedded NUL round-trips; needsRehash true for m-1, v=16, handles both m,p,t and m,t,p order.
- A2-6: Dockerfile base `node:24-slim` (glibc); argon2 0.45.1 ships linux-x64 `argon2.glibc.node` + `argon2.musl.node`; package.json diff is exactly one added line, exact pin; lockfile adds argon2, @phc/format, node-addon-api, node-gyp-build. The in-image Linux `node -e require('argon2')` was not run (disk), documented in the manifest as left for A9/A8: accepted for this unit (criterion allows a documented probe).
- Timing (UA-11): median over 16 interleaved runs, wrong password vs unknown account (null hash) 85.9 vs 73.5 ms, same order, no short-circuit; both do a full argon2id verify.
- Email: all 1,112,064 scalar values in `a<c>b@x.com`: NFKC-instability after lowercase 0 for single chars, no post-normalisation control/format char, idempotent; CR/LF-interior, LS/PS, ZWSP refused; `@@`, brackets, quotes, `x..com` refused; 200k random mixed-script emails idempotent.

## Falsifications (copy, one file per run, hash fidelity OK for all)
| id | edit | file | result |
|---|---|---|---|
| A2-1a | needsRehash drops memory check | password.test | 1 fail (killed) |
| A2-1b | `length >= 1` -> `>= 0` | password.test | 1 fail (killed) |
| A2-1c | verify(null) skips dummy verify | password.test | 1 fail (killed) |
| A2-2 | argon2id -> argon2i | password.test | 5 fail (killed) |
| A2-3a | `parts.length !== 2` -> `< 2` | email.test | 1 fail (killed) |
| A2-3b | drop final NFKC pass (beyond floor, adversarial) | email.test | 0 fail, SURVIVED, see P1 |
| A2-3c | drop post-NFKC control check | email.test | 0 fail (equivalent: fuzz shows no code point reaches it) |
| A2-4a | no local-part check | password-policy.test | 3 fail (killed) |
| A2-4b | no digit/symbol suffix strip | password-policy.test | 1 fail (killed) |
| A2-4c | PASSWORD_MAX 128 -> 512 | password-policy.test | 3 fail (killed) |
| A2-5a | ignore usedAt | tokens.test | 1 fail (killed) |
| A2-5b | ignore (userId,purpose) binding | tokens.test | 1 fail (killed) |
| A2-5c | store raw token as tokenHash | tokens.test | 4 fail (killed) |
| A2-5d | no expiry check | tokens.test | 1 fail (killed) |
| A2-6 | `0.45.1` -> `~0.45.1` | password.test | 1 fail (killed) |

Floor (1 per criterion) killed for all six. Production code for A2-3 is correct; only its test is thin (P1).

## Findings (non-blocking)
PROPOSED-ISSUE: {"severity":"medium","criterion":"A2-3","title":"email idempotence/merge test does not pin the final NFKC pass","detail":"Removing the `.normalize(\"NFKC\")` after `.toLowerCase()` in apps/api/src/user-accounts/email.ts parseEmail leaves all 43 tests green. With it removed, `H\\u0331@x.com` (H + combining macron below) normalises to `h\\u0331@x.com` while `\\u1E96@x.com` stays `\\u1E96@x.com`: two spellings of one address become two account keys and normalisation is not idempotent. 122 base+combining-mark pairs behave this way (H+0331, J+030C, T+0308, W+030A, Y+030A ...). Shipped code is correct (fuzz: 0 failures); the regression guard is missing.","fix_direction":"add table cases H+U+0331 == U+1E96, J+U+030C, T+U+0308, W+U+030A to email.test.ts asserting equal keys and idempotence; re-run the final-NFKC mutation."}
PROPOSED-ISSUE: {"severity":"low","criterion":"A2-4","title":"policy bypasses: dotted local part, prefix on deny word, list size","detail":"With email alice.smith+tag@example.com: `ALICESMITH12345678` is ok (containment is literal, so separator-stripped forms pass); `1password1234` is ok (only trailing digit/symbol runs are stripped); the deny list is 1,274 entries vs the spec's top-10k [ASSUMPTION], already disclosed by the maker as a human item.","fix_direction":"also test the local part with separators removed; strip a short leading digit run before the deny lookup; swap in a vetted top-10k list (no code change). Spec A2-4 wording is met as written."}
PROPOSED-ISSUE: {"severity":"low","criterion":"A2-4","title":"production bundle does not ship common-passwords.txt","detail":"apps/api/scripts/build.mjs:50 rewrites runtime assets only for `.ps1`; password-policy.ts reads a `.txt` via new URL(..., import.meta.url), so a bundled build throws on first checkPassword (fails closed). Confirmed by reading build.mjs; owner A3 or the next unit editing build.mjs.","fix_direction":"extend the regex to `\\.(?:ps1|txt)` and add a bundle smoke assertion."}
PROPOSED-ISSUE: {"severity":"low","criterion":"A2-3","title":"misleading comment in email.ts; first unknown-account verify pays dummy-hash generation","detail":"email.ts parseEmail comment says trim would hide trailing CR/LF/TAB, but the preceding regex strips exactly those, so `a@x.com\\n` is accepted and trimmed (header injection still impossible: interior and non-whitespace controls are refused). Separately, the first verify(null, ...) in a process also generates the dummy hash (one-time extra ~80 ms).","fix_direction":"correct the comment; warm the dummy hash at module load or server start."}

EXPLANATION: All six criteria independently reproduce and every floor falsification is killed in a hash-verified copy. Adversarial probing (all code points, NFKC sequences, timing, token binding/replay, policy bypasses) found no auth/tenancy/data-write defect in the shipped code; one adversarial extra mutant survives because the idempotence test is thin (P1, medium, non-blocking under the backlog override: file, do not open a unit).
Metrics: start=2026-10-29T00:00Z end=2026-10-29T00:00Z wall_min=25 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=15 cycle=0 resumes=0 tokens=unavailable builder_min=45 check_min=25 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1500 mutants=15 defects_unit=0 defects_6c=0
