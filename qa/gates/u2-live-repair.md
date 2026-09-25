# Gate — run (or permit) the U2 live repair of the 24 Sep InFocus session
**Opened:** 2026-09-25T14:0x+05:30 · unit u2-fix1-ingest-guards (fix cycle 1, code at 87df8e8 on wave/u2-fix1-ingest-guards, manifest Status: BLOCKED)
**Why a gate:** the auto-mode classifier refused the repair run ("Modify Shared Resources": writes to main-tree raw/ + data/ and the production lkb Mongo). A refused action is not re-routed through another agent — the human runs it or grants the permission.
**Root causes found (code fixed, unit-tested, not yet live-proven):**
- ISS-305: run-watch.mjs's Mongo connection lacked the `?? "lkb"` DB default (.env has no MONGODB_DB) → indexSession read a different, near-empty DB → "no chunkable turns". The bad watch_state row was ALSO written to that wrong DB (stray row on the Mongo server, outside lkb).
- ISS-304: 55-min long-path threshold let a 49-min file take the unguarded short path → now 40 min + ≥97% coverage guard.
- ISS-306: dot-less Drive title lost its last char ("InFocu"); date came from createdTime → now parsed from title + TOC calendar → `2026-09-24-in-focus`.
**Command (PowerShell, from D:\KnowledgeBase):**
    $env:LKB_MAIN_TREE_ROOT = "D:\KnowledgeBase"
    node D:\KnowledgeBase-lanes\u2-fix1-ingest-guards\scripts\watch\run-watch.mjs --reingest 1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri
    node D:\KnowledgeBase-lanes\u2-fix1-ingest-guards\scripts\watch\run-watch.mjs --dry-run
Effect: deletes ONLY tenant toc rows for sessionId 2026-09-25-infocu (+ its data/toc-migrated dir), re-transcribes (Gemini, approved) under 2026-09-24-in-focus with the coverage + chunk guards. Idempotent.
**Options:** (a) run the command above; (b) allow this action class for Claude in permission settings, then say "run the repair"; (c) leave the bad session as is (it stays 84% + unsearchable).
**Blocks:** U2 fix-cycle close-out → merge → U6 scheduled watcher (must not schedule a watcher known to mis-ingest); U4 dashboard data.
**Also open (same session):** qa/gates/zoom-bot-signin.md (before Sun 10:00) · U5 auto-record blocked by classifier (per-meeting approval vs fully automatic).
