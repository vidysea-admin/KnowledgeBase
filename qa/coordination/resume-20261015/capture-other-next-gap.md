# Capture/processing next-gap survey — 2026-10-15

Scope: read-only targeted T-011/T-034/T-035/T-038/T-039/T-040/T-041/T-043/T-044/T-046/T-048/T-050 inspection. No private corpus, secrets, tests, build, browser, provider or DB operations.

**Result: no defensible new unblocked software unit identified outside the current native/privacy and shared integration lanes.** Historical tracker descriptions of unwired primitives are stale. T-040 product composition and T-041 searchable OCR have matching scoped PASSes; T-048 single-dispatch is checked-PASS but its newer privacy candidate is separate; T-050 official Ask executor is already implemented in packages/ask/src/ask-graph.ts. Pending checks are not missing implementation.

## Best remaining independent evidence gate: T-041 real OCR → search

Tier 3 roadmap acceptance, not a new defect/build. Requirement: qa/contracts/goal-T041.md L1–L3 and docs/meeting-bot-roadmap.md P4: slide-only text searchable next to speech with session/time and screen origin.

Producer: scripts/webinar/process-video.mjs and scripts/webinar/slides/slide-knowledge.mjs. Immediate consumers: scripts/webinar/sync-session.mjs (enrichSlideKnowledgeTurns → buildSessionFiles), actual stored loader/chunker and source hydrator, then tenant search. Missing **evidence**, not demonstrated missing behavior: one real finite slide recording through configured OCR, independent visual/time comparison, actual authorized persisted/indexed slide-only query with neighboring speech and foreign-tenant refusal.

Reuse qa/verdicts/t041-searchable-time-aligned-ocr.md cycle1 and its 28-pass/1-explicit-native-media-skip receipt; independent span oracle134 assertions. Latest applicability reconciliation reports15/16 exact pins and one type-only tenantScope delta; do not claim16-pin runtime identity. No duplicate synthetic suite proposed.

Check plan after authorized fixture/provider/work-DB and CPU availability: freeze current dependency pins; execute one bounded real producer sample; independently inspect duplicate/transition/final frame and slide-only phrase; consume through actual sync/index/search with provenance and tenant refusal. Existing provider/human/privacy/native and activation gates remain distinct; this survey authorizes none.

Round cap: existing OCR alignment and searchable consumer seams already have at least two PASSed units (t041-slide-turn-alignment, t041-ocr-stage-alignment, t041-searchable-time-aligned-ocr). No nonsecurity polishing unit justified; source/data-write safety defects remain uncapped if actually found. Parent remains HOLD pending L1–L3.
