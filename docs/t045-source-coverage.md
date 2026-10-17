# T-045 source acquisition and acceptance

T-045 remains in progress until all five real sources satisfy `qa/contracts/goal-t045.md`.
Source code, configured flags and fixture tests cannot establish successful live acquisition.

## Runtime configuration

`LKB_SOURCE_INTAKE=1` enables source intake configuration. Production HTTP refuses inline SDK
transcription: the runtime must mount the durable enqueue/poll path and run its separate worker.
The worker additionally requires an explicit `LKB_SOURCE_INTAKE_MODEL` and a configured
`GEMINI_API_KEY`. Missing worker configuration keeps direct intake unconfigured (503).
No default model or new default-enabled capture flag is introduced.

Provision a portable yt-dlp executable and ffmpeg on the intended host, or provision them in CI.
Point `LKB_YT_DLP_PATH` to the native executable and `LKB_FFMPEG_PATH` to an absolute binary/directory
when PATH discovery is unavailable. `LKB_FFPROBE_PATH` may name an absolute verified ffprobe executable.
Do not use a shell shim. Host/global installation is not part of
this source unit. Container provisioning belongs to the root deployment integration owner.

`LKB_HOSTED_SOURCE_ACQUISITION=1` separately enables hosted acquisition. Without it, OnAir/Zoom
keep refusing with downloader-unavailable unless an operator supplies a trusted downloader.

OnAir currently supports an event page containing exactly one explicit YouTube recording embed.
The event request uses validated HTTPS, checks all DNS addresses and connects to the approved address.
An optional `LKB_ONAIR_COOKIE_HEADER` is a trusted operator-provided authorized session; it travels only
to the exact OnAir HTTPS origin, cannot follow redirects, and is never sent to yt-dlp. Never put the
cookie in a command, issue, manifest, public log or source evidence. Protected jobs additionally require
the exact tenant/account/event/actor/provider-processing binding described in docs/t045-source-worker.md;
request approval alone cannot use the account. Dynamic pages without a recording
embed, ambiguous multiple videos and unavailable authorization refuse acquisition. A JavaScript-only
event may need an independently verified authorized-session resolver; this unit does not assert it works.

The Zoom hosted path uses yt-dlp's specific Zoom extractor and only the canonical accepted share URL.
It does not replace the live Zoom browser-bot run required by T-045, or add a passcode/session flow.
OnAir forwards only its validated embedded YouTube recording to the YouTube extractor. Generic
extractor fallback is disabled. Source citation metadata retains the original OnAir/Zoom source.

Tool execution uses argument arrays, a ten-minute bound and a shared stdout/stderr cap. Tool children
receive OS basics rather than application provider keys or login tokens. Hosted jobs use fresh physical
scratch directories; error cleanup removes only that job directory. Successfully acquired media remains
available to the existing retention/persistence consumer. YouTube production jobs likewise use fresh
directories so concurrent tenants cannot share a filename. Existing fixture seams remain injectable.

## Transcription

The worker's media wrapper uses the existing Gemini resumable upload, processing poll and candidate-text parser.
It requires normalized MP4/m4a audio, matching the acquisition output and existing generator's MIME.
Other media formats refuse rather than being mislabeled; conversion belongs to the capture pipeline.
Audio size, provider response size, polling count and total transcription time are bounded. Upload
URLs and file URIs cannot leave the configured Google origin. Uploaded files are deleted after success
or processing/generation failure; a deletion failure refuses successful acceptance and must be resolved.
If upload-finalize fails before a valid file name is returned, no safe deletion target is available;
the provider's own lifecycle and a separately verified reconciliation path remain an operational concern.

Production adapters measure duration with bounded local-file-only ffprobe before STT. The wrapper
requires that measurement, clamps parser output to it, refuses out-of-range timestamps and missing
beginning/tail coverage. Real received speech, transcript completeness/accuracy and diarization quality
still require the source-run acceptance receipts.
No mock protocol or recognized magic header establishes playable audio or correct speech.

## Five-source acceptance matrix

| Required source | Implemented acquisition path | Evidence still required |
| --- | --- | --- |
| OnAir on-demand | Authenticated/public pinned page to one YouTube embed, then yt-dlp | Authorized actual event/session, playable received media, real STT, tenant persistence, index and cited Ask |
| YouTube | Existing direct yt-dlp audio adapter with bounded sanitized runner and isolated scratch | Portable tool, actual public source, playable audio, real STT, persistence, index and cited Ask |
| Google Meet | Existing browser bot, owned by T-011/T-034 | Actual observed admission and received speech, usable capture and downstream receipts |
| Microsoft Teams | Existing browser bot, owned by T-011/T-034 | Actual observed admission and received speech, usable capture and downstream receipts |
| Zoom live meeting | Existing browser bot, owned by T-011/T-034 | Actual observed admission and received speech, usable capture and downstream receipts |

For every row record the current operational entrypoint, Windows host, exact command/request and time,
owned source/session IDs, media hash and probe, transcription receipt, tenant readback, index completion,
and independently checked source-grounded Ask citations. Evidence must omit personal join/share tokens.
Replay the same actual media in its tenant and prove the existing session is returned with no database
creates/deletes; prove another tenant gets distinct source identity and cannot access those rows.

`inspectSourceMediaRuntime` reports only configuration flags and always `liveVerified: false`.
T-053's connector workflow separately checks actual indexing consumption and records durable failures.
`/ingest/source` now returns explicit indexing status: done only with a positive complete version-2
receipt; failed on exception/degradation; pending when not requested or already ingested. Raw source
creation/deduplication remains 201/200 and cannot be mistaken for implicit indexing success. Repeats
create/delete nothing and do not re-index; a separate verified consumer handles incomplete indexing.

This work does not close T-045, enable production capture, approve a real migration, settle T-048's
default switch or establish Windows/Ubuntu operational release acceptance.
