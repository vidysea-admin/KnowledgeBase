# HUMAN_GATE — two live blind spots in the machine-wide Stop hook, and the fix is outside D-049

**Raised:** 2026-09-28 · by the maker, on `/checker`'s FAIL of `iss-346-round-cap-mechanical-check` cycle 0
**Status:** OPEN — needs the Approver (Umesh). **Nothing has been changed.**
**Blast radius:** `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`, registered as a **Stop** hook in
**user-level** `C:/Users/Lenovo/.claude/settings.json:124` — it fires in **every project on this
machine**, including ones that never saw the authorizing decision.

## First, a correction, because an earlier alarm from this loop was wrong

An earlier tick of mine escalated that *"a machine-wide hook has shipped an under-counting round
cap."* **That was false and is retracted.** Verified directly against the live hook:

- `grep -c 'vLast'` → **0**. The under-counting last-`VERDICT:`-line gate **never shipped**.
- The live hook implements the **cumulative** rule via `Test-VerdictPass` (vocabulary-restricted,
  bold-stripped, multi-form), and its own line 112 names this as *"the one place this deviates from
  'the last VERDICT line is operative'."*
- The merged rival unit **FAILed its own cycle 0** on exactly that premise and calls applying it
  *"reintroducing, not fixing, a real regression."*

**Two independent lanes each stopped it.** The governance worked; my report of it did not.

Also corrected: the D-049 shared-log entry is **not missing** — it exists at
`D:/ai_os/decisions/log.md`, under the 2026-09-28 heading, item 3 being the ISS-346 round cap. It is
**stale**, recording the pre-unit byte-state (`28c1ae44…`, `grep -c 5d6e0994` = 0), which is a real
but much smaller problem than "unwritten".

## The two findings that ARE live

### 1. The canonical-field fix was applied to `ROUNDCAP` and never to the sibling `MAKER` predicate

D-042's canonical `**Handshake status:**` field is honoured by `ROUNDCAP` and **not** by the `MAKER`
predicate **in the same file**, where the miss is **silent**. Reproduced by the checker:

| manifest field | `MAKER` result |
|---|---|
| legacy `Status:` | `BLOCK-MAKER pend=1` — correct |
| canonical `**Handshake status:**` only | `MAKER pend=0`, **no block** |

So a manifest written to the current standard makes the pending-handshake gate go quiet. This is the
ISS-266/ISS-267 class the hook was changed to fix, still live through the other door.

### 2. A unit escapes the cap entirely by naming its seam in prose

An otherwise-identical candidate is **not capped** when its seam is named in prose rather than as a
backticked path (`blocked: True` vs `False`; trace `candidates=1 capped=0`). **18 of 171 real
manifests are already in that shape.** The cap is defeated by prose style, not by intent — and
nothing warns.

## Why the maker is not fixing either

- `.claude/hooks/*` is an **enforcement path**: `Changes-authorized` alone is insufficient; the
  authorizing entry must carry `**Approved-by:** Umesh`.
- **D-049 authorizes the `ROUNDCAP` predicate specifically.** It does not extend to the `MAKER`
  predicate or to the seam-extraction grammar. Reading it as covering them would be exactly the
  "authorization is a waiver" move this project refused for D-043 (see
  `qa/gates/mc-sessionstart-handshake-reader-round-cap.md`).
- The hook lives in `D:/ai_os`, a **separate repo** this project's units cannot commit — which is
  ISS-190, now raised to **critical** by the checker on better grounds than a line count:
  `git -C D:/ai_os status` shows **four** modified enforcement hooks plus shared rules and skills,
  none committed. **One ordinary `git checkout` in an unrelated session silently reverts
  machine-wide enforcement that two units and a verdict now cite.**

## Options for the Approver

1. **Authorize both fixes in one new entry** (`Approved-by: Umesh`, naming the `MAKER` canonical-field
   audit and the prose-seam grammar), then build and check them as one unit. Closes both doors.
2. **Authorize only the `MAKER` canonical-field fix** — the narrower, higher-severity one — and file
   the prose-seam class for later. The cap keeps a known bypass.
3. **Commit `D:/ai_os` first, then decide** (ISS-190). Argument for going first: until those four
   hooks are committed, any fix can be silently reverted by an unrelated session, so fixing before
   committing builds on sand.
4. **Neither** — record both as accepted, documented limits of the cap.

## What is NOT in question

- The `ROUNDCAP` predicate's authorization is sound: D-049 names the ISS-346 check, carries
  `Changes-authorized: …delivery-gate-stop.ps1 (machine-wide)` and `**Approved-by:** Umesh`.
  The builder's correction of my D-043 citation was right.
- No cap waiver was taken; `mc-sessionstart.ps1` is untouched; its round-cap gate stays OPEN.
- The live hook is byte-unchanged by this gate (`5d6e0994…5162`).
