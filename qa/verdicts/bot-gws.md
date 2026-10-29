# Verdict — bot-gws
**Cycle checked:** 0
**VERDICT:** PASS
**Policy-Version:** proportional-verification/2026-10-19.17 (as pinned by the manifest)
**Checked:** HEAD c6b044eb (code 4e764ed9, base 77ba22d8), coordinator A, tier S (platform default of a binary path; no auth/tenancy/data write)

## Check plan
Diff read in full (2 product-adjacent files + manifest). Criteria C1-C3 evidenced by the checker's own runs; one falsification per criterion in a copy; adversarial read of the exec path; R1 regression run.

## Scope read (step 4c)
Changed files are exactly gws-channels.ts (new exported `resolveGwsBinary`, `createGwsRunner` now calls it) and the new gws-channels.test.ts, plus the manifest. No file outside the declared scope. Callers of `createGwsRunner` (tick-wiring.ts:87, onair-mail-loader.ts:46, scripts/webinar/scheduler/deps-runtime.mjs:46) keep the same signature; the win32 and override results are identical to the old inline expression, so only the non-win32 default changed (".../gws.exe" -> "gws").

## Criteria (checker's own runs, cwd = worktree, `node --import tsx --test`, timeout 150)
- C1 PASS: win32 default is path.join(root,".cache","tools","gws-0.22.5","gws.exe"). gws-channels.test.ts 3 pass / 0 fail.
- C2 PASS: linux, darwin and linux-with-whitespace-override all return bare `gws` (no .exe, no repo path). Same run.
- C3 PASS: " /opt/gws/gws " trimmed and returned on win32/linux/darwin; "   " ignored on linux (falls through to "gws").
- R1 PASS: alerts.test.ts 12 pass / 0 fail (imports gws-channels, unmodified).

## Falsification (copy in scratchpad, per-mutation byte backup, restore verified by git hash-object == `git rev-parse HEAD:<file>` = 79f61049, yes x4)
| id | edit | base | mutated |
|---|---|---|---|
| C1 | `platform === "win32" ?` -> `false ?` | 3 pass | win32 test red (2 pass/1 fail) |
| C2 | non-win32 branch `"gws"` -> the .exe path | 3 pass | linux test red (2/1) |
| C3 | `if (override) return override;` -> `if (false) ...` | 3 pass | override test red (2/1) |
| extra (mutant 1) | drop `.trim()` on LKB_GWS_PATH | 3 pass | 2 tests red (blank-override + trimmed-override) |
Bound tree untouched (git status clean). Restored copy re-ran 3 pass.

## Adversarial read (auth/tenancy/data-write: none touched)
- Non-win32 bare `gws` goes to execFile (no shell), resolved via PATH only; no cwd lookup on POSIX, no new injection surface. LKB_GWS_PATH is operator env, same trust as before.
- Win32 behaviour byte-identical to the old default; nothing selects bare `gws` on win32.
- A missing binary on Linux surfaces through the existing error branch (`gws failed (ENOENT)`), no credential or URL logged. No bypass found.

## Notes (non-blocking)
- Selected tests cover the resolver only; `createGwsRunner` wiring is a one-line call and is exercised by alerts.test.ts via the injected runner seam, not the real binary. Acceptable at tier S.
- Sibling resolvers (scripts/webinar/*, apps/api operations-integrations) use their own binary resolution and are not affected by this change.

ISSUES-WRITTEN: none
PROPOSED-ISSUE: none

Metrics: start=2026-10-29T02:00:00Z end=2026-10-29T02:05:30Z wall_min=5 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=330 mutants=1 defects_unit=0 defects_6c=0 check_min=5
