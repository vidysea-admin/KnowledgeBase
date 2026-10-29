# Verdict B — ua-credentials (coordinator B of a blind dual check)
Cycle checked: 0
VERDICT: PASS
Policy-Version: proportional-verification/2026-10-19.17
TIER: L (auth / password storage / token secrecy; dual-trigger apps/api/src/user-accounts/password.ts:38)
Checked code SHA: 2584ac94 (HEAD code identical; later commits touch only qa/). Base 1c864477.
Dual-check blindness: coordinator A's verdict, checkpoint and evidence were not read.

## Check plan
Diff-scope read (4c) of all 5 modules + 4 tests + dependency lines; independent re-run of every acceptance test (one file per node --test, 200 s timeout); tsc; lint:structure; adversarial probe script (outside tree); 10 falsifications in a copy (per-mutation byte backup, restore verified by `git hash-object` == `git rev-parse HEAD:<file>`); static ELF check for A2-6.

## Criteria (each evidenced by me)
- A2-1 PASS. password.test.ts 13/13. Probe: round-trip true; wrong/empty/129-char false; `needsRehash` false current, true for m=4096, v=16, argon2i, "", null, duplicate-key and m,p,p garbage, false for stronger m. Falsify: drop the `t <` clause -> 1 failed (needsRehash); skip the dummy verify -> 1 failed (UA-11 parity test). Timing probe: real-wrong 59-107 ms vs unknown-account 62-80 ms.
- A2-2 PASS. PHC `$argon2id$v=19$m=19456,p=1,t=2$<salt>$<tag>`; falsify argon2id -> argon2i: 5 failed; fixed salt (maker) not re-run, argon2i mutant bites the same test.
- A2-3 PASS. email.test.ts 43/43. Probe: NFKC fullwidth `Ａ@x.com`, `a＠x.com`, `ｘ` domain, `ﬁ`, Kelvin K normalise; `a@@x.com`, CR/LF injection, quoted/bracket forms, NUL, ZWSP -> null. Idempotence fuzz over all BMP+SMP code points (a+cp+b@x.com): 0 non-idempotent. Falsify `parts.length !== 2` -> `< 2`: 1 failed.
- A2-4 PASS. password-policy.test.ts 12/12. Probe: 11 chars rejected, 12 ok, 128 ok, 129/1e6-char too_long (no hang), space passphrase and Cyrillic accepted, upper-case / fullwidth / `password2026!!` -> common, `john+tag@` local contained. Falsify containsLocalPart -> false: 3 failed; falsify suffix strip: 1 failed.
- A2-5 PASS. tokens.test.ts 8/8. 32 CSPRNG bytes -> 43-char base64url; only sha256 hex returned for storage; tokenMatches false on upper-case digest, trailing LF, padding, raw token as stored hash, non-strings (never throws); timingSafeEqual on equal-length digests. Falsify store-raw: 4 failed; drop (userId,purpose) binding: 1 failed; ignore `usedAt`: 1 failed.
- A2-6 PASS (with a named residual, see PI-2). Exact pin `0.45.1` (package.json) and lockfile specifier/version/integrity pinned; falsify `~0.45.1`: 1 failed. Image base: `node:24-slim` (Dockerfile) runs `pnpm install --prod`; argon2 stays an esbuild external (build.mjs). Static check I ran: `argon2.glibc.node` is ELF with max `GLIBC_2.34` / `CXXABI_1.3.9` (Debian 12/13 slim ship glibc >= 2.36), `argon2.musl.node` also present. A Linux container `node -e` probe was NOT run (no docker/disk); H-4 dependency decision is recorded in the manifest (D-206).
Floor: `npx tsc --noEmit -p apps/api/tsconfig.json` exit 0; `pnpm lint:structure` OK (10 stages, 0 failed); `git status` of tracked files clean after all mutation work; diff touches only package.json, pnpm-lock.yaml and apps/api/src/user-accounts/*.

## Adversarial hunt (auth / data-write paths touched)
No tenancy or write path is touched (no route mounted). Probed: token cross-user/cross-purpose replay, expired, used, NaN/string expiry, junk and non-string input, case-flip of digest; password oversize DoS (bounded before NFKC), lone surrogate, NFD vs NFC; PHC parameter spoofing in needsRehash; email header injection, bidi/ZW chars, NFKC/lowercase collisions (İ stays distinct from i, no idempotence break). No bypass found.

## PROPOSED-ISSUE
PROPOSED-ISSUE: {"severity":"low","kind":"timing","title":"First unknown-account verify per process pays dummy hash creation (~2x argon2 cost)","where":"apps/api/src/user-accounts/password.ts:44-48","detail":"dummyHash() is lazily created on first verify(null, ...); that one request costs hash+verify, an observable unknown-email timing outlier right after boot. Fix direction: warm it at startup or call it eagerly from the A4 login module."}
PROPOSED-ISSUE: {"severity":"medium","kind":"evidence-gap","title":"A2-6 container-image import probe not executed","where":"manifest A2-6 / apps/api/Dockerfile","detail":"Only a Windows probe and a prebuilds-exist test ran; the Linux `docker run <api-image> node -e \"require('argon2')\"` is deferred to A8/A9. Static ELF check (GLIBC <= 2.34) is compatible but is not an import. Owner must run it before A4 ships to production."}
PROPOSED-ISSUE: {"severity":"low","kind":"build","title":"Production bundle will not ship common-passwords.txt","where":"apps/api/scripts/build.mjs:50 / password-policy.ts loadDenyList","detail":"build.mjs rewrites only `new URL('x.ps1', import.meta.url)`; a bundled build throws (fail closed) on first checkPassword. Maker named it; the one-token regex change needs an owner (A3/A4)."}
PROPOSED-ISSUE: {"severity":"low","kind":"test-gap","title":"verify() of a 129-char password is only tested against an unrelated hash","where":"apps/api/src/user-accounts/password.test.ts","detail":"Mutating `length <= PASSWORD_MAX` to `+1` fails only the hash() test; verify of a directly-built argon2 hash of a 129-char plaintext is not asserted false."}
PROPOSED-ISSUE: {"severity":"low","kind":"policy","title":"Local-part containment is literal and skips local parts under 3 chars; deny list is ~1.3k not 10k; email accepts `a@x` and `a@-x.com`; raw-input control check is redundant","where":"password-policy.ts:68-76, email.ts:36-48","detail":"`john.smith@x` does not reject `johnsmith...`; spec [ASSUMPTION] top-10k list unmet (maker-disclosed human item); removing the raw-input control check left email.test.ts green (equivalent mutant, post-normalisation check covers it); password.ts also exports PASSWORD_HASH_PARAMS though UA-10 says the module exposes only hash/verify/needsRehash."}

## Notes
Surviving mutant: raw-input control check removal (equivalent, see above). Scratchpad is shared with other agents: I wrote only under `.../scratchpad/B-ua-cred/` and `.../scratchpad/ua-cred-B-mut/`; an earlier mis-step copied ua-credentials files over `scratchpad/copyb/apps/api/{package.json,tsconfig.json,src/hash.ts}`, an unrelated scratch copy (not in any repo), disclosed here.

Metrics: start=2026-10-29T09:15+05:30 end=2026-10-29T09:42+05:30 wall_min=27 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1620 mutants=10 defects_unit=0 defects_6c=0 check_min=27
slow: lint:structure 2.5 min and 10 mutant runs (~0.3 min each) dominated; all else under 1 min.
