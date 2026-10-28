# Import captions from your own YouTube channel

Official route only: YouTube Data API v3 (`channels.list mine=true`, `playlistItems.list`, `captions.list`,
`captions.download`). It works only for videos on the channel of the Google account that signs in. It does not scrape
(`timedtext`, innertube), does not use yt-dlp and never downloads video. Other people's videos cannot be imported.

## 1. OAuth client (once, in the Google Cloud console)
1. Pick (or create) a project, then APIs & Services > Library > enable **YouTube Data API v3**.
2. APIs & Services > OAuth consent screen: add the channel owner's Google account as a test user (External, Testing).
3. Credentials > Create credentials > OAuth client ID > **Desktop app**. Download the JSON.
4. Give the app the client, either way:
   - `LKB_YT_CLIENT_ID` and `LKB_YT_CLIENT_SECRET` in `.env`; or
   - save the JSON as `config/client_secret.json` (already gitignored; the gws client works if the API is enabled in its project) or point `LKB_YT_CLIENT_FILE` at it.

## 2. One-time consent
`node --import tsx apps/api/src/youtube-import/cli.ts login`
It prints a URL and waits on `http://127.0.0.1:<port>/callback`. Open the URL, sign in as the channel owner and approve
the single scope `youtube.force-ssl` (needed by `captions.download`). The refresh token is written to
`config/youtube-token.json` (gitignored, mode 0600) and is never printed. Revoke any time at myaccount.google.com/permissions.

## 3. Import
```
MONGODB_DB=lkb_staging LKB_ALLOW_STAGING=lkb_staging \
node --import tsx apps/api/src/youtube-import/cli.ts import --tenant <id> [--since YYYY-MM-DD] [--limit N] [--budget UNITS]
```
- Lists the uploads playlist (newest first). Per video: manual en/hi caption, else auto-generated (ASR), else any other
  non-draft track; downloaded as VTT, turned into timestamped turns, and ingested through `intakeFromSource` with the video id, title,
  published date, channel and an owner-content consent receipt. Session indexing is the normal separate step.
- Idempotent by video id: videos already ingested are skipped before any caption quota is spent.
- Videos with no track, a refused download or empty captions are logged (`skip <id>: <reason>`) and skipped.
- Writes only to `lkb_staging` (D-117); the command refuses any other database.

## Quota
`captions.download` costs 200 units, `captions.list` 50, the others 1. Default budget 9000 of the 10000 daily units
(`--budget`), tracked per Pacific day in `config/youtube-quota.json`. A 403 `quotaExceeded` (or a budget that cannot
cover one more video) stops the run cleanly; rerun the next day. Rate-limit 403/429/5xx retry twice with backoff.
