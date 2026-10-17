# T-041 — slide OCR aligned with transcript turns

Checker-owned full-parent acceptance. Maker must not edit this file.

Tier: 3, user-selected roadmap task under D-170. This contract adds an acceptance map; it does not amend frozen contracts, historic decisions, historic verdicts or approved storage policy.

## Authoritative scope

- `TASKS.md` / `.goal/goal.json`: T-041, slide keyframes → OCR → attached to turns by time.
- `docs/meeting-bot-roadmap.md`, P4: scene-change dedupe → OCR → timed attachment; **done when slide text is searchable next to speech**.
- `ARCHITECTURE.md`: tenant scoping, idempotent writes, no fact without provenance, schema-first collection shapes, no silently dropped sources.
- D-008: existing provenance and recording-retention rules. D-137: bounded primary OCR retry/backoff, then configured fallback, then omit failed frame and report attempt count; failed OCR is not blank text.
- D-170: implementation and downstream wiring are authorized; human semantic approvals, credentials, production writes/promotion and live proofs remain distinct gates.
- Existing `qa/contracts/t041-keyframe-dedup.md` and the checked alignment/OCR/extraction/wiring slices remain applicable. Their scoped PASSes explicitly do not close T-041.

## Source implementation acceptance

S1. The actual recording processing entry point invokes slide processing when configured, with the recording duration and transcript turns on the same seconds-from-session-start clock. Disabled/unconfigured operation reports its state honestly. A helper available only through a test does not establish production wiring.

S2. Keyframes represent distinct visible slide content rather than every duplicated sampled frame. Extraction, perceptual/scene-change dedupe, OCR and alignment are connected. Sampling granularity and threshold assumptions are recorded; the existing dedupe invalid-input and span invariants remain satisfied.

S3. Stored content is actual successful OCR output, not a hash stand-in, model instruction, or a copy of speech. Blank results are distinguishable from exhausted/malformed/failed OCR. D-137 retry/backoff/fallback and typed per-frame failure counts survive the integration. Failures must not silently become successful empty extraction.

S4. Consecutive equal slide observations may merge; different slides and A/B/A transitions retain ordered distinct coverage. Slide spans are bounded by the finite recording duration, and turn attachments reference their real overlapping half-open intervals. Boundary, empty/zero-length turn, turn-crossing-slide and final-slide behavior are explicit. Invalid observations/turns cannot produce fabricated citations.

S5. The persisted/searchable representation retains slide identity, session/source identity, recording time or span, and real transcript-turn attachment references. OCR is visibly screen-derived and retains the existing unverified/review status; it is not silently attributed to a speaker's spoken words or promoted to verified fact. Original speech remains recoverable independently.

S6. Actual ingestion/index/search consumers read the OCR representation. A phrase present only on a slide is discoverable beside the session's speech, with a valid session/time citation and its screen origin; indexing only alignment IDs or dropping text fails this requirement. An explicit known search consumer must be identified in the packet.

S7. Persistence/search follow existing tenant and source identity rules, with idempotent repeat ingestion and no cross-tenant collisions or retrieval. Malformed/mismatched session, source, turn or tenant references fail closed at the actual write/read boundary. Any changed collection shape follows schema/generation/migration integration ownership; no ad hoc parallel shape is sufficient.

S8. Reuse of established screen-evidence storage, retention and redaction policy is acceptable if the packet names that policy and demonstrates equivalent treatment. A new policy decision cannot be inferred from these clauses. Temporary extraction files are cleaned according to existing rules on success/error; errors and diagnostics disclose no credentials, raw frame bytes or sensitive OCR content beyond the explicitly authorized output. Model/capture failures remain observable without corrupting speech processing.

S9. The sample stage and immediate downstream consumer pass with retained exact commands, output/counts, fixture identities and candidate hashes. The packet names scope, cycle, all changed/new files, actual caller/consumer and remaining whole-task gates. Existing relevant contract verification is retained, including `contracts/verify_contracts.py` when applicable. Focused fake tests may establish source behavior but cannot substitute for L1–L3.

## Full-parent completion evidence

L1. Process a real finite recording containing legible, changing slides and corresponding real transcript turns through the wired entry point. Retain source/duration identity, extraction/dedupe observations, OCR provider/model identity, failure counts and timed attachment evidence. Synthetic text, fake media commands and screenshots without recording-time correspondence are insufficient.

L2. Independently compare representative OCR/alignment output against the recording: a duplicate slide, a genuine transition, a slide-only phrase and the final span. Report observed sampling/OCR limitations and unresolved failed frames. No accuracy threshold or missing content may be silently invented away.

L3. Consume that output through actual ingestion/index/search in an authorized tenant. Query a slide-only phrase and retain the returned text plus source/session/time and screen-origin citation; show neighboring speech remains available and an unauthorized tenant cannot retrieve it. This must use actual runtime persistence/consumer behavior, not an injected mock or an unwired helper.

## Verdict and task status

Only the independent checker may issue PASS for the matching manifest cycle and unchanged candidate hashes. A scoped S1–S9 implementation verdict must state its exact scope and can coexist with whole-task HOLD. T-041 becomes done only after all applicable S1–S9 and L1–L3 pass. Missing CPU/provider/runtime access produces explicit HOLD, not assumed live evidence. A proven acceptance violation produces FAIL. No current contract creation, source-only review or earlier foundation PASS is whole-task acceptance.
