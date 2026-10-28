# Content-free PTS diagnostic checkpoint

managed-review/1; cycle 2 diagnostic only, not a proof change, not ready for checker. Prior fix1 broker result: 13 pass/1 actual integration failure, zero skips. Source SHA `e59bf9df461e744abe1891ff6efe30550d97bdc3bd80f48664abd2b1562e3a90`; exact new probe bytes stored adjacent. All other sources unchanged from fix1.

Existing mismatch error now includes only stream kind, frame ordinal/counts, rational timestamps, audio sample count and decoded frame duration/byte length. No media bytes, names, private paths or payload hashes. No acceptance condition changed. The old receipt lacks the numeric facts required to distinguish partitioning from actual timestamp drift.

Broker request: original real integration only via test-name-pattern `broker-only`, with existing binaries/paths; retain full output. Maker ran no tests or diagnostic binary. Root must return this numeric receipt before a semantic fix. Actual maker runtime tokens/active time/cost remain unknown/null; no reviewer spawned and no verdict claimed.
