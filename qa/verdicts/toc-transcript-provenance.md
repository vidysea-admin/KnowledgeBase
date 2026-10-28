# TOC transcript provenance — independent checker

VERDICT: PASS (bounded provenance unit)
Cycle checked: 2
ISSUES-WRITTEN: none

The cycle2 ready-for-check request resolves the cycle1 environmental HOLD. Source SHA256 hashes for all9 previously reviewed provenance files were independently rechecked unchanged at checkpoint d08d1ec. The installed local FFmpeg and FFprobe each report9.0.2. No source assertion, timeout or required case was weakened.

Independent newly unblocked command: node --test --test-name-pattern='real ffmpeg synthetic video' scripts/webinar/process-video.test.mjs, with per-command PATH pointing to the verified task-local FFmpeg and installed Node24. Result: exit0,1/1 PASS, zero skipped/cancelled,2985.3318ms. This creates actual synthetic video and verifies timestamped playable frame evidence. No real provider, browser, database or corpus operation occurred.

Affected-stage result is a transparent composite55/55:54 prior passing cases on unchanged source plus the independently rerun formerly failed FFmpeg case. It is not a new execution of all55 cases. Other process-video cases use injected command/Transport doubles, so installed FFmpeg changes only the previously blocked real-media fixture. Root explicitly accepted this composition; repeated passing tests were unnecessary. Original affected command and preserved prior HOLD evidence are recorded in qa/evidence/u22-checker-provenance-2026-10-09.json.

The existing independent27/27 checks and maker29/29 immediate downstream/audio checks remain valid on unchanged source. They cover immutable turn identity, archive/invalidation ordering, explicit work-DB/source tenant, stale seed/sync refusal, coherent same-buffer snapshots, strict combined speech/screen/frame validation and safe downstream generation consumption. This satisfies the affected-stage and immediate-downstream requirements for this bounded unit.

Closeout permitted for the same-slug provenance manifest only. Full U2.2 remains BUILDING; independently confirmed semantic gold, binding thresholds,65 unreviewed claims, original corpus failures and R1/R2/R3 live product acceptance remain open. No canonical schema, frozen contract, enforcement, production promotion, live capture or whole-corpus correctness acceptance follows. Global pre-existing structure/tracker gates are not marked green.
