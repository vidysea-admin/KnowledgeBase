# Manifest — t041-searchable-time-aligned-ocr
**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 1
**Task:** T-041 (full-parent HOLD pending real L1–L3 evidence)
**Tier:** 3 — user-selected roadmap task under D-170 and root's exclusive source lease.
**Scope:** Wire existing stored screen OCR to full slide visibility intervals and overlapping speech, preserving source origin and bounded per-frame recovery.
**Packet:** qa/packets/t041-searchable-time-aligned-ocr.md
**Contract:** qa/contracts/goal-T041.md S1–S9 and L1–L3; qa/contracts/t041-keyframe-dedup.md reused by unchanged optional keyframe path.

## Current state
Independent checker PASS received for matching cycle1 and unchanged source/synthetic acceptance pins; file handshake closed. This is scoped S1–S9 source implementation acceptance, not live OCR or full task completion.
No qa/contracts edits, schema/generated/migration edits, decisions, tracker changes, live writes, provider calls or media subprocesses.
Shared attachment validation, screen-safe mapper call-site and emitted-summary speaker guard are applied by root integration and freshly inspected/pinned. The first focused run reached the real mapper/page-builder/hydrator but failed because its injected database lacked the review reader's findOne method. Only the owned fixture was corrected to provide scoped find/findOne reads, a real recording source/session context and an absent review head. Original origin/tenant assertions remain; review/context traversal assertions were added. Production code was not changed for this repair.

## Evidence
Immutable initial failure: qa/evidence/goal-t051checker-broker-t041-maker.json and matching .stdout.txt/.stderr.txt; exit1, elapsed4577.6762ms,29tests/27pass/1fail/1explicit hermetic media skip; nine before/after SHA256 pins unchanged. The failed injected fixture is superseded by cycle1; it is not a passing receipt.
Current cycle1 replay: qa/evidence/t041-searchable-time-aligned-ocr/maker-cycle1-current-20261014T234324Z.receipt.json plus stdout/stderr; appointed ordinary coordinator, terminal exit0,wrapper3813ms/Node3607.0903ms,29tests/28pass/0fail/1explicit native-media skip. All16 pre/post pins unchanged and freshly rechecked against current bytes. Actual processVideo→loader→chunker plus actual mapper→page-builder→scoped source hydrator consumed public synthetic outputs; six digest-resealed attachment attacks refused. Receipt SHA256f127b73524ddce0b69e5d8cb46ef2a96e76477438038e428fb17dc094c6cd7ea. No native media/provider/private corpus/real database execution.
Central contracts receipt is reused with unchanged validator/registry SHA256 and disclosed empty-registry PASS by vacuity in the packet. Current candidate pins and exact command are in the packet.

## Origin finding resolution
Current independent synthetic planner→historical overlay→actual hydrator probe passed through the appointed coordinator: qa/evidence/t041-searchable-time-aligned-ocr-checker/review-origin-current-20261014T233230Z.receipt.json and matching stdout/stderr; exit0,2258ms,all nine pre/post SHA256 pins unchanged and current. Planner blocks screen-to-human remapping; the physical effective reader/actual hydrator refuses the invalid historical overlay. The pure effectiveTurns helper still emits person:alice; acceptance is proved at the guarded production read/write boundaries, not by claiming that helper preserves origin. No pre-fix origin runtime RED executed.

## Checker closeout
qa/verdicts/t041-searchable-time-aligned-ocr.md, VERDICT:PASS, Cycle checked:1, SHA256d064a850f0761aead285a5aac73e1c59bca96a9aee346fdfae8c52b0eccc3f04. Independent span oracle passed134 assertions (64 all-pairs timelines/64 permutations plus boundary-invalid/mapping cases),exit0/167ms/two stable pins; receipt qa/evidence/t041-searchable-time-aligned-ocr-checker/span-current-20261014T234824Z.receipt.json. Maker closeout reconfirmed all16 candidate pins/current sync caller and checked contract/probes/validator bytes unchanged; no duplicate suite run. Whole T-041 remains in progress/HOLD for L1 real recording/provider OCR, L2 independent visual OCR/time comparison and L3 actual authorized tenant ingestion/index/search. Native media test remains explicitly skipped. No production action or publication occurred.

## Subsequent applicability reconciliation — 2026-10-15
Owned source/tests, actual loader/hydrator/privacy/read guards and inspected sync caller remain unchanged. Fifteen of16 imported raw pins still match the immutable cycle1 receipt. Only packages/db/src/lib/tenantScope.ts changed: the scopedCollection db parameter type changed from Db to Pick<Db,"collection">; executable find/findOne tenant-merge logic is unchanged. Checker independently confirmed that reversing exactly this annotation in memory yields the original checked SHA256 byte hash. Static type erasure supports continued behavior applicability; no fresh runtime receipt or exact16-pin identity is claimed for these later bytes. Reconciliation recorded in qa/evidence/t041-searchable-time-aligned-ocr/applicability-20261015.json. No meaningful OCR behavior delta found, no source change/shared patch or duplicate passing suite requested. Whole-parent L1–L3 remains HOLD.
