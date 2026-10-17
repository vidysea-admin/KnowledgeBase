# Windows qualification integration — bounded producer/ledger stage

Status: in_progress; source candidate is a dirty byte-pinned snapshot, not a new Git commit. No checker verdict or READY claim. Root/base: C:/Users/product/Desktop/KnowledgeBase at dbb719a5e0895f874aa4fb7cc9fcc23b460ec1c9. Tier 3 authorized roadmap; security/data-write boundaries remain uncapped. Policy: managed-review/1; final executable review admission is pending actual broker receipts and complete packet validation.

## Implemented boundary

The ordinary recording path now carries the detected meeting platform (`meet`) rather than the host OS (`win32`). Legacy OS-labelled captures remain unqualified. WindowsPacketClock is a distinct WASAPI/QPC observation type, never an AudioContext pair. The existing audio ledger wire retains an optional descriptive tag, validates exact retained-byte SHA/frame/sequence/sample-zero, device continuity, QPC/bracket ordering, and rejects mixed audio domains. AudioContext qualification refuses tagged Windows samples before its verifier.

The separately pinned five-file producer owns the actual helper child pipe and challenge; only completed sessions mint its private capability. Its closed-spool join checks real receiver capability, physical readback twice, current full identity, exact PCM hash/rate/count/zero and every retained packet tag. Parsed JSON, numeric fits and callback success cannot mint qualification. Actual helper source is uncompiled/unexecuted; actual calibration remains null.

## Exact source/evidence references

- central-source-pins.json: four central production paths, maximum300 lines.
- before-pins.json and backups/: original eleven raw preimages; bridge-before-pins.json adds granted but UNCHANGED bridge preimages.
- native-b/packet.md and pins: actual runRecord Windows-OS/canonical-platform fixture and legacy refusal, runtime test165 lines; record-commands.test.ts remains unchanged at inherited387 lines.
- native-c/packet.json and packet.md: three frozen tagged ledger/spool/numeric test files, seven added and21 total nodes.
- ../windows-producer-maker/source-pins.json and packet.md: five new producer/helper files, adapter195/helper143 lines; native directory26 immediate files.

Applicable unchanged ground truth: qa/contracts/t042-trusted-registry-integration.md R1–R2 trusted/current ownership, R3–R4 sample-zero/independent uncertainty, R5/R7 exact bytes/transform, R6 physical boundary, R11 unavailable/default-off; qa/contracts/t048-sealed-private-capture-20261014.md §§2–7. These are partial implementations, not satisfaction of every clause.

## Sole-broker minimum request (not executed)

1. Exact candidate package typecheck: pnpm --filter @lkb/meeting-bot typecheck. Then affected full dependency graph and scoped structure/LOC; no policy relaxation.
2. One bounded node command (Node/Job <=75s, concurrency1) for native/windows-capture-clock.test.ts, native/native-clock-ledger.test.ts, native/native-spool.test.ts, tiles/native-measurement.test.ts. All direct original cases retained. Spool fixtures require the broker's safe writable parent/current ACL policy; no native helper/browser activation.
3. Cheap runtime positive selection only: test-name-pattern `^(legacy invocation|native selection|native quotas|playback joins|missing, suspended|legacy OS platform)` against native/native-capture-runtime.test.ts; record actual selected counts. The two genuine finalizer fixtures are separately gated and not silently called passed/skipped evidence.
4. If a verified existing Windows C++ toolchain is admitted, build only the pinned helper via its CMakeLists in a NEW broker-owned build directory. No installation/helper execution/host activation. Static source review is not a successful build.

Immediate consumers: existing spool physical/replay reader, AudioContext qualifier, actual runRecord config; new producer join. No public API/schema/contracts/enforcement changes. Ordinary CLI Windows mode, dedicated browser PID/creation/executable readback bridge, actual helper-to-receiver lifecycle, archived raw packet conversion reproof, independent current-host/sampler latency calibration and live host proof remain OPEN. The current default capture mode is unchanged. The authentic finalized Windows-tagged qualifier refusal fixture is not yet proven; forged capabilities are not a substitute.

Maker usage: active_seconds:null, total_tokens:null, monetary_cost:null. Historical allocations/HOLD/PASS scopes remain separate and unchanged; ratio UNVERIFIED. No test/build/provider/DB/browser/audio/helper execution, checker dispatch, staging or commit by this maker.