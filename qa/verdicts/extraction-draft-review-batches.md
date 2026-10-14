# Extraction AI draft review batches

VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: none

Scope: eight additive source-bound AI draft batches only. Contract: qa/contracts/extraction-draft-review-batches.md clauses 1–5, D-163, and preservation of the existing parallel-extraction-adjudication contract. Full U2.2 semantic gold, individual human approvals, threshold acceptance, complete-corpus quality and production/backfill gates remain open. This verdict approves review preparation, not any draft as humanGold.

## Independent findings

All 72 original claim IDs/order/records, 80 literal citation occurrences, 14 unresolved identities and seven replacement proposals are preserved. Eight batches contain 10/10/10/10/10/10/10/2 entries. All 58 current artifact byte lengths, exact SHA-256 and CRLF-to-LF hashes verify; canonical claim/session bindings and all 74 current passage matches verify. Complete historical/current citation contexts match the unchanged original packet. Historical Git provenance is inherited from the prior packet PASS, not newly re-adjudicated here; new inventory folders outside its original corpus do not extend this bounded scope.

Direct semantic review compared all 72 draft rationales and all seven replacement rationales with the complete included current source records. No disagreement found. Literal support totals: supported 2, partial 2, unsupported 54, unavailable 14. SCADpro's institutional-role component and the Wai Wah Tsang full-name attribution remain correctly partial. The UCAS letter-of-reference passage does not establish a personal-statement format transition. These judgments concern the cited records, never external factual truth or absence from full transcripts.

All 72 human reviews remain unreviewed; approvers, approval dates, decisions and approval source hashes null; humanGold false; thresholds null. Five independently constructed in-memory human-gold/threshold/approval promotion variants are refused. Builder readback is byte-idempotent across all candidate files; an isolated checker scratch probe accepts identical LF/CRLF content without rewriting it and refuses changed human-review content, preserving original bytes. Scratch removed in finally. No product/source mutation test occurred.

## Checked final bindings

Maker manifest SHA-256 at check: 2377b62c6a5a7e7bcb7f96da5403b7c4102fb85a3bf8266d870d6ba6740fcbb6.
Maker packet SHA-256: e20efafb1178ba54aa030385ef9dda06f366168e12e3c5b08cab21abab03d82c.
All 23 final candidate file pins in that packet independently verified before and after commands; the packet is the exact complete hash list.
Index SHA-256: d2cb375e85d1048fde8f9a1d8160af64085a6f4ae2bdf0e8ee7ccdb21bc110a3.
Original extraction packet remains 1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175.
Original golden human-review packet remains 44432ab2717ba807a4ed066d346280156f4a671d172524f1ab009b116811677e.

## Reproduced commands and results

Working directory: C:/Users/product/Desktop/KnowledgeBase. All subprocess commands bounded by Python subprocess timeout=15 seconds.

- `python qa/evidence/extraction-draft-review-batches-independent.py` — started 2026-10-14T08:43:29.380194Z, duration 0.205343s, exit 0. Checker-authored consumer; PASS: claims72, literalOccurrences80, unresolved14, replacements7, batches8, artifactByteChecks58, currentPassageMatches74, humanGold0, promotionProbesRefused5. Index hash matches above.
- `python data/eval/extraction-draft-review/verify.py` — started 08:43:29.586272Z, duration 0.162373s, exit 0. Maker's downstream consumer independently rerun: PASS 72/80/14/7,58 artifact checks,0 humanGold; draft counts2/2/54/14.
- `python contracts/verify_contracts.py` — started 08:43:29.748569Z, duration 0.120765s, exit 0: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.
- `python data/eval/extraction-draft-review/build.py` — started 08:44:05.874223Z, duration 0.157026s, exit 0. Output: claims72,batches8,counts2/2/54/14,humanGoldCount0,sourcePacketSha256 unchanged. Independent before/after all-folder-file hash comparison: identical.
- Python stdin importlib scratch probe calling `build.write_preserving` against explicitly scoped `qa/evidence/extraction-draft-review-preservation.tmp` — started 08:44:06.043618Z, duration 0.013612s, exit 0: 2/2 identical CRLF acceptance and changed-human-review overwrite refusal; original bytes preserved; scratch removed.

The independent consumer code is persisted at qa/evidence/extraction-draft-review-batches-independent.py. Direct source review covers all new builder/verifier logic and all draft judgments. Prior maker claims were not used as substitutes for these checks. Existing original packet's historical provenance is attributed to qa/verdicts/parallel-extraction-adjudication.md; its bytes and all preserved records are unchanged. No issue fixes/reproduction corpus claimed.

## Timing and limits

Dispatch/launch timestamp was not captured; earliest measured checker checkpoint is 2026-10-14T08:39:02.952741Z. Initial skill/scope reading began before that checkpoint; precise start unknown. Semantic/source review and independent probe drafting occupied the pre-ready interval. Ready submission received before measured scope/packet read completion at 08:43:02.433203Z. Approval requested/resolved: not applicable. Required commands started/finished at the measured times above; draft/persist start follows 08:44:06Z. Exact final persistence timestamp/elapsed checkpoint are appended after readback; true launch-to-verdict time cannot be reconstructed. This exceeds the skill's 120–180-second efficiency target because candidate preparation was still running and complete 72-item source review was required. No unmeasured interval is attributed to approval or drafting.

EXPLANATION: Issue-free bounded preparation check. No providers, DB, browser, full suite, source edits, gold promotion, governance/enforcement edits, commit or push. Initial console source read failed with cp1252 Unicode encoding after claim51; UTF-8 reads completed all missing ranges before PASS. The scoped new contract does not alter any original/frozen acceptance rule.

Final readback/hash checkpoint: 2026-10-14T08:45:45.924450+00:00; 402.972s since earliest measured checkpoint (not true launch time). Final candidate hashes 23/23 unchanged. Checker code SHA-256: d4dd5f5c140e727d88d40ea7c097029d6c9040f0ac4565db6ef314ccaab38c4c.
