# scripts-test-fixes

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: test-side / audit-config only (no product behaviour change, no data writes). Lane: lane/scriptsfix. No ledger issue fixed; no ledger rows touched.

## Scope
1. `scripts/qa/packet-snapshot.test.mjs`: `fixture()` now `mkdir -p`s the git-ignored `.cache/coordination` before `mkdtemp`. The "actual CI, B7 and D3 inventory adapters" test reads real untracked inventories from the main tree's cache; it now `t.skip`s with a reason when they are absent (fresh checkout/worktree) and still runs where they exist.
2. `scripts/webinar/process-video.test.mjs`: "real ffmpeg synthetic video" skips with "ffmpeg/ffprobe not found on PATH" when either binary fails `-version`; runs where present.
3. `scripts/lib/tracker-audit.mjs`: 14 historical verdicts added to `G4_FROZEN` (immutable checker records, D-019). Old verdict files NOT edited.

G4_FROZEN additions (all under qa/verdicts/):
- qa/verdicts/iss-298-ledger-id-allocator.md
- qa/verdicts/lint-tracker-g4-qualify-issue-refs.md
- qa/verdicts/medium-fix-batch-2-2026-10-10.md
- qa/verdicts/r1-alert-title-policy-and-reasons.md
- qa/verdicts/r1-attention-alerts.md
- qa/verdicts/t-031-audio-watchdog.md
- qa/verdicts/t-047-controller.md
- qa/verdicts/t034-tab-capture-extension-logic-tests.md
- qa/verdicts/t036-calendar-description-link-scan.md
- qa/verdicts/t037-join-rules-stale-lock-takeover.md
- qa/verdicts/t039-send-now-command.md
- qa/verdicts/t040-strict-quote-verifier-and-windowing.md
- qa/verdicts/t042-self-introduction-fusion.md
- qa/verdicts/t046-retention-dry-run-report.md

## Evidence (node from toolchain, fresh worktree where .cache/coordination was absent)
- packet-snapshot.test.mjs + process-video.test.mjs: before ENOENT on every fixture; after tests 43 pass 41 fail 1 skipped 1 -> the 1 fail fixed by the inventory skip (now skipped 2 total incl. ffmpeg).
- ledger-union.test.mjs G4 "master's manifests and verdicts are clean": was failing (14 files flagged); fixed.
- Full scripts test set (579 tests): pass 571, fail 6, skipped 2 (before the final inventory skip). Remaining failures, out of scope: scripts/upload/queue.test.mjs x4 (real Mongo/Python worker, not run-able here); scripts/webinar/send-now-host.test.ts x2 (launch argv / launcher 502).
- `test:lint`: 136 tests, 133 pass, 3 fail (out of scope): snapshot.mjs docs/SNAPSHOT.md <= 200 lines; ISS-323(c) Zoom URL argv; title-ending-in-backslash argv.

## Not verified
Ffmpeg-present path not run (no ffmpeg on this machine).
