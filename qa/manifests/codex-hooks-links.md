# Unit: codex-hooks-links

**Fix cycle:** 0

## Worktree sync (disclosed per brief)

`git merge --ff-only master` was run first (worktree was behind; the authorizing decision landed
on master today). Fast-forwarded `a99140f..ca86e53`, pulling in `docs/DECISIONS.md` (D-050-CODEX,
D-051), the ISS-307 `mc-sessionstart.ps1` fix, and 280+ unrelated files from concurrent lanes.
Branch: `worktree-agent-a6831e0acd90211ee`. HEAD at merge: `ca86e53f16a21a2d7ccc38894e35accb0a5ab4b0`.

## Scope read first

Read `docs/DECISIONS.md` **D-050-CODEX** (line 1031) in full, and **D-051** (line 1094), which
disambiguates it from the same-day **D-050-SPEAKER**. Every claim below cites D-050-CODEX, never
bare "D-050".

## What this unit found, in one paragraph

D-050-CODEX authorized converting the six `.codex/hooks/*.ps1` copies to **links** so the mirror
could not drift "by construction," with a parity-lint as fallback **only if links do not
resolve**. The probe below shows the link resolves fine under `-File` — that specific test
passes — but **both candidate link mechanisms fail the requirement that actually matters**: they
do not survive `git clone` or `git worktree add`, which is this repo's routine unit of
concurrency (D-019). A link that must be silently re-established after every worktree is not
"impossible to drift by construction" — it is the same "policed by a lint someone must keep
passing" problem the decision was trying to escape, just moved one level up and made invisible.
Per D-050-CODEX's own pre-authorization ("that fallback is authorized by this entry too, so a
failed probe does not need a new decision"), this unit takes the **parity-lint fallback** as the
durable fix, while documenting the link investigation in full because — per the brief — that
finding is worth more than the unit.

## The probe, in order, with actual output

All commands below were run from this worktree
(`D:\KnowledgeBase\.claude\worktrees\agent-a6831e0acd90211ee`). Byte backups of all six
`.codex/hooks/*.ps1` files were taken and verified with `cmp` **before any mutation**, per D-020 /
D-050-SPEAKER ruling 3 (per-mutation backup, restore-on-any-exit, `cmp`-verified).

### 1. Hard link — created and initially resolves

```
Remove-Item .codex\hooks\decisions-append-guard.ps1 -Force
New-Item -ItemType HardLink -Path .codex\hooks\decisions-append-guard.ps1 -Target .claude\hooks\decisions-append-guard.ps1
fsutil hardlink list .claude\hooks\decisions-append-guard.ps1
```
```
\KnowledgeBase\.claude\worktrees\agent-a6831e0acd90211ee\.codex\hooks\decisions-append-guard.ps1
\KnowledgeBase\.claude\worktrees\agent-a6831e0acd90211ee\.claude\hooks\decisions-append-guard.ps1
```
Confirmed both names resolve to one inode; content compared equal.

### 2. The required probe: does `-File` resolve the link? YES

```
'{"tool_name":"Edit","tool_input":{"file_path":"docs/DECISIONS.md"}}' |
  powershell -NoProfile -ExecutionPolicy Bypass -File .codex\hooks\decisions-append-guard.ps1
```
Exit 0, output byte-identical to running the same input against `.claude\hooks\...` directly.
**This part of D-050-CODEX's question is answered: yes, PowerShell `-File` resolves a Windows hard
link (and, separately tested below, a directory junction) with no special handling needed.**

### 3. Hard link — broken by the Edit tool (this repo's own primary editing mechanism)

Added one comment line to `.claude/hooks/decisions-append-guard.ps1` via the Edit tool (the exact
mechanism used to author every prior fix cited in this unit's brief — D-034, D-041, ISS-307):
```
grep -n PROBE-MARKER .codex/hooks/decisions-append-guard.ps1 .claude/hooks/decisions-append-guard.ps1
```
```
.claude/hooks/decisions-append-guard.ps1:2:# PROBE-MARKER...
```
(`.codex` side: no match.) `cmp` confirms the two files differ after the edit;
`fsutil hardlink list` on each now shows **only itself** — the Edit tool's write pattern (write
new content, replace the file) severed the shared inode. **Silent**: no error, no warning, the
directory listing looks unchanged.

### 4. Hard link — separately broken by `git checkout` (how the six files got fixed content today)

