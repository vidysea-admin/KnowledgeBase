# Verdict: codex-hooks-links

**Cycle checked:** 0
**Date:** 2026-09-28
**Checker:** fresh Claude Sonnet subagent, read-only toward the artifact, bound to `D:\KnowledgeBase`
**Compared against:** HEAD `f8fc81e` (worktree `worktree-agent-a6831e0acd90211ee`,
`D:\KnowledgeBase\.claude\worktrees\agent-a6831e0acd90211ee`), working tree clean at time of check.
No formal `qa/contracts/<feature>.md` or `qa/adapter.json` exists for this unit; it is a
decision-driven remediation (D-050-CODEX + ISS-355 + ISS-268), so the dispatch's 8 numbered
"claims to re-derive" serve as the acceptance criteria.

## What I independently re-ran (not trusted from the manifest)

1. `git diff --stat .claude/ .codex/hooks.json` → empty. `git diff --stat qa/issues.jsonl` → empty
   (maker did not touch the ledger). `git status --short` → clean.
2. `diff --strip-trailing-cr` on all six mirror pairs → all six `OK`. Additionally ran **raw**
   `diff` (no CR-strip) on `mc-sessionstart.ps1` and `mc-precommit.ps1` specifically (the two with
   real prior content regressions) → **byte-identical**, stronger than the manifest's own claim.
3. `node scripts/lib/lint-codex-hooks.mjs` → `OK (6 pair(s) compared)`. `node --test
   scripts/lib/lint-codex-hooks.test.mjs` → 6/6 pass.
4. `qa/tests/mc-hooks-ledger-union.ps1` run both with default path and `-HookPath
   .codex/hooks/mc-sessionstart.ps1` → identical 4/4 PASS output both times (union count 6, not 2).
5. `qa/tests/mc-hooks-stall-detect.ps1` and `qa/tests/mc-hooks-bolded-status.ps1` → both pass,
   confirming `.claude/hooks` undisturbed and byte-hash-verified restore.
6. `node scripts/lint-loc.mjs` (same 4 pre-existing violations), `node scripts/lint-dirsize.mjs`
   (same 1: `apps/api/src` 32/31 — confirmed `scripts/lib/` placement did **not** trip a new
   dirsize violation; `structure.config.json`'s override for `scripts` is 32, unaffected),
   `node scripts/lint-root.mjs` (same 1: 17 loose files), `node scripts/snapshot.mjs --check`
   (still stale, unrelated), `node scripts/tracker-audit.mjs --gate g1,g4` (same 5 G4 findings) —
   all baseline claims re-derived as **sets**, not just counts; nothing attributable to this unit.
7. Parsed all 12 hook files (`.claude/hooks/*` ×6, `.codex/hooks/*` ×6) with
   `[scriptblock]::Create(...)` → all PARSE OK. `grep -rln PROBE-MARKER .claude/hooks/
   .codex/hooks/` → empty.
8. `git log -S -- .codex/hooks` era history and the ISS-355 ledger row's own `"reproductions"`
   array cross-checked verbatim against the manifest's D-015 table — the 5 rows match exactly;
   reproductions 1–2 (`git ls-tree` at `8669919`, `git show eff401b --stat`) are correctly treated
   as immutable historical fact, not reinterpreted. `grep -c -i codex docs/DECISIONS.md` → 20 hits
   now (manifest reported 14 via a different grep invocation; both are decisively nonzero against
   the recorded zero — no discrepancy that matters).
9. Confirmed `.github/workflows/ci.yml` runs `pnpm lint:structure` on both `push` and
   `pull_request` — the new lint is **CI-enforced**, not an optional local command.

## Independent falsification (own throwaway copies, never the bound tree)

**Central technical claim — re-derived from scratch, not from the manifest's transcript.** Built a
bare scratch git repo (outside the bound root) and reproduced each mechanism myself:

- Hard-linked two files, then did a plain `Node fs.writeFileSync` write-replace on one side (the
  write pattern this class of tooling uses) → the link severed silently (both sides read back
  different content, `fsutil hardlink list` dropped to one path). Repeated with `git checkout` of
  an existing file in the pair → same silent severing. This independently corroborates probes 3–4
  of the manifest with different tooling than the manifest used.
- Created a directory junction, `git add -A`'d its contents → `git ls-files -s` showed plain
  `100644` blobs, exactly as claimed — git genuinely has no object type for a junction.
- Committed that state and did a **fresh `git clone`** (not `git worktree add`, an even stronger
  test) → the clone's copy is an ordinary file with no `LinkType` at all, and editing the
  "source" side in the clone did **not** propagate to the "mirror" side. This is decisive,
  independent proof of the manifest's sharpest claim: a fresh clone/worktree of a junction-backed
  tree yields six ordinary, unlinked files, silently.

**Parity-lint discrimination — re-derived with my own edit, not the manifest's test fixture.**
Built a second, minimal throwaway copy (`structure.config.json` + `scripts/lib/{lint-codex-hooks,
walk}.mjs` + both hook dirs) outside the bound tree. Confirmed green baseline, appended one
comment line to `.codex/hooks/mc-precommit.ps1` → lint went red naming that exact file; restored
and flipped line endings only (no content change) → lint stayed green. This satisfies the row
"Parity lint catches real divergence" / "tolerates CRLF/LF-only" independent of the manifest's own
unit-test fixtures, which I also re-ran and which agree.

## The central design question

**Was taking the fallback justified?** Yes. D-050-CODEX's own pre-authorization is worded around
a narrower trigger ("if it does not resolve" under `-File`), and the link **does** resolve under
`-File` — so on the letter, the fallback's stated trigger wasn't hit. But the maker's reasoning,
which I independently reproduced above with different tooling, shows the resolve test was never
the requirement that mattered: it is the survival of `git worktree add` (this repo's routine
concurrency primitive per D-019) that determines whether "impossible to drift by construction" is
actually true, and neither link mechanism survives it — the mirror reverts to six ordinary,
unlinked files with zero signal that anything changed. Shipping a junction and calling ISS-355
closed on the strength of the narrow resolve-test would have been false confidence: this very
worktree is proof, since it was created by `git worktree add` from a commit that has never held a
junction. Reading D-050-CODEX's fallback clause to cover "fails at the point that actually
matters, not just the literal probe" is a defensible, disclosed extension of the decision's own
stated purpose (drift prevention), not a re-litigation of it — and the manifest is transparent
about making that extension rather than hiding it.

The junction-as-hazard argument (invisible to `git status`, a junction-unaware recursive delete
could follow it into `.claude/hooks/`) is also sound and independently plausible given this repo's
own automated mutation-run cleanup (D-020) — I did not need to reproduce a destructive delete to
credit this as a real, not manufactured, risk.

**Does the parity lint answer ISS-355, or reinstate the condition D-050-CODEX wanted to end?**
Both, in a way the manifest is honest about rather than hiding. D-050-CODEX's own text says "the
problem is the copying, not the copier's care" as an argument **for deletion** — but D-050-CODEX
itself already rejected deletion (an unguarded Codex session in a Lab Protocol repo was judged
worse than a stale mirror), before this unit ever ran. Given deletion was off the table and both
link mechanisms are now proven non-durable under this repo's own concurrency model, what's left is
exactly the two options D-050-CODEX itself named: an unenforced copy (which is what produced
ISS-355 and ISS-268 in the first place) or a lint. The lint is **not** "impossible by
construction" — the manifest says so plainly in its own "stated plainly" section, disclosing that
a fresh worktree still starts unlinked and stale until someone runs the check — but it converts
ISS-355's actual complaint (a copy silently diverging for days with zero authorization and zero
detection) into a **CI-enforced, git-native** check that fires on every push and PR, which the
prior state never had. That is a real, verified improvement over the status quo the ledger
described, even though it is a lint someone must keep passing rather than a guarantee. I accept
it as answering ISS-355 on those terms, with the residual gap (a local branch that never gets
pushed can still drift silently until CI or a local `lint:structure` run) treated as a disclosed,
accepted limitation rather than a hidden one.

