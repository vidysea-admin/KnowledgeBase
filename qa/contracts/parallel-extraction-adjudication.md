# Parallel extraction adjudication packet — independent acceptance

Scope: offline preparation artifact only. Full U2.2 remains gated. This contract does not approve semantic labels, factual truth, entity gold, binding thresholds, source repairs, production writes, or backfill.

1. Re-enumerate extraction-corpus cases and original persisted claims independently. Packet contains each unchanged claim exactly once, preserving all original evidence occurrences and unresolved reference identities.
2. Independently verify exact current artifact bytes and SHA-256, CRLF-to-LF-only normalized hashes, canonical JSON claim/source bindings, and historical Git blob bytes at the recorded migration revision. Historical/current citation contexts contain complete literal matching records with text hashes; unavailable contexts are explicit.
3. Independently reconstruct inventory and absent artifacts. Unavailable cases remain acquisition failures, not zero-claim accepted cases.
4. Independently match all seven reviewed replacement proposals to extraction-reconciliation-reviewed.json, retaining original evidence and complete proposed evidence context. Preserve 65 unreviewed replacement identities without promoting proposals into gold.
5. Every claim's human adjudication remains unreviewed/unknown, humanGold false, bindingThresholds null. Global semantic gold remains unaccepted with no labels, fact/entity gold, or binding thresholds.
6. Recompute aggregate coverage, invalid-time session identities, unresolved references, and all baseline raw-byte versus normalized-LF comparisons. Evidence must record actual command/output and artifact hash after manifest reaches ready-for-check, Fix cycle 0.
