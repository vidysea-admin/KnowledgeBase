# Watched server join — finite CLI shutdown repair, cycle 1

managed-review/1 maker fragment. Root C:/Users/product/Desktop/KnowledgeBase; base HEAD
d50a25c200dcbcf574ecade0aa205f5fcb45c5f8; candidate SHA unassigned. Root explicitly
authorized the 30-second CLI process watchdog and two existing leased paths only.
Prior server af7a4657... and join-test 038f8c21... candidates were NEVER_RUN and are
preserved raw in backups/. packet.json records full preimage/current/dependency hashes.
All prior broker receipts/manifest evidence remain unchanged; no execution is inferred.

Root concern was valid: prior CLI interception only awaited library shutdown and set
exitCode on failure, leaving Mongo monitors or a hung awaited tick able to hold the
process alive. A successful singleton connect is not ownership proof; shared Mongo
must not be disconnected by library/launcher inference.

New exported installNativeCliShutdown is an explicit, injected coordinator, installed
only by direct CLI entry. Only that direct-entry branch supplies process.exit. First
SIGINT/SIGTERM calls existing stopNativeServer and arms a referenced fixed 30000ms timer.
Drained success finishes0; synchronous/asynchronous failure or deadline finishes1 with
fixed content-free diagnostic. A second signal finishes130(SIGINT) or143(SIGTERM).
Completion happens once and removes both handlers/cancels its timer. Late drain results
cannot finish again. Imported modules/library startup install no CLI handlers/watchdog,
and library stop behavior remains abort/await -> HTTP close -> explicit onStop(defaultnoop).
No shared DB close or process.exit exists in library functions.

The deadline guarantees bounded CLI completion, not graceful completion of hung work.
Deadline/second signal may terminate an initialized tick; existing durable/idempotent
source jobs remain the recovery mechanism. No test claims cancellation of fake key
verification. Actual supervisor/host lifecycle tests from the unrun initial join remain.

Four additional fake-signal/fake-timer tests cover passive-until-signal and successful
drain-before-finish; hung tick deadline plus late result; sync/async failure redaction;
both second-signal codes plus finish-once and listener/timer cleanup. Existing disabled
test additionally verifies library startup leaves actual process signal counts unchanged.
Six existing server tests + ten new join/CLI tests = sixteen proposed launcher tests.

Required sole-broker replay: scripts/native-capture/server.test.ts and
scripts/native-capture/server-watched.test.ts, affected explicit root types, full graph
and scoped LOC/directory checks. Upstream watched host7/durable-job5 can reuse exact
unchanged source/environment receipts only if broker policy permits. No native decoder,
genuine archive or EXIT replay is justified for this launcher-only join. Root/central
will overlay these two final pins into the intended72path candidate before admission.

Only server.ts and server-watched.test.ts changed. No tests/build/DB/ACL/provider/browser/
decoder execution by maker; no PASS/operational readiness/efficiency claim. token_metric
actual_total; actual tokens/active seconds/cost remain null/unknown. Independent checker
and real source/worker/DB/platform/deployment gates remain outstanding.
