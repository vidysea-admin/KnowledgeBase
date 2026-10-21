# w26-ytcaptions: import captions from the owner's own YouTube channel (official API)

Status: ready-for-check
Fix cycle: 0
Lane: KnowledgeBase-lanes/w26-ytcaptions  Branch: lane/w26-ytcaptions  Base: 60cf1f683dbd5dcc0163b668df111d62ba4a2563
Candidate SHA: see `git log -1 lane/w26-ytcaptions` (the commit that adds this file)

## Why
Umesh chose the captions-download route: the official API works only for videos on his own or managed channel.

## Design
- `apps/api/src/youtube-import/cli.ts`: `login` (OAuth installed-app: PKCE, loopback `127.0.0.1`, prints the URL, scope `youtube.force-ssl`) and `import --tenant <id> [--since] [--limit] [--budget]`.
- OAuth client: `LKB_YT_CLIENT_ID`/`LKB_YT_CLIENT_SECRET`, else `LKB_YT_CLIENT_FILE`, else the existing gitignored `config/client_secret.json`. Refresh token in gitignored `config/youtube-token.json` (0600), never printed.
- `http.ts` allows only `www.googleapis.com/youtube/v3/*` and `oauth2.googleapis.com` (no timedtext/innertube/yt-dlp/video). `client.ts` has exactly four calls: channels.list mine, playlistItems.list, captions.list, captions.download (tfmt=vtt).
- `run.ts` -> existing `intakeFromSource` (same sink/docs as other sources) via `adapter.ts` (`Source`, kind url, captureMode provided, owner-content consent receipt + sourceMeta videoId/title/publishedAt/channel/track). Source id = tenantSourceId(sha256("youtube-captions:"+videoId)): idempotent by videoId; existing videos are skipped before any caption quota is spent.
- Track choice: manual en/hi, then ASR, then other manual; drafts/forced never. No track / refused download / empty captions are logged and skipped.
- `quota.ts`: default 9000 units per Pacific day, persisted in gitignored `config/youtube-quota.json`; costs 1/1/50/200; 403 quotaExceeded exhausts the ledger and stops the run; rate limits and 429/5xx back off twice.
- CLI refuses any database except `lkb_staging` (D-117).

## Changed paths
- apps/api/src/youtube-import/{http,captions,quota,client,adapter,run,oauth,cli}.ts and {captions,oauth,import}.test.ts
- docs/youtube-owner-captions.md (36 lines); .gitignore (+2 lines: token and quota files)
- Not touched: package.json, composition, schema, contracts, DECISIONS.

## Checks a checker must run (from apps/api)
- `node --test --import tsx src/youtube-import/*.test.ts` -> pass 17
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0
- `node scripts/lint-loc.mjs --all` (repo root) -> all stages pass
- Review: no other host/path reachable; tokens never printed; staging-only refusal in cli.ts.

## Evidence
- tests: captions 5, oauth 5, import 7 = 17/17 pass (fake Http, in-memory sink; the login test uses a real 127.0.0.1 loopback only).
- tsc exit 0 (apps/api).
- D-020 mutation (script outside the repo, per-mutation backup + trap, cmp restore): replace the already-imported pre-check in run.ts with `false &&` -> "idempotent by videoId" FAILED (pass 6 / fail 1); restored.
- lint-loc --all: OK (10 stages, 0 failed), exit 0.

## Not verified
- No live OAuth consent and no live YouTube call (needs Umesh's browser approval and the YouTube Data API v3 enabled in the OAuth client's Google project).
- Whether the API lets the owner download auto-generated (ASR) tracks is unconfirmed; a 403 is logged and skipped.
- Mongo sink path (`createMongoIntakeSink`) is reused unchanged and not exercised against a live staging DB here.
