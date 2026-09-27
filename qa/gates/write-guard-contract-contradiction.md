# HUMAN_GATE — write-guard-enforcement-gaps: contract contradiction blocks convergence

**Question:** `write-guard-enforcement-gaps` is STALLED at cycle 3 of max 3 (verdict
`qa/verdicts/write-guard-enforcement-gaps.md` `Cycle checked: 3`, commit `5231a42`, FAIL 4/7,
ISS-180 high). The stall diagnosis (`qa/debug/write-guard-enforcement-gaps-cycle3.md`,
2026-09-09) classified it **LOOP-DESIGN**: `qa/contracts/write-guard.md` **C1** ("deny when
the file exists, silent when absent") directly contradicts **I2** ("path-shape, not
path-existence, decides"). Three cycles hardened the matcher (I2's half); the `\\?\`
extended-length survivor lives in the existence probe that C1 licenses — a verify surface
derived from that contract cannot fail on that input by construction.

**Options:**
- **A — Amend the contract first.** `qa/contracts/write-guard.md` is checker-owned: resolve
  the C1/I2 contradiction (existence never decides; creation-time paths deny-by-default),
  then open a NEW unit under the amended contract. (The stall diagnosis's own smallest
  recovery.)
- **B — Accept the residual `\\?\` gap** as documented risk; close the unit STALLED with the
  exposure recorded in the ledger.
- **C — Fresh unit, different mechanism** (e.g. canonicalise via .NET GetFullPath + strip the
  `\\?\` prefix before probing) — note this still needs the contract amended first, since the
  current verify surface cannot fail on the input by construction.

**Answer format:** `write-guard-contract-contradiction: A|B|C`

**Blocks:** any further fix cycle on the write-guard seam (`aios-write-guard.ps1`). Does not
block other units.

**Opened:** 2026-09-22 — maker tick reconciling the STALLED pair; no gate file existed for
this unit (its sibling stall `delivery-gate-manifest-blindness` is already covered by
`qa/gates/mc-hooks-manifest-blindness.md`).

**Answered:** <pending>
---

**Answered:** 2026-09-25 — **Fix authorised** — Umesh (AskUserQuestion, 2026-09-25) on the config audit's Critical C1: the guard fails OPEN on its own deny via `$ErrorActionPreference=Stop` + an outer `catch { exit 0 }`, reachable through a Windows extended-length path prefix to docs/DECISIONS.md and settings.json. Authorised: make the deny path fail-CLOSED, strip the extended-length prefix before the existence probe, add a fixture asserting a THROWN EXCEPTION never yields an allow, and correct ISS-180's recorded root cause (it blames Test-Path; the real mechanism is the fail-open catch). Requires a DECISIONS entry carrying Approved-by: Umesh.

**Gate status:** ANSWERED — recorded inline: 2026-09-25 — **Fix authorised** — Umesh (AskUserQuestion, 2026-09-25) on the config audit's Critical C1: the g