Re-created the same hard link, confirmed both sides showed the probe marker, then ran the exact
class of operation that landed today's fixes in `.claude/hooks/mc-sessionstart.ps1`:
```
git checkout -- .claude/hooks/decisions-append-guard.ps1
grep -c PROBE-MARKER .claude/hooks/decisions-append-guard.ps1 .codex/hooks/decisions-append-guard.ps1
cmp .codex/hooks/decisions-append-guard.ps1 .claude/hooks/decisions-append-guard.ps1
```
```
.claude/hooks/decisions-append-guard.ps1:0
.codex/hooks/decisions-append-guard.ps1:1
differ: char 89, line 2
```
`git checkout` **also** breaks the hard link — git's worktree-write path is a replace, not an
in-place modify, same failure class as the editor. **Hard links are ruled out**: the repo's two
most common ways of changing a hook file both silently sever them.

### 5. Directory junction — survives both of the above

Restored clean state (`cmp`-verified against the byte backups), then replaced `.codex/hooks`
(moved aside as `.codex/hooks.orig`) with a junction: `New-Item -ItemType Junction -Path
.codex\hooks -Target <repo>\.claude\hooks`. `Get-ChildItem .codex\hooks` listed the same six
names (both directories held exactly the same six files at the time of the test). Repeated
probes 3 and 4 against `lab-session-end.ps1` through the junction:
- Edit-tool write to `.claude/hooks/lab-session-end.ps1` → **immediately visible** through
  `.codex/hooks/lab-session-end.ps1` (`cmp` identical, both show the marker).
- `git checkout -- .claude/hooks/lab-session-end.ps1` → **still identical after** (`cmp` clean,
  marker gone from both). A junction is a directory-level reparse point, not a per-file inode
  link, so a replace-write to a file *inside* the target directory is invisible to git and to
  every tool as a link-breaking event — there is only one physical directory, reached by two
  path spellings.

### 6. The finding that overrides the junction's apparent success: git cannot store it

```
git status --short
git ls-files -s .codex/hooks/
```
```
 M .codex/hooks/mc-precommit.ps1
 M .codex/hooks/mc-sessionstart.ps1
100644 5ff7ef3... .codex/hooks/decisions-append-guard.ps1
100644 33cd200... .codex/hooks/features-snapshot-session-end.ps1
... (all six, mode 100644)
```
Git has no object type for an NTFS junction or hard link — `git ls-files` shows plain mode
`100644` blobs regardless of what the working-tree entry actually is. **Whatever gets committed
is always six independent file snapshots**, whether the local working tree implements
`.codex/hooks` as a junction, a hard link, or six ordinary copies. This worktree is itself the
proof: it was created by `git worktree add` from a commit that has never contained a junction
(git cannot represent one), so it started with six ordinary, independent files — not a link of
any kind — even though this repo has now (in another worktree, or after this unit merges) fixed
`.claude/hooks/mc-sessionstart.ps1` three separate times today. **Every future `git worktree add`
in this maker-checker repo — its routine unit of concurrency per D-019 — reproduces exactly that:
a fresh, unlinked copy, with no signal that it is one.**

### 7. Decision taken from the probe

Per D-050-CODEX's explicit pre-authorization, **this unit takes the parity-lint fallback**,
deliberately **not** the per-file-link approach the entry describes as its default. Reasoning,
stated plainly as required:

- The link mechanism that survives in-place edits (junction) provides **zero** protection at the
  moment that matters most for this repo — a new worktree — because git cannot propagate it.
  Presenting it as "solved by construction" would be false confidence.
- Keeping a junction locally in the merged working tree is also a **live hazard**, not just a
  non-benefit: `.codex/hooks` as a reparse point is invisible to `git status`, and a
  junction-unaware recursive delete run against it (in a repo whose own maker-checker tooling
  does automated directory sweeps and mutation-run cleanup, per D-020) is a real way to end up
  deleting or corrupting `.claude/hooks/` — the actual enforcement surface — through a name that
  looks like a harmless six-file mirror. `(Get-Item ".codex\hooks").Delete()` removes a junction
  safely; a naive recursive delete elsewhere in this codebase might not.
- The parity lint, by contrast, is committed, git-native, and re-evaluates on every checkout —
  including a fresh worktree — rather than depending on a piece of local, uncommittable
  filesystem state nobody is told to recreate.

**Result:** the junction was dismantled (`(Get-Item ".codex\hooks").Delete()`, which removes the
reparse point without touching its target — verified `.claude/hooks/*` intact immediately after).
`.codex/hooks` is an ordinary directory again, containing six ordinary files, each now
byte-identical to its `.claude/hooks` counterpart (verified with `cmp`, all six). This also
satisfies the brief's instruction that all three previously-stale copies be brought current: they
now are, along with the two that had real defects.

