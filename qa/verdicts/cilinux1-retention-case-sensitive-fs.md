# Verdict: cilinux1-retention-case-sensitive-fs

VERDICT: PASS
Cycle checked: 1
Checked commit: ed2d2b74 (lane/cilinux1)

## EXPLANATION
Cycle 0 FAIL (early-return mutant survived) is resolved by the 4 added climbsOut rows. Re-verified with a Node script (no shell quoting), byte backup restored in finally, hash == HEAD blob 0aadb65a after both:
- delete `if (depth < 0) return true;`: killed (1 fail).
- split without backslash: killed (1 fail).
Full packages/ingest: 342/342 pass. Cycle 0 findings otherwise stand: guard purely additive, realpath containment intact, Windows behaviour unchanged. The drop-climbsOut-call mutant remains equivalent on Windows (killed only by the Linux CI run); the case-sensitive branch is unproven until CI re-runs.

ISSUES-WRITTEN: none
