# Manifest — t045-zoom-recording-source-adapter

**Goal task:** T-045 (Zoom cloud-recording half, URL recognition only), tier 3 roadmap pull. T-045 lists "OnAir on-demand, YouTube via yt-dlp, Meet/Teams/Zoom via browser bot"; OnAir and YouTube are done (both PASS), so Meet/Teams/Zoom are next. Of these only Zoom has an on-demand (recording) URL shape evidenced in the repo.
**Round cap / classification:** PASSed verdicts naming the intake source-adapter seam: 2 (`t045-youtube-source-adapter`, `t045-onair-source-adapter`; both `ISSUES-WRITTEN: none`). This unit is a NEW platform adapter, i.e. a new feature slice of roadmap task T-045 (tier 3), not a finding-driven polish round on an existing adapter, and it touches no auth/tenancy/data-write path. The class-based cap governs follow-up findings on a seam, so it does not forbid this slice. If the checker reads the cap as seam-wide, this is the point to raise it.
**Roadmap exit criterion (docs/meeting-bot-roadmap.md:76):** "one successful run per source". NOT claimed.
**Date:** 2026-10-11 · **Lane:** T045NEXT (no issues filed; `qa/issues.t045next.jsonl` not created)
**Files (new only):** `packages/ingest/src/sources/zoom-recording.ts` (106 non-blank lines), `zoom-recording.test.ts` (227), this manifest. Sources dir file budget: +2 files.

## Why Zoom recordings
Evidence in repo: `apps/api/src/gws-gmail.ts:63` (`RECORDING_URL_RE` contains `zoom\.us\/rec`); `qa/contracts/gmail-meeting-candidates-approval.md:128` ("a real `zoom.us/rec/share/...` link" extracted live from Gmail); `packages/meeting-bot/src/platform.ts:29` (zoom.us and `*.zoom.us`). Not usable: Meet (`send-now.ts:91-94` only join codes/lookup = live meeting), Teams (`/meet/<id>`, `/l/meetup-join`: live only), Webex/Zoho (live only; no recording shape anywhere). Zoom `/j/`, `/w/`, `/wc/` are live-join forms and are deliberately refused.

## Scope
Pure URL recognition: `parseZoomRecordingUrl(input) -> {ok,platform:"zoom-recording",kind,recordingId,canonicalUrl} | {ok:false,reason}`, `extractZoomRecordingId`, `canonicalZoomRecordingUrl(kind,id)`, descriptor `zoomRecordingAdapter`. No fetch, download, HTML parsing, process, DB. Not a `Source`.

