# Unit: deriveddrafts (lane w17-deriveddrafts)
Status: checked-PASS
Fix cycle: 0
Base SHA: 9e55b642
Candidate SHA: see lane HEAD (single commit)

## Changed paths
- scripts/eval/derived-drafts/derived-drafts.mjs (new): multi-model consensus drafts
- scripts/eval/derived-drafts/derived-drafts.test.mjs (new): 9 tests
- data/eval/derived-drafts/t022-derived-drafts-2026-10-17.json, u22-derived-drafts-2026-10-17.json (live output, sidecars)
- qa/manifests/deriveddrafts.md

## Authority
D-163 (AI drafts, never humanGold), D-164 (Ollama glm-5.3-flash then deepseek-v4.1-flash; Gemini last, tie-break only), D-108 harness posture.

## Design
- Sidecar only. The review packets (calibration-human-review.json, extraction-draft-review/*) are byte-pinned by sha256 and packetSha256, so aiDraft is NOT written into them; sidecar items carry the packet item id + inputSha256 / claimRecordSha256 and an `aiDraft` object in the same shape the U2.2 UI reads (literalCitationSupport, literalRationale). Merging into the UI is a later, separately authorised step.
- Every draft: label "derived, not humanGold", humanGold:false, humanReview null/unreviewed. assertNoHumanGold gates every write; output is wx (no overwrite) and confined to data/eval/derived-drafts/.
- Flags: models-disagree, look-closely, insufficient-models, no-majority, invalid-or-failed-vote.
- U2.2 claims whose cited turns are all unavailable get a deterministic rule vote (no model call).

## Checks for the checker
- DD_DATA_ROOT=<byte-exact tree> node --test scripts/eval/derived-drafts/derived-drafts.test.mjs
- Pinned sources are mixed LF/CRLF; a fresh lane checkout fails extraction-review loadBundle (batch-drift) independent of this unit. Tests therefore read the main tree via DD_DATA_ROOT.
- Confirm sidecars contain no humanGold true, no approvedBy/approvedAt/decision non-null, no keys.

## Evidence (real)
- tests: 9 pass / 0 fail
- Live T-022: 30 items, 62 calls (cap 90), agree 28, disagree 2 (Gemini tie-break on disagree only).
- Live U2.2: 72 items, 117 calls (cap 216), all 72 agree; draft labels unsupported 54, unavailable 14, partially_supported 2, supported 2; 1 item flagged.
