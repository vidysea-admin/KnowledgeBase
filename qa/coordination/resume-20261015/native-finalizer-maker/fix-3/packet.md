# Source cycle 3 — maker selftest, CPU slot returned

managed-review/1; no independent PASS or native acceptance. Root temporarily authorized this maker the sole CPU verification slot: at most two code/test iterations and one downstream privacy check. Existing verified JobObject supervisor hash `d99983ba54d43ecf22bae2e2bad0dad7a57156d9bb16c36cc38d05d3cce3fc6a` supervised each bounded command, with exact argv/env/runtime/bootstrap/source pins, own exit, full raw log and tree closure in adjacent JSON receipts. All source pins unchanged across commands. Actual complete maker active time/tokens/cost remain unknown; measured command durations are recorded separately. Historical failures remain intact.

Iteration 1: original15, 14 pass/1 real integration fail. Diagnostic confirmed actual first packet PTS67 skip312/discard0, last packet PTS467 skip0/discard648 (21 packets total). Zeros on the opposite edge are ordinary values, not conflicting trim declarations. The wrapper's terminal print failed with UnicodeEncodeError after the test receipt/log were safely persisted; the Node own exit remains 1 in iteration1.json.

Fix: retain every Skip Samples packet's ordinal, PTS, duration, skip/discard/reasons in deeply frozen `NativeDecodedProbe.packetTrims`. Aggregate nonzero skip is accepted only on first packet, nonzero discard only on last. Duplicate side data, interior trim, negative/malformed values still refuse. Missing compressed metadata remains unknown; Opus is playback-only and never becomes canonical PCM origin. Canonical WAV exact decoded SHA/count/zero proof remains strict.

Quantization proof now also persists exact `quantizationBoundSeconds` numerator/denominator. Regression tests verify the exact fraction 49000/96000000 and its defined numeric display 24500/48, avoiding floating associative-operation equality. No admission tolerance or proof was relaxed.

Iteration 2: 16/16 pass, zero skips/failures, including actual receiver->real FFmpeg9 WebM mux->independent readback and exact selected WAV identity. Node own exit0; JobObject closed; 8.344 command seconds. One new trim-topology regression supplements original15, covering normal opposite-edge zeros and interior/duplicate/malformed refusals.

Dependent privacy8 command (three existing test files, read-only source): timeout after35 seconds, own exit124, tree closed, pins unchanged. Six test cases emitted green before the real native privacy fixture stalled; no completed summary and no downstream success claim. See privacy8.log/json. This is a separate privacy-owner investigation; no blind retry, timeout increase or privacy edits were made. Finalizer16 green is maker evidence only; checker, scoped TS, combined candidate and full measured-platform gates remain open.

Exact frozen source bytes and hashes: source-pins/ and checkpoint.json. Only new probe source/test changed in this cycle; existing legacy/privacy files remain untouched.
