# Checkpoint B: wa-isolation-read-side (cycle 0)
Evidence identity: product head bfc5350f (bound HEAD fc4060c2, product diff 0 lines). Scratch tree = git archive bfc5350f + junctioned node_modules
(session scratchpad w7chk-B-tree; unlink junctions with cmd rmdir before any recursive delete).
Commands: node --test --import tsx on isolation-read-side.test.ts + isolation-write-side.test.ts (26/26); router.test, review-source.test, routes/whatsapp.test,
route-tenant.test, message-vertical.test (33/33); probes w7chk-probe1/2/3 (cross-tenant, path variants, replay approve, stamps, audit, ISS-API-003 corpus, marker/repair).
Falsifications F1-F6 via w7chk-B-mut.sh, each restored and HEAD-fidelity verified. No background PIDs started. No production Mongo, no .env read.
Result: FAIL on C6 (P1 marker side effect), P2, P3 proposed. C1-C5 PASS.
