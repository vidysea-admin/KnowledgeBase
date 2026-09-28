# HUMAN_GATE — D-043 item 3 is authorized on the enforcement path but FAILS D-014's round cap

**Opened:** 2026-09-28
**Unit it blocks:** the `**Handshake status:**` reader in `.claude/hooks/mc-sessionstart.ps1`
(ISS-350 reproduction 2; D-043 authorized fix item 3)
**Status:** OPEN — needs the Approver
**Decision needed from:** Umesh (this repo's named Approver)

## The two gates are independent, and only one of them clears

D-043 carries `**Approved-by:** Umesh` and its `Changes-authorized` names
`.claude/hooks/mc-sessionstart.ps1` for exactly this change ("parse `**Handshake status:**` for the
pending/closed-out counts"). So the **enforcement-path gate clears.**

D-014's **round cap** is a separate gate and it does not. Measured on disk this tick:

| seam | verdicts that MENTION the file | PASSed units whose manifest `## What changed` NAMES it |
|---|---|---|
| `.claude/hooks/delivery-gate-stop.ps1` | 3 | **0** |
| `.claude/hooks/mc-sessionstart.ps1` | 7 | **3** |

The three that actually touched `mc-sessionstart.ps1` and PASSed:
`T-017b-snapshot-features-ledger`, `ledger-shard-union-reader`, `mc-hooks-bolded-status`.

The project CLAUDE.md "Round cap" rule: non-security findings are capped at **2 PASSes** on that
seam; "Before pulling a non-security unit, count prior PASSed verdicts naming the same seam; at >=2,
skip it and say so. If a seam looks unsafe past the cap, raise a `HUMAN_GATE` — do not open round
N+1." This change is a handshake-state reader. It is **not** security class (not tenancy, auth,
cross-tenant read, data write, or credential handling), so the cap applies to it. The count is 3.

## Why this is not being decided by the maker

D-044 shows what an intentional cap waiver looks like: it "waives D-014's round cap once" for a
named seam, in so many words. **D-043 contains no such clause.** Reading an enforcement-path
authorization as also silently waiving the round cap would be the maker granting itself an exception
the Approver did not write — which is the precise shape of the failure both rules exist to stop.

So D-043 item 3 is held, not built, and this file is the record.

## What makes this uncomfortable, stated honestly rather than buried

The capped seam is **the reader that computes what work exists.** D-043's own `Why` says so: "The
session-start hook printing `Checks pending: 0` over an unanswered cycle-1 FAIL (ISS-350) is a defect
in the mechanism that decides what work exists; while it stands, every tick's inventory is computed
by a reader that cannot see the contract."

That is a real argument for waiving the cap here, and it should be weighed. It is also exactly the
argument a grinding loop would make about its own favourite file, which is why it is the Approver's
call and not the maker's. Note that the cap is currently doing visible work on this file: three
separate units have already landed in it.

## The options

1. **Waive the cap once for this seam and this fix** (the D-044 pattern) — append a DECISIONS entry
   saying so explicitly, with `Approved-by`. The unit then becomes buildable immediately.
2. **Hold it until ISS-346 lands** (the round-cap mechanical check, authorized by D-043 item 2 and
   dispatched this tick, seam PASS count 0 so it is freely pullable). Then the cap is machine-checked
   rather than argued, and this decision is made once against a working instrument. D-043's own
   `Result` already sequences item 2 first, "because it is the mechanical check that governs the
   D-044 cap waiver taken in the same session".
3. **Rule that `mc-sessionstart.ps1` is not one seam** — it is a session-start banner composed of
   several independent predicates (ledger count, pending handshake, stall detect, FEATURES.jsonl,
   pause/auto-continue), and the cap is meant to stop a *seam* grinding, not a *file* accumulating
   unrelated predicates. This would be a general amendment to how the cap counts, not a one-off
   waiver, and it would need its own reasoning since it weakens the cap everywhere.
4. **File-don't-fix** — accept that `Checks pending` / `PASS not closed out` are computed from a
   bolded-`Status` grep and keep ISS-350 reproduction 2 open permanently. Costs: the inventory that
   drives every tick stays wrong in the direction of reporting less work than exists.

**Recommended: 2, then decide between 1 and 3 with the mechanical check in hand.** Nothing is lost by
waiting one unit, and option 3 is a rule change that deserves to be made against measurements rather
than against this one file.

## Links
D-043 (Approved-by: Umesh, item 3), D-044 (the explicit-waiver precedent), D-014 (class-based cap),
D-013 / project CLAUDE.md "Round cap", ISS-350, ISS-346, D-042.
