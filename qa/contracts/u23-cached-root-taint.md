# Cached-root provenance taint — independent security acceptance

Scope: root-authorized security fix at actual indexing/tree-read boundaries.
Historical goal-u23 helper cycle-1 PASS remains a separate unchanged candidate.

1. Preserve original affected source bytes/hashes and immutable attack/control
   fixture before product changes. Only an actual original-byte run proving the
   intended unsafe behavior counts as RED; harness/type/import errors do not.
2. If a page is rejected for nonexistent current cited turns or invalid canonical
   provenance, its cached session summary/topics and mixed ancestor summaries must
   not survive incremental indexing or remain readable through the actual production
   tree reader/search seam. Filtering the provider input alone is insufficient.
3. Positive control: an eligible session with a current valid cited page retains
   its legitimate knowledge. No inference, network, production DB or source repair
   is needed for these fixtures; tenant-scoped read predicates remain exercised.
4. Fix acceptance reruns the issue's recorded original case verbatim with the
   standing regression; do not replace its input/oracle with an easier new case.
   Report exact attack/control counts against that issue ID.
5. Root/runtime owns shared production source paths; checker owns this contract,
   independent probes and evidence. Broker execution must bind actual unchanged
   candidate/current cycle and immediate downstream actual-reader consumption.
6. Current required frozen-validator evidence stays explicit. Scoped security PASS
   is not whole-task, semantic gold, provider quality, backfill or rollout acceptance.

Human labels and thresholds are neither authored nor changed by this contract.
