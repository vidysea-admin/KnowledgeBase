# HUMAN_GATE — two different units share the slug `iss-346-round-cap-mechanical-check`

**Status:** OPEN — needs the Approver (Umesh). **Nothing has been overwritten. No merge was completed.**
**Raised:** 2026-09-28, by the maker orchestrator, on attempting to merge worktree
`agent-a035913864247fa58` into master.

## What happened, mechanically

`git merge --no-ff worktree-agent-a035913864247fa58` returned **`CONFLICT (add/add)`** on BOTH
handshake files:

```
CONFLICT (add/add): Merge conflict in qa/manifests/iss-346-round-cap-mechanical-check.md
CONFLICT (add/add): Merge conflict in qa/verdicts/iss-346-round-cap-mechanical-check.md
```

`add/add` is the signal that matters: neither side descends from the other. Two loops each
*created* a manifest and a verdict at the same two paths, in separate worktrees, against the same
ledger row (ISS-346).

I ran `git merge --abort`. Master is at `e76b354`, unchanged by this attempt; my branch is intact.

## The two units

| | master (`e76b354`) | branch `worktree-agent-a035913864247fa58` |
|---|---|---|
| manifest | 627 lines, first line `# iss-346-round-cap-mechanical-check` | 513 lines, first line `# Manifest — iss-346-round-cap-mechanical-check` |
| handshake | `**Handshake status:** checked-PASS` | `ready-for-check`, `Fix cycle: 1 of max 3` |
| verdict | `**Cycle checked:** 1` → `**VERDICT: PASS**` (newest-first), cycle 0 FAIL below | `Cycle checked: 0` FAIL, then `Cycle checked: 1` FAIL (appends downward) |
| closed out at | `97756f5` | not closed out — held on this gate and on `maker-predicate-canonical-field-and-prose-seam.md` |
| commits | `26bd6a2`, `3d68219`, `2776aac`, `97756f5` | `610ed0e`, `8eb96d6`, `baea349`, `8ac0582` |

**They are the same investigation, reached independently.** Master's says the ROUNDCAP work was
*"already landed by a concurrent lane, and this unit did NOT write it"*; mine says
*"`ROUNDCAP` and `Get-ManifestSeam` already existed — they shipped in `delivery-gate-machine-wide-fix`"*.
Both then audited the existing predicate and both found the code fix was not theirs to make. So this
is **duplicated effort across two loops**, not two conflicting accounts of the truth. That is the
cheaper reading, and it is the one the evidence supports.

## Why I did not resolve it myself

- Master's copy is **PASSed and closed out.** Merging mine writes a `FAIL` at `ready-for-check` over
  a closed record. A checker's PASS is not the maker's to displace, and "resolve the conflict" here
  means exactly that.
- Taking master's side instead **discards a checked verdict** (`8ac0582`, cycle 1) and the audit
  behind it. Neither direction is a merge; both are a deletion wearing a merge's clothes.
- Renaming my branch's files to a distinct slug is the obvious remedy — and it renames a
  **checker-authored verdict**, whose path is the handshake channel. The maker does not edit verdicts.
  It is the Approver's call whether a rename counts as transport or as an edit.

## What I did land, and why it is safe

`qa/issues.a035913.jsonl` had **no conflict** — it is a clean add of 11 rows, and the shard was not
previously tracked on master. I staged it from the branch and verified it is the **same git blob**
(`45061ef0122d33f00537196360f268f12ec2c213` on both sides), so it lands byte-for-byte as the checker
wrote it, with nothing authored by me.

That matters because of what is in it: **`ISS-A035913-011`, severity `high`, status `open`** — the
cycle-1 checker independently found that `.claude/hooks/mc-precommit.ps1:43`'s pending-unit regex
does **not** match a manifest carrying only D-042's canonical `**Handshake status:**` field
(verified live: legacy match `True`, canonical-only match `False`). That is a **third**
contract-named artifact with the same live, silent, undisclosed blindness, and D-019 says every
reader takes the union of the shards — so a finding stranded on an unmerged branch is invisible to
the sweep, the tracker audit and the open-issue count. Leaving it there was the larger risk.

## Decision needed

1. **Rename my branch's pair to a distinct slug** (e.g. `iss-346-roundcap-cross-hook-audit`) and
   merge it alongside master's, so both records survive. Requires your ruling on the maker renaming a
   checker-authored verdict path.
2. **Retire my branch as duplicated effort**, keeping master's PASSed unit as the record — but first
   transplant the two findings master's unit does not contain (`ISS-A035913-011`; the prose-seam
   `18/171` measurement, independently derived three times) into a fresh unit.
3. **Something else** — including that the duplication itself is the finding worth fixing, since
   nothing stopped two loops from claiming one ledger row.

## The structural point, stated once

D-019 fixed concurrent loops colliding on **issue ids**. This is the same failure one level up: the
**manifest and verdict paths are a shared namespace with no allocator**, and they are the handshake
itself. A collision there does not produce a wrong id in a citation — it produces two units that
cannot both be recorded. Worth a decisions entry whichever option you pick.

**Links:** ISS-346 · ISS-A035913-011 (high, open) · D-019 · D-049 · D-052 ruling 1 ·
`qa/gates/maker-predicate-canonical-field-and-prose-seam.md` (also OPEN) ·
`qa/verdicts/iss-346-round-cap-mechanical-check.md` (master's PASS · branch's cycle-1 FAIL `8ac0582`)
