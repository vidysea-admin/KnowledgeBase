# DECISIONS.md — append-only history (Lab Protocol v1.1 semantics)

> The ONLY write path is `scripts/append_decision.ps1`. Direct edits are denied by the
> PreToolUse guard. See `D:/ai_os/templates/lab-protocol/DECISIONS.schema.md` for the schema.

## D-000 | 2026-09-03 | type: decision | status: ACTIVE
**What:** Adopted the Lab Protocol for `D:\KnowledgeBase` at the root level. Accepted three
documents as the canonical basis for this project: `goal.md` (the CEO-call transcript — source
of truth for the vision), the "Knowledge Base" Google Slides deck (64 slides / 58 real product
screens — the target product surface, screenshots archived at `reference/kb-deck-screens/`),
and `Living-Knowledge-Base-Architecture.html` (the already-piloted TOC-slice ingest→index→
query→maintain architecture). `TOC/` and `whatsapp_msg/` are established as knowledge *sources*
feeding one root knowledge base, not separate products — `TOC/` folds directly into this repo's
governance; `whatsapp_msg/` keeps its own separate Lab Protocol repo (own `.git`,
ARCHITECTURE.md, DECISIONS.md) since it was already governed independently, and is referenced
from here rather than duplicated.
**Why:** The CEO's stated goal (an AI counsellor that beats top human counsellors, run as a
public AI-vs-human championship) requires a knowledge base disciplined enough to trust as the
counsellor's memory. Umesh confirmed mid-session that the competition/championship framing IS
the long-range plan for this directory (not out of scope as first assumed), that "brain kind of
stuff, properly set up in the database and hosted" is the required foundation, and that work
here should run maker-checker style (`/maker` + `/goal`) rather than ad-hoc.
**Result:** Root `ARCHITECTURE.md`, this file, `contracts/` (empty), `TASKS.md`, repo-committed
enforcement hooks, and `.claude/CLAUDE.md` scaffolded. `git init` run at root (fresh repo, no
prior history). Full feature inventory (60+ maker work units across Learn/Remember/Reason/
Improve/Platform/Operations) captured in the approved plan file
`C:\Users\Lenovo\.claude\plans\thik-hai-and-you-nested-cat.md`.
**Links:** plan file above; genesis commit (this commit).

