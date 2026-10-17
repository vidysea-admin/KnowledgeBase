# Unit: u22anchor (lane w17-u22anchor)
Status: ready-for-check
Fix cycle: 0
Base SHA: d42f3713 (deriveddrafts PASS verdict)
Candidate SHA: see lane HEAD (single commit)

## Changed paths
- scripts/eval/derived-drafts/derived-drafts.mjs: resolveCitation/resolveCitations; u22Prompt, u22Draft and run use resolved text
- scripts/eval/derived-drafts/derived-drafts.test.mjs: 13 tests (4 new: resolution, current-only rule, unresolvable, real-packet 80/80)
- data/eval/derived-drafts/u22-derived-drafts-anchored-2026-10-17.json (NEW sidecar, wx; old u22 sidecar kept untouched)
- qa/manifests/u22anchor.md

## Design
- The hash-bound packet already carries the ARCHIVED original turn per citation (`originalMigration`, git revision 907c9c9 of data/toc-migrated) with textSha256. Used instead of recomputing the toc-recovery mapping (same archive, same legacy ids).
- Resolution order: archived-original (record._id == cited id and sha256(text) == textSha256) -> current only if !sameIdContentChanged -> unresolved. Unresolved claims keep the deterministic "unavailable" rule vote, zero model calls.
- aiDraft.citationSource ("archived-original"|"current"|"mixed"|null) plus per-citation {turnId, citationSource, textSha256, artifactRevision}.
- humanGold false, assertNoHumanGold before write, packets untouched, authoritative store untouched.

## Checks for the checker
- DD_DATA_ROOT=C:\Users\product\Desktop\KnowledgeBase node --test --import tsx scripts/eval/derived-drafts/derived-drafts.test.mjs (13 pass)
- Sidecar: no humanGold true, no non-null approvedBy/approvedAt/decision, no keys.
- Spot-check some archived turns against `git show 907c9c9:data/toc-migrated/<id>/turns.json`.

## Evidence (real)
- tests: 13 pass / 0 fail.
- Live U2.2: 72 items, 159 calls (cap 216), flagged 15, all 72 archived-original.
- Old: unsupported 54, unavailable 14, partially_supported 2, supported 2.
- New: supported 52, partially_supported 19, no-majority (null) 1.
- Transitions: unsupported->supported 40, ->partially_supported 13, ->no-majority 1; unavailable->supported 8, ->partially_supported 6; partially->supported 2; supported->supported 2.
- Agreement: agree 59, majority 12, disagree 1.
