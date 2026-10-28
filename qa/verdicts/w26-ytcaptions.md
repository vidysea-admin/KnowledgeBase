# Verdict: w26-ytcaptions

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: deceb87c0d63163e1da9d6dd4e07de4cc963b1c5
Base: 60cf1f683dbd5dcc0163b668df111d62ba4a2563
Class: security (credential handling, data writes)

## Cycle 1 evidence (independent)
- Diff 22edd1bc..deceb87c reviewed: oauth.ts (timer.unref, listener fully closed incl. closeAllConnections), new staging-guard.ts (requireStagingDatabase = requireDatabaseName + exact lkb_staging) used by cli.ts which returns 2 before connect, new tests, manifest. No other product change.
- Tests (from apps/api, `timeout 600 node --test --test-force-exit --import tsx` on captions, oauth, import, staging-guard): 19 pass / 0 fail, exit 0; the cycle 0 libuv teardown crash is gone.
- tsc --noEmit -p tsconfig.json: exit 0.
- Mutant M1 (cycle 0 finding 1, append ${res.body} to the tokenCall error in oauth.ts): now KILLED by "token endpoint failure: neither the thrown error nor any log carries the response body" (18 pass / 1 fail).
- Mutant M2 (new, staging-guard.ts: disable the lkb_staging exact check): KILLED by "staging guard refuses every non-staging target..." (18 pass / 1 fail).
- D-020: per-mutation byte backup, trap INT/TERM/ERR, timeout 300; after both, `git -c core.autocrlf=true hash-object` equals `git rev-parse HEAD:<file>` for oauth.ts (2ca072bf7d3f7b5569ea36b6f0f5d0be735da963) and staging-guard.ts (ebbab168ce3522b41cbeafac339e5ba6cffc417e); working tree clean.
- Cycle 0 findings 1 and 2 resolved; notes 3 (teardown) resolved, note 4 (Windows 0600 best-effort, JSON.parse snippet, .dockerignore) remain optional.
- Not verified: live Google/OAuth, Mongo, lint-loc; maker/checker token ratios not recorded (unverified).

ISSUES-WRITTEN: none. Ledger rows for w26-ytcaptions may be flipped; maker may close out to checked-PASS.

## Cycle 0 record

Cycle 0 result (historical, superseded by cycle 1 above): FAIL
Cycle 0 checked: 0
Cycle 0 reviewed SHA: 22edd1bc8db45e61b6edf305ff25fa1fd15d61cb
Base: 60cf1f683dbd5dcc0163b668df111d62ba4a2563
Class: security (credential handling, data writes)

## Summary
Product code reviewed line by line is correct on every focus item. FAIL is for one proven, security-class test gap: a D-020 mutant on the token-not-logged path survives the whole suite, and the staging-only guard in cli.ts has no test at all. No scope to hunt further was taken.

