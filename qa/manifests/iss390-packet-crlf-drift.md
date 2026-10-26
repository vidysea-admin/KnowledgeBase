# iss390-packet-crlf-drift

**Handshake status:** ready-for-check
Status: ready-for-check
**Date:** 2026-10-26
**Fix cycle:** 0 of max 2
**Dual check:** not required (tier L config: .gitattributes line-ending rules plus a test; one checker, no dual)
**Issues addressed:** ISS-390
**Executor:** claude-sonnet-subagent
**Executor rationale:** single config change plus two tests; one builder, no external model.

## What changed
- .gitattributes (appended block, lines after `docs/FEATURES.jsonl merge=union`) — per-file checkout EOL for the byte-pinned inputs of the 72-claim review bundle: `data/eval/extraction-adjudication-packet.json text eol=lf`; `data/eval/extraction-draft-review/batch-01..08.json text eol=crlf`; the 46 `data/toc-migrated/<session>/{claims,turns}.json` named by the batches' sourceBinding artifacts `text eol=crlf`. Cause (measured): the packet pin 1cbc8cb5... is the sha256 of the LF bytes, while the 8 batch pins and the 46 toc-migrated claims/turns pins are sha256 of CRLF bytes (checked per file with LF- and CRLF-normalised hashes), so no single core.autocrlf value reproduces them. The index blobs are all LF; only the working-tree EOL differs, so git sees no content change.
- scripts/eval/extraction-review.test.mjs — two tests appended (plus two import lines): (1) `git check-attr eol` for the packet is `lf`, the on-disk packet has no CR byte, and its sha256 equals index.json sourcePacket.sha256; (2) the pin is not loosened: a CRLF-converted packet in a temp root is still refused with `packet-drift` by `loadBundle`.
- Working tree (not committed content; EOL only): the packet re-materialised LF, the 46 toc-migrated claims/turns re-materialised CRLF so they match the new attributes. `git diff` is empty for all of them.
- unchanged: scripts/eval/extraction-review.mjs (`loadBundle` pin check, line 25, deliberately not touched), every pin, index.json, the batches.
- Option (b) (line-ending-stable hash) rejected: the pins are a mix of LF and CRLF hashes, so normalising would require rewriting pins in index.json and the batches, which are themselves pinned.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (config: .gitattributes; one checker, no dual)
Round: 2 files, 1 criterion, est 20 min — attribute block plus two tests and this manifest
Base sha: 0573214ef5c655ca44a667799fddc8f346bfd7f0
Base / checked state: code commit c89d7268, base 0573214e, branch docs/devops-golive-2026-10-26
Affected tests / full-suite trigger: scripts/eval/extraction-review.test.mjs, scripts/eval/extraction-stage-receipts.test.mjs, scripts/eval/extraction-review-resume.test.mjs, scripts/eval/extraction-authorized-import.test.mjs (the four loaders of the pinned bundle). Builder ran no full suite.
Tests[C1]: scripts/eval/extraction-review.test.mjs::ISS-390: the pinned packet is checked out as LF so its bytes match the pin on every platform; scripts/eval/extraction-review.test.mjs::ISS-390: the pin is not loosened; a CRLF-converted packet is still refused as packet-drift — the first asserts the fix (LF attribute, no CR byte, sha equals the pin), the second proves the pin was not loosened
Pre-check[C1]: c89d726 node --test --import tsx --test-name-pattern=ISS-390 scripts/eval/extraction-review.test.mjs -> pass 2, 0 failed t=1 blobs=scripts/eval/extraction-review.test.mjs:c78aeb0
Falsification[C1]: copy red-before (old .gitattributes, autocrlf=true: packet RED) / green-after (new .gitattributes: packet, batch-01, toc turns GREEN under autocrlf=true and false)
Falsify[C1]: iss390-eol red@0573214e green@c89d7268

## Falsification (throwaway git repos under the scratchpad, never the bound tree)
Script: scratchpad fal/check.mjs hashes the three pinned file kinds against the real pins from index.json / batch-01.json; each cell is a fresh `git clone` of a repo holding the HEAD blobs of the packet, batch-01.json, one toc-migrated turns.json and index.json, with the files deleted and re-checked-out.
- old .gitattributes, core.autocrlf=true -> exit 1: packet RED (CRLF bytes, the ISS-390 failure), batch-01 GREEN, turns GREEN
- old .gitattributes, core.autocrlf=false -> exit 1: packet GREEN, batch-01 RED, turns RED (shows no single autocrlf setting works)
- new .gitattributes, core.autocrlf=true -> exit 0, all three GREEN
- new .gitattributes, core.autocrlf=false -> exit 0, all three GREEN
- test 2 (pin not loosened) is the guard: it passes before and after by design and goes red only if someone loosens the pin.

## D-015 — the issue's own recorded reproductions, by issue id
- ISS-390 recorded: `node --test --import tsx scripts/eval/extraction-review.test.mjs` and `extraction-stage-receipts.test.mjs` test 1 fail with `Error: packet-drift at extraction-review.mjs:25`. Re-run at base in this checkout: extraction-review.test.mjs fails at import with `Error: packet-drift` (reproduced). After the fix `loadBundle` returns: extraction-review.test.mjs 12 of 13 pass (both new ISS-390 tests pass); extraction-stage-receipts.test.mjs test 1 no longer throws packet-drift. ISS-390: 2/2 recorded packet-drift reproductions cleared.
- Residual, named and out of ISS-390 scope (not packet-drift, not EOL; both are working-tree-content drift of untracked/extra data that the tests count): `extraction-review.test.mjs` "real immediate extraction consumer remains unlabelled..." line 75 (`stageGaps` has no unavailable `raw` stage in this checkout) and `extraction-stage-receipts.test.mjs` "real bound source inventory..." (`undeclaredDirectories` 0, test expects 2; data/toc-migrated has 35 directories on disk, 32 tracked). Proposed new issue for the checker/ledger; not fixed here.
- Cross-platform note: on a fresh checkout every pinned file now gets the pinned EOL regardless of core.autocrlf; files outside the pinned set are untouched.

## How to verify
- `node --test --import tsx scripts/eval/extraction-review.test.mjs` -> expected: 13 tests, 12 pass, 1 fail (the named residual above); the two ISS-390 tests pass
- `git ls-files --eol data/eval/extraction-adjudication-packet.json` -> expected `w/lf attr/text eol=lf`

## Actual outputs
`ℹ tests 2 ℹ pass 2 ℹ fail 0` (ISS-390 pattern); full file `ℹ tests 13 ℹ pass 12 ℹ fail 1` (the fail is the named residual, not packet-drift).

Live browser evidence: Not UI-touching

## Capability coverage
- Capability: loadBundle accepts the byte-pinned packet from a normal checkout. Covered by Tests[C1] and Falsification[C1].
- Not covered: toc-migrated claims/turns and batches EOL are asserted by the falsification script, not by a repo test (a repo test would need every pinned file hashed; loadBundle's own pin checks already do that for the whole bundle at import time).

Metrics: policy=proportional-verification/2026-10-19.17 suite_runs=0 mutations=0 cycle=0