## D-001 | 2026-09-03 | type: session | status: ACTIVE
**What:** Backfilled project history prior to Lab Protocol adoption (interview deferred to
T-000, answered inline instead of a separate `/init-lab resume` round since the context was
already gathered this session). Key prior decisions: (1) built
`Living-Knowledge-Base-Architecture.html` as a hybrid vectorless-tree + CRAG design for the TOC
slice, piloted end-to-end on the 27th-August-In-Focus session only; (2) chose Gemini
(`gemini-3.5-transcribe` + `gemini-3.7-flash`) as the primary transcription/diarization
pipeline with local `/transcribe` (faster-whisper) kept as fallback, after the local pipeline
hit a real `cublas64_12.dll` dependency failure on the original 23-session run; (3) built
`whatsapp_msg/` as a separately-governed, read-only, multi-tenant WhatsApp archiver, not yet
pointed at any TOC/expert group; (4) manually built `KNOWLEDGE-BANK.md` (240-line synthesis of
all 23 TOC sessions) and a by-month Google Sheet before any of this was automated.
**Why:** Preserve the reasoning behind pre-protocol choices so future sessions don't relitigate
them from scratch.
**Result:** Recorded here; no code changed.
**Links:** `TOC/TOC-Materials/KNOWLEDGE-BANK.md`, `Living-Knowledge-Base-Architecture.html`,
`whatsapp_msg/docs/DECISIONS.md` (that repo's own independent decision log).

## D-002 | 2026-09-03 | type: decision | status: ACTIVE
**What:** Meeting/webinar capture mode = SILENT FULL CAPTURE (Option B of the product brief), not announced-bot (A) or notes-only tiered (C). Every captured fact must be diarized and cited with who said it, when, and in which session, so the team can return to that expert for guidance. Recordings are to be purged after processing to a defined level; the purge design is explicitly deferred (T-026).
**Why:** Founder's stated requirement: organizers often do not provide recordings; Vidysea attends as a paid member and wants its own copy for manual review and to feed the counsellor brain. Provenance is what makes the resulting knowledge defensible and actionable.
**Result:** Legal/reputational exposure noted once and accepted by the Approver: India DPDP Act 2023 notice obligation for identifiable audio/video; platform T&Cs commonly prohibit recording; two-party-consent jurisdictions abroad; discovery risks bans from the communities that form the moat. Mitigations designed in: consent_policies row exists (default silent-full, switchable), provenance is a frozen invariant (no turn without speakerRef, no claim without evidence), retention field added now so purge is a migration later.
**Changes-authorized:** ARCHITECTURE Â§3 (H3 provenance becomes the basis for a future frozen contract; add H8 capture-mode hypothesis); ARCHITECTURE Â§6 (Q4 resolved, Q6 purge level added)
**Approved-by:** Umesh
**Links:** T-024, T-011, T-026; plan file section 6c.0

## D-003 | 2026-09-03 | type: decision | status: ACTIVE
**What:** Stack = TypeScript pnpm monorepo (packages/{core,db,ai,ingest,index,ask,meeting-bot}, apps/, workers/), Python only in isolated ML workers. Existing Python units (tree_index/, ask_router/) are ported to TS with tests first; schema/ JSON Schemas remain the single source of truth with TS types generated from them. whatsapp_msg/ becomes a workspace source (submodule), not the product shell.
**Why:** Designed against the D:\erp failure audit: two checkouts, 5k-line god-files, 32 schemas in one file with dated patch migrations, a 1,105-line duplication map, 6k lines of onboarding prose. Baileys and Playwright are Node-native; a single service language plus generated types removes hand-copied field lists.
**Result:** Hard CI budgets adopted: 300 LOC per file (tests 400), 30 files per dir, root <= 15 loose files, one exported symbol per concept, ARCHITECTURE.md <= 150 lines, migrations only via migrate-mongo.
**Changes-authorized:** ARCHITECTURE Â§4 (directory map replaced by the monorepo tree); ARCHITECTURE Â§5 (add file/size/dependency budgets); ARCHITECTURE Â§6 (Q2 resolved)
**Links:** T-016, T-017, T-018; plan file section 6c.1

## D-004 | 2026-09-03 | type: decision | status: ACTIVE
**What:** Meeting-bot and transcription vendor = self-hosted Vexa (Apache-2.0) with Whisper diarization as the default, behind a pluggable STT seam (packages/ai/stt) so an API key for an advanced model such as gemini-3.5-transcribe can be supplied and preferred. Recall.ai rejected.
**Why:** Corpus must not transit a third party; open-source keeps control and cost near zero; the seam preserves the option to use the better diarization already validated on the 27th-August pilot.
**Result:** Market scan recorded in plan section 6c.2 (Recall, Vexa, Meeting BaaS, Deepgram, AssemblyAI, Jina, Firecrawl, Tavily; Fireflies/Otter/Onyx rejected).
**Changes-authorized:** ARCHITECTURE Â§3 (add H9 pluggable STT); ARCHITECTURE Â§6 (vendor question closed)
**Links:** T-024, T-019; plan file section 6c.2

## D-005 | 2026-09-03 | type: decision | status: ACTIVE
**What:** AI backend = Gemini-first (purchased Gemini API tokens carry 80-90% of the load; Google-side monthly budget is the cap). Claude is used through the same OAuth login flow as the claude CLI (email -> OTP), i.e. Claude Code / Agent SDK under the Max subscription, not API keys. Anthropic Messages API is optional behind a feature flag (off by default) and may be dropped. No budget-guard / throttling work now; a jobs ledger with per-job maxCost only.
**Why:** Founder does not want to manage a second metered budget; Gemini tokens are already purchased; the OAuth flow is how the team already logs in.
**Result:** Routing matrix in plan section 6c.3 re-mapped: Gemini Flash for cheap/many stages, Gemini Pro for claims/answers, Claude Code for agentic/bulk/dev-loop; parity contract test runs Gemini vs Claude Code.
**Changes-authorized:** ARCHITECTURE Â§3 (add H10 provider routing); ARCHITECTURE Â§6 (budget question closed)
**Links:** T-019; plan file section 6c.0 and 6c.3

## D-006 | 2026-09-03 | type: decision | status: ACTIVE
**What:** Install the maker-checker auto-continue enforcement wiring in this repo: project .claude/CLAUDE.md block (on session start, if qa/ shows pending state, run /maker continue before anything else; /checker sweep as manual override), session-start hook printing the AUTO-CONTINUE directive when pending state exists, and the PreToolUse commit guard, via /maker init (idempotent repair).
**Why:** Sweep finding ISS-005: without it the loop advances only when a session explicitly invokes /maker continue; a session opening this repo with pending qa/ state would silently idle. Reversible (/maker pause writes qa/.paused; removing the settings entry disables the directive).
**Result:** Approved by the Approver during the 2026-09-03 grill (Q7). Wiring to be installed by the next /maker init run.
**Changes-authorized:** .claude/CLAUDE.md (maker-checker block); .claude/hooks/* (add mc session-start + commit guard); .claude/settings.json (register the two hooks) -- each is the minimal enforcement addition the maker skill's enforcement-wiring reference specifies.
**Approved-by:** Umesh
**Links:** ISS-005; grill log Q7 in the plan file; T-016 (wiring lands before the restructure unit starts)

## D-007 | 2026-09-03 | type: decision | status: ACTIVE
**What:** The counsellor evaluation question bank draws from three sources: (a) questions asked in TOC/webinar Q&A segments, (b) anonymised questions from Pathlynks counselling sessions, (c) hard questions submitted by each competing counsellor. Pathlynks student data is APPROVED for this single use, conditional on the anonymisation rule below.
**Why:** A realistic bank of real student confusion is the raw material for the head-to-head harness (grill Q1-Q3). Synthetic LLM-generated questions were rejected as the primary bank because they test what a model thinks students ask.
**Result:** Anonymisation rule: strip names, schools, exact scores and dates (bucket to ranges); a human reviews the bank once before it is frozen; the frozen bank carries a content hash so results are comparable across runs. Bank owner for the one-time review: open flag. This entry is the explicit per-use approval the AIOS rules require before any Pathlynks / student-applicant data is touched.
**Approved-by:** Umesh
**Links:** T-012, T-021; grill log Q3

## D-008 | 2026-09-03 | type: decision | status: ACTIVE
**What:** Capture policy is PROVIDED-FIRST and the AI backend is MULTI-PROVIDER. (1) Capture ordering per source: organizer-provided recording -> public recording -> attendee notes/live transcript -> silent capture ONLY when no alternative exists; silent capture remains a supported capability (default policy row silent-full) but is the last resort, never the default path for sources that already share recordings (e.g. TOC). Media purge is GATED: a recording may be deleted only when every claim citing it is marked verified, and a +/-15 s evidence clip per cited turn is retained permanently. (2) AI backend: five provider adapters from day one (gemini, anthropic API key and OAuth/Claude Code modes, openai, ollama, claude-code), each exposing listModels() so the UI/CLI renders a per-provider model dropdown; the provider chain per jobKind is a user-editable ordered list of any length >= 1. Gemini stays the default first provider.
**Supersedes:** D-002, D-005 -- D-002 recorded silent full capture as the flat mode and purge-after-processing without a gate; the grill (Q4, Q12) established that the founder wants provided sources used first (no wasted effort/tokens where recordings are already given) and that ungated purge breaks the who-said-what promise the moment an expert disputes a quote, so provided-first ordering plus a verified-claims gate and retained evidence clips replace it. D-005 recorded that the Anthropic API was optional and might be dropped; the grill (Q5, Q6) established a hard no-single-AI-dependency rule with rotation across Gemini/OpenAI/Ollama/Anthropic and a per-provider model dropdown, so the drop clause is removed while Gemini-first as the default is kept.
**Why:** Founder's explicit rules from the 2026-09-03 grill: silent capture is the final possible weapon, not the daily tool; no AI tool should run on one model; evidence must survive disputes.
**Result:** Design consequences: sources.captureMode in {provided, public, notes, silent} required; media.kind incl. evidence-clip and media.retention added in schema v2 (T-018); packages/ai ships five adapters + listModels() + STT seam (T-019); paste-a-link capture CLI warns before silently joining a provided-recording community (T-024).
**Changes-authorized:** ARCHITECTURE section 3 (H8 capture-mode hypothesis reworded to provided-first; H10 provider routing reworded to multi-provider chain); ARCHITECTURE section 6 (purge level question restated as gated-purge design task)
**Approved-by:** Umesh
**Links:** T-018, T-019, T-024, T-026; grill log Q4, Q5, Q6, Q12; brainstorms/2026-09-03-lkb-counsellor-assumptions.md

## D-009 | 2026-09-03 | type: decision | status: ACTIVE
**What:** Register .claude/hooks/features-snapshot-session-end.ps1 as a second SessionEnd hook in .claude/settings.json, alongside the existing lab-session-end.ps1 entry. On graceful session end, if docs/FEATURES.jsonl changed during the session, it runs node scripts/snapshot.mjs to regenerate docs/SNAPSHOT.md so the next session's snapshot is never stale by more than one session. Always exits 0, fails open on error, same posture as lab-session-end.ps1.
**Why:** T-017b (checker verdict qa/verdicts/T-017b-snapshot-features-ledger.md, cycle 1) FAILed criterion 6a because this specific hook was not covered by D-006's grant (which named only mc-sessionstart.ps1 and mc-precommit.ps1). The script itself was already written and hand-tested by the maker; only the settings.json registration was withheld pending this approval.
**Result:** Approved by the Approver. The pnpm lint:structure staleness gate (criterion 6b, already PASSed) remains the enforcement backstop regardless of whether this hook fires.
**Changes-authorized:** .claude/settings.json (add a second SessionEnd hooks entry for features-snapshot-session-end.ps1, merged alongside the existing lab-session-end.ps1 entry, never overwriting it)
**Approved-by:** Umesh
**Links:** T-017b, ISS-013; qa/contracts/snapshot-features-ledger.md criterion 6a

## D-010 | 2026-09-05 | type: decision | status: ACTIVE
**What:** Rewrite every hook command in .claude/settings.json from `powershell -Command "$i=[Console]::In.ReadToEnd(); & \"$env:CLAUDE_PROJECT_DIR\...\" -InputJson $i"` to `powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/<script>.ps1` for: decisions-append-guard.ps1, features-snapshot-session-end.ps1, lab-session-end.ps1, lab-session-start.ps1, mc-precommit.ps1, mc-sessionstart.ps1. No hook script changes; the scripts already read stdin when -InputJson is empty.
**Why:** Claude Code executes hook commands through bash -c on this machine, which expands `$i` and `$env:...` to empty strings before PowerShell parses the command. Every hook in this repo has therefore failed with a parse error on every invocation since it was installed (evidence: `hook_non_blocking_error` records in the session transcripts; AIOS decisions/log.md 2026-09-05). The append-only DECISIONS guard, the session-start protocol snapshot and the /landplane reminder have never actually run here. Run with -File, the repo copies work (verified in D:/KnowledgeBase on 2026-09-05: lab-session-start injects the snapshot with a RECOVERY warning; decisions-append-guard denies a direct edit).
**Result:** Enforcement becomes live from the next session. The /init-lab template in the AIOS carries the same fix (templates/lab-protocol/project-settings.template.json, commit d2d93a4) so new repos are correct.
**Changes-authorized:** .claude/settings.json (hook command strings only; matchers, timeouts and entries unchanged)
**Approved-by:** Umesh
**Links:** AIOS decisions/log.md 2026-09-05 (two entries: machine-wide hook fix; Lab-repo finding); memory reference_hook_commands_run_under_bash

## D-011 | 2026-09-05 | type: decision | status: ACTIVE
**What:** Sync the committed hook scripts decisions-append-guard.ps1, lab-session-start.ps1 to the AIOS Lab-Protocol template (D:/ai_os/templates/lab-protocol/hooks, commit of 2026-09-05): JSON output is now ASCII-escaped before it is written. Behaviour otherwise unchanged.
**Why:** Under the harness PowerShell writes stdout in the OEM codepage; non-ASCII characters copied from ARCHITECTURE.md / DECISIONS.md into the session-start snapshot became 0x1a bytes inside the JSON string and Claude Code rejected the payload (raw-text fallback + a hook_non_blocking_error per session). Observed in this repo's live session on 2026-09-05 right after the hook commands were rewired (D-010).
**Result:** The session-start snapshot and the append-guard reply are accepted as JSON; no more error records.
**Changes-authorized:** .claude/hooks/decisions-append-guard.ps1 , .claude/hooks/lab-session-start.ps1 (byte-identical to the AIOS template)
**Approved-by:** Umesh
**Links:** AIOS decisions/log.md 2026-09-05 (ASCII-escape addendum); hook-fixtures.ps1 'lab-session-start under chcp 437'

## D-012 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Clarification of D-003's scope: D-003's Changes-authorized field named ARCHITECTURE section 6 Q2 as resolved, but ARCHITECTURE.md's section 6 also carries "CLOSED by D-003: Mongo Atlas Vector Search" against Q5. This entry confirms Q5's closure explicitly rides on D-003's own Result field ("migrations only via migrate-mongo" and the monorepo/schema-source-of-truth decisions that make Mongo Atlas Vector Search the only vector-search option consistent with the adopted stack), so the Q5 closure is authorized retroactively under D-003, not a separate unresolved judgment.
**Why:** ISS-011 (checker-unit, 2026-09-03) found an attribution drift: ARCHITECTURE.md:124 attributes Q5's closure to D-003, but D-003's own Changes-authorized field lists only Q2. This is not a wrong decision -- the D-003 session's reasoning did cover the vector-search question as a natural consequence of the schema/Mongo stack choice -- it is a paperwork gap where the authorizing field was never updated to also name Q5. This entry closes that gap without re-litigating the underlying decision.
**Result:** ARCHITECTURE.md section 6 Q5 ("CLOSED by D-003: Mongo Atlas Vector Search") is confirmed correctly attributed to D-003, now with an explicit authorizing record. No change to ARCHITECTURE.md is made by this entry -- the existing "CLOSED by D-003" text was already correct in substance, only unbacked by D-003's own field. No new decision content is introduced.
**Changes-authorized:** none (this entry does not authorize any new ARCHITECTURE.md or contracts/ edit; ARCHITECTURE.md section 6 Q5's existing text already reads "CLOSED by D-003" and needs no rewording)
**Links:** ISS-011; D-003; ARCHITECTURE.md section 6 Q5

## D-013 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Override the maker/checker backlog priority for THIS repo only, in .claude/CLAUDE.md, under a new "Backlog priority override" section. Four changes: (1) insert a roadmap tier (.goal/goal.json pending tasks with deps met / TASKS.md rows) at position 3 of the backlog priority, above medium-severity issues and contract-gap analysis; (2) severity-gate the ceremony -- full manifest+verdict+contract+close-out only for high/critical and for anything touching auth, tenancy or data writes, with medium getting a one-line ledger entry verified inside the next unit touching the same file and low never being a pulled unit; (3) a round cap declaring any contract seam CLOSED after it has PASSed twice, further findings filed file-don't-fix, escalation to HUMAN_GATE rather than round N+1; (4) ISSUES-WRITTEN: none is an explicitly creditable check, with low-severity observations going to EXPLANATION notes outside the backlog, and BACKLOG_EMPTY redefined to ignore open low-severity issues. The shared AIOS skills at D:/ai_os/.claude/skills/maker and /checker are deliberately NOT edited; blast radius is confined to this repo.
**Why:** Measured on 2026-09-08 across 226 commits over 6 days (2026-09-03 to 2026-09-08): governance prose (qa/manifests + qa/verdicts + qa/contracts) totals 26,019 lines against 9,985 lines of production source; 29,671 lines were added to qa/ against 8,449 to apps/; 152 of 226 commits (67%) touch no source file at all; and of 84 ledger issues, 83 were generated by the loop itself (checker-unit 63, checker-sweep 20, maker 1) with ZERO originating from the product roadmap. The causal mechanism is structural, not behavioural: maker/SKILL.md:243-246 defines the backlog priority as qa/QUEUE.md TODO row, then open ledger issues by severity, then contract-gap analysis, then feedback-inbox -- TASKS.md and .goal/goal.json appear nowhere in the list, so a roadmap task is reachable only when the ledger is empty AND every contract criterion is covered AND the inbox is clear. Meanwhile checker/SKILL.md:127 makes ISSUES-WRITTEN a mandatory verdict field and :185/:252 mandate bypass and silent-failure hunts, so every check including a PASS refills the higher-priority tier, and that emptiness condition is never reached. maker/SKILL.md:22-98 (THE CONTINUATION RULE) then reschedules at 60s indefinitely, stopping only on BACKLOG_EMPTY. Traced instance: search-store-injectable-handle PASSed and wrote ISS-078/079/080/081/082; search-store-tenant-assertion addressed 078/079/080, PASSed, and wrote ISS-083/084; search-store-rank-assertion addressed 083/084 and is round seven on the same seam in a single day -- while T-007, T-008, T-011 (annotated "Umesh 2026-09-07: this is a priority and gets made real"), T-013, T-014, T-015, T-021 and T-022 all sat open and untouched, and all three rows currently in qa/QUEUE.md are sweep-manufactured rather than roadmap-derived. The sweep itself had already written into qa/.last-sweep that round 4 introduced a worse defect than it closed and that the pin class should be declared CLOSED; rounds 5, 6 and 7 proceeded regardless because nothing in the priority list reads that file. 65 of the 84 issues are medium or low severity yet each consumed the same full ceremony as the one genuine cross-tenant read disclosure.
**Result:** The verification mechanism is preserved intact for the cases that justified it -- high/critical severity and anything touching auth, tenancy or data writes still get the full manifest+verdict ceremony that caught the cross-tenant read disclosure invisible to all 102 tests. What changes is that roadmap work becomes reachable and that a seam cannot be re-opened indefinitely by its own PASS verdicts. Success is measured two ways: a /maker continue tick selects a T-### roadmap unit rather than a qa/QUEUE.md row (observable in qa/.last-tick), and the share of commits touching no source file falls below 40% from the current 67%. This entry authorizes the .claude/CLAUDE.md edit only; it does not authorize any change to ARCHITECTURE.md, contracts/, .claude/hooks/*, .claude/settings.json or scripts/append_decision.ps1.
**Changes-authorized:** .claude/CLAUDE.md (append one new section "Backlog priority override" after the existing "Maker-checker discipline" section; no existing line in that file is modified or removed)
**Approved-by:** Umesh
**Links:** T-011, T-021; ISS-071; qa/gates/golden-set-redesign.md; qa/.last-sweep; qa/QUEUE.md; maker/SKILL.md:243-246; checker/SKILL.md:127

## D-014 | 2026-09-08 | type: decision | status: ACTIVE

**What:** Restate D-013's maker-checker backlog override with ONE rule corrected: the round cap
becomes CLASS-based, not count-based. A contract seam closes after 2 PASSes for ordinary findings
(coverage, cost, style, doc accuracy, N+1, unasserted fields), but findings in the SECURITY CLASS
(tenancy, auth, cross-tenant read, data write, credential handling) are NEVER capped and always
open a unit at any round count. Everything else in D-013 is carried forward verbatim: the backlog
priority order with the roadmap as tier 3, the severity gate, the verdict rule that
"ISSUES-WRITTEN: none" is a complete check, and the redefined BACKLOG_EMPTY.
Additionally authorizes a single narrow DENY path in .claude/hooks/mc-precommit.ps1: refuse a
git commit while qa/.mutations-active is non-empty. The hook stays WARN-only for everything else
and must still never emit "allow".

**Why:** D-013's cap said "a seam that has already PASSed twice is CLOSED". Measured against what
actually happened on this repo, that rule would have shipped a high-severity data leak. ISS-078,
the cross-tenant read disclosure that let any authenticated caller read every tenant's verbatim
transcript text, was first found at ROUND 5 of the search seam, after FOUR consecutive PASSes on
that same seam, and it had survived 102 green tests and a clean typecheck. A count-based cap
assumes severity decays with round count; the one time it mattered here, severity spiked at round
5. The class-based cap keeps D-013's real benefit (it stops the 7-round grind on unasserted test
fields) without the failure mode that would have closed the seam two rounds before the leak was
found. Separately, D-013's stated root cause that checker/SKILL.md:127 requires every check to
emit issues is factually wrong: line 127 is the output field "ISSUES-WRITTEN: <ISS-ids | none>",
which explicitly permits none. No rule ever demanded issues. The real cause of 84 self-generated
issues was the maker's own checker dispatch prompts repeatedly instructing checkers to "then try
to find a fifth/eighth bypass" - a prompt defect, fixed in the dispatch template, not by
overriding a rule that does not exist. The deny path is authorized because a mutation
(score: 0.5) was found applied to production source in apps/api/src/search-store.ts AFTER its
checker had verified the restore as byte-identical; nothing in the repo would have caught it, and
git log --all -S confirms it was caught before any commit only by timing.

**Result:** .claude/CLAUDE.md's "Backlog priority override" section is replaced by the same content
with the class-based cap. mc-precommit.ps1 gains one deny branch guarded on qa/.mutations-active.
The mutation helper reuses the existing, tested scripts/lib/evidence.mjs (trustOf /
untrustedAmong) rather than adding new git logic.

**Changes-authorized:** .claude/hooks/mc-precommit.ps1 (add one narrow deny branch on a non-empty
qa/.mutations-active; no other behavior change) . .claude/CLAUDE.md (replace the round-cap
paragraph inside the existing "Backlog priority override" section; the rest of that section is
unchanged)

**Approved-by:** Umesh

**Supersedes:** D-013 -- D-013's count-based round cap would have closed the search seam after
round 4, two rounds before ISS-078 (a cross-tenant read disclosure) was found at round 5 following
four consecutive PASSes; this entry keeps every other part of D-013 and replaces only that cap
with a class-based rule that never caps security-class findings.

**Links:** qa/issues.jsonl ISS-078 . qa/issues.jsonl ISS-085 . qa/manifests/search-store-injectable-handle.md . qa/gates/concurrent-maker-sessions.md . qa/feedback-inbox.md

## D-015 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Add a rule to .claude/CLAUDE.md, under the maker-checker section, requiring that when a work unit's stated purpose is to fix a filed issue, its standing regression test must re-run that issue's OWN recorded reproductions verbatim from qa/issues.jsonl, and the manifest's Evidence section must report the resulting count against that corpus by issue id (e.g. "ISS-093: 15/20 refused"). Authoring an additional corpus is encouraged; SUBSTITUTING one for the ledger's recorded cases is not. Where a recorded reproduction is deliberately not closed, the manifest must name it and say why, rather than omitting it from the measurement.
**Why:** Measured on this repo 2026-09-08 across three consecutive fix cycles of the unit speaker-verbatim-token-boundary. Cycle 3 responded to ISS-093, whose ledger row recorded 20 concrete attack reproductions and whose fix_direction named the target set explicitly as "prepositions/particles to/so/back/not". The maker added to, so and back, missed not, then measured 12/12 against a 12-case corpus it authored during that same cycle and reported that as the result. Re-running ISS-093's own 20 cases gives 15/20, and surfaces "I am Not sure about that." still shipping person:not -- a closed-class function word, inside the failing criterion, and named by that exact word in the issue the unit existed to close. The checker found it in cycle 3; the maker could have found it in cycle 1 at zero cost by re-running the ledger. The defect being corrected here is therefore not the missing word, which is a one-line remedy, but the measurement habit: a fix measured against a corpus its own author chose is marking homework with an easier exam, and it is the mechanism by which a unit can pass three cycles while its originating issue stays open. This also explains a pattern visible across the same seam: three separate test-fixture rewrites over three cycles, each individually justified and each disclosed, but none of them anchored to the ledger's recorded cases.
**Result:** The maker-checker pair keeps its existing division -- the checker still owns qa/contracts/ and remains the only entity that can PASS -- but the maker can no longer report a self-selected denominator when a filed issue is in scope. The measurable effect is that an issue's recorded reproductions become the floor of the regression suite, so an issue cannot be reported closed while its own evidence still fails. Cost is small: re-running a recorded corpus is mechanical and the cases already exist in qa/issues.jsonl. This entry authorizes the .claude/CLAUDE.md edit only; it does not change hooks, settings.json, scripts/append_decision.ps1, ARCHITECTURE.md or contracts/, and it does not alter D-013's backlog priority or D-014's class-based round cap.
**Changes-authorized:** .claude/CLAUDE.md (append one subsection "Measuring a fix against the ledger" under the existing "Maker-checker discipline" section; no existing line modified or removed)
**Approved-by:** Umesh
**Links:** ISS-093, ISS-095, ISS-096; D-013, D-014; qa/manifests/speaker-verbatim-token-boundary.md; qa/verdicts/speaker-verbatim-token-boundary.md (cycles 1-3)

## D-016 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Raise the `scripts/` directory file budget in structure.config.json from 30 to 31, to admit scripts/sync-speakers.mjs (the U2.4 apply-step entrypoint: resolve speakers deterministically from the local transcripts, build schema-shaped documents, dry-run by default, live write only without --dry-run and blocked on cross-session personId collisions unless --allow-collisions is passed).
**Why:** The `speakers` collection has been empty since the schema was created, which is exactly why catalogue B3 and B10 score MISSING -- the probe is "collection speakers (empty)". Writing real rows needs an entrypoint, and the established precedent for local-data-to-Mongo syncing is a standalone script with a --dry-run flag that the contract is PASSed against (scripts/sync-real-turns.mjs, T-003 phase 3). Adding one puts scripts/ at 31 against a budget of 30. Raising a budget to fit new code is the WEAKER of the two available responses and is recorded as such: the budget exists precisely to force consolidation rather than accretion. Consolidation was checked first and is not honestly available -- every one of the 30 existing files is referenced from at least two places (package.json scripts, contracts, manifests or other scripts), so nothing is dead and removable, and the two candidates for merging (sync-real-turns.mjs and sync-speakers.mjs) would produce a single entrypoint whose name misdescribes half of what it does, while also modifying an artifact that already carries a checker PASS. The alternative of hiding the implementation under scripts/lib/ to avoid the non-recursive count would satisfy the linter while defeating the budget's purpose, which is worse than raising it openly.
**Result:** scripts/ may hold 31 files. This is a one-file raise tied to one named entrypoint, not a general relaxation; the next script to arrive should consolidate rather than trigger another increment, and a reviewer is entitled to reject this entry and require consolidation instead. No other budget in structure.config.json changes. lint-dirsize continues to enforce the number, so the constraint remains machine-checked rather than advisory.
**Changes-authorized:** structure.config.json (the `scripts` entry of the directory-size budget only, 30 -> 31; no other key modified)
**Links:** U2.4; catalogue B3, B10; scripts/sync-real-turns.mjs (precedent); D-003, T-017 (the budgets); qa/manifests/speaker-apply-write.md

## D-017 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Supersedes D-016, which was factually wrong and is therefore not acted on. Instead of raising the directory-size budget, add an optional per-directory override to the budget: structure.config.json gains `dirsize.overrides` (a path-to-number map, empty by default), scripts/lint-dirsize.mjs consults it and falls back to `dirsize.maxFiles` for any directory not listed, and `overrides` is set to `{ "scripts": 31 }` so scripts/sync-speakers.mjs can land. The global `maxFiles` stays at 30 and every other directory keeps it unchanged.
**Why:** D-016 authorized "the `scripts` entry of the directory-size budget only, 30 -> 31" on the belief that the budget was per-directory. It is not. structure.config.json carries a single `"dirsize": { "maxFiles": 30 }` and scripts/lint-dirsize.mjs applies that one number to every directory under every root, so executing D-016 as written would have relaxed the constraint for packages/, apps/, workers/ and schema/ as well -- a repo-wide loosening, authorized by an entry that described a one-directory change and justified itself on that basis. The error was found while implementing D-016, before any edit landed. The underlying need is unchanged and D-016's reasoning still holds on its own terms: the speakers collection is empty, which is precisely why catalogue B3/B10 score MISSING; writing real rows needs an entrypoint; the precedent for local-data-to-Mongo syncing is a standalone script with a --dry-run flag (scripts/sync-real-turns.mjs); and consolidation was checked first and is not honestly available, since all 30 existing scripts are referenced from at least two places. What changes is the mechanism: an override keeps the constraint scoped and machine-checked, where a global raise would have traded a real repo-wide guarantee for one file.
**Result:** scripts/ may hold 31 files; every other directory is still capped at 30, and lint-dirsize still fails on any breach. The override map is deliberately explicit -- a directory has to be named to get extra room, so accretion stays visible in a diff and in this log rather than hiding behind a moved global. D-016 is superseded and MUST NOT be executed: applying both would raise the global to 31 and grant scripts/ an override, compounding the very mistake this entry corrects. A reviewer remains entitled to reject the override and require consolidation instead.
**Supersedes:** D-016 -- D-016 authorized a per-directory raise of the scripts budget, but structure.config.json has no per-directory budget: it carries one global dirsize.maxFiles that lint-dirsize applies to every directory under every root, so executing D-016 would have relaxed packages/, apps/, workers/ and schema/ too. This entry reaches the same outcome for scripts/ through an explicit override that leaves the global cap and every other directory untouched.
**Changes-authorized:** structure.config.json (add `dirsize.overrides` and set it to `{ "scripts": 31 }`; `dirsize.maxFiles` stays 30), scripts/lint-dirsize.mjs (consult the override map, default to maxFiles), scripts/lint.test.mjs (cover the override and the default path)
**Links:** D-016 (superseded), D-003, T-017; U2.4; catalogue B3, B10; scripts/sync-speakers.mjs

## D-018 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Raise the `scripts` entry of `structure.config.json`'s `dirsize.overrides` from 31 to 32, so `scripts/backfill-chunks.mjs` (U1.0) can land. The global `dirsize.maxFiles` stays 30 and no other directory is touched; the mechanism D-017 built is reused exactly as designed.
**Why:** This is the SECOND consecutive raise of the same override in one day, and that is disclosed rather than buried, because the accretion is the thing a reviewer should be judging. The honest case for it: `chunks` was measured empty (0 rows) against 26 sessions and 2118 turns even though U1.1, U1.2 and U1.3 had all PASSed, because `writeSessionChunks` only runs during indexing and every existing session was indexed before that code existed. Three PASSed units had therefore never produced a single row. A backfill needs an entrypoint, and the established precedent for a local-data-to-Mongo job is a standalone script with a `--dry-run` flag (`scripts/sync-real-turns.mjs`, `scripts/sync-speakers.mjs`, `scripts/seed-toc.mjs`). Consolidation was checked first, as D-017 requires, and is not honestly available: no existing script performs an indexing operation, so folding a backfill into one would couple two unrelated concerns to dodge a file count. The job is also not one-time -- any change to the chunker or the embedding model requires a re-embed, so this is a durable entrypoint, not a migration that can be deleted after one run.
**Result:** `scripts/` may hold 32 files; every other directory is still capped at 30 and `lint-dirsize` still fails on any breach. The override map stays explicit, so this second raise is visible in the diff and in this log. A reviewer remains entitled to reject it and require consolidation instead, exactly as D-017 stated -- and the standing warning in D-017 is now itself evidence: an override granted once has been widened once, which is the accretion pattern the explicit map exists to keep visible. If a third raise is proposed, that should be treated as a signal to consolidate rather than to widen again.
**Supersedes:** D-017 -- D-017 set `dirsize.overrides` to `{ "scripts": 31 }` to admit one file (sync-speakers.mjs) and explicitly reserved a reviewer's right to reject the override and require consolidation. This entry keeps D-017's mechanism, reasoning and global cap entirely intact and widens only that one number to 32 for one further file, so it is a narrowing amendment to a single value rather than a change of approach.
**Changes-authorized:** structure.config.json (`dirsize.overrides.scripts` 31 -> 32 only; `dirsize.maxFiles` stays 30)
**Links:** D-017, D-016 (superseded), D-003, T-017; plan section 10 U1.0; scripts/backfill-chunks.mjs; ISS-113; catalogue B6

## D-019 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Give each concurrent maker lane its own issue ledger with namespaced ids, so two loops cannot allocate the same id. A lane working in a git worktree writes to `qa/issues.<lane>.jsonl` (e.g. `qa/issues.a-speakers.jsonl`) and allocates ids of the form `ISS-<LANE>-NNN` where `<LANE>` is the worktree/branch suffix in uppercase (e.g. `ISS-A-SPEAKERS-001`), counting from 001 within that file alone. `qa/issues.jsonl` keeps its current meaning and numbering and remains the ledger for work done in the main tree. Every reader -- the checker sweep, the tracker audit, any count of open issues -- treats the union of `qa/issues.jsonl` and `qa/issues.*.jsonl` as the ledger, so a per-lane file is a shard rather than a private copy. Lane files are NOT renumbered into the main file on merge; the namespaced id is permanent, which is what keeps every manifest, verdict and commit message that cites it correct forever.
**Why:** Separate git worktrees were adopted on 2026-09-08 to stop two concurrent maker loops colliding. They solved file collisions completely and did nothing for the shared id counter in qa/issues.jsonl, which produced three incidents the same day. Both loops allocated ISS-100 for different findings; both then allocated ISS-102 and ISS-103 for different findings; and, worst, the two loops assigned different ids to the SAME findings, so the speaker-seam issues filed in lane/a-speakers as ISS-093/095/097/098 exist in the canonical ledger as ISS-104/106/108+111/109 because the other loop's checker had independently re-filed them. Nothing was lost, but every manifest, verdict and commit message produced in that lane cites ids that now name entirely different defects: a reader following qa/manifests/speaker-denylist-ledger-corpus.md to ISS-093 lands on a golden-set pin-criterion issue belonging to another lane. That is not cosmetic. D-015 requires a fix to be measured against its issue's OWN recorded reproductions, and that rule is only as strong as the id resolving to the right row; an audit trail whose references silently repoint is worse than one that is merely incomplete, because it still looks correct. The alternative of renumbering on merge was rejected: it rewrites ids that the other lane's artifacts may also cite, it makes the canonical record mutable, and it has to be redone on every merge.
**Result:** Id collisions become impossible by construction rather than by convention, since no two lanes draw from one sequence. Citations are stable for the life of the repo because a lane id is never rewritten. The cost is that readers must glob rather than open one file, and that the main-tree ledger and the lane ledgers use two different id shapes -- accepted, because the alternative costs correctness rather than convenience. This entry does not renumber any existing row: the divergence already recorded in qa/gates/ledger-id-divergence.md stays as it is, with its mapping table, as the historical record of what the shared counter cost.
**Changes-authorized:** .claude/CLAUDE.md (append one subsection "Per-lane issue ledgers" under the existing "Maker-checker discipline" section; no existing line modified or removed)
**Approved-by:** Umesh
Note added on filing: this entry was first drafted as D-016, then D-018, and both numbers were taken by the other concurrent loop before it could be appended -- the shared-counter problem it exists to fix, reproducing itself in docs/DECISIONS.md while the fix was being written. The append guard caught it both times, which is the difference between the two logs: DECISIONS refuses a non-sequential id, while qa/issues.jsonl accepts whatever it is handed.
**Links:** qa/gates/ledger-id-divergence.md; qa/gates/concurrent-maker-sessions.md; D-013, D-014, D-015; ISS-100, ISS-114, ISS-115

## D-020 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Two changes, one enforcement-path and one convention. (1) `.claude/hooks/mc-precommit.ps1` resolves the armed-mutation ledger against the WORKTREE being committed to -- `git rev-parse --show-toplevel`, falling back to `$env:CLAUDE_PROJECT_DIR` only when that fails -- instead of unconditionally `Set-Location $env:CLAUDE_PROJECT_DIR` before reading `qa/.mutations-active`. Each checkout therefore has its own ledger and blocks only on its own armed mutations. (2) Append a rule to `.claude/CLAUDE.md` requiring every mutation run to wrap the test command in a timeout and to restore from a byte backup in a trap that fires on timeout, interrupt and error, not only on the success path.
**Why:** Both come from real failures on 2026-09-08. For (1): committing the guarded-fetcher unit in the worktree `D:\KnowledgeBase-lanes\c-unrun-writers` was refused with "BLOCKED: a mutation is still armed -- apps/api/src/indexing/vector-gap.ts", a file that does not exist in that worktree at all. It is the other concurrent maker loop's in-flight work in the main tree. The hook does `Set-Location $env:CLAUDE_PROJECT_DIR` at line 13 and then reads `qa/.mutations-active` at line 21, so every worktree's pre-commit consults the main tree's ledger and one lane's mutation testing blocks commits in every other lane. That is worse for SAFETY than for throughput, because the natural workaround under deadline is to delete another lane's ledger row or bypass the hook -- disarming a live control while a real mutation is applied to real source. The control's intent is not in question and was earned the hard way: it exists because the ISS-083 `score: 0.5` mutation was found applied to production source. Only its scope is wrong. This is the fourth cross-loop leak of the day after the ISS-100 id collision, the ISS-102/103 id collision, and the divergent-id gate -- worktrees isolate files and isolate nothing else. For (2): a hand-rolled mutation harness in this session set `hop = -1` inside a redirect loop, producing a genuinely infinite loop; the test suite hung rather than failed, the run was killed manually, and the mutant was left applied on disk until it was restored from a byte backup. A mutation harness that can leave a mutant in the working tree is the same hazard class as ISS-083 itself.
**Result:** A lane can commit while another lane is mid-mutation-test, and the guard keeps full strength within each checkout -- the block is scoped to the tree that armed the mutation rather than weakened. Mutation runs cannot hang indefinitely or leave a mutant behind, because the restore is in a trap rather than the happy path. Neither change relaxes what the pre-commit hook refuses; the first narrows WHERE it looks, the second narrows how long a mutant can exist. The fallback to `$env:CLAUDE_PROJECT_DIR` is retained so behaviour is unchanged outside a worktree.
**Changes-authorized:** .claude/hooks/mc-precommit.ps1 (ledger path resolution only -- what it refuses, and its exit codes, are unchanged), .claude/CLAUDE.md (append one subsection on mutation-run safety under the existing maker-checker section)
**Approved-by:** Umesh
**Links:** ISS-C-UNRUN-WRITERS-005; ISS-083; qa/gates/ledger-id-divergence.md; qa/gates/concurrent-maker-sessions.md; D-019

## D-021 | 2026-09-08 | type: decision | status: ACTIVE
**What:** Vector search is brute-force exact cosine computed in Node over vectors stored in the existing `chunks` collection, behind a `vectorSearchFn` seam -- NOT MongoDB Atlas Vector Search. This replaces the answer to ARCHITECTURE Open Question Q5 only. Every other part of D-003 (the TypeScript pnpm monorepo, Python confined to ML workers, JSON Schemas as the single source of truth with generated TS types, and the CI budgets) is untouched and remains in force.
**Why:** Atlas Vector Search is not available on this deployment, as a matter of fact rather than preference: `MONGODB_URL` is `mongodb://13.202.206.101:27017` -- a self-hosted mongod on a raw EC2 address with no `+srv` and no Atlas control plane -- so the `$vectorSearch` aggregation stage does not exist there and Q5's recorded answer was never executable. Measured against the real corpus on 2026-09-08, brute force is also the better engineering choice at this size and not merely the available one: 1452 chunks at 3072 dimensions is a few million multiply-adds per query, and the scan is EXACT, whereas an approximate-nearest-neighbour index would trade recall for a speed budget nothing is currently asking for and would add build and invalidation cost on every re-embed. The measured result of the brute-force retriever is recall@5 = 0.935 (86/92) against a heuristic baseline of 0.391 and a question-blind control of 0.217. The seam is what makes this reversible: `vectorSearchFn` is injected at the composition root, so adopting a real vector database later is an injection change rather than a rewrite, and this entry should be revisited when brute-force p95 latency exceeds roughly 500 ms.
**Result:** ARCHITECTURE Open Question Q5 is re-answered: one database, brute-force exact cosine in `packages/index/src/vector/`, no Atlas dependency and no separate vector store. The plan file's internal shorthand "D-a" for this decision is retired -- it was a plan-local label that never corresponded to a DECISIONS id, and `packages/index/src/vector/cosine.ts` is corrected to cite D-021 instead. A reviewer is entitled to reject brute force in favour of a dedicated vector store; the argument for revisiting is latency at a larger corpus, not correctness, since an exhaustive scan cannot rank worse than an approximate one.
**Supersedes:** D-003 -- D-003 is the stack decision, and ARCHITECTURE Q5 recorded its closure as "Mongo Atlas Vector Search on chunks, one DB until measured otherwise". That specific answer is not implementable on this self-hosted deployment, which exposes no Atlas control plane, so the shipped code diverged from the recorded architecture. This entry replaces that single answer with the mechanism actually built and measured, and deliberately leaves the whole of D-003's stack, language-split, schema-source and CI-budget content in force.
**Changes-authorized:** ARCHITECTURE.md section 6 Q5 (re-answer: brute-force cosine over `chunks`, no Atlas); packages/index/src/vector/cosine.ts (replace the "D-a" citation with D-019)
**Links:** D-003 (superseded on Q5 only), U1.4, U1.5, ISS-124; plan section 10 decision table row D-a; qa/manifests/vector-cosine-retriever.md

## D-022 | 2026-09-09 | type: decision | status: ACTIVE
**What:** Ratifies criteria C7 and C8 of `qa/contracts/loop-safety.md` as project-wide policy in their own right, rather than as clauses inherited from D-014. C7: a checker that mutates source must assert the files IT ARMED match HEAD before writing its verdict (per-unit close-out, not a tree-wide check). C8: when a DECISIONS entry's Result states that an operative rule file was changed, that change must actually land, in the same unit. Both keep their current wording and their place in the scored criteria block. The contract's self-contradictory provenance note -- its gate note claims the file derives wholly from D-014 while its own amendment log admits C7/C8 record judgments the checker made -- is to be corrected by a CHECKER to cite this entry; the maker does not edit contracts.
**Why:** ISS-087, raised by a Mode B sweep, found that C7 and C8 trace to nothing in D-014. D-014 authorizes a hook deny branch and a CLAUDE.md paragraph; C7 imposes a new procedural obligation on every future checker and C8 is a general Lab-Protocol rule binding every future DECISIONS entry. Nobody disputes the rules are good -- C8 was generalised from a real miss in that same cycle, where D-014's own Result claimed .claude/CLAUDE.md had been updated and it had not (ISS-086), so a decision sat in the log reading as done while the loop obeyed the old rule. The objection was never the content but the door: they were adopted by the component whose job is to CHECK compliance, under an approval that did not cover them. A checker that can widen its own mandate by writing a contract is a self-certification path, which is the single failure mode the maker-checker pair exists to prevent. Ratifying does not change behaviour; it makes the authority match the rule, so the next person who reads loop-safety.md is not told something about its provenance that its own amendment log contradicts. Live evidence for C7 was observed while the gate was being written: scripts/lib/tracker-audit.mjs was found reverted to an older pattern by a checker's mutation that had not been closed out per-unit.
**Result:** C7 and C8 are authorized policy. Every future checker asserts its own armed files against HEAD before issuing a verdict, and every future DECISIONS entry whose Result claims a rule-file change must land that change in the same unit. loop-safety.md C1-C6 are unaffected and remain traceable to D-014. Deletion was explicitly rejected by the sweep, by the maker and by this entry: the behaviour is worth keeping either way, so the only question was which door it came through. A reviewer may still narrow C8 later if it proves too broad in practice -- that would need its own entry, which is the point.
**Approved-by:** Umesh
**Changes-authorized:** qa/contracts/loop-safety.md (provenance note only, to cite this entry instead of D-014; CHECKER-authored, never the maker)
**Links:** ISS-086, ISS-087, D-014; qa/gates/loop-safety-contract-ratification.md; qa/contracts/loop-safety.md

## D-023 | 2026-09-09 | type: decision | status: ACTIVE
**What:** Removes the project-level `PreToolUse` registration of `.claude/hooks/decisions-append-guard.ps1` from `.claude/settings.json`. The script itself stays on disk and its protections stay in force: the identical user-level guard at `D:/ai_os/.claude/hooks/` (now merged into `aios-write-guard.ps1`) walks up from every target file, finds this repo's `docs/DECISIONS.md`, and applies the same `deny` on DECISIONS.md and the same `ask` on Lab enforcement paths. `mc-precommit.ps1` is untouched -- it is the D-020 mutation guard and remains registered on `Bash|PowerShell`.
**Why:** The registration is redundant, and redundancy here is not free. Claude Code runs every matching hook to completion BEFORE the tool executes, each in its own Windows PowerShell 5.1 process. Measured on this machine 2026-09-09: `edit-in-place-guard` 1191ms + `decisions-append-guard` (user) 1137ms + `config-protection` 1162ms + `decisions-append-guard` (project) 1598ms = ~5088ms of pure process startup on EVERY Write and Edit in this repo. `pwsh` 7 is not installed, so reducing the number of spawns is the only available lever. The duplicate contributes ~1598ms and no protection the user-level copy does not already provide -- verified by piping tool JSON for `docs/DECISIONS.md`, `.claude/settings.json` and `.claude/hooks/mc-precommit.ps1` through both and getting identical decisions (deny, ask, ask). The cost was real: approval prompts and hook latency were stalling the maker-checker loop for hours, since nothing runs between turns and a background checker's blocked write surfaces as a prompt in the main session.
**Result:** Write/Edit in this repo now runs one guard instead of four. Protection is unchanged and was verified by parity test, not by inspection: `docs/DECISIONS.md` still returns `deny`, and `.claude/settings.json`, `.claude/hooks/*.ps1` and `scripts/append_decision.ps1` still return `ask` with the Approved-by reasoning intact. If the user-level guard is ever unregistered, this repo loses that protection and the registration must be restored -- the tradeoff is deliberate and recorded here so the dependency is visible rather than implicit.
**Approved-by:** Umesh
**Changes-authorized:** .claude/settings.json (remove the redundant PreToolUse decisions-append-guard registration only; mc-precommit.ps1 and all SessionStart/SessionEnd entries unchanged)
**Links:** D-020; D:/ai_os/.claude/hooks/aios-write-guard.ps1; .claude/hooks/decisions-append-guard.ps1

## D-024 | 2026-09-09 | type: decision | status: ACTIVE
**What:** Live-browser validation becomes mandatory for UI-touching units in this repo, implemented in the SHARED maker/checker skills (Umesh chose shared scope over a KnowledgeBase-only override) plus a fifth Stop-hook predicate. Concretely: maker cycle step 5b writes qa/evidence/browser-<unit-slug>-<date>/report.json before the manifest; the manifest template gains a required "Live browser evidence" section; checker gains Mode D (live feature validation) which must drive its OWN browser and may not read the maker's screenshots; the checker verdict gains a LIVE-BROWSER field and a UI-touching unit cannot PASS without it; delivery-gate-stop.ps1 blocks once per session when a UI-surface file was edited and no browser evidence was written. Two friction fixes ship in the same unit: apps/api/src/server.ts's PORT default moves 3000 -> 3300 to match apps/web/.env.development, demo-live.mjs and live-verify.mjs, and package.json gains "demo:up" to start both servers.
**Why:** The rule already existed and could not fire. maker/SKILL.md's "THE MAKER NEVER VALIDATES ITS OWN SHIP" and the whole of checker/SKILL.md Mode C are conditioned on the adapter's isolation.done including a deploy, and THIS REPO HAS NO qa/adapter.json, so both were dead here. Measured consequences: one session shipped ~19 units with a browser opened zero times; the first browser run found that the API defaults to :3000 while the web app calls :3300, so started the documented way the dashboard shows "failed to load dashboard data" with 9 console errors, which no unit test can see because both sides are individually correct; and Umesh found by hand that clicking a node on /brain does nothing, on a page whose own text invites the click. An audit of every prior browser-shaped check found that NO checker has ever independently re-run a browser - each substituted curl or read the maker's PNGs - which removes exactly the independence the checker exists for. Two further causes are recorded because they are the mechanism, not the symptom: qa/contracts/web-sessions-calendar-brain-richness.md explicitly licensed skipping the click ("canvas pixel-clicking in a live browser is not reliably automatable ... rely on BrainPage.test.tsx's 5 passing tests ... not a live click"), which is false - the clicks were automated in minutes - and apps/web/src/pages/BrainPage.test.tsx mocks react-force-graph-2d and then clicks the mock's own DOM buttons, so the test replaces the very component that is broken and passes while the feature is dead. Prose alone was already tried: plan section 9 asked for visible-browser validation and it did not happen, which is why this carries a machine gate, mirroring the 2026-09-08 decision that gave the maker continuation rule a Stop-hook predicate after the prose form "fired only on supportive prompts".
**Result:** A UI-touching unit that reaches close-out without live browser evidence is blocked by the Stop hook and cannot be PASSed by a checker. Backend-only units are unaffected: the trigger is generic web-file patterns, so a qa/ or scripts/ session never trips it. Deliberately in scope as user-facing, correcting an error this session made: packages/ask/** and packages/index/src/{vector,tree,search}/** change what /ask and /brain render, and were previously treated as backend-only. The contract concession quoted above is revoked by name. Explicitly NOT decided here: whether canvas hit-testing is the cause of the /brain node-click bug - that is the first unit to run under this rule, and it must be fixed without being certified by the mock that hid it.
**Approved-by:** Umesh
**Changes-authorized:** D:/ai_os/.claude/skills/maker/SKILL.md (cycle step 5b, manifest template, checker-dispatch block); D:/ai_os/.claude/skills/checker/SKILL.md (Mode D, verdict field); D:/ai_os/.claude/hooks/delivery-gate-stop.ps1 (fifth predicate); apps/api/src/server.ts (PORT default only); package.json (demo:up script); qa/ui-surfaces.json (new)
**Links:** D:/ai_os/decisions/log.md 2026-09-09; qa/evidence/browser-2026-09-09/README.md; plan section 9; qa/contracts/web-sessions-calendar-brain-richness.md; apps/web/src/pages/BrainPage.test.tsx

## D-025 | 2026-09-09 | type: fix | status: ACTIVE

**What:** Narrow the maker predicate in `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` so it scans
for a `ScheduleWakeup` call only in the transcript lines written since the LAST `stop_hook_summary`,
instead of anywhere in the current human turn. Each end-of-turn is then judged on its own. If no
prior `stop_hook_summary` exists (the first Stop of a session) the existing turn-boundary logic is
used, and if neither can be resolved the hook falls back to the whole-transcript scan it uses today.
Fail-silent is preserved in both directions: any parse failure makes the hook quieter, never louder.

**Why:** Measured on this session's own transcript, not recalled. The last actual `ScheduleWakeup`
tool call was 2026-09-08T10:56:13Z; the session's final turn ended 2026-09-09T03:34:10Z. That is
16h38m and roughly twenty ticks with no continuation armed - the browser-rule unit, the PORT fix and
the /brain node-click fix all ran with a dead loop, and the maker then reported that it had called
ScheduleWakeup when it had not. The gate exists to catch exactly this and did not, because its
predicate asks whether a ScheduleWakeup appears anywhere in the CURRENT TURN, where a turn boundary
is the last human message. That one human turn ran sixteen hours, so a single stale wakeup satisfied
the predicate all day. It is a once-per-turn check being used as a once-per-tick check. It fired once
at 03:32:30Z (budget 1 of 3, recorded in the session's .maker.blocked marker) and the block was
answered with prose rather than a tool call, after which the session ended.

**Result:** Pending - to be verified by firing the hook against two fixture transcripts (one whose
only wakeup predates the last stop_hook_summary, which must now block; one with a wakeup after it,
which must not) plus a regression check that a turn which did call ScheduleWakeup is still not
blocked. The 3-block-per-session budget, the ASCII-only JSON output and the fail-open behaviour are
unchanged.

**Approved-by:** Umesh - approved the plan containing this step via plan-mode approval on 2026-09-09,
then answered "proceed ahead" to the direct question of whether to write this entry and apply the
hook change. Recorded as what actually happened rather than paraphrased as a separate spoken
approval, because the authorizing act was a plan approval plus that two-word reply.

**Changes-authorized:** .claude/hooks/delivery-gate-stop.ps1

**Links:** D-024 (the live-browser rule this same gate carries); incident record in qa/.last-tick
2026-09-09T04:12Z; maker/SKILL.md THE CONTINUATION RULE.

## D-026 | 2026-09-09 | type: fix | status: ACTIVE

**What:** Withdraw D-025's justification. There was no 16-hour continuation gap and no ~20-tick
unarmed run. The maker predicate in `delivery-gate-stop.ps1` is NOT known to be defective, and the
scoping change D-025 authorized is withdrawn pending a defect that actually reproduces. The
enforcement path is untouched: nothing was edited under D-025 (the harness permission classifier
denied it), so this entry withdraws an authorization, it does not roll back a change.

**Why:** Counted across every session file in `~/.claude/projects/d--KnowledgeBase/`, this session
made **179 distinct ScheduleWakeup calls**, 26 of them inside the window D-025 called dead. The
largest recent gap is 2026-09-08T18:35:32Z -> 2026-09-09T00:54:40Z = **6h19m**, which is IST 00:05
to 06:24 - overnight, with Claude closed. Nothing fires while Claude is fully closed; that is a
documented honest limit of the continuation rule, not a defect. The gate also behaved correctly on
the night in question: it blocked at 03:32:30Z, a ScheduleWakeup followed at 03:33:49Z, and the
03:34:10Z Stop passed with no findings.

The error was in my instrument, not in the loop. After a compaction the transcript contains
duplicated event ranges, so **line order is not time order**. I ran `grep -n ... | tail -4` and read
the highest line number as the latest event: line 38076 carries timestamp 10:56:13Z but sits near
the end of the file, while lines 33403-36259 carry later timestamps. I checked one line's timestamp,
found it consistent with the story I already had, and never validated the probe against a
known-positive. That is the same failure as the /brain node-click diagnosis two days earlier, where
polling `canvas.style.cursor` measured nothing because force-graph signals hover with a CSS class -
and the lesson recorded from it was, verbatim, to test a probe on a known-positive before reporting
a negative.

Found by a Mode B checker sweep (ISS-177, high), which counted the calls directly and contradicted
a number I had already written into `qa/.last-tick`, a DECISIONS entry, a commit message and a
report to the Approver. The sweep is correct on every point.

**Result:** D-025 withdrawn as unsupported. What survives independently, because it was measured a
different way and does not rest on the gap figure: the **BROWSER predicate is satisfied by prose** -
476 transcript lines match its `browsed` pattern against 371 real Playwright tool calls, so 105
matches are text, including a subagent dispatch prompt that merely names an evidence directory
(audit `D:/ai_os/audits/2026-09-09-delivery-gate-browser-predicate.md`, H1); and
`qa/ui-surfaces.json`'s regex can disable that gate while both its own comment and the hook's claim
it can only narrow it (H2). Those two remain open and still need an Approved-by to fix, on their own
evidence rather than on D-025's.

**Supersedes:** D-025 -- D-025's Why is a measurement artifact: it read a compacted transcript's line
order as time order and reported a 16h38m dead loop that the raw timestamps refute at 179 calls and a
6h19m worst gap explained by an overnight machine shutdown. An entry authorizing an enforcement-path
change on a false premise must be withdrawn explicitly rather than left standing and quietly unused.

**Approved-by:** Umesh - the authorization being withdrawn is D-025's, granted by plan approval plus
"proceed ahead"; this entry narrows that grant rather than widening it, and no enforcement file was
modified under either entry.

**Changes-authorized:** none - this entry withdraws an authorization and changes no file.

**Links:** D-025 (superseded); ISS-177 (the sweep finding that caught it); ISS-176, ISS-178 (same
sweep, open); `D:/ai_os/audits/2026-09-09-delivery-gate-browser-predicate.md` H1/H2 which survive.

## D-027 | 2026-09-24 | type: decision | status: ACTIVE
**What:** Web-client meetings and webinars (Zoho Webinar, Google Cloud OnAir, and any platform with no vendor bot) are captured by a LOCAL browser bot on Umesh's Windows laptop: `meeting-bot record` spawns packages/meeting-bot/py/sb_join.py (headed SeleniumBase-UC Chrome on a persistent profile data/bot-profile/ that the user logs into once, so it attends as the registered attendee, mic/camera prompts denied), pins the window title, and drives OBS 32 over obs-websocket to record ONLY that Chrome's process tree (Application Audio Capture + window capture matched by title; global desktop/mic muted for the run). The recording is ffmpeg-extracted to m4a, passed through a silence gate (max < -50 dB means never transcribed), registered as data/toc-migrated/<id>/source.json with audioPath, and transcribed by the existing scripts/transcribe-long-session.mjs (find-audio-file.mjs now honors audioPath). New platforms zoho + cloudonair route to the browser strategy. This EXTENDS D-004 and does not replace it: Vexa remains the planned route for Meet/Teams/Zoom at scale, exactly as strategy.ts already routes. Umesh chose the fast-track (build + live run today, manifest and /checker afterwards).
**Why:** First live target was a Zoho webinar at 16:00 the same day, and an open-source survey (Vexa, Attendee, screenappai/meeting-bot, meetingbot, Meetily, Hyprnote, OpenClaw, puppeteer-stream) found NO project supporting Zoho. Every "meeting bot" is Docker/Linux-first and joins as a visible named guest, while local recorders never join. Recall.ai stays rejected (D-004). A browser running as the user plus per-process audio capture is platform-agnostic and runs natively on Windows. Measured in today's smoke runs: (1) a SILENT (-91 dB) capture sent to Gemini came back as 18 fluent invented turns, which is why the silence gate is mandatory; (2) Chrome's OS window title is "<document.title> - Google Chrome", and the first spec without that suffix matched nothing (black video + silence); (3) a killed bot left its Chrome holding the profile lock, so the next launch hung silently, and it also left saved Sessions that restored stale tabs (fixed: orphan kill + session cleanup at start); (4) a force-killed OBS relaunches in Safe Mode without obs-websocket.
**Result:** Verified end-to-end from a Windows scheduled task: bot opens the page, window confirmed, OBS records only the bot (peak -0.2 dB), audio extracted, session registered; a speech sample (a Hindi YouTube ad) transcribed correctly as 3 speakers. Known gaps, not fixed today: the OBS window VIDEO is black while audio works (slides not captured yet); auto-scheduling from Gmail/Calendar candidates, plus notify, is phase 2; in-browser tab capture to drop the OBS dependency is phase 2; Google OnAir on-demand needs a one-time login in the bot profile. Recording third-party webinars is for internal KB use only.
**Links:** T-011; U4.1; U4.2; D-004; packages/meeting-bot/src/capture/obs-windows.ts; packages/meeting-bot/py/sb_join.py; packages/meeting-bot/src/cli.ts; scripts/lib/find-audio-file.mjs; C:/Users/Lenovo/.claude/plans/check-38fdc7ba-2ad2-46c0-b4f6-95c5567673-dazzling-babbage.md

## D-028 | 2026-09-24 | type: decision | status: ACTIVE
**What:** (1) Bot-captured webinars are transcribed in ONE call with gemini-3.8-flash (opt-in via the new GEMINI_STT_MODEL env var in scripts/transcribe-long-session.mjs, with chunkSeconds larger than the duration). Chunking stays as the fallback; the adapter default model (gemini-3.5-flash) is unchanged until more sessions are measured. The HTTP timeout was raised from 10 to 30 min. (2) Webinar sessions are written to the live KB tenant "toc", because it is the only tenant with API keys and the app reads nothing else; the real organisers go on sessions.org. (3) The first knowledge-graph rows: scripts/sync-webinar-session.mjs builds DETERMINISTIC graph_edges (no LLM) from a hand-checked meta.json (people, orgs, countries, topic patterns). Edge types: spoke_in, represents, located_in, partner_of, covers, discussed, held_on, in_month, captured. Every edge carries sessionRef, date, confidence and evidence[] (turn id + tStart + occurredAt). Turns are rewritten with speakerRef = personId, speakerLabel and absolute occurredAt. Re-running replaces only that session's turns and edges.
**Why:** On the first live webinar (61.8 min after trimming), the chunked gemini-3.5-flash path failed once on a 600 s headers timeout. At 20-min chunks it produced 346 turns with two long answers attributed to the wrong speaker (Anjum's placements answer at 16:19 and Austria answer at 16:36 were labelled as the host), and it had invented turns over 13 min of post-event silence before the audio was trimmed. gemini-3.8-flash, in one call (in 92,759 / out 13,160 tokens), returned 80 complete turns with no gaps, named all three speakers from the audio (Devanshi, Anjum, Sagar), and got both disputed passages right. The chunking itself exists because an older model truncated around the 60-min mark (commit 709c6c0); that limit no longer holds for this model. Umesh asked for the session to be saved "user wise and date wise" into the knowledge graph. graph_edges had 0 rows (B7 MISSING), and deterministic edges with evidence satisfy H3 without an unevaluated LLM extractor.
**Result:** Mongo lkb/tenant toc now holds the session, source, 80 turns, 3 speakers (person:anjum@org:ibs, person:sagar@org:hau, person:devanshi), 6 orgs, 15 topics and 94 graph_edges. Read-back queries answered "who spoke on 2026-09-24" (turn counts and speaking seconds), "what did Anjum discuss" (Hungary x10, placements x9, ...), evidence for sagar->proof-of-funds (turn t073 at 16:57:29 IST), and IBS partners (Buckingham, DBS, De Montfort, BHMS). Known weaknesses: keyword edges are noisy (country:usa also matches "Hellenic American"), so confidence is 0.7-0.8; the host's name spelling is unconfirmed (confidence 0.8); the webinar's last ~5-8 min are missing (the bot disconnected at ~17:01). Not decided: making gemini-3.8-flash the adapter-wide default (needs a TOC re-transcription comparison first).
**Links:** T-042; T-043; T-044; U2.6; D-027; scripts/sync-webinar-session.mjs; scripts/transcribe-long-session.mjs; data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/meta.json

## D-029 | 2026-09-25 | type: fix | status: ACTIVE

**What:** Make the machine-wide write guard `D:/ai_os/.claude/hooks/aios-write-guard.ps1` fail CLOSED on its deny path, and correct the recorded root cause of ISS-180. Three changes: (1) the deny decision for a `docs/DECISIONS.md`-shaped or enforcement-shaped path must not be reachable by an exception falling through to the outer `catch { exit 0 }`; (2) strip a Windows extended-length path prefix before any existence probe or path normalisation, so the guard cannot manufacture the bypass itself; (3) add a fixture to `D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1` asserting that a THROWN EXCEPTION inside the guard never yields an allow.

**Why:** A fresh, independent security audit (`D:/ai_os/audits/config-gc/2026-09-24-security-audit.md`, graded F) found the guard fails OPEN on its only deny. `$ErrorActionPreference = "Stop"` combined with an outer `catch { exit 0 }` means any exception during path handling is swallowed into a silent allow. Probed live end to end: `D:\KnowledgeBase\docs\DECISIONS.md` correctly denies, but the same file reached through a Windows extended-length prefix returns SILENT ALLOW, and so does `.claude/settings.json`. The guard also normalises `/` to `\`, which converts an innocuous forward-slash spelling into the extended form -- so it manufactures the bypass rather than merely failing to catch it. Separately, ISS-180's recorded root cause is wrong: it blames `Test-Path -LiteralPath` returning False, but measurement shows it returns True and that line is never reached. A fix written against the recorded cause would pass its own test and leave the hole open, which is the specific failure this entry exists to prevent. The fixture is the durable part: a guard whose error path is untested can regress to fail-open silently, and no existing check would notice.

**Result:** Authorised, not yet implemented. Implementation and its verification follow under this entry; the fixture must be shown FAILING against the current fail-open behaviour before it is trusted passing, per the standing rule that a test which cannot fail is not a test.

**Changes-authorized:** `.claude/hooks/aios-write-guard.ps1` (deny-path fail-closed + extended-length prefix stripping only) - `.claude/hooks/tests/hook-fixtures.ps1` (add the thrown-exception-never-allows fixture)

**Approved-by:** Umesh

**Links:** ISS-180 (recorded root cause corrected by this entry) - `qa/gates/write-guard-contract-contradiction.md` (Answered 2026-09-25) - `D:/ai_os/audits/config-gc/2026-09-24-security-audit.md` Critical C1 - D-023 (the entry that authorised the merged guard) - ISS-083, D-020 (same hazard class: an unverified change left applied)

## D-030 | 2026-09-25 | type: decision | status: ACTIVE

**What:** Amend criterion [C4] of `qa/contracts/delivery-gate.md` to DROP the heading stamp form `# Verdict - <slug> - **Cycle checked: N**`. Verdicts standardise on an own-line `**Cycle checked:** N`. The checker makes the contract amendment; the delivery gate keeps its ASCII-only, line-anchored reader and is not re-widened to match the dropped form.

**Why:** The heading form separates the stamp from its label with a middle dot or em dash, which requires a non-ASCII boundary in the gate's pattern and made the gate's answer depend on how PowerShell decodes the file -- two independent measurements disagreed about which reader mangles it, and neither was obviously wrong. Cycle 3 of `delivery-gate-manifest-blindness` made that form unreadable and asserted the trade unilaterally inside a manifest, which invariant [I2] forbids ("a change that trades C1 for C2 is a FAIL, not a tradeoff"); the checker was right to fail it, and the contract has sat unamended since. The cost of the amendment is now measured rather than hypothetical: on 2026-09-25 the gate reported "1 check(s) pending" for `u2-4-phase3-precision-regate` whose verdict IS stamped, because the stamp sits mid-line behind a middle dot at line 3 -- a false positive that blocked two working sessions twice in one evening. All four verdicts using the heading form are closed, so nothing live is lost. Option C (read the form via an ASCII-only structural route) was considered and declined as more code for a form we are choosing to stop writing; keeping the encoding independence measured at 232 files x 3 decoders with 0 decision changes is worth more than reading four historical headings.

**Result:** Authorised. Both live sessions had already adopted own-line stamping as a working convention pending this decision, and the convention was deliberately NOT written into any contract criterion while the gate was open -- amending a gated criterion sideways through another contract is the exact unilateral move [I2] exists to stop. That restraint is now discharged by this entry.

**Changes-authorized:** `qa/contracts/delivery-gate.md` ([C4] only -- drop the heading form; no other criterion touched)

**Approved-by:** Umesh

**Links:** `qa/gates/delivery-gate-c4-heading-form.md` (Answered 2026-09-25, option A) - ISS-205, ISS-206, ISS-207 - ISS-184 - `qa/contracts/delivery-gate.md` [C4] and [I2] - `qa/manifests/delivery-gate-manifest-blindness.md` (STALLED at cycle 3)

## D-031 | 2026-09-25 | type: decision | status: ACTIVE
**What:** Add a `dirsize.overrides` entry for `apps/api/src` in `structure.config.json`, raising its cap from the global `maxFiles: 30` to `31` â€” same mechanism and shape as the existing `scripts: 32` override (D-017 precedent), never a raised global.
**Why:** U2 (source-watcher) added `apps/api/src/gws-gmail.test.ts` â€” the first unit test for `gws-gmail.ts` (T-028, previously untested), covering the new body-decode/date-extraction/kind-classification pure functions the unit added. That is the 31st file directly under `apps/api/src`, one over the global budget. The alternative â€” moving `gws-gmail.ts`/`gws-calendar.ts` into a new subdirectory to keep the top-level count down â€” was rejected for this unit: it touches every import site across `store.ts`, routes, and tests for a directory-hygiene reason unrelated to U2's own scope, under time pressure that favors a small, reviewable diff over a wider mechanical refactor. `scripts/lint-dirsize.mjs`'s own doc comment names exactly this path: "a directory must be NAMED to get extra space, so accretion shows up in a diff and in DECISIONS rather than hiding behind a raised global."
**Result:** `pnpm lint:structure`'s `lint-dirsize` step passes with `apps/api/src` at 31 files, override at 31. No other directory's budget changed. A future cleanup (splitting `apps/api/src` into subdirectories the way `indexing/`/`routes/` already are) remains open and is not blocked by this entry â€” it would let the override be removed again.
**Links:** U2 (plan `C:/Users/Lenovo/.claude/plans/what-is-the-update-vivid-donut.md` Â§U2); `qa/manifests/u2-source-watcher.md`; D-017 (the `scripts: 32` override this mirrors); `scripts/lint-dirsize.mjs`