## Findings
1. (FAIL reason, security class) Surviving mutant on the credential-not-logged path. `apps/api/src/youtube-import/oauth.ts:56` (`tokenCall` error message, which cli.ts:77 prints) deliberately names only HTTP status and Google's `error` code. Mutation: append `${res.body}` to that message (body can carry access/refresh tokens). Result: all 17 tests pass, exit 0 (receipt: per-mutation byte backup, trap INT/TERM/ERR, timeout 300; restored; `git -c core.autocrlf=true hash-object` of oauth.ts == `git rev-parse HEAD:` == 006169e8e0e7f0e4259a9ab99656754ce0f10ff2). The only "never printed" test (`oauth.test.ts` login) checks `print()` output and never exercises the failing-token-endpoint path. Fix: add tests where the fake `Http` returns 400/401 with a body containing `SECRET_RT`/`SECRET_AT` for (a) `createTokenProvider` refresh and (b) `runLogin` code exchange, asserting the rejection message matches `/HTTP 400 invalid_grant/` and does not contain the secret strings; re-run the same mutant and show it dies.
2. (FAIL reason, security class) The D-117 staging-only refusal (`cli.ts:44-45`, `requireDatabaseName` + exact `lkb_staging`) is untested: no test imports cli.ts. Static read is correct (unset MONGODB_DB throws, `lkb` / other names return 2, `lkb_staging` without `LKB_ALLOW_STAGING=lkb_staging` throws, wrong-case name throws, only exact lkb_staging with opt-in connects), but a regression is undetectable. Fix: add a small test calling `main(["import","--tenant","t"], env)` for env = {}, MONGODB_DB=lkb, other_db, lkb_staging without opt-in, asserting exit 2 or a throw and that `connect` is never reached (these refusals all occur before `connect`). My own runtime probe of this was inconclusive (timed out under load, no output), so the guard is verified by reading only.
3. (note, low) `oauth.test.ts` aborts at process teardown with a Windows libuv assertion (`!(handle->flags & UV_HANDLE_CLOSING)`, async.c:94, exit 1) when run with `--test-force-exit` (2/2 runs; the 17 sub-tests themselves pass). Without `--test-force-exit` (the manifest's command) the three files give 17/17, exit 0. Likely lingering keep-alive sockets from the real-loopback fetch; suggest `server.closeAllConnections()` in `listenForCode` after `server.close()`. Not a product-correctness finding.
4. (note, low) Token file mode 0600 is best-effort on Windows (mode only applies on creation and is ignored on NTFS); docs should say the file relies on directory ACLs there. `JSON.parse` failures on a corrupt token/client file could echo a short snippet of the file in the message. `.dockerignore` lists client_secret but not `config/youtube-token.json`.

## Verified (independent)
- Identity: HEAD == 22edd1bc; diff base..candidate is 14 files, +833, all under apps/api/src/youtube-import, docs, .gitignore, manifest.
- Scraping: grep for timedtext|innertube|youtubei|yt-dlp|ytdl|youtube-dl in youtube-import and docs: only the guard comment, the guard's negative test, and a docs sentence saying it is not used. `http.ts` allows only https `www.googleapis.com/youtube/v3/*` and `oauth2.googleapis.com`; `client.ts` has exactly four calls (channels mine, playlistItems, captions.list, captions.download tfmt=vtt). No video download. PASS.
- Token / secret hygiene: `git check-ignore -v` ignores config/youtube-token.json, config/youtube-quota.json, config/client_secret.json (.gitignore:5-7); `git grep` finds no client secret literals; client read from env (LKB_YT_CLIENT_ID/SECRET), LKB_YT_CLIENT_FILE or gitignored config/client_secret.json. Refresh token written 0600 via `writeSecret`, never printed (login prints only URL and "not shown"). PASS apart from finding 1's test gap.
- OAuth: listener binds `127.0.0.1` port 0; `/callback` only; `state` compared and `code` required, error param rejected; PKCE S256 with 48-byte verifier sent as code_verifier; 300 s timeout; server closed on completion. State comparison is not constant-time and a local wrong-state request aborts the login (low, acceptable).
- Ingest: `intakeFromSource` with tenant-scoped `tenantSourceId`, intake.ts checks tenant match and scoped id; source id is sha256("youtube-captions:"+videoId) so repeat imports are already-ingested; run.ts pre-check via `findSessionBySource(tenant, id)` skips before spending caption quota; mongo sink asserts valid tenant id. Consent receipt: provided/given/recordedBy `youtube-owner-import` with sourceMeta.ownerContent basis own-channel; `fetch()` refuses any other consent. Invalid videoId refused. No cross-tenant path.
- Quota/errors: ledger charges before each call, persisted per Pacific day, default 9000; 403 quotaExceeded/dailyLimitExceeded exhausts ledger and stops via QuotaStop; rate limit and 429/5xx back off twice then stop; per-video download refusal is skipped, 401 aborts. Parser: garbage, header-only, inverted cues, CRLF, BOM, out-of-order all handled without throwing (captions.test.ts).
- Commands (from apps/api, PATH with node runtime, each under `timeout 600`, output in lane `.chk/`, removed before commit):
  - `node --test --import tsx` on the 3 files: 17 pass / 0 fail, exit 0.
  - Same with `--test-force-exit`: oauth.test.ts file crash as in finding 3 (re-run once, same result).
  - `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: exit 0.
- Not run: lint-loc --all (not in the brief's checks), network, live Google, Mongo, browsers.

## Remaining / limits
- No live OAuth or YouTube call verified (also not done by maker). Mongo sink path reused unchanged.
- Budget metrics not recorded (maker usage not supplied in the packet); ratio unverified.

## Ledger
ISSUES-WRITTEN: none. Ledger rows may NOT be flipped; maker should do fix cycle 1 for findings 1 and 2 only (notes 3 and 4 optional), then re-submit for a re-check including a re-run of the same mutant.
