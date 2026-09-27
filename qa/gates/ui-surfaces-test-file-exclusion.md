# HUMAN_GATE — should `qa/ui-surfaces.json` exclude `*.test.*` from the D-024 browser trigger?

**Raised:** 2026-09-09 by the `vacuous-evidence-probes` cycle-1 checker (Mode A + Mode D)
**Approver:** Umesh
**Answered:** —

## The single question

> Approve narrowing `qa/ui-surfaces.json`'s pattern so that a path matching `\.(test|spec)\.`
> before its `.tsx/.jsx/.vue/.svelte/.html/.css` extension does **not**, on its own, make a unit
> UI-touching for the D-024 live-browser gate — written as a `D-NNN` entry via
> `append_decision.ps1` carrying `**Approved-by:** Umesh`, since `qa/ui-surfaces.json` is read by
> `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` and this narrowing weakens a gate.

## Why it is being asked

`vacuous-evidence-probes` changed exactly four files: `apps/web/src/pages/AskPage.test.tsx` and
three under `qa/**`. The `.tsx` extension alone matched the pattern, so the gate demanded a live
browser run for a unit in which **no runtime surface changed** — the test file is not in the
shipped bundle and no runtime module imports it. The Playwright profile was also locked, so the
unit came within one judgement call of being blocked on a browser run that could not have observed
anything it changed.

## The checker's recommendation: APPROVE, with the reasoning recorded in the file

- Correct on the merits — a `*.test.tsx` edit cannot alter a rendered surface.
- The exclusion is safe **because the gate is evaluated over the unit's whole changed set**: a
  test-file change that accompanies a real UI change still trips the gate on the other file. That
  sentence should go into `qa/ui-surfaces.json`'s `why_the_indirect_ones_are_here` block (or a new
  `why_tests_are_excluded` block) if this is approved, so a later reader cannot mistake the
  exclusion for "test changes are never UI-relevant".
- It is nonetheless a gate weakening, and D-024's own text warns that "an exemption that arrives by
  accident is the failure this whole rule exists to stop". An exemption that arrives because an
  agent found the gate inconvenient is the same failure with better manners — hence the Approver,
  not the checker or the maker.

## What does NOT depend on this answer

Nothing is blocked. The `vacuous-evidence-probes` verdict PASSed on an explicit checker ruling that
the unit is **not-applicable** for Mode D on the merits (changed set is one test file plus `qa/**`),
with the instrument lock recorded separately as `LIVE-BROWSER: SKIP`. This gate exists so the next
test-only unit does not have to re-derive that ruling by hand — it is a durability question, not a
blocker.

**Gate status:** OPEN — still unanswered, opened 2026-09-09, the oldest live gate in this directory. Field added 2026-09-28: the ISS-348 canonicalization left this file unstamped because its markers matched no known convention, and sweep shard 2 has since read it in full and confirmed `**Answered:** —` is accurate. Absent from the count is not the same as answered, which is exactly the gap ISS-348 exists to close
