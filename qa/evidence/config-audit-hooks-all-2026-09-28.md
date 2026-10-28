# AIOS Config Audit — Hooks (all six) — 2026-09-28

**Mode:** 1 (security audit), scoped to `.claude/hooks/*` per dispatch. Read-only throughout; no
hook, settings.json, CLAUDE.md or decision was modified in producing this report.

**Grade: F (28 / 100)**

Read that number correctly before anything else: **zero Critical findings** (no command
injection, no hardcoded secret, no `dangerouslyDisableSandbox`, no hook that self-modifies
`settings.json`). The score is driven entirely by three High and five Medium findings, most of
which are specific to the custom deliverable this dispatch asked for — the authorization-diff
against `docs/DECISIONS.md` and a per-hook prompt-injection sweep — rather than the skill's
generic command-injection/secrets checklist, which came back clean. The `F` band's own
description ("do not ship... unaddressed critical") does not literally fit a zero-critical result;
I report the arithmetic honestly per the skill's scoring rule and flag this tension rather than
rounding up. Treat this as: **no smoking gun, but the paper trail and the injection surface are
both worse than either of today's two scoped self-audits found**, because neither was scoped to
look at what I found.

## Progress checklist

- [x] Step 1: Inventory (six `.claude/hooks/*.ps1`, `.claude/settings.json`, `.codex/hooks/*` mirror + `.codex/hooks.json`, `docs/DECISIONS.md`)
- [x] Step 2: CLAUDE.md scan (not re-run in full; project CLAUDE.md rules are the standard this audit measures against, not a separate scan target this time)
- [x] Step 3: settings.json scan (wiring table below)
- [x] Step 4: hooks scan (six files read in full, each assessed against the skill's hook table)
- [x] Step 5: N/A this dispatch (agents/skills out of scope; hooks-only per instruction)
- [x] Step 6: Grade + report (this document)

---

## PART 1 — The authorization diff (the core deliverable)

Method used: grepped every `**Changes-authorized:**` line in `docs/DECISIONS.md` (48 hits),
checked each for a same-entry `**Approved-by:**`, ran `git log --follow` per hook to get every
commit that touched it, diffed each substantive commit against its cited entry's scope, and
cross-checked the two existing scoped audits (`config-audit-ledger-shard-union-reader-2026-09-28.md`,
`config-audit-iss-307-stall-detect-2026-09-28.md`) against the live file rather than trusting them.

| Hook | Last substantive change (SHA, date) | Authorizing entry | `Approved-by`? | Verdict |
|---|---|---|---|---|
| `decisions-append-guard.ps1` | `738b6df` 2026-09-05 (ASCII-escape sync to AIOS template) | D-011 | Yes (Umesh) | **AUTHORIZED** — current content verified byte-identical to the live AIOS template (`diff` returned nothing) |
| `features-snapshot-session-end.ps1` | `795bd90` 2026-09-03 (created) + `a32da03` 2026-09-03 (wired) | D-009 | Yes (Umesh), but **only for the `settings.json` registration** | **PARTIALLY AUTHORIZED** — the hook's own code was never named in any `Changes-authorized` field anywhere in the log |
| `lab-session-end.ps1` | `26065f8` 2026-09-03 (genesis `/init-lab`; never modified since) | D-000 | **No `Approved-by` field at all** | **UNAUTHORIZED by the repo's own rule** — mitigated in practice (content is byte-identical to the shared `D:/ai_os/templates/lab-protocol/hooks/` template), but a template match is not a substitute for the citation the project CLAUDE.md requires |
| `lab-session-start.ps1` | `738b6df` 2026-09-05 (current content, D-011); base from `26065f8`/D-000 | D-011 (current) / D-000 (base) | D-011: Yes; D-000: No | **AUTHORIZED for current content** — D-011's citation is "byte-identical to the AIOS template," which covers the whole file, so it supersedes the D-000 gap in practice |
| `mc-precommit.ps1` | `58cfaf0` 2026-09-27 (D-034 status pattern) | D-006 → D-014 → D-020 → D-034, chained | Yes at every step | **AUTHORIZED** — diffed all four substantive commits (`2be1a47`, `917aa1b`, `6a57bae`, `58cfaf0`) against their cited scopes; each matches exactly, no drift |
| `mc-sessionstart.ps1` | `bdc755b` 2026-09-28 (citation rename only) | D-006 (creation) → **`795bd90` FEATURES.jsonl block: no citation** → D-034 → D-041 → D-050-SPEAKER ruling 2 → D-051/`bdc755b` (comment fix) | Mixed — D-006/D-034/D-041/D-050-SPEAKER all carry Umesh; the `795bd90` addition carries none | **PARTIALLY AUTHORIZED** — every cited change is clean and drift-free, but two live code blocks (detailed below) are unaccounted for in the authorization chain |

**Out of scope, noted for context only:** DECISIONS lines 301/665/974/920 authorize
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` and `aios-write-guard.ps1` — machine-wide hooks
outside this repo's six, not part of this table. `aios-write-guard.ps1` matters below because it
is the compensating control for one finding.

### Drift check detail (the part scoped audits don't do)

I diffed every commit in each hook's `git log --follow` history against its cited
`Changes-authorized` text, not just the newest one:

- `mc-precommit.ps1`: `2be1a47` (D-006, creation) → `917aa1b` (D-014, "add one narrow deny branch
  on a non-empty `qa/.mutations-active`; no other behavior change") → `6a57bae` (D-020, "ledger
  path resolution only") → `58cfaf0` (D-034, "status pattern only"). Each diff matches its cited
  scope exactly — no unauthorized hunk in any of the four commits.
- `mc-sessionstart.ps1`: five substantive commits. Four are clean (`2be1a47`/D-006, `58cfaf0`/D-034,
  the ledger-union hunk authorized by D-041, the ISS-307 hunk authorized by D-050-SPEAKER ruling 2).
  **The fifth, `795bd90`, is not clean** — see Finding H2 below.

---

## PART 2 — Findings

### High

**H1 — `.codex/hooks/mc-sessionstart.ps1` and `.codex/hooks/mc-precommit.ps1` are live, wired, and
reintroduce three defects their `.claude/` originals already fixed.**

`.codex/hooks.json` wires all six `.codex/hooks/*.ps1` files by absolute path
(`d:\KnowledgeBase\.codex\hooks\...`) on `PreToolUse` (Bash|PowerShell), two `SessionStart` events
and two `SessionEnd` events — this is a live, executing configuration, not a dormant copy. All six
files still carry an identical mtime of `2026-09-24 23:08:xx` (verified with `ls -la`), confirming
D-050-CODEX's own provenance analysis that this was a one-shot Codex setup, not a maintained mirror.

Verified content, line-ending-normalized (`diff <(tr -d '\r' ...) <(tr -d '\r' ...)`):
- `decisions-append-guard.ps1`, `lab-session-end.ps1`, `lab-session-start.ps1` — **identical** to
  `.claude/` (byte-for-byte after normalizing line endings).
- `features-snapshot-session-end.ps1` — identical content, differs **only** in line endings
  (CRLF vs LF) — cosmetic.
- `mc-precommit.ps1` — **one real divergent line**: still the pre-D-034 naive
  `'Status: ready-for-check'` substring match instead of the bolded/heading-tolerant pattern.
- `mc-sessionstart.ps1` — **51 divergent lines** (LF-normalized `diff` count): still the single-file
  `$LEDGER = 'qa/issues.jsonl'` (pre-D-041, under-counts open issues by the same 21-row gap D-041
  measured), still the naive Status match and first-not-maximum verdict cycle (pre-D-034), and
  **the ISS-307 fix is entirely absent** — it still reads only the oldest line of `qa/.last-tick`
  and substring-matches `STALLED|EXHAUSTED` anywhere in the tick's prose, i.e. the exact
  false-negative/false-positive pair D-050-SPEAKER ruling 2 fixed on the `.claude/` side is still
  live for any Codex session.

D-050-CODEX (Approved-by: Umesh) already authorizes converting these six files to symlinks/junctions
pointed at the `.claude/` originals, closing this permanently — **but that conversion has not been
executed**. Until it is, any session opened through the Codex CLI in this repo runs governance
hooks that under-report open issues, miss bolded manifest handshakes, and never raise a stall
banner regardless of what `qa/.last-tick` actually says. This is precisely ISS-355's own "high"
rating, independently reconfirmed here rather than inherited.

**H2 — `mc-sessionstart.ps1` lines 73–85 (the FEATURES.jsonl "anti-cyclic guard"): no authorizing
citation, and it emits free-text ledger content verbatim into SessionStart context.**

```
73  # T-017b feature-level anti-cyclic guard (mirrors the decision-level DECISION INDEX above):
74  # surface any removed/updated docs/FEATURES.jsonl row from the last 30 days.
75  if (Test-Path 'docs/FEATURES.jsonl') {
...
83    Write-Output ("FEATURE CHANGED: " + $evt.feature + " " + $evt.event + " on " + $evt.date + " -- " + $evt.reason)
84    }
85  }
```

This block was added in `795bd90` ("feat(T-017b): SNAPSHOT.md generator + FEATURES.jsonl ledger"),
the same commit that created `features-snapshot-session-end.ps1`. Its own commit message says the
SessionEnd hook's *settings.json wiring* "needs its own DECISIONS entry" (which D-009 then supplied)
— but D-009's `Changes-authorized` field names only `.claude/settings.json`. No entry anywhere in
`docs/DECISIONS.md` names `mc-sessionstart.ps1` for this addition. It is not covered by D-006
(creation, scoped to "mc session-start + commit guard" as a skeleton, predates T-017b by hours on
the same day) or by any later entry.

Beyond the paperwork gap, this is a live, unaudited **prompt-injection surface**: `$evt.reason` is
free text from a `docs/FEATURES.jsonl` row (schema-validated for structure only — `appendEvent`
validates against `schema/features_event.schema.json`, which constrains shape, not content), and it
is concatenated verbatim into a `Write-Output` line that becomes part of the SessionStart
`additionalContext` payload. This hook's own header states plainly: *"SessionStart stdout is
injected into the agent's context — a directive here is read as an instruction, not just a status
line."* Neither existing scoped self-audit examined this block (both were scoped to their own diff
hunks — lines 5–13 for the ledger union, lines 47–71 for the ISS-307 fix); this is exactly the class
of gap a diff-scoped self-audit cannot see and a full sweep exists to catch.

**H3 — `mc-sessionstart.ps1` lines 47–49 (`qa/.regrill-due` passthrough): raw file content reaches
SessionStart context verbatim, dormant today but live code.**

```
47  if (Test-Path 'qa/.regrill-due') {
48    $first = Get-Content 'qa/.regrill-due' -TotalCount 1
49    if ($first -match '^(\d{4}-\d{2}-\d{2})') { if ([datetime]$Matches[1] -le (Get-Date)) { Write-Output ("RE-GRILL DUE: " + $first + " -- HUMAN_GATE: run /grill on that topic before continuing.") } }
50  }
```

The gate is only that the line **starts** with a date; everything after the date — the whole rest
of `$first` — is emitted verbatim inside an instruction-shaped sentence ("... HUMAN_GATE: run
/grill on that topic before continuing."). `qa/.regrill-due` does not currently exist on disk
(verified), so this is dormant, not exploited — but it is live code, predates both scoped
self-audits (it is not part of either audited diff hunk), and is the same injection shape the
ISS-307 audit itself treated as worth a dedicated section when it *removed* one instance of this
pattern. This one was never touched.

### Medium

**M1 — D-000 (genesis) carries no `Approved-by` field; `lab-session-end.ps1`'s entire authorization
rests on it.** `lab-session-end.ps1` has been modified exactly once in this repo's history —
created by `26065f8`/D-000 and never touched since. D-000's own text has a `**Links:**` field but no
`**Approved-by:**` field anywhere in the entry — the only one of the entries I read that omits it
entirely. The project's own rule is explicit: *"Enforcement paths... Changes-authorized alone is
NOT enough — the authorizing entry MUST carry Approved-by."* D-000 fails that bar for all three
files it created (`decisions-append-guard.ps1`, `lab-session-start.ps1`, `lab-session-end.ps1`),
though D-011 later re-authorizes the first two with a proper Approved-by citation ("byte-identical
to the AIOS template," which I verified still holds). `lab-session-end.ps1` never got that
follow-up. Practical risk is low — content matches the shared, presumably-reviewed
`D:/ai_os/templates/lab-protocol/hooks/lab-session-end.ps1` template byte-for-byte — but a template
match is not the citation the repo's own rule requires.

**M2 — `features-snapshot-session-end.ps1`'s own code was never named in a `Changes-authorized`
field.** Same shape as M1: D-009 authorizes the `settings.json` wiring only; nothing authorizes the
hook file's content, which was written the same day under D-006-era enforcement (D-006 names only
"mc session-start + commit guard").

**M3 — `mc-sessionstart.ps1:9` silent error suppression — reconfirmed still open.** The
2026-09-28 ledger-union scoped audit (Grade A, 94/100) already found this
(`-ErrorAction SilentlyContinue` on the `qa/` enumeration cannot distinguish "absent" from
"unreadable") and proposed a fix. I independently re-read the current file and confirm the fix has
not been applied — the finding still applies verbatim. Carried forward, not double-counted as new.

**M4 — `mc-sessionstart.ps1:9` glob wider than D-019's shape — reconfirmed still open.** Same
audit's Low finding (`issues*.jsonl` matches more than the canonical + lane-shard shape); still
unaddressed on the current file. Carried forward.

**M5 — `mc-precommit.ps1:33-36` passes raw external-process output into a PreToolUse `deny`
reason, unsanitized.**
```
33    $mut = & node scripts/lib/mutate.mjs assert-clean 2>&1
34    if ($LASTEXITCODE -ne 0) {
35      $reason = "BLOCKED: a mutation is still armed -- committing now could ship deliberately broken source. " + ($mut -join ' ')
```
`$mut` (the node script's stdout+stderr) is concatenated verbatim into `permissionDecisionReason`,
which the agent sees. In practice, `mutate.mjs assertClean()` only ever emits `r.path` values it
read from `qa/.mutations-active`, a ledger the maker/checker tooling itself writes when arming a
mutation — not adversarial input in the sense the skill's checklist worries about — so realized risk
today is low. But it is the same unmitigated pattern class (unsanitized file/process-derived text
reaching agent-facing output) as H2/H3, just with a currently-trusted source.

### Low

**L1 — `decisions-append-guard.ps1` is not registered in this repo's `.claude/settings.json` —
documented, approved, and compensated, not a live gap.** By the mechanical hygiene definition
("script on disk no settings entry references") this is an orphan. It is a *deliberate* one: D-023
(Approved-by: Umesh) removed the redundant project-level registration because the user-global
`aios-write-guard.ps1` already covers this repo (it walks up from any target path to find
`docs/DECISIONS.md`). I verified the compensating control is still live:
`C:/Users/Lenovo/.claude/settings.json:102` still registers
`powershell ... -File D:/ai_os/.claude/hooks/aios-write-guard.ps1` on PreToolUse. No action needed;
noting it so a future mechanical orphan-scan doesn't re-raise it without this context, and because
D-023 itself flags the dependency as worth keeping visible.

**L2 — `mc-precommit.ps1`'s PreToolUse registration in `.claude/settings.json` has no explicit
`timeout`, unlike all five other hook entries (which specify 10 or 15).** Falls back to Claude
Code's default. Not dangerous — `mc-precommit.ps1` only spawns `node` when the tool call contains
`git commit` — but it's an inconsistency worth a one-line fix for uniformity.

---

## PART 3 — Settings.json wiring (verified, not inferred)

| Hook | Registered? | Event | Timeout |
|---|---|---|---|
| `lab-session-start.ps1` | Yes | SessionStart (`startup\|resume\|clear`) | 15s |
| `mc-sessionstart.ps1` | Yes | SessionStart (all matchers) | 15s |
| `lab-session-end.ps1` | Yes | SessionEnd | 10s |
| `features-snapshot-session-end.ps1` | Yes | SessionEnd | 10s |
| `mc-precommit.ps1` | Yes | PreToolUse (`Bash\|PowerShell`) | **none set** (L2) |
| `decisions-append-guard.ps1` | **No** | — | — (L1, compensated) |

No dead entries (every registered command points at a file that exists). One orphan (L1,
compensated). No duplicate registrations.

---

## PART 4 — `.codex/hooks/` disposition (see H1 for the live-bypass finding)

D-050-CODEX (Approved-by: Umesh, 2026-09-28) authorizes replacing all six `.codex/hooks/*.ps1`
files with symlinks/junctions to their `.claude/hooks/` originals, and requires verifying the Codex
CLI resolves a Windows symlink before converting all six. **That verification and conversion have
not happened** — the six files are still plain, divergent copies with a shared mtime of
2026-09-24 23:08, three of which (as detailed in H1) are stale in ways that matter operationally,
not just cosmetically.

---

## PART 5 — Prompt-injection surface, per hook (explicit per-hook check as requested)

| Hook | Writes to stdout? | File/ledger-derived free text reaches it? |
|---|---|---|
| `decisions-append-guard.ps1` | Yes (PreToolUse `permissionDecisionReason`) | No — all strings are hardcoded literals plus `$rel`, a normalized path derived from the *current* tool call's own `file_path` (same-turn, same-agent-controlled input, not cross-session) |
| `features-snapshot-session-end.ps1` | Yes (SessionEnd, one line) | No — the only output is a fixed literal string |
| `lab-session-end.ps1` | Yes (SessionEnd) | No — only an integer count (`$dirtyCount`) is emitted |
| `lab-session-start.ps1` | Yes (SessionStart `additionalContext`) — **by far the widest surface** | **Yes, extensively and by design.** Injects up to 100 lines of `ARCHITECTURE.md` verbatim, the full DECISIONS index, archived REJECTED lines, and up to 60 lines of the last 3 full DECISIONS entries verbatim. This is the mechanism the Lab Protocol is built on (session start must show ground truth), not a bug — but it means anyone who can get prose into `ARCHITECTURE.md` or `docs/DECISIONS.md` controls a large block of future-session "instructions." Both files are guarded (DECISIONS.md hard-denied except via `append_decision.ps1`; ARCHITECTURE.md gated by the `Changes-authorized` + human-approval rule), so this is an **acknowledged, structurally-necessary design tradeoff**, not scored as a new finding — but it is the highest-value target if either guard is ever weakened, and worth Umesh knowing it's this wide. |
| `mc-precommit.ps1` | Yes (PreToolUse, WARN and DENY) | Partially — see M5 (external process output, low-trust-but-not-zero) |
| `mc-sessionstart.ps1` | Yes (SessionStart, largest banner of the maker-checker layer) | **Yes — see H2 and H3.** Everything else emitted (`$n`, `$LEDGER` count string, `$queue`, age strings, `$pendTxt`/`$unclosed` manifest **basenames**, and post-fix `$status` which is now one of exactly two literals) is either a count or a name chosen by the maker's own tooling — I independently re-verified the two existing scoped audits' claims here and they hold. The two exceptions are H2 (`$evt.reason`) and H3 (`$first`), both free text from files nothing prevents from containing arbitrary content. |

---

## Grading math

Start at 100.
- Critical: 0 × 30 = **0**
- High: 3 × 15 = **45** (H1 `.codex` stale+wired mirror; H2 FEATURES.jsonl no-citation + injection; H3 `.regrill-due` passthrough)
- Medium: 5 × 5 = **25** (M1 D-000 no Approved-by; M2 features-snapshot content uncited; M3 silent error suppression, carried; M4 wide glob, carried; M5 unsanitized process output)
- Low: 2 × 1 = **2** (L1 documented orphan; L2 missing timeout)

100 − 45 − 25 − 2 = **28 → Grade F** per the skill's 0–39 band, with the caveat stated at the top:
this is a zero-critical result and the band's own prose ("do not ship") does not map cleanly onto
what was actually found — a governance paper-trail with real gaps plus two narrow, currently
low-blast-radius injection surfaces, not a live exploited vulnerability. I show the arithmetic
rather than override it; if Umesh judges H2/H3 to be Medium rather than High (both are dormant or
narrow-source today), the score moves to 100−30−40−2=28... recompute: 2 High + 6 Medium + 2 Low =
100−30−30−2=38, still F. Even the most charitable reasonable re-scoring stays in D/F territory
because of the sheer count of open items across five of six files, which is itself the finding: the
authorization discipline this repo prides itself on (D-019's "DECISIONS is guarded" claim) has more
holes than either prior scoped self-audit — each honestly scoped to its own diff — could have found.

## What's NOT a finding (checked, and clean)

- **No command injection** in any of the six hooks — no `${...}` shell interpolation of untrusted
  data into a command position; `git commit` detection in `mc-precommit.ps1` is a `-match` test on
  the hook's own JSON input, not passed to a shell.
- **No hardcoded secrets** in any hook.
- **No `dangerouslyDisableSandbox` or "allow" permission decisions** — every hook that emits a
  `permissionDecision` uses only `deny` or `ask`, consistent with `decisions-append-guard.ps1`'s own
  comment warning against ever emitting `allow`.
- **No hook modifies `.claude/settings.json` or itself.**
- **`mc-precommit.ps1`'s D-014/D-020/D-034 chain is clean** — verified line-by-line against each
  cited scope; no drift.
- **ISS-364's specific evidentiary claim does not fully hold up under direct re-reading — noted for
  the record, not as a finding against this audit's scope, since it's about a different session's
  commit.** ISS-364 (open, high, in `qa/issues.jsonl`) and `bdc755b`'s own commit message assert that
  commit `0cf1b17`'s message "describes `.codex/hooks` authorization and cites no ruling for" the
  ISS-307 stall-fix diff it carries. Direct read of `git log -1 --format=%B 0cf1b17` shows a
  dedicated paragraph: *"Also committed here: the ISS-307 stall-banner fix to mc-sessionstart.ps1,
  found uncommitted in the working tree. It IS authorized -- by D-050-SPEAKER ruling 2, which names
  that file and those lines and carries Approved-by -- so it is committed rather than reverted,
  after checking the diff against that scope."* That is an explicit ruling citation with
  Approved-by, not an absence of one, and the commit's primary subject is D-051 (the duplicate-D-050
  id collision), not `.codex/hooks` — `0cf1b17` never touches `.codex/`. The real, still-valid part
  of ISS-364 is narrower than its own evidence field claims: the code diff and its full authorship
  narrative *are* split across two commits (`0cf1b17` has the diff + a correct citation; `ca86e53`
  has the rationale, the scoped self-audit and the regression test but — per `git show --stat
  ca86e53` — no `.claude/hooks/mc-sessionstart.ps1` line at all), which is still a real
  pathspec-discipline defect worth the fix ISS-364 proposes. I am not closing or amending ISS-364 —
  editing the ledger is a checker action — but flagging that its evidence text should be corrected
  by whoever next touches it, since a reader who verifies it before disambiguating "no ruling cited"
  will find the opposite.

## Decisions needed from Umesh (ordered by severity, one line each)

1. **[H1]** `.codex/hooks/mc-sessionstart.ps1` and `mc-precommit.ps1` are live, wired, and stale by three fixed-on-`.claude`-side defects — approve executing D-050-CODEX's already-approved symlink/junction conversion now, or approve temporarily unwiring `.codex/hooks.json` until it lands.
2. **[H2]** `mc-sessionstart.ps1` lines 73-85 (FEATURES.jsonl guard) has no `Changes-authorized` citation and emits free-text `$evt.reason` into SessionStart context — approve a backfill DECISIONS entry, and separately approve either accepting the injection surface or truncating/sanitizing `$evt.reason` before it reaches `Write-Output`.
3. **[H3]** `mc-sessionstart.ps1` lines 47-49 (`qa/.regrill-due` passthrough) emits a raw file line verbatim into SessionStart context — approve narrowing the emitted text to just the matched date, or accept the dormant risk as-is.
4. **[M1]** D-000 (genesis) has no `Approved-by` field, leaving `lab-session-end.ps1`'s whole authorization resting on it — approve a short backfill entry citing D-000 and confirming the file (which matches the shared AIOS template) with a proper `Approved-by`.
5. **[M2]** `features-snapshot-session-end.ps1`'s own code content has never been named in any `Changes-authorized` field (only its wiring, via D-009) — approve the same kind of backfill entry.
6. **[M3/M4]** Apply or explicitly decline the two still-open fixes from the 2026-09-28 ledger-union scoped audit on `mc-sessionstart.ps1:9` (absent-vs-unreadable `qa/` distinction; tighten the `issues*.jsonl` glob to the D-019 shape).
7. **[M5]** Decide whether `mc-precommit.ps1`'s pass-through of `mutate.mjs assert-clean` output into a deny reason needs sanitizing, or is acceptable given the ledger's trusted, same-loop provenance.
8. **[L1]** Confirm you're comfortable with `decisions-append-guard.ps1`'s protection in this repo depending on the user-global `aios-write-guard.ps1` staying registered (D-023) — no action needed today, just a sign-off that the dependency is intentional and understood.
9. **[L2]** Approve adding an explicit `timeout` to `mc-precommit.ps1`'s PreToolUse entry in `.claude/settings.json` for consistency with the other five hook registrations, or accept the default as-is.

## Confidence note

Every finding above is stated at >80% confidence based on direct file reads, `git log`/`git show`
evidence, and byte-level diffs I ran myself (not inherited from either prior scoped audit, both of
which I independently re-verified rather than took on faith, per the dispatch's instruction). The
one item flagged as genuinely uncertain is the severity calibration itself (H2/H3 vs Medium) —
that judgment call is called out explicitly in the grading-math section rather than hidden inside
a number.