## Fresh-clone / fresh-worktree answer, stated plainly

**A fresh `git clone` or `git worktree add` produces `.codex/hooks/*.ps1` as six ordinary,
independent files, frozen at whatever content this unit's commit carries — no link, no
junction, nothing "by construction."** That is a genuine limitation this unit does not remove: if
`.claude/hooks/mc-sessionstart.ps1` is fixed again next week in one worktree, every *other*
worktree's `.codex/hooks/mc-sessionstart.ps1` (fresh or pre-existing) sits stale until something
notices. **The parity lint is what notices** — it runs on every `pnpm lint:structure` in every
worktree from its own on-disk files, not from a link that may or may not still exist there — and
that is why it is the fix landed here rather than a backstop for one.

## What changed, per file

| File | Change |
|---|---|
| `.codex/hooks/mc-sessionstart.ps1` | Brought byte-identical to `.claude/hooks/mc-sessionstart.ps1`: adds the D-041 union-glob (`$LEDGERS`/`qa/issues*.jsonl`), the D-034 bold/heading/list-marker `Status:` regex, the max-across-matches `Cycle checked` loop, and (as a side effect of copying current `.claude` content verbatim) the ISS-307 stall-detect fix already landed there today. |
| `.codex/hooks/mc-precommit.ps1` | Brought byte-identical to `.claude/hooks/mc-precommit.ps1`: the same D-034 `Status:` regex fix in the pre-commit warning path. |
| `.codex/hooks/decisions-append-guard.ps1`, `features-snapshot-session-end.ps1`, `lab-session-end.ps1`, `lab-session-start.ps1` | Already byte-identical (or, for `features-snapshot-session-end.ps1`, CRLF-only different) before this unit; unchanged in substance, now covered by the lint below so that stays true going forward. |
| `structure.config.json` | New `codexHooks` block: `mirrorDir`, `sourceDir`, and the six filenames — the single source of truth the new linter reads. Authorized by D-050-CODEX's fallback clause. |
| `scripts/lib/lint-codex-hooks.mjs` | New. For each configured file, compares `.codex/hooks/<name>` to `.claude/hooks/<name>` **modulo line endings** (`\r\n` normalized to `\n` before comparison) and reports a violation on any real content divergence, a missing mirror file, or a missing source file. Exit 0 / non-zero, same `report()` convention as the other `scripts/lint-*.mjs` files. Placed in `scripts/lib/` rather than `scripts/` because `scripts/` is already at its D-018 dirsize override cap of 32 files — adding one more there would itself be a new violation. |
| `scripts/lib/lint-codex-hooks.test.mjs` | New. 6 tests: clean pass, CRLF-only pass, real-divergence fail, missing-mirror fail, missing-source fail, and a pass against the **real repo tree** (not just a fixture) asserting `6 pair(s) compared` — the non-vacuous, decisive check that the fix actually landed. Kept out of `scripts/lint.test.mjs` because that file is held to the strict 300-LOC cap (its `.test.mjs` name doesn't match `structure.config.json`'s `loc.testPatterns`, which only match `.test.ts`/`test_*.py`) and adding these tests there would itself have crossed it — a violation this unit would have introduced discovered and avoided during the build, not left for the checker to find. |
| `package.json` | `lint:structure` now runs `node scripts/lib/lint-codex-hooks.mjs`; `test:lint` now includes `scripts/lib/lint-codex-hooks.test.mjs`, alongside the repo's other `scripts/lib/*.test.mjs` entries (same wiring pattern as `mutate.test.mjs`, `tracker-audit.test.mjs`). |
| `qa/tests/mc-hooks-ledger-union.ps1` | Added an optional `-HookPath` parameter (default unchanged: `.claude/hooks/mc-sessionstart.ps1`), so the existing standing test can be re-run against `.codex/hooks/mc-sessionstart.ps1` to prove behavioral parity through that specific path — reused per the brief rather than inventing a new harness. Backward compatible: the default invocation is untouched. |
| `.codex/hooks.json`, `.claude/hooks/*` | **Not modified**, as instructed. Verified: `git diff --stat .claude/ .codex/hooks.json` is empty. |

## How to verify (commands a checker can re-run)

