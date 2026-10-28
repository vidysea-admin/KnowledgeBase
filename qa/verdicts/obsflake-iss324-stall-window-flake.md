# Verdict: obsflake-iss324-stall-window-flake

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
- Diff (obs-windows.test.ts only): no assertion removed or weakened; only timings changed (stall 400->3000 ms via STALL_MS, ticks 12->35 = 3.5 s > stall window, cap test openCapMs 1200->4000). (a) wedged child detected: silent fixtures unchanged, still assert the stall failure. (b) progressing child not killed: progress test outlasts the stall window and must open.
- Runtime: before 25 s (and it failed 1/8, flake reproduced), after 27-39 s per run (about 30 s). Acceptable.
- 10 sequential runs: each pass 8 / fail 0 (10/10).
- Mutations in browser/bot-child.ts line 95: `>= 1e12` (never fires) -> pass 7 fail 1; `>= -1` (always fires) -> pass 6 fail 2. Restored each time; git hash-object equals HEAD blob; tree clean.
- Note: manifest cites bot-child.ts under obs/; actual path is src/capture/browser/bot-child.ts (cosmetic).

ISSUES-WRITTEN: none
