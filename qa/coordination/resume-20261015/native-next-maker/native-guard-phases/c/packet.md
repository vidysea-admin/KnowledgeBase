# Native guard phase helper — C maker fragment

managed-review/1; unit native-guard-phases, cycle 0. Root
C:/Users/product/Desktop/KnowledgeBase; observed HEAD37e51f95c367594bddb422c39c11415674ecf001.
Candidate SHA unassigned. Only C source is NEW packages/meeting-bot/src/capture/native/
testsupport/native-guard-phase.ts; absence proof preimages.txt, full SHA/total LOC packet.json.
B alone owns existing native-archive-recovery.test.ts and both original nodes/targeted guards.
No producer, schema, contract, enforcement, existing support or watched-unit source edits.

Frozen API createNativeGuardPhaseTrace(testId:'tamper'|'fair') returns callable
mark(stage,event:'start'|'complete',ordinal?:number), readonly fixed .status:
disabled/active/refused/failed/limited. Stage catalog has16 fixed values listed in packet.json.
Ordinal is integer0..10. Serialized JSON has EXACT stageId and elapsedMs fields only:
node1(tamper)/node2(fair) prefix, whitelisted stage/event/ordinal; monotonic elapsed integer
capped0..75000. It never writes a path, source content, error object/name/code/message,
credential or transcript. Arbitrary stage/ordinal/testId inputs cannot enter the JSON.

Broker alone admits/validates LKB_NATIVE_TEST_PRIVATE_DIR as its NEW protected disposable
UUID. BOTH explicit root and LKB_NATIVE_GUARD_PHASE_LOG are required before any filesystem
access; missing either is disabled/passive. Fixed sink is native-guard-phases.jsonl inside
that root; the supplied log path must resolve exactly there. Helper checks the directory and
refuses existing/symlink sink before exclusive wx0600 open. ONE module-owned fd is lazily
shared by both original nodes in the same child; OS process exit closes it. Every record
uses writeSync+fsyncSync, with256record/64KiB total bounds and physical identity/size checks.

Missing environment creates no file/output/handler/timer. All observer failures are
nonthrowing and cannot mask original assertions. Fixed .status is available to guards;
missing/refused/failed/limited trace is broker DIAGNOSTIC_INCOMPLETE, never semantic PASS.
resetNativeGuardPhaseTraceForTest closes/resets nonthrowingly for independent NEW-tempdir
guard probes only. B must restore environment in finally; exact original-two-node replay
uses a fresh process and never invokes reset. No IO callback/arbitrary-root issuer exists.

Visibility: synchronous durable sidecar writes bypass Node isolated reporter buffering.
Broker can inspect while child runs and must snapshot/hash/parse after JobObject closes
but BEFORE finally-owned UUID cleanup. Stdout/stderr diagnostics are not a visibility
guarantee. Empty/partial trace cannot prove that no mutations ran; Node assertions/own exit
and attributable original-case counts remain mandatory. Original exit124/70.594s emptylog
history is retained and unexplained; no timeout increase/retry authority is implied.

Proposed guard floor: absent env noeffects; optional path mismatch beforeopen; existing/
symlink sink refusal; exact-field successful records and sink removal yielding failed
status without throw. B owns authored cases. Broker next: bot types + helper guards first,
then only original two guard nodes <=75s external bound under new root admission/pins.
Preserve all7binding/11mutation/fair/quota assertions and existing producer calls.
No closed watched-unit reactivation or28test replay. No checker dispatched or PASS claimed.

No tests/build/DB/provider/decoder/ACL/browser/broker execution by C. token_metric
actual_total; actual maker tokens/active seconds/cost remain null/unknown. Packet validation,
broker evidence and independent checking remain required at their governing gates.

Root's explicit-trace contract correction preserved original cc5fc4fa... raw bytes in
backups/helper-before-explicit-trace.ts and old packet-before-explicit-trace.json. Only
the environment guard moved to require BOTH supplied values; B adds root-present/log-absent
to its existing disabled guard node. The previous helper revision was not executed by C.