```bash
# 1. All six mirror files are now identical to their .claude/hooks originals (modulo CRLF/LF):
for f in decisions-append-guard.ps1 features-snapshot-session-end.ps1 lab-session-end.ps1 \
         lab-session-start.ps1 mc-precommit.ps1 mc-sessionstart.ps1; do
  diff --strip-trailing-cr ".codex/hooks/$f" ".claude/hooks/$f" && echo "OK: $f"
done

# 2. The new parity lint passes on the real tree and is non-vacuous:
node scripts/lib/lint-codex-hooks.mjs
node --test scripts/lib/lint-codex-hooks.test.mjs

# 3. The DECISIVE behavioural test (D-041 union fix), reusing the existing standing test against
#    BOTH paths — this is the proof that .codex/hooks/mc-sessionstart.ps1 now reports the UNION
#    count (6, across a 3-file throwaway ledger) rather than the old single-file undercount:
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-ledger-union.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-ledger-union.ps1 \
  -HookPath ".codex/hooks/mc-sessionstart.ps1"

# 4. Sanity: the two other standing hook tests still pass (unaffected — .claude/hooks untouched):
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-stall-detect.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-bolded-status.ps1

# 5. .claude/hooks and .codex/hooks.json are untouched:
git diff --stat .claude/ .codex/hooks.json     # expect empty

# 6. D-015 reproductions, by issue id (see below).
```

## Actual outputs, pasted verbatim

**Command 1** (all six, `--strip-trailing-cr`):
```
OK: decisions-append-guard.ps1
OK: features-snapshot-session-end.ps1
OK: lab-session-end.ps1
OK: lab-session-start.ps1
OK: mc-precommit.ps1
OK: mc-sessionstart.ps1
```

**Command 2**:
```
lint-codex-hooks: OK (6 pair(s) compared)
```
```
✔ lint-codex-hooks: passes when the mirror file matches its .claude/hooks original
✔ lint-codex-hooks: CRLF-vs-LF alone is NOT a violation
✔ lint-codex-hooks: fails when mirror content actually diverges
✔ lint-codex-hooks: fails when a mirror file is missing entirely
✔ lint-codex-hooks: fails when the .claude source itself does not exist
✔ lint-codex-hooks: passes on the REAL repo tree (proves the fix landed, not just the test)
tests 6, pass 6, fail 0
```

**Command 3** — default (`.claude` original):
```
  PASS  counts the union (6), not the canonical file alone (2)
  PASS  reports how many files the union covered (3)
  PASS  excludes files not matching issues*.jsonl
  PASS  no ledger present still reports UNKNOWN, not 0
RESULT: PASS (4/4 assertions)
```
**Command 3** — via `.codex/hooks/mc-sessionstart.ps1` (identical, proving the mirror behaves the
same, not just that it reads the same on inspection):
```
  PASS  counts the union (6), not the canonical file alone (2)
  PASS  reports how many files the union covered (3)
  PASS  excludes files not matching issues*.jsonl
  PASS  no ledger present still reports UNKNOWN, not 0
RESULT: PASS (4/4 assertions)
```

**Command 4**:
```
mc-hooks-stall-detect.ps1: RESULT: PASS (4/4 assertions)
mc-hooks-bolded-status.ps1: TOTAL: 8 checks, 0 failed.
  RESTORE VERIFIED byte-identical (Get-FileHash) — the pre-fix/post-fix mutation swap this test
  performs on .claude/hooks/{mc-sessionstart,mc-precommit}.ps1 was cleanly reverted.
```

**Command 5**: empty output (confirmed no diff).

## D-015: measured against ISS-355's own recorded reproductions, by issue id

ISS-355 lists 5 reproductions. Re-run verbatim, not substituted:

| # | Reproduction | Result before this unit (per ISS-355's evidence) | Result now |
|---|---|---|---|
| 1 | `git ls-tree -r 8669919 --name-only \| grep '^.codex/hooks'` | empty (historical fact about repo state before `eff401b`) | unchanged — historical, not a defect to fix |
| 2 | `git show eff401b --stat` | shows the original unauthorized add | unchanged — historical, not a defect to fix |
| 3 | `diff .codex/hooks/mc-sessionstart.ps1 .claude/hooks/mc-sessionstart.ps1` | showed union-glob, D-034-regex, max-cycle differences | **empty diff** — fixed |
| 4 | `diff .codex/hooks/mc-precommit.ps1 .claude/hooks/mc-precommit.ps1` | showed the same regex difference | **empty diff** — fixed |
| 5 | `grep -rn codex docs/DECISIONS.md` | zero hits (no authorization) | **14 hits**, including D-050-CODEX and D-051 — authorization now on record |

**3/3 of the reproductions that describe the actual defect (not repo-history forensics) are
closed.** Reproductions 1–2 are permanent historical facts about a commit that already happened;
they are correctly left unchanged rather than reinterpreted as still-open findings — nothing in
this unit's scope claims to rewrite git history.