I did not find a superior alternative the manifest missed: a `.gitattributes` smudge/clean filter
or a post-checkout hook would need to be configured via `git config` on every clone exactly like a
symlink needs re-establishing — same failure class, not an escape from it. A build-time-generation
step is arguably cleaner long-term but is a larger, unauthorized change beyond this unit's scope
and D-050-CODEX's fallback clause; noting it as a future option, not a finding against this unit.

## Ledger disposition (checker call, not the maker's)

Confirmed the maker did not touch `qa/issues.jsonl` (`git diff --stat qa/issues.jsonl` empty).
I moved both rows `open → verified` myself, having independently confirmed (a) the authorizing
entries exist (D-050-CODEX, D-051, both `Approved-by: Umesh`), (b) the three regressions are
actually gone (raw-diff byte-identical + behavioural union-count test), and (c) a durable,
CI-enforced regression check exists and was proven, in a throwaway copy, to both catch a real
divergence and tolerate a CRLF-only one — satisfying the "confirms once that the regression check
fails with the fix reverted" bar in the same pass. `regression_check` set to
`node scripts/lib/lint-codex-hooks.mjs` on both rows. Diff: `qa/issues.jsonl`, 2 lines changed
(ISS-268, ISS-355), nothing else touched.

## Scoreboard

VERDICT: PASS
SCOREBOARD: 8/8 claims evidenced, 0/0 invariants violated (no formal contract; baseline
non-regression fully re-derived as sets)
FAILURES (if any): none
CAPABILITY-COVERAGE: 9/9 rows reproduced (2 independently re-derived in fresh throwaway copies with
my own edits/mechanisms rather than the manifest's fixtures; the remaining 7 re-run and confirmed)
LIVE-BROWSER: not-applicable (changed paths are `.codex/hooks/*.ps1`, `scripts/lib/*`,
`structure.config.json`, `package.json`, `qa/tests/mc-hooks-ledger-union.ps1` — governance/tooling,
no UI surface)
ISSUES-WRITTEN: none — ISS-355 and ISS-268 moved `open → verified` (ledger-owned disposition call,
not a new finding)
EXECUTOR: claude-sonnet-subagent (maker) / claude-sonnet-subagent (checker) — self != executor
holds
EXPLANATION: The manifest's central technical claim (both link mechanisms fail to survive this
repo's routine `git worktree add`/clone concurrency, so a committed parity lint is the durable fix)
was independently reproduced from scratch in throwaway scratch repos, with different tooling than
the manifest used, and held up decisively. All 8 numbered claims in the dispatch were re-derived
directly rather than trusted, `.claude/hooks` and `.codex/hooks.json` are untouched, and baseline
non-regression checks match as sets. The fallback take is a defensible, disclosed extension of
D-050-CODEX's narrow resolve-test trigger rather than a dodge of the harder solution, since the
harder solution (a link) was independently proven not to hold at the point that actually matters
for this repo.
