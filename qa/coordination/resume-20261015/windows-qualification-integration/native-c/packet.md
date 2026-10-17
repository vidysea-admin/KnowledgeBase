# Maker C Windows qualification test fragment

Policy: managed-review/1. Fix cycle: 1. Status: authored-awaiting-broker. Base: dbb719a5e0895f874aa4fb7cc9fcc23b460ec1c9. Exact source/preimage pins and counts: [packet.json](packet.json). Root: C:/Users/product/Desktop/KnowledgeBase.

Only the three leased existing tests changed. Added seven nodes; current files contain 21 nodes (ledger 5, spool 9, measurement 7). Ledger tests retain tagged PCM separately, source sample zero, immutable nested facts and silent flags=2 acceptance; refuse tag mismatches, reordered packets, device gaps/overlap, non-increasing QPC, overlapping brackets, mixed clock domains and changed owner/generation identity. Spool tests use actual receiver-computed PCM SHA and issued spool readback, including descriptive hash mismatch refusal. Numeric tests exercise missing corpus, five bounds independently undefined/null/NaN, legacy win32 applicability and absent AudioContext coverage.

The intermediate authored ledger preimage before final strict alignment is retained in backups/authored-before-strict-alignment.test.ts (never executed). Original raw preimages are retained independently. No production, contract, shared schema or enforcement edits by this maker.

Required broker checks: explicit affected bot types, these three files/21 nodes under a finite command bound with full receipts, and parent scoped graph/LOC checks. No execution performed. Independent checker remains required; this fragment does not claim PASS or readiness of the combined production unit.

Authentic finalized WASAPI qualification refusal is unproved: the leased measurement test has no authentic finalized tagged media fixture. No fabricated capability or AudioContext cast was added. Actual Windows device/calibration/private qualification and activation remain open. All maker actual usage metrics are unknown/null with actual_total semantics.