## Accepted forms
| Form | Grounding |
|---|---|
| `https://zoom.us/rec/share/<token>` (optional trailing `/`) | grounded in `gws-gmail.ts:63` and `qa/contracts/gmail-meeting-candidates-approval.md:128` |
| `https://zoom.us/rec/play/<token>` | `/rec` prefix grounded (`gws-gmail.ts:63`); the `play` kind is unverified against the live site |
| `https://<one-label>.zoom.us/rec/...` (e.g. `us02web.`) | host family grounded in `platform.ts:29`; unverified against the live site. Canonical is rebuilt on bare `zoom.us` (unverified that bare host serves every subdomain's recording) |
| host / scheme case-insensitive | URL standard; unverified for Zoom specifically |
| token charset `[A-Za-z0-9][A-Za-z0-9._-]*`, 8..256 chars, case kept | ASSUMPTION: the repo has only the elided `...` token, so the charset and length bounds are unverified against live tokens (a real token with another character would be refused) |

## Passcodes and tokens
Query allow-list `ZOOM_RECORDING_QUERY_ALLOW` is EMPTY: `pwd`, `startTime`, `componentName`, any `token`/`passcode`, all other query params and the fragment never reach the canonical URL or the id. Consequence: a recording that REQUIRES a passcode (the passcode normally rides in `?pwd=` or is typed on a page) cannot be played from the canonical URL alone. The passcode must travel separately through a secret-handling path (encrypted at rest, never logged, never in an id or URL) that does not exist yet. FOLLOW-UP, not invented here. Note the path token itself is a bearer capability for no-passcode shares; it is stored as `recordingId` (needed as the stable id), so downstream code must not log it.

## Security decisions
https only; host `zoom.us` or exactly one DNS label before it (`^(label\.)?zoom\.us$`, label `[a-z0-9-]` not starting/ending with `-`): no suffix/prefix, no multi-level, no `zoom.com`, no trailing dot; any `@` in authority refused (`credentials`); any `:` refused (`port`, even 443); any char outside printable ASCII and any `\` refused (`bad-characters`, covers controls, DEL, U+2028, lone surrogates, IDN look-alikes; punycode hosts are `host-not-allowed`); `%` in the path refused; dot-only/leading-dash tokens, extra segments, empty token refused; input <= 400 chars. Refusals: not-a-string, empty, too-long, bad-characters, not-https, credentials, port, unparseable, host-not-allowed, path-not-supported, bad-recording-id. Never throws.

## Registration
NOT registered. `grep -rn -E "onair|youtube|zoom-recording" packages/ingest/src/index.ts packages/ingest/src/registry.ts` printed nothing: youtube and onair are not exported or registered either; nothing existing changed.

## Evidence
Node: codex runtime on PATH. From `packages/ingest`:

`node --test --import tsx src/sources/zoom-recording.test.ts`
```
✔ accepts supported forms: kind, id (case kept) and canonical URL, query/fragment/pwd dropped
✔ refuses every hostile or unsupported input with the right reason
✔ never throws on hostile garbage
✔ canonical URL is idempotent and refuses a bad kind or id
✔ empty id is never accepted
✔ a passcode/token query parameter never reaches the canonical URL or id; allow-list is empty
✔ property (seeded): any accepted input has allow-listed host, https, no stray query, no userinfo
✔ cross-adapter exclusivity: no accepted fixture is accepted by another adapter
ℹ tests 8 / pass 8 / fail 0
```
Hostile table: 70 cases (asserted >= 60) with exact reason each. Property: seeded LCG seed 46, 4,000 inputs, accepted > 20 asserted. Exclusivity: every accepted fixture of youtube (5), onair (3) and zoom (10) run through the other two adapters; none double-accepted. Idempotence: every canonical re-parses to the same id/kind/canonical.

`node --test --import tsx src/sources/youtube.test.ts` -> `ℹ tests 10 / pass 10 / fail 0`; `.../onair.test.ts` -> `ℹ tests 6 / pass 6 / fail 0` (both unchanged).
`node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> no output, `tsc-exit=0`.
`node scripts/lint-dirsize.mjs` -> `FAIL: packages/index/src/pipeline: 34 files (budget 30)`. That violation is pre-existing and in another package; `packages/ingest/src/sources` is not flagged.

## Mutations
Harness: untracked, lane-unique, absolute paths in this worktree, byte backup taken per mutation, restored in `finally`, 120 s `spawnSync` timeout with SIGKILL, harness deleted before commit. `git hash-object zoom-recording.ts` before and after the run: `9e05ca7ec82443524c8bd9d10fe8af0a7fd7216f` (identical; HEAD equality is verified after the commit, see below).
| Mutation | Result | Killed by |
|---|---|---|
| host suffix match (`/zoom\.us$/`, shared by both host checks) | KILLED | refuses every hostile... |
| http allowed (both scheme checks removed) | KILLED | refuses every hostile... |
| full query kept (`+ url.search`) | KILLED | accepts supported forms; passcode/token test; property |
| userinfo checks skipped (both) | KILLED | refuses every hostile... |
| empty id accepted (`*`, validId bypassed) | KILLED | refuses every hostile...; canonical idempotent...; empty id never accepted |
| `pwd` added to allow-list and carried | KILLED | accepts supported forms; passcode/token test; property |
| case-folded id (extra) | KILLED | accepts supported forms; passcode/token test |
Each mutation removes every redundant guard for that class (host: one shared regex; scheme and userinfo: both the regex-level and URL-object checks), so none is masked by a second check.

## Not done
- No fetch, download, transcription, HTML parsing; no `Source`; nothing verified against the live site or any real recording token; "one successful run per source" not met; unregistered.
- Passcode-bearing recordings cannot be played yet: needs the separate secret path (follow-up).
- T-045 stays `in_progress`.

## Platforms still remaining and what each needs
- Meet and Teams: recording shapes are not evidenced anywhere (only live join forms). Need a real sample recording/on-demand URL from the owner (Meet recordings are Drive files, so the existing Drive adapter shape may apply; Teams recordings are Stream/SharePoint links).
- Webex: a real recording link sample (`.webex.com/...` playback form) from the owner.
- Zoho Webinar/Meeting recording: a real on-demand/recording URL sample (repo has only join `key=`/`sessionid=` forms).
- Zoom: a real `rec/share` URL with a real token (charset/length), and one with `pwd`, to verify the token bounds, the `play` kind, and subdomain/bare-host behaviour.
- All: the browser-bot "one successful run per source" runs and adapter registration.

## Fix cycle 1

### SENSITIVE: share tokens are bearer secrets (requirement on the future registration/wiring unit)
For this platform BOTH `recordingId` AND `canonicalUrl` contain the share token, which is a bearer secret: anyone holding it can view the recording. Neither may be logged, shown in alerts or UI, or stored in places with wider access than the recording itself. The registration/wiring unit must enforce this (redact on log/display, restrict storage). Passcode (`pwd`) values are never kept by the adapter, and passcode-protected recordings need a separate secret path that does not exist yet.

### What failed (ISS-T045NEXT-001, medium)
Cycle 0 accepted `https://acme.zoom.us/rec/share/T` as ok and rewrote the canonical URL to bare `zoom.us` (possibly a dead link, host dropped from the id) and accepted the ungrounded `/rec/play/` kind.

### Now accepted: exactly one shape
`https://zoom.us/rec/share/<token>` (optional trailing `/`, scheme/host case-insensitive). Evidence for the host: `qa/contracts/gmail-meeting-candidates-approval.md:128` ("a real `zoom.us/rec/share/...` link", bare host `zoom.us`) and `apps/api/src/gws-gmail.ts:63` (`zoom\.us\/rec`). `packages/meeting-bot/src/platform.ts:29` (`.zoom.us` suffix) is evidence for JOIN-link hosts only, not for recording hosts, so subdomains are not grounded.
- Refused with new reason `unverified-shape`: `/rec/play/<token>`, any `<label>.zoom.us` host (e.g. `acme.`, `us02web.`), vanity hosts, each with a valid token. A caller can now tell "not handled yet" from "not ours" (`host-not-allowed`, `path-not-supported`, ...). Refusal rather than `verified:false`: it cannot be misused.
- Order of checks: scheme/credentials/port/host family, then path shape (`path-not-supported`), then token validity (`bad-recording-id`), then `unverified-shape`.
- Canonical/id rule: the canonical URL carries the validated lower-cased host (always `zoom.us`, never rewritten; test asserts accepted canonical host equals input host lower-cased). One accepted host, so the id is the token alone (host qualification is not applicable; if a second host is ever accepted the id MUST become host-qualified).
- Kept: https only; no query/fragment kept; exclusivity with youtube/onair; `/j/ /my/ /wc/ /s/` refused (`path-not-supported`); `zoomgov.com`, `us02web.zoomgov.com`, `zoom.com.cn` refused (`host-not-allowed`); never throws; bounded (400 chars).
- Hostile table: every previous entry keeps its reason (all used the bare host). Changed behaviour only for formerly accepted inputs (`/rec/play/`, subdomains), now `unverified-shape`. The `ZoomRecordingKind` type is now `"share"` and `canonicalZoomRecordingUrl("play", ...)` throws.

### D-015 measurement
`ISS-T045NEXT-001: 2/2 refused unverified-shape` (the row's two recorded reproductions, `https://acme.zoom.us/rec/share/AbCdEfGh12345678` and `.../rec/play/AbCdEfGh12345678`, run verbatim in test "ISS-T045NEXT-001 recorded reproductions ..."). No recorded reproduction left open.

### Mutations (harness untracked, lane-unique, inside this worktree, byte backup per mutation, restore in `finally`, 200 s SIGKILL timeout, deleted before commit; `git hash-object zoom-recording.ts` = `49e1d6c57e0e9aa0dba40bd118093029df73230c` before and after, equal to the committed blob checked after commit)
| Mutation | Result | Named killers |
|---|---|---|
| unverified subdomain accepted | KILLED | "ISS-T045NEXT-001 recorded reproductions..."; "unverified shapes (play kind, any subdomain...)"; property |
| `/rec/play` accepted | KILLED | "unverified shapes (play kind, any subdomain...)" |
| host check removed (subdomain accepted, canonical on constant host) | KILLED | ISS-T045NEXT-001 test; unverified shapes test; property (host equals input host) |
| canonical host rewritten to `www.zoom.us` | KILLED | "host is never rewritten..."; accepts supported forms; idempotence; property |
| unverified reason collapsed into `path-not-supported` | KILLED | ISS-T045NEXT-001 test; "unverified shapes..." |
| query kept in canonical | KILLED | "harmless query/fragment is dropped..." (new focused test); accepts supported forms; passcode test; property |
Not applicable: "id not host-qualified when two hosts accepted" (one host accepted). `/j/` accepted is now covered by the focused test "join paths /j/ /my/ /wc/ /s/ and zoomgov.com / zoom.com.cn are refused by name".

### Evidence (from `packages/ingest`, node = codex runtime)
`node --test --import tsx src/sources/zoom-recording.test.ts` -> `ℹ tests 13 / pass 13 / fail 0` (includes `ISS-T045NEXT-001: 2/2 refused`); `youtube.test.ts` -> `tests 10 / pass 10 / fail 0`; `onair.test.ts` -> `tests 6 / pass 6 / fail 0`; `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> no output, `tsc-exit=0`. Budgets: source 107 non-blank lines (<= 300), test 295 (<= 400); no file added.

### What the owner must supply to widen acceptance
One real link per shape, with the real token: a `/rec/play/` link; a recording link on a regional/tenant subdomain (e.g. `us06web.zoom.us/rec/share/...`); any vanity-host link; and one passcode-bearing link (`?pwd=`). Until then these stay `unverified-shape`.

Status: checked-PASS (Checked: qa/verdicts/t045-zoom-recording-source-adapter.md, cycle 1, 4a9796e; URL recognition only, unregistered)
Fix cycle: 1
