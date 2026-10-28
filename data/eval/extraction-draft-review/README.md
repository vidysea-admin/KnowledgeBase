# Extraction draft review

These eight batches contain all 72 original claims in their original order: ten items per batch and two in the last batch. They preserve all 80 literal citation occurrences, including all 14 unresolved identities, and seven existing replacement proposals.

Start with `batch-01.md`; open its paired JSON to inspect complete unchanged current/historical passages, speaker/time fields, claim records and source hashes. Review each item individually by its claim ID. Later batches use the same format.

Every proposed ruling is an **AI draft** under D-163. `supported` means the displayed cited passage establishes the claim; `partially_supported` means a material component remains unestablished; `unsupported` means these particular citations do not establish it; `unavailable` means no current cited turn exists. None is an external fact check or a claim that the full transcript lacks support. Replacement support is rated separately and never repairs the original citation automatically.

Umesh must approve each source-bound item individually before any later unit can create a gold label. All human review fields remain unreviewed/null, every `humanGold` is false, and thresholds remain null. No approval import or gold promotion exists in this preparation unit. Factual truth, omissions and entity precision remain unknown. Full U2.2 remains gated.

`index.json` pins the original packet, reviewer drafts and batches. To rebuild: `python data/eval/extraction-draft-review/build.py`. To check corpus completeness, exact current source hashes, complete passage preservation and non-promotion: `python data/eval/extraction-draft-review/verify.py`. Changed source bytes make verification fail; do not approve stale drafts.

Existing packets, source claims/transcripts, runtime, database, provider calls and accepted gold are unchanged. Historical source records remain the original packet's snapshots, not newly reverified provenance.
