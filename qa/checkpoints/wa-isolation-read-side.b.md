# Checkpoint B: wa-isolation-read-side (cycle 0)
Evidence identity: product head bfc5350f (bound HEAD fc4060c2, product diff 0 lines). Scratch tree = git archive bfc5350f + junctioned node_modules
(session scratchpad w7chk-B-tree; unlink junctions with cmd rmdir before any recursive delete).
Commands: node --test --import tsx on isolation-read-side.test.ts + isolation-write-side.test.ts (26/26); router.test, review-source.test, routes/whatsapp.test,
route-tenant.test, message-vertical.test (33/33); probes w7chk-probe1/2/3 (cross-tenant, path variants, replay approve, stamps, audit, ISS-API-003 corpus, marker/repair).
Falsifications F1-F6 via w7chk-B-mut.sh, each restored and HEAD-fidelity verified. No background PIDs started. No production Mongo, no .env read.
Result: FAIL on C6 (P1 marker side effect), P2, P3 proposed. C1-C5 PASS.

# Checkpoint B: wa-isolation-read-side (cycle 1, repair re-check)
Evidence identity: code head 21dfc204 (bound HEAD 7ab17ee6, manifest-only delta). Scratch = git archive 21dfc204 plus junctioned node_modules (session scratchpad w7chk-B1-tree).
Commands: node --test --import tsx isolation-read-side + isolation-write-side (37/37); wider affected set of 13 files (124 tests, 123 pass, 1 skipped replica-set); tsc --noEmit apps/api exit 0;
cycle-0 probes w7chk-probe1/2/3 verbatim (6/6); new probes w7chk-b1-read (B1CHK-1/2/3) and w7chk-b1-write (B1CHK-W1..W4), see qa/evidence/wa-isolation-read-side-B/.
Falsifications F1-F7 via w7chk-B1-mut.sh (per-mutation backup and trap, timeout), all restored, git hash-object equals rev-parse 21dfc204:file. No background PIDs started. No production Mongo, no .env read.
Result: PASS on C1-C6; P1 low (repair loop aborts on a non-skippable failure; no production caller of repairPendingInvalidations).
