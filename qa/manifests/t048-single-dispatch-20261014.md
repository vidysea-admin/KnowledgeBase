# Manifest — t048-single-dispatch-20261014

**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Tier:** 3 — unblocked roadmap task T-048, operational one-attempt dispatch implementation.
**Authority:** D-170 implementation authorization; D-162 default-OFF restriction preserved.
**Parent task:** T-048 remains in_progress. No actual provider comparison or default promotion is claimed.
**Checked:** qa/verdicts/t048-single-dispatch-20261014.md, Cycle checked0, verdict SHA256
6EB699DFBCF85CFF1087F7CEF3DC5FD5B36E5096A4482F518AD6F4C283F7D61E.
Independent broker2/2 offline protocol/actual QA consumer probes passed0.662437s;
receipt qa/evidence/goal-t051checker-broker-t048-independent.json. All checked owned files
were rehashed unchanged before this close-out. PASS remains confined to recorded source pins;
the subsequent trusted privacy composition is a separate candidate and does not inherit it.

## Scoped behavior

The opt-in long recording driver makes one initial whole-file transcription request and immediately
falls back on failed, malformed, empty, invalid or incomplete output. Initial partial results never
enter the fallback merge. Chunk retries remain bounded to three attempts and three tail recursion
levels. Provider errors in the opt-in retry/fallback path use fixed, redacted messages. The driver
records actual strategy/model/duration, audio/committed-turn hashes and protocol/request attempts.
It integrates T-044's independently owned generation helper: accepted QA attempts correspond to
the selected whole single or best-prefix/recursive-tail/chunk turns, using unique attempt IDs.
Sidecars publish atomically. QA/single-enabled publication first invalidates validation.json;
same canonical turns plus a changed QA report cannot reuse an older clean validation verdict.
All requests read/extract an owned immutable audio snapshot; snapshot hash/duration bind the
provider input, and a changed source hash refuses publication before any artifacts change.

## Owned paths and bases

- scripts/lib/transcription/recording-dispatch.mjs — new, no base existed.
- scripts/lib/transcription/recording-dispatch.test.mjs — new, no base existed.
- scripts/transcribe-long-session.mjs — base SHA256 E5227DE4D6B4A64334BF25D0593FFE42C4E039835F12F4BE68DEFBB1604985D8.
- scripts/lib/transcription-wiring.test.mjs — base SHA256 B2C6CD9158A60F8650D261F4F508545B17B4B185B9AF5777F7BD34A9B1720067.
- docs/t048-transcription-dispatch.md — new, no base existed.
- This manifest — new.

T-044 owns scripts/lib/transcription/transcript-qa-generation.mjs and its test, plus the
downstream QA evaluator/validator. These are dependencies and jointly verified consumer hooks;
their sources are not authored by this maker. No contracts, trackers, decisions, shared API/web
composition, package/dependency files, schema or generated sources are changed here.

## Contract and impact map

qa/contracts/goal-t048.md C2–C5: executable bounds, exactly one initial generateContent, bounded
fallback, no initial/fallback mixing, failures preserve prior files before publication, bound
generation evidence and error redaction. C1/C6/C7 remain unachieved parent gates: recorded default
promotion, paired real TOC comparison, actual isolated downstream index/citation proof.

dispatchRecordingTranscription -> singleAttempt (direct transcribeSpanOnce) / chunkAttempt
(existing transcribeSpan retry/tail recovery) -> mergeChunkedTurns -> validateTurns ->
writeTranscriptGeneration -> actual committed bytes -> buildTranscriptQaGeneration.
The immediate consumer evaluateTranscriptQaGeneration validates the produced artifact against
the exact bytes and real merged turns; tests also replace same-count text bytes to prove refusal.

Security flags: local data writes YES (turns/provenance/QA/path/validation), credential handling
YES (injected upload transport privately uses GEMINI_API_KEY); no new auth, tenancy, DB reads or
DB writes. tenantId/sessionId remain source-derived through transcriptTenant; immutable turn
identity and existing derived-knowledge invalidation stay on the sanctioned writer path.

## Evidence

Central broker execution: `C:\Program Files\nodejs\node.exe --test --test-concurrency=1 scripts/lib/transcription/recording-dispatch.test.mjs scripts/lib/transcription-wiring.test.mjs`.
Actual receipt qa/evidence/goal-t051checker-broker-t048.json: exit0,27 tests/27 pass/0 fail,
0 skipped/cancelled; TAP6083.083ms, wall6186.5432ms. UTC2026-10-14T20:02:14.348Z to
20:02:20.540Z. Broker timeout120000ms. All15 source/dependency hashes identical before/after
and rechecked by maker after receipt. stdout/stderr paths are recorded in that immutable receipt.
The CLI fixtures intercept dotenv, provider/upload, ffmpeg and ffprobe; fixture credentials only.
Child Node runs have 30-second bounds. No real audio or database is read.
Passed cases include actual local downstream evaluateTranscriptQaGeneration consumption,
changed same-count bytes refusal, selected recursive prefix/tail IDs, source mutation refusal,
identical-turn suspicious-QA invalidation and atomic QA publication failure preservation.
No real provider, network, ffmpeg, browser or DB operation occurred; no duplicate maker run.

Frozen-contract reference receipt (separate attributed earlier check, not this27-case run):
qa/evidence/t057-ops-health-key-boundary/contracts-receipt.json records `python contracts/verify_contracts.py`,
exit0 at2026-10-14T09:02:33Z,0.1467932s; matching output says no frozen contracts yet,
PASS by vacuity. Current contracts/contracts.json still has stages:{}; no frozen-stage
acceptance is inferred from that output. Fresh global verifier remains centrally schedulable.

Static source budgets: driver 298 nonblank /300; focused test376 /400; scripts/lib direct files30 /30.
No matching T-048/single-call ledger reproductions were found in the union `qa/issues*.jsonl`.
No source mutation run. Original files are preserved via listed base hashes; checker verifies
final hashes after tests. Independent matching-cycle verdict is required before close-out.

## Frozen source snapshot (maker execution verified; independent acceptance pending)

| Owned path | SHA256 |
|---|---|
| scripts/transcribe-long-session.mjs | 8B5F8F7F02D27FB2AA1D3531A6A3D2BD810AB65F43307D1BA26937D46CB11913 |
| scripts/lib/transcription-wiring.test.mjs | A3276884893E0B579F97BE678EEAC0ECFF1FAA8C56BC0540D3E192F614FE8B64 |
| scripts/lib/transcription/recording-dispatch.mjs | F998ACA09E973AC94576F62BC8B1441911727586E27370CA9069C25F7CD9FC8C |
| scripts/lib/transcription/recording-dispatch.test.mjs | BC9F3FB6F526BF33F0DA5381E752C0C05242AA18DA86B404B3F13A363740703A |
| docs/t048-transcription-dispatch.md | D5646747A4A8E0CCFA52FE866E8F4460B28EB41C076860DD69BD0DE045AA1947 |

Integration prerequisites reported to central owner: watcher must independently validate QA
before seed/index; short QA-enabled recordings must reach the QA-capable long driver; intentional
private capture intervals require the validated durable consent receipt and canonical locator
before any silence-aware coverage exception. Arbitrary source.privateWindows are not trusted.
