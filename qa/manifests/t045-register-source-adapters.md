# t045-register-source-adapters

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (next unblocked roadmap task T-045, "More sources"). Class: ingest routing plus subprocess arguments built from user-supplied URLs: full ceremony.
Lane: lane/sourcesreg. Lane ledger `qa/issues.sourcesreg.jsonl`: ISS-SOURCESREG-001 (medium), ISS-SOURCESREG-002 (low), both file-don't-fix.

## Scope (packages/ingest only)
- `src/registry.ts`: new `buildSourceRegistry(parts)` fixing the precedence; `detectSource` unchanged.
- `src/sources/hosted-recording.ts` (new): `createOnairSource`, `createZoomRecordingSource` (full `Source` adapters over the existing recognisers), `HostedRecordingError`, injected `HostedRecordingDownloader`.
- `src/sources/youtube.ts`: `binary-missing` and `bad-config` error codes, `resolveYtDlpCommand(env)` (`LKB_YT_DLP_PATH`), `resolveFfmpegLocation(env)` (`LKB_FFMPEG_PATH`, becomes `--ffmpeg-location`), ENOENT mapped to `binary-missing`. Default argv is byte-identical (existing youtube tests unchanged).
- `src/index.ts`: exports. `src/sources/media-sources-registry.test.ts` (new, 74 tests).

## Decisions
- Order: recording, document, whatsapp, youtube, onair, zoom-recording, url. Legacy adapters keep their slots; the new strict recognisers sit before the catch-all url, so only inputs that used to reach `url` (or matched nothing, for `{url, tenantId}` objects) can move.
- OnAir and Zoom had no `Source` (descriptor only). They now implement the same output as YouTube (source kind "url", one media doc, `sourceMeta`, tenant carried). The media download is an injected seam with NO implementation: with none injected `fetch` fails closed with `downloader-unavailable`. No allow-list was widened: hosts are exactly what the recognisers already accept.
- Output contract = `schema/sources.schema.json` + `schema/media.schema.json` (the ingestion-source-seam contract). They have no duration field, so none is emitted.
- Env convention follows `LKB_GWS_PATH`/`LKB_PYTHON`. `.env.example` NOT edited (outside packages/ingest): the two new variable names need adding there.
- Zoom share token is a bearer secret and is stored in `source.url` (same as YouTube url); never put in an error message (tested).

## Evidence (packages/ingest, node off PATH, timeouts, no network/browser/real binary)
- `node --test --import tsx src/sources/media-sources-registry.test.ts` -> tests 74, pass 74, fail 0 (73 before the pinned KNOWN test; first run had 1 fail, a wrong expectation in my test, fixed).
- Existing: youtube.test.ts 10/10, onair.test.ts 6/6, zoom-recording.test.ts 13/13, registry.test.ts 5/5, url.test.ts 7/7, recording.test.ts 4/4.
- `tsc --noEmit -p tsconfig.json` -> exit 0.
- Routing: 24 positive rows (existing sources incl. hint objects, 3 new sources in string/object/url-hint forms), 29 look-alikes, 8 junk inputs. Every look-alike routes exactly as the legacy registry did and never to a new adapter; every legacy-routed input keeps its adapter except strict new-source URLs.
- Look-alike/injection cases: http, subdomain spoof, suffix spoof, unlisted subdomain, `@` userinfo (both orders), creds, port, host-in-path, backslash, whitespace, `--exec` as id, encoded slug, Zoom play/subdomain shapes.
- Argv: 8 crafted URLs (`--exec=...`, flag-prefixed, newline, `-o` prefix) spawn nothing (typed `invalid-url`); a valid id with smuggled `&--exec=` params gives only `... , "--", <rebuilt URL>`; bad `LKB_*` values and a `--` command are `bad-config`; ENOENT -> `binary-missing`, EACCES -> `exec-failed`.
- Mutations (harness `.mut-sourcesreg.mjs`, untracked, deleted; byte backup restored in `finally`; hash before/after printed): url first in order KILLED (13 fail); ENOENT mapping KILLED; path-escape check removed KILLED; consent check removed KILLED; tenant hard-coded KILLED. NOT APPLIED: removing the `--` marker (line endings made my pattern not match); covered by existing youtube.test.ts and the argv test only.

## NOT covered
- Live runs per source (T-045 exit criterion "one successful run per source") and the OnAir Google login: need credentials and network, not part of this lane. No downloader exists for OnAir/Zoom; YouTube real spawn (`defaultYoutubeExec`) and a real yt-dlp/ffmpeg run were never executed.
- Nothing yet constructs the registry in apps/api or a CLI; `.env.example` entries missing.
- ISS-SOURCESREG-001/002 (see ledger).