ISS-268 has no separate machine-reproducible repro list (its own text is the disposition
question, since superseded/answered by ISS-355 + D-050-CODEX per its own `checker_note`). Its
disposition — "sanction with a both-files-change rule, or remove/gitignore" — is answered by this
unit: sanctioned, with the parity-lint rule, and the authorizing entry now exists.

No reproduction is left open silently; none needed to be.

## Ledger discipline

Per the ledger-union rule (D-019), the union of `qa/issues.jsonl` + `qa/issues.*.jsonl` was
checked before allocating anything: master has allocated up to ISS-363. **This unit files no new
issue** — the maker never edits `qa/issues.jsonl` status fields (checker-owned per project
CLAUDE.md); ISS-355 and ISS-268 are left `open` for `/checker` to close against the evidence
above, not self-marked fixed here.

## Mutation-run safety (D-020, amended by D-050-SPEAKER ruling 3)

- **Per-mutation byte backup**: all six `.codex/hooks/*.ps1` copied to the scratchpad
  (`codex-hooks-links/codex-<name>.ps1.bak`) and verified with `cmp` before the first mutation.
  During the link investigation, an additional in-`$env:TEMP` snapshot of the fully-fixed content
  was taken before dismantling the junction, and used to repopulate `.codex/hooks` as plain files.
- **Trap on all exits**: every probe used `try/finally` (the two hard-link breakage tests) or an
  explicit restore-then-verify sequence; no probe was left applied on any exit path, including the
  two that deliberately broke a link.
- **`cmp`-verified restores**: every restore point in this manifest is followed by a `cmp` or
  `Get-FileHash`/`diff` check showing the restore succeeded, not merely attempted.
- **Post-run check that every touched file still matches HEAD**: `.claude/hooks/*` — confirmed
  zero diff against HEAD (`git status --short .claude/hooks/` → empty); `.codex/hooks/*` — the
  two real changes (`mc-sessionstart.ps1`, `mc-precommit.ps1`) are the intended, reviewed diff
  shown above, and all twelve files (six `.codex` + six `.claude`) were re-parsed successfully
  with `[scriptblock]::Create((Get-Content -Raw <file>))` after the final state was reached (all
  12: PARSE OK).
- **No PROBE-MARKER strings remain anywhere**: `grep -rln "PROBE-MARKER" .claude/hooks/
  .codex/hooks/` → empty.
- **Timeout**: the probes here are direct, single-invocation PowerShell calls (no loops, no
  mutation harness), so no `timeout` wrapper was needed in the sense `scripts/lib/mutate.mjs`
  provides; `mc-hooks-bolded-status.ps1` (which this unit only *ran*, did not modify) already
  wraps its own hook invocations in `Start-Job`/`Wait-Job -Timeout` per its existing D-020
  compliance.

## Capability-coverage table

| Capability | Falsifying edit | Result |
|---|---|---|
| Parity lint catches real divergence | `lint-codex-hooks.test.mjs`: mirror content set to `'STALE'` vs source `'FIXED'` | FAILS with exact file names named (verified) |
| Parity lint tolerates CRLF/LF-only difference | same test file, CRLF source vs LF mirror, same logical content | PASSES (verified) — matches `features-snapshot-session-end.ps1`'s real, accepted state |
| Parity lint catches a missing mirror file | mirror file simply not created | FAILS, names the missing path (verified) |
| Parity lint catches a missing source file | source file simply not created | FAILS, names the missing path (verified) |
| Parity lint passes on the real, fixed repo tree | run with `--root` = actual repo root, no fixture | PASSES, `6 pair(s) compared` (verified — this is the control row proving the check isn't vacuous against real content) |
| `.codex/hooks/mc-sessionstart.ps1` reports the UNION count | ran the existing `mc-hooks-ledger-union.ps1` test against the `.codex` path via the new `-HookPath` param | 4/4 PASS, identical to the `.claude` control run (verified) |
| `.codex` mirror unaffected by unrelated hook logic | ran `mc-hooks-stall-detect.ps1` and `mc-hooks-bolded-status.ps1` (both target `.claude/hooks` only, as controls) | both pass, confirming this unit did not disturb `.claude/hooks` (verified) |
| `.claude/hooks/*` and `.codex/hooks.json` untouched | `git diff --stat .claude/ .codex/hooks.json` | empty (verified — control row for the "must not modify" constraint) |
| All 12 hook files still parse as valid PowerShell | `[scriptblock]::Create(...)` on all 12 | all PARSE OK (verified) |

## Fix cycle: 0

**Status:** ready-for-check
