# Verdict: w23-coreq

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 95dc24c62b4f81d6811229862fb789f46a321419
Base: 3c99337f (cycle 0 candidate 4d8dbbed)

## Cycle 1 evidence (independently produced)
- Diff 4d8dbbed..95dc24c6 read. `orphanGenerated` now lstat-filters (regular files only, `.ts`, banner-bearing, names from `readdirSync` of generated/) and is called in `main()`. CHECK prints DRIFT and exits 1 via the drift count; write mode `unlinkSync`s. A `GEN_TYPES_ROOT` env override was added for tests (the caller controls it; not a repo escape by itself).
- Own orphan probe (real schema/ copy in a scratch root inside the lane, since removed). `--check` exit 1 listing the orphan, and the file was still present after `--check`. Write mode exit 0 `removed gone.ts`. The final `--check` exit 0.
- Deletion safety probe:
  - A hand-written `hand.ts` survived.
  - A `.ts` file without the banner survived.
  - A `.ts` junction pointing at a dir holding a banner-bearing file: the junction and the target file both survived.
  - A banner-bearing file outside generated/ survived.
  - Odd names `..ts` and `..x.ts` (banner-bearing, inside generated/) were treated as in-dir files and removed, and nothing outside was touched. Names from `readdirSync` cannot contain separators, so a `..` path component cannot arise.
- A file symlink could not be created on this host (not permitted). It is covered only by the maker's skipped test and is UNVERIFIED here, though lstat `isFile()` is false for symlinks. Not probed: generated/ itself being a junction (repo-controlled config).
- `node scripts/gen-types.mjs --check` on the lane tree: exit 0, `OK: 46 generated type file(s)`.
- `node --test --test-force-exit scripts/gen-types.test.mjs`: pass 4, fail 0, skipped 1 (symlink, "symlink not permitted").
- Mutations (per-mutation byte backup, trap, timeout 600, each restored). `git hash-object` of scripts/gen-types.mjs equals the `HEAD:` blob 4a21ef25..., and of the test file equals fa787e91..., both after restore.
  - M1, delete the `unlinkSync(path)` call: killed (pass 3, fail 1, in the e2e orphan test).
  - M3, drop `drift += 1` in the orphan loop (skips the check failure): killed (pass 3, fail 1, same e2e test).
  - A syntax-breaking first attempt was a crash, not counted.
- `node scripts/lint-loc.mjs --all`, alone, timeout 600: exit 1. 9 of 10 stages exit 0 (loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker). `dependencies` exit 1362, and all 1362 are `no-unresolvable-workspace-import` (lane node_modules gap). The count equals cycle 0, so this unit adds no violation. That stage cannot be verified in this lane and is recorded as a limit, not as a pass.
- ISS-JOBQUEUE-002: the cycle 0 evidence stands (lock at base, lost-update 15/15). No code change in cycle 1.

## Ledger rows
- ISS-SCHEMAEDIT-001: may be flipped to verified (checker verdict w23-coreq cycle 1, 95dc24c6).
- ISS-JOBQUEUE-002: not changed by this unit. The row text is open-before-wiring and the owner decides closure.

ISSUES-WRITTEN: none
Not verified: dependencies lint stage in a fully installed tree; file-symlink deletion behaviour on this host.

---

## Superseded history (cycle 0, candidate 4d8dbbed, FAIL; not authoritative)

Cycle-0 verdict was FAIL at cycle 0, reviewed SHA 4d8dbbedc9b70253e9ab9de570500a803c6ab324 (commit ca060985).

### Findings (cycle 0)

1. HIGH, acceptance violation (ISS-SCHEMAEDIT-001): `orphanGenerated` was exported but never called. `git show 4d8dbbed:scripts/gen-types.mjs | grep -n orphanGenerated` gave only line 76 (the definition), and `unlinkSync` was imported but never used. `main()` was byte-identical to base. So `--check` did NOT fail on orphans and write mode did NOT delete them. Probe: write mode exit 0 and `gone.ts` still present; `--check` exit 0 printing `OK: 46 generated type file(s) + index.ts match schema/`.
2. HIGH, test gap: no test covered the main() orphan path.
3. Maker's mutation M1 only exercised the pure helper.

### Cycle 0 other checks
- Real tree `--check` exit 0. Tests pass 2, fail 0.
- ISS-JOBQUEUE-002: `queue-lock.ts` exists at base 3c99337f; the cited PASS verdict qa/verdicts/iss-jobqueue-002-lost-update.md is PASS cycle 0 (lost-update half met; pruning half ISS-JOBQLOST-001 verified; follow-ups ISS-JOBQLOST-003/004). `file-job-queue.lost-update.test.ts` run 15 times (timeout 600 each): 15/15 exit 0, pass 6 fail 0 each. The row stays `open-before-wiring` by design and was not flipped.
- Lint: same result as cycle 1 (9 of 10 stages exit 0; dependencies exit 1362, lane node_modules gap).
