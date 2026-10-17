# Finite native/vectorless broker phase

Maker evidence only. No independent verdict or unit close-out.

| Job | Own exit | Actual results |
| --- | --- | --- |
| Native codec/ledger/spool | 0 | 11 pass / 11 tests |
| Native probe/finalizer | 1 | 12 pass / 13; real FFmpeg synthetic integration failed, no skip |
| Deadline cycle3 canonical/legacy | 0 | 5 pass / 5 |
| Deadline cycle3 original composition | 0 | 1 pass / 1 |
| Deadline cycle3 deadlines/ledger consumers | 0 | 7 pass / 7 |
| Deadline cycle3 HTTP consumers | 0 | 3 pass / 3 |
| Offline evaluation diagnostics cycle1 | 1 | 5 pass / 6 |
| Browser component all-pins request | not launched | active tab-browser intersection; no recertification |
| Browser narrowed pure JS fixtures | 0 | **5 actual tests**, all pass; requested seven count not asserted |
| Profile observability | 0 | **2 actual tests**, all pass; Vitest summary and collected/task-update/finished markers |

Finalizer integration used existing absolute ffmpeg.exe and ffprobe.exe found through installed PATH, hashed in native-binary-hashes.json. Failure: rawvideo decoder `Invalid time base: -1`, native-media-probe.ts command during actual synthetic VP8+PCM finalization. No fallback or source edits.

Evaluation diagnostics failure: test `diagnostics provider truncation and malformed output stay distinct from graph authorization` expected `source-or-graph-refusal`, actual `abstention`, at vectorless-production-eval.test.mjs:183. Offline fixture transport only; no provider calls.

Profile receipt's generic Node count parser is empty because Vitest uses a different summary. Its raw profile-observability.log explicitly reports `Test Files 1 passed (1)` and `Tests 2 passed (2)`, exit0; no rerun was needed to establish counts.

Original finite queue measured50.875 script seconds. Narrow browser follow-up is recorded separately in browser-pure-summary.json. Verified existing JobObject Tree supervision records PIDs, exit codes, durations and completed tree closure. Source pins plus conservative relative source-import closure were hashed before/after; dependency lock and synchronous bootstrap fingerprints retained. This closure is not a complete package-alias import audit. All executed job pins unchanged, writer intersections empty, shared types022057 unchanged. Deadline historical rows restored byte-identically on every job.

Root's current native-current-writers.json authority supersedes original primitive leases. Broad browser component request was correctly refused while tab-browser remained active; only the six frozen native JS source/test files and their pure relative closure were admitted for follow-up. Browser HTTP/legacy regression selection awaits freeze and an exact request. No package-wide compilation, live browser, external service, DB, paid call, real platform qualification, or independent checker dispatch occurred. Full parent/typecheck/contracts/integration gates remain open; runtime total tokens unknown.
