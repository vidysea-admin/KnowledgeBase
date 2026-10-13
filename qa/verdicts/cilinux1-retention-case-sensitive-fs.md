# Verdict: cilinux1-retention-case-sensitive-fs

VERDICT: FAIL
Cycle checked: 0
Checked commit: d8435bf2 (lane/cilinux1)

## EXPLANATION
Production change is sound; one test gap in the security function climbsOut must be closed.

Security (probed on Windows with real junction): `..`, `../`, `..\`, `a/..\..\b`, `../secret`, `..\secret`, `a/../../secret`, `/etc`, `C:\x`, `C:foo`, `\server\share`, `\?\C:\x`, `\foo`, and a junction `lnk/secret.webm` all give outside-root. `%2e%2e/...` is a literal name (no decoding anywhere) and is not-found. Trailing space/dot names stay inside or are refused by the post-resolve checks. The change is purely additive: one new guard line before resolve; the absolute/drive/UNC/NUL guard, resolve+relative check and realpath containment (`escapes(relative(realRoot, real))`) are untouched. Mutant that deletes the realpath check is killed (1 fail). Windows behaviour unchanged.

Suite: packages/ingest 342/342 pass; tsc --noEmit exit 0.

Mutations (per-mutation byte backup, restored in finally; hash after each == HEAD blob 0aadb65a; harness deleted):
- drop `climbsOut` call: survives on Windows. This is an EQUIVALENT mutant here: resolve+relative+escapes refuses every path climbsOut refuses, before any fs call, so no Windows-observable behaviour differs. Linux CI is the killer (the trap-io probe test). Accepted, not a FAIL reason.
- `depth <= 0` -> `depth < 0`: killed.
- ".." no longer decrements depth: killed.
- drop realpath containment: killed.
- **remove the early `if (depth < 0) return true;` in climbsOut: SURVIVES (342/342-equivalent, 0 fail)**. This is a pure function mutant, killable on every platform, and the Windows guard masks it in probeMedia. Real defect: `../a/b.webm` would return false from climbsOut (depth -1,0,1) and rely on the Windows-only path.relative check; on Linux `..\a\b.webm` would then read inside the root as "not found". The table only holds climbing paths that finish at depth <= 0.
- split without backslash: could not apply through Git Bash arg quoting; reasoned killed, since `..\..\outside.webm` row would end depth 1.

Cases 2-4: the probe-based expectations are correct for both filesystems; the case-insensitive branch is exactly the old assertion (no Windows weakening); signals gained a `case-only` row. Case-sensitive branch is unproven until CI re-runs (acknowledged by maker).

## Required fix (test only)
In `retention-report.media-escape.test.ts`, add to the `out` array of "climbsOut: both separators": `"../a/b.webm"`, `"..\a\b.webm"`, `"a/../../b/c.webm"`, `"a\..\..\b\c.webm"` (each climbs out and ends at positive depth). Re-run the early-return mutant; it must fail.

ISSUES-WRITTEN: none
