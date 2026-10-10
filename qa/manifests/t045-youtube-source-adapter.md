# Manifest — t045-youtube-source-adapter

**Goal task:** T-045 (YouTube half only), tier 3 roadmap pull. Round cap: 0 PASSed verdicts name a YouTube / yt-dlp seam (`grep -il "youtube\|yt-dlp" qa/verdicts/*` finds only `u2-source-watcher.md`, a different seam). Cap not reached.
**Roadmap exit criterion (docs/meeting-bot-roadmap.md:76):** "| T-045 | **More sources**: Google OnAir on-demand (after a one-time login), YouTube via yt-dlp (direct audio, no recording), Meet/Teams/Zoom via the same browser bot | one successful run per source |"
**Date:** 2026-10-10 · **Lane:** T045 (no issues filed; `qa/issues.t045.jsonl` not created)
**Files (new only):** `packages/ingest/src/sources/youtube.ts`, `packages/ingest/src/sources/youtube.test.ts`

## What was built
1. `extractYoutubeVideoId` / `canonicalYoutubeUrl`: https only; hosts exactly youtube.com, www.youtube.com, m.youtube.com, youtu.be (music.youtube.com not asked for by any doc, so rejected); shapes `/watch?v=`, `youtu.be/<id>`, `/live/<id>`, `/shorts/<id>`; id must match `^[A-Za-z0-9_-]{11}$`; rejects userinfo, ports, whitespace/control/backslash, > 200 chars, playlists/channels/handles. The URL passed onward is rebuilt as `https://www.youtube.com/watch?v=<id>`.
2. `buildYtDlpArgs(id, workDir)`: argv array, no shell. Only user-derived value is the rebuilt URL after `--`. `--ignore-config` first; no `--exec*`, cookies, or account options.
3. `createYoutubeSource(deps)` implementing `Source`: injected `exec` seam (`defaultYoutubeExec` is the sole spawn, `shell:false`, never called by tests), path-inside-workDir check, injected reader/hasher, `toTurns` hands bytes to the injected T-019 `Transcribe` seam (same as `recording.ts`). Source doc: `kind:"url"`, `url`=canonical, `path`=audio, plus `sourceMeta {platform, videoId, canonicalUrl, retrievedAt}`. Media doc `kind:"audio"`.
4. Consent (H8, ARCHITECTURE.md:46): "capture order is organizer-provided recording → public recording → attendee notes/live transcript → silent capture ONLY when no alternative exists". H8 defines no separate permission flag, so the existing `ConsentContext` is required: `given === true`, non-empty `recordedBy`, `captureMode` of `provided` or `public`; `notes`/`silent` refused before exec runs. Typed errors: invalid-url, consent-refused, exec-failed, non-zero-exit, timeout, no-output, path-escape, empty-output.

## Sample argv (id `dQw4w9WgXcQ`, workDir `/work/yt`)
```
["--ignore-config","--no-playlist","--no-progress","-x","--audio-format","m4a","--no-simulate","--print","after_move:filepath","-o","/work/yt/yt-dQw4w9WgXcQ.%(ext)s","--","https://www.youtube.com/watch?v=dQw4w9WgXcQ"]
```

## Evidence
Node: `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin` on PATH; node_modules junctioned to the main tree (root and packages/ingest).

`cd packages/ingest && timeout 120 node --test --import tsx src/sources/youtube.test.ts`
```
✔ accepts supported URL shapes and extracts the id
✔ rejects every hostile or unsupported URL shape
✔ canonical URL is rebuilt from the id and refuses a bad id
✔ argv: exact vector for a sample id, URL last after --, no dangerous options
✔ argv: hostile inputs never reach the vector or add an argument
✔ isInsideDir rejects escapes (posix and windows flavours)
✔ success: fake exec -> source doc with citation metadata, then STT seam gets the audio
✔ failure modes are typed and produce no document
✔ path escape in the reported audio path is rejected
✔ consent: refused without explicit given + provided/public
ℹ tests 10 / pass 10 / fail 0
```
`cd packages/ingest && timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> no output, `tsc-exit=0`.
`node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (109 dir(s) within budget)`.

## Not delivered
- NOT registered in `registry.ts` (out of scope by instruction).
- NEVER run against real YouTube or a real yt-dlp binary: the roadmap's "one successful run per source" clause is NOT claimed. yt-dlp's `--print after_move:filepath` stdout contract and `-x --audio-format m4a` (needs ffmpeg) are assumptions, unverified.
- yt-dlp is not installed or pinned by this unit. `defaultYoutubeExec` is untested by design.
- No real STT, no full suite, no monorepo build run. `sources.schema.json` `kind` enum has no "youtube", so `kind:"url"` is used with extra `sourceMeta` (schema allows additional properties); not validated against the schema in a test.
- Tenant/data-write touching: the adapter writes no DB; persistence is the caller's.

Status: ready-for-check
Fix cycle: 0
