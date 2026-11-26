# Feedback inbox — verbatim user feedback, timestamped. Any session may append; checker folds in.

## 2026-09-03 — Umesh (chat, mid-session, verbatim intent) — folded 2026-09-03 (partial: design-first→T-016 via monorepo-restructure.md amendment log; bot/URL/seam await contracts T-017..T-025)
- "AUR SABSE important iska schema essaa rakhna jo scalable ho and system design ko bhi phle plan krr le properly ... DRY principle use ho ... ERP me schema aur system design decide nahi hua tha, cloud code itne zyada tokens kharch hota hai just for holding the context, code repeated hai, human engineer control nahi le paata — aisa nahi hona chahiye." → design-first gate (plan §6a), monorepo + CI budgets (§6c.1).
- "live meeting join karne ke liye meeting ka bot hoga ... meeting ka URL daalu, dedicated system ke paas apna chrome browser ho, mere via / user as a user join kare, apne aap calendar dekh ke directly join kare, meeting khud record kare ... hum paid member hain ... recording provide nahi karte to hum apne liye rakh rahe hain taaki manual review ho sake" → meeting bot + calendar + vault (A10/A11, T-024/T-025).
- "URLs daalein to wahan se data properly aa jaye" → URL ingestion (T-023).
- "market me free products hain to unko API ke through integrate karein" → market scan done (§6c.2).
- "AI API-based hoga ya cloud code hamara Max subscription ke through — dono ka system day one se integrate karega" → provider seam (T-019).
- DECISIONS (AskUserQuestion answers): consent = **silent full capture** with full diarization + who/when provenance so team can follow up with the expert; recordings purged after processing (purge design deferred). Stack = **TS pnpm monorepo, Python ML workers**. Bot = **self-host Vexa + Whisper, pluggable STT so a Gemini 3.5-transcribe key can be preferred**. Backend = **Gemini-first (purchased tokens, Google-side budget), Claude via the `claude` CLI OAuth email→OTP login flow, Anthropic API optional/droppable; no budget-guard work now — features first.**

## 2026-09-03 (later) — Umesh, mid-session + /grill outcomes — folded 2026-09-03 (sweep, no commit needed: TOC/whatsapp_msg-as-sources already covered by qa/contracts/ingestion-source-seam.md naming a future `whatsapp` adapter + TASKS.md T-002/T-007; A13/Watched Sources already present as T-027 in TASKS.md)
- "TOC wali directory, WhatsApp wali directory — ye sab as a feature aayenge right?" → yes: raw/TOC = recording/document adapters + T-002; sources/whatsapp_msg = A8/A9 + T-007.
- "Google search bhi hoga… important websites bookmark kar paayen, update hone par track ho ke knowledge pool update ho jaye — reputed websites ka content gold hai; headers / landing pages bhi" → A13 Watched Sources, T-027 (depends T-023).
- "Meeting link Zoom / Google Meet / koi aur platform — sab ke hisaab se bana paayega? system dynamic, use-case wise" → T-024 platform-adapter layer (Vexa for Meet/Teams; browser-profile join for Zoom/others; system-audio universal fallback). Flags: verify Vexa Zoom support; Zoom web-client bot join spike.
- Grill decisions (see brainstorms/2026-09-03-lkb-counsellor-assumptions.md): "beat" = blind head-to-head panel-scored; configurable panel w/ credibility tier; Pathlynks questions approved anonymised (D-007); provided-first capture, silent = last resort, gated purge + evidence clips (D-008); five providers + listModels dropdown, user-editable chain (D-008); D-006 approved; first demo = paste-a-link capture on any platform; eval harness (internal tier) alongside first /ask; copilot for in-house counsellors first (C12/C2 before C14).

## 2026-09-03 (later) — Umesh, scope correction on T-012/T-014 (compete screen) + priority — folded 2026-09-03 (sweep, no contract to amend: no T-012 contract exists yet, so TASKS.md's wording — commit b489089 — is the source of truth for now; correctly reflects the re-scope and T-009-before-T-010/T-028 priority)
- "Ye sab tho manually hoga naa iske liye — ek screen bana denge jahan counsellor details milegi.
  Dont take it too much. Ek screen mein hogi 'compete wali' aur usme counsellor basic details
  daal ke start kar payenge." → the eval-harness/championship UI is scoped WAY down: ONE simple
  manual-entry screen (counsellor name/basic details -> start a compete run), NOT a platform.
  No self-serve counsellor onboarding, no fancy panel management UI right now.
- "Main cheez ye dekh abhi ki knowledge base kaise banega, aur phir developers ko API deni hogi
  for virtual counsellor and all — vo log API hit karenge. Baad mein counsellor ka user
  management karenge, tho baad mein dekh lenge." → priority order restated: (1) knowledge base
  build (current work) (2) Developer API so external devs/the counsellor client can hit it
  (3) counsellor user-management/accounts — explicitly deferred, not now.

## 2026-09-03T11:02:09Z — Umesh, mid-session (GEMINI_API_KEY fix) — reinforces existing design, no new build needed
- "aur humko tho system adaptive banana hai naa, like langchain ki koi bhi api key chal jaaye
  ya phir anthropic ho toh sab chal jaaye easy fallback se" → system should be adaptive: any
  provider's API key should work, with easy fallback if e.g. Anthropic fails. This is ALREADY
  the design (D-008/T-019): five provider adapters (gemini/anthropic/openai/ollama/claude-code)
  behind one `Provider` interface, `config/ai-routing.yaml`'s per-jobKind ORDERED chain, and
  `packages/ai/src/router.ts`'s `complete()` tries each provider in order, records every attempt
  to the `jobs` ledger, only throws `AllProvidersFailedError` if every provider in the chain
  fails. No contract amendment needed — confirms the existing fallback architecture is the right
  call, not a new requirement.

2026-09-07 · maker (ISS-056 unit) — folded 2026-09-07 (Mode B sweep: ruled by /checker Mode A
cycle 1 in qa/contracts/catalogue-progress-score.md's amendment log, commit 3d0c442. I13/I14
UPHELD UNCHANGED — the maker's "already protected by the banner" premise is refuted by that
contract's own ISS-047 measurement. Workflow harm sustained as its own issue, ISS-058 open,
medium: split `catalogue-score --check` out of `lint:structure` into a `lint:score` gated on the
commit/CI path. This entry sat unmarked in the inbox despite the ruling landing two commits ago —
marking it now closes the fold-in gap.) · PATTERN: a trust gate wired into the everyday lint blocks the
everyday workflow. `catalogue-score --check` refuses when any SCRAPED SOURCE file is uncommitted,
so `pnpm lint:structure` now fails during ANY in-flight unit — i.e. exactly when you would run it,
pre-commit. EVIDENCE: this unit's own run — `REFUSED: packages/index/src/pipeline/claims.ts is not
what the repository holds (modified)`, while every other structure check passed and the score was
unchanged at 20.2%. The refusal is contract I13/I14 and correct for the EVIDENCE and CATALOGUE
inputs (they can inflate the number). For scraped SOURCE the protection is arguably already the
doc's EDITED-SINCE-COMMIT banner plus the staleness check, and a source edit that changes no
verdict still blocks the lint. APPLIES NEXT: any gate that can be red for legitimate reasons during
normal work — the earlier ruling "a gate that blocks every commit until someone else acts is a gate
people delete" applies to this one too. Not changed unilaterally: I13/I14 are checker-owned, and
the last sweep reopened ISS-006 precisely because makers edited their own ground truth.

- 2026-09-08 · PATTERN observed twice this session (empty-manual-verdict-refusal ISS-036, then
  tracker-audit-g1-gate ISS-053, then again while drafting catalogue-cli-clean-check ISS-064
  before it was caught pre-ship): a regression test that re-derives its own inline check instead
  of calling the SAME exported function the production code path uses is a false-green trap — a
  real regression in the production logic can pass the "proving" test because the test never
  actually calls it. Caught every time only because mutation-testing-with-proof-of-application is
  mandatory here; a green suite alone would have shipped all three false-green tests silently.
  APPLIES NEXT: when writing a regression test for a bug in a filter/check/guard function, always
  extract the check into its own named function first and have the test call that function
  directly, never a hand-copied duplicate of its logic — then the mutation test is the thing that
  proves the extraction, not just the fix. — folded 2026-09-08

- 2026-09-08 · maker (self-caught, confirmed by the concurrent sweep's own report) · PATTERN:
  **mutation-with-proof-of-application writes a deliberately-broken state into a real file, and any
  concurrent reader can observe it and reasonably report it as a shipped defect.** Mutation testing
  is mandatory here, so this hazard is structural, not a one-off slip. EVIDENCE: the Mode B sweep
  dispatched at the top of the 2026-09-08T01:12 tick ran for ~385s, overlapping the window in which
  `packages/index/src/eval/baseline.ts` was mutated (`const saturated = false`) to prove the
  saturation test reddens. The sweep read the file mid-mutation and reported it as a possible
  shipped defect — "a saturation detector that can't detect saturation certifies the broken number
  as informative". It was right about what it saw; the file was restored seconds later and verified
  (`grep` shows the real detector, 7/7 green, real data verdicts SATURATED). Two things prevented
  harm, both worth keeping: the sweep HEDGED rather than filing ("reads as mid-TDD red, not a
  shipped defect"), and narrow-pathspec commit discipline meant its commit `c11515a` touched only
  its own three qa/ files — verified afterwards that no commit anywhere ever captured the mutated
  line (`git log --all -S'const saturated = false'` → empty). APPLIES NEXT: do not dispatch a sweep
  or checker that reads the same files you are about to mutate. Sequence it — mutate before
  dispatching, or after the concurrent reader returns. If the overlap is genuinely unavoidable, say
  so in the dispatch prompt so the reader knows a transient broken state is expected. The general
  rule: a verification technique that temporarily makes the repo lie must not run while something
  else is reading the repo for truth. — folded 2026-09-08
2026-09-08 · Umesh ("the current flow is taking really long — check what is really taking this long") · PATTERN: the maker-checker cycle's cost is prose and re-verification rounds, NOT tooling or the database. Measured this tick: full verify suite = 19s total (typecheck 11s, api tests 6s, index tests 1s, lint:structure 1s); live Mongo = 1s for ping + count + full 2118-turn fetch. Yet ticks run ~15 min each, steadily. The time goes to (a) manifest+verdict prose of 3,000-5,300 words per unit — last 5 commits are 1,194 lines of qa/ prose against 263 lines of code, a 4.5:1 ratio; (b) each checker being a fresh subagent that re-reads the store, tests, contract and prior manifests cold; (c) SEVEN consecutive rounds on one 85-line file (search-store.ts, rounds 4-7). EVIDENCE: timing run 2026-09-08; `git log -5 --numstat` split by path; qa/.last-tick inter-tick deltas (15 min modal). APPLIES NEXT: cap manifests at ~400 words unless the unit found something with a live-data or security consequence — the 3,000-word manifests were written during genuine findings (the round-6 cross-tenant disclosure earned its length), which is exactly why the length should not become the default. Round 7's own manifest is 1,004 words to report two medium test-coverage gaps. Consider a contract criterion: a manifest over N words must name the live consequence justifying it.
2026-09-08 · maker close-out · PATTERN: mutation testing needs a post-restore re-verification at CLOSE-OUT, not only at restore time. Twice this session a concurrent reader met a mid-mutation tree; this third instance is worse — the ISS-083 mutation (`score: 0.5` in production `search-store.ts`) was found APPLIED in the working tree after the checker had already verified its own restore SHA256-identical with an empty `git status` on that file. The restore verification passed and the mutation was still there afterwards. EVIDENCE: `git diff apps/api/src/search-store.ts` at close-out showed `-score: hit.score / +score: 0.5`; verdict `80e9ba7` states the file was clean against HEAD; `git log --all -S 'score: 0.5'` empty, so nothing ever shipped. APPLIES NEXT: any unit whose evidence includes a mutation must re-run `git diff <mutated-file>` at close-out and assert empty, as a separate step from the restore. A restore that verified once is not a restore that held. Cheap: one command, and it catches a class where production source is the mutated target.
2026-09-08 · maker observation · PATTERN: a mutation guard that must be voluntarily invoked will be skipped by exactly the actors it protects, and the skip is invisible. EVIDENCE: within one hour of `loop-safety-mutation-guard` shipping, a checker running a requested mutation test reverted `scripts/lib/tracker-audit.mjs:47` to a defective regex WITHOUT calling `mutate.mjs apply` — `mutate.mjs list` said "no outstanding mutations" and `qa/.mutations-active` was absent, so the commit guard would not have denied a commit touching that file. The guard's own manifest disclosed this limit ("it does not enforce use"); it recurred unprompted the same hour. APPLIES NEXT: the closure is procedural, not code — a checker that mutates source asserts the files IT armed match HEAD before writing its verdict (currently drafted as [C7] in qa/contracts/loop-safety.md, whose authority is itself disputed by ISS-087 and gated in qa/gates/loop-safety-contract-ratification.md). Also worth adding to every mutation-bearing checker DISPATCH prompt, since dispatch text is read at the moment of use whereas a contract criterion is read at close-out — the wrong end for a rule about arming.
2026-09-08 · maker, from a self-inflicted loss · PATTERN: a guard placed on only ONE end of a paired destructive operation guards nothing, and the refused half will be read as "the tool protected me" while the unguarded half does the damage. EVIDENCE: scripts/lib/mutate.mjs `apply` correctly REFUSED a file holding uncommitted edits ("is 'modified', not 'committed'"), the sequence continued, and the trailing `restore` ran `git checkout --` on that same never-armed file and discarded ~40 lines of real uncommitted work — the exact loss the apply precondition had just prevented, one command later. Also note `set -e` did not stop the sequence after the refusal, so an exit-1 guard cannot be assumed to halt a compound command. APPLIES NEXT: for any tool with an arm/disarm or apply/restore pair, the destructive half must independently verify it is acting on something the safe half registered — never infer it from "the caller followed the sequence". Fixed and covered by mutate.test.mjs case (f), which asserts the file is left BYTE-IDENTICAL on refusal, not merely that the command exits non-zero. Generalises to any future revert/rollback/cleanup helper in this repo.
2026-09-08 · checker (golden-set-pin-criterion cycle 1) · PATTERN: "all N paths verified" is not coverage when the unverified path is the one that costs money — and cost is exactly what makes a path stay unverified. EVIDENCE: ISS-095, a plain ReferenceError in the generation loop, shipped under three green CLI paths (--dry-run, --refilter, --provenance-only); the fourth, the paid Gemini call, was the only one never run and the only one broken. The maker's evidence line was accurate and worthless. APPLIES NEXT: any script with a paid or slow path needs a stub-backed exercise of that exact code path (here `--self-test` with a fake provider, proven by mutation to catch the class while --dry-run stays blind). Applies to transcribe-*.mjs, eval-calibration.mjs and any future generator: the expensive path is the one most likely to be untested and therefore most likely to be broken.
2026-09-08 · checker (chunk-schema-and-chunker cycle 1) · PATTERN: hand-picked test fixtures verify the shapes the author already imagined; the defects live in the shapes they did not, so any function with a branchy accumulation loop needs a GENERATED input space, not examples. EVIDENCE: nine deliberate, well-reasoned chunker cases all passed and shipped two medium defects — duplicate chunks in 1172/3024 fuzzed shapes (39%) and ceiling breaches in 37% of multi-turn chunks (worst 1790 vs an 800 ceiling). The author had even NAMED the exact hazard in a comment ("emitting unconditionally duplicates a chunk, skipping unconditionally loses the tail") and then guarded only one of the two sites. A checker's generated sweep found both in one run. APPLIES NEXT: buildChunks now carries its own 45-shape fuzz, and it immediately earned itself by catching a THIRD bug the checker had not isolated (an 802-char chunk against an 800 ceiling, because the length counter summed trimmed turn lengths while the emitted text joins them with separators). Same treatment is owed to any future accumulation loop — U1.4's top-k merge and U1.5's reciprocal-rank fusion are the next two.
2026-09-08 · checker (ISS-100) · PATTERN: grepping a command's OUTPUT for failure strings is not the same as checking whether the command SUCCEEDED, and on an `&&` chain it silently attributes a pass to steps that never ran. EVIDENCE: `pnpm lint:structure | grep -E "OK|violation"` showed only OK lines, so the maker reported "clean, depcruise 0 violations" — but the chain had short-circuited at tracker-audit with exit 1, and depcruise NEVER EXECUTED. The cited number came from no run at all. This is the third instance of the same family this session (after "all three CLI paths re-run" hiding an untested paid path, and prose asserting behaviour the code lacked). APPLIES NEXT: every gate in a manifest's evidence block is verified by EXIT CODE and reported as such; a grep may illustrate a result but may never establish one. Cheap and mechanical: `cmd >/dev/null 2>&1; echo "EXIT=$?"`.
2026-09-08 · maker, from a merge incident · PATTERN: an integrity check that counts rows and checks uniqueness cannot see the failure where a row SURVIVES under its id while its CONTENT is replaced — and that is exactly what a line-oriented merge of an append-only JSONL produces when two lanes allocate from one counter. EVIDENCE: qa/issues.jsonl allocates ids as max+1; two concurrent sessions each issued ISS-091..ISS-100 to entirely different findings; merge c1efa10 resolved by line position and kept one row per id. Their tip 100 rows, my tip 100 rows, merged 101 — ten findings gone while the ledger showed 101 rows, 101 unique ids and no gaps. Every gate we own (duplicate-id scan, JSON parse, count, tracker-audit G1/G2/G3) passed on a ledger that had just lost ten real findings. A missing row is visible; a row describing the wrong finding is not. APPLIES NEXT: (a) any append-only shared artifact keyed by a monotonic counter is unsafe under concurrent lanes — the commit-based coordination Umesh approved protects FILES, not a shared counter, and that gap was never covered by the ruling; (b) integrity gates for such artifacts must compare CONTENT against merged-in ancestors, not just shape at HEAD. Recovered as ISS-102..111 with an id_collision provenance field; structural fix gated in qa/gates/ledger-id-collision.md. Same hazard applies to any future counter-keyed file — docs/FEATURES.jsonl and docs/DECISIONS.md D-### are the next two, and DECISIONS is append-only-by-script which makes it MORE exposed, not less.
2026-09-08 · maker, second occurrence · PATTERN: the checker's /goal close writes `.goal/goal.json` only, so G1 goes red on every PASS and stays red until the next maker tick notices. EVIDENCE: U1.1 closed at 15:xx left `TASKS.md:94` at `open` while goal.json read `done` (filed ISS-100 by the cycle-1 chunker checker, since it made `lint:structure` exit 1); U1.2 closed at 15:57 did exactly the same thing an hour later. Both times the maker discovered it only because a gate failed. APPLIES NEXT: the close is not complete until BOTH trackers agree — either the checker updates TASKS.md in the same narrow-pathspec commit as goal.json, or the maker's close-out step includes a G1 run before it stamps the tick. The second is cheaper and belongs to the maker, since the maker already owns the close-out flip. Note this is the gate working as designed — G1 exists precisely to catch tracker divergence — but a gate that fires predictably on every single PASS is one people learn to clear reflexively rather than read.

2026-09-09 · Umesh, quoted in D:/ai_os/.claude/hooks/aios-write-guard.ps1:116-117 by a concurrent session ·
VERBATIM: "meri need nhi honi chaiye naa, like there should be maker checker validation instead of human approval."
PATTERN: a guard that stops and waits for a human is the wrong shape when the same edit can reach the file
by another route. The replacement is a CHECKER that cannot be stepped around, not a DOORMAN that can --
here, a CONFIG predicate in delivery-gate-stop.ps1 that refuses to end the session until
/aios-config-auditor has run over the config files the transcript shows were touched.
EVIDENCE: the PreToolUse hook matches only Write|Edit|MultiEdit, so every Bash heredoc/sed edit in this
session bypassed it entirely -- including the edits that changed the guard itself. A hook ask also
overrides defaultMode=auto, so auto mode read as broken. Measured cost: ~5.1s and up to 84 prompts per
sweep of writes.
APPLIES NEXT: the same test applies to every gate this project adds -- if there is a second route to the
same effect, the gate buys interruption without safety. Ask whether the control belongs at the tool
boundary (skippable) or at the session boundary (not skippable). The Lab Protocol ask is deliberately
KEPT because it enforces a named human Approver, which is a protocol requirement rather than friction.

2026-09-09 · Umesh (in session) · PATTERN: a rendered page is not a working page — validate interaction, not appearance. EVIDENCE: "/brain k node mai working needed hai, node click krne pr bhi kuch nhi hota". Confirmed and localised, not yet root-caused: `onNodeClick={handleNodeClick}` IS wired (BrainPage.tsx:130) and the handler is trivial (97-99); the canvas is the top element at its own centre with `pointer-events: auto` and nothing covering it; exactly one canvas in the DOM. But react-force-graph's pointer picking NEVER fires — 0 hover hits (`canvas.style.cursor === "pointer"`) sweeping the whole canvas at 18px, 0 at 3px around the clearly-drawn centre node, and 0 after zooming in 8 wheel steps. So it is not a missed click, not hit-radius, and not zoom. Strongest remaining hypothesis: the explicitly passed `width`/`height` (682x520, added to fix an earlier ResizeObserver race) disagree with the DPR-scaled backing store (852x650, dpr 1.25), so picking coordinates and drawing coordinates are in different spaces. APPLIES NEXT: any canvas/WebGL surface, and any component whose test mocks it — `BrainPage.test.tsx:19` `vi.mock`s react-force-graph-2d and clicks the mock's own buttons, so 5 green tests never touched the broken path. A fix must NOT be certified by that mock. — folded 2026-09-10 (implemented and independently live-validated at `de39232`; the correction below is the retained lesson)

2026-09-09 · CORRECTION to my own entry above · PATTERN: verify the INSTRUMENT before trusting a measurement, and before naming a root cause from it. EVIDENCE: I reported "pointer picking never fires" from a hover probe polling `canvas.style.cursor`. force-graph@1.51.4 signals hover with a `clickable` CSS CLASS (`.force-graph-container .clickable { cursor: pointer }`), never an inline style — so every "0 hover hits" reading measured nothing at all. I then "confirmed" a DPR-scale-loss root cause from `getTransform().a = 0.913 != dpr 1.25`; but 0.9134/1.25 = 0.7308 is the d3-zoom factor, so the transform includes zoom and the scale WAS applied. Two wrong conclusions, both stated confidently, both built on unvalidated instruments. Re-measured with the real signal: `onNodeClick` fires correctly, and only 1.2% of the canvas (32/2601 grid points, 5px radius, ~180 nodes) was ever over a node — a person aiming at a visible dot simply misses. Fixed with `nodePointerAreaPaint` (10px screen-space target, divided by globalScale): 8.8% hit rate, 7.2x. APPLIES NEXT: any canvas/WebGL probe — assert the probe detects a KNOWN-positive case before reporting a negative; and a derived quantity (a transform that folds in zoom) is not the raw quantity you think you are reading. — folded 2026-09-10 (the shipped pointer-area fix and checker browser evidence incorporate this correction)

2026-09-09 · Umesh (current session) · VERBATIM: "great. now set your  and now build all and keep testing and validating until the goal is acheived . dont stop and keep validating all in the live browser and after that keep commiting and pushing in the github repo keep going" · PATTERN: the terminal goal is continuous maker-checker delivery, not a one-shot plan: build the full feature catalogue, test every bounded unit, validate every UI-changing unit through real live-browser interactions, and commit plus push only verified increments until the north star is achieved. EVIDENCE: direct user instruction in the current session. APPLIES NEXT: the remaining 57-feature catalogue and every UI surface reached while closing it; production-data promotion remains a separate human-approved boundary. — folded 2026-09-10 (the active goal plus `qa/loop.md` already require repeated bounded units and Mode-D browser validation; local verified commits continue, while external GitHub export remains explicitly parked in `qa/gates/github-export-internal-qa.md`)

2026-09-10 · Umesh (current session) · VERBATIM: "session load hone mai issue ho rhaa hai check it too and fix it too" · PATTERN: a persisted browser credential that the API rejects must return the user to an actionable authentication state instead of leaving every protected page in a generic load-error shell. EVIDENCE: live `http://127.0.0.1:5173/` reproduced `failed to load dashboard data`; the shell rendered (so a stored key existed), a deliberately invalid key returned HTTP 401, and the current valid work-DB key returned HTTP 200 against the same `/sessions` endpoint. APPLIES NEXT: the shared web API client and AuthProvider so one recovery path covers Dashboard, Sessions, Brain, Calendar, Sources, WhatsApp, Ingest, and Settings. — folded 2026-09-22 (already implemented and checked: qa/verdicts/session-loading-verification.md checked-PASS, Cycle checked: 1 — late-401 storage guard + 2 tests, web 55/55)

## 2026-09-22 · checker fold-in index (Mode B sweep, one commit for all markers below)

| inbox entry | disposition |
|---|---|
| 2026-09-03T11:02 GEMINI_API_KEY adaptive fallback | folded → `qa/contracts/ai-provider-seam.md` amendment log (design confirmation, no criterion change) |
| 2026-09-08 flow-cost / manifest length (Umesh) | folded here, **no contract governs manifest prose** — recorded as a standing maker-process rule: manifests ~400 words unless the unit found a live-data or security consequence; enforced via maker dispatch prompts, revisit if a third instance recurs |
| 2026-09-08 post-restore re-verify at close-out | folded → `qa/contracts/loop-safety.md` (close-out discipline) |
| 2026-09-08 voluntary guard skip / armed-files assertion | folded → `qa/contracts/loop-safety.md` ([C7] + dispatch-prompt practice) |
| 2026-09-08 paired destructive ops | folded → `qa/contracts/loop-safety.md` (recorded lesson; mutate.test.mjs case (f)) |
| 2026-09-08 paid-path stub | folded → `qa/contracts/golden-set-recall.md` amendment log (new section) |
| 2026-09-08 generated input space | folded → `qa/contracts/schema-v2.md` amendment log (accumulation-loop fuzz) |
| 2026-09-08 exit-code evidence | folded → `qa/contracts/loop-safety.md` (exit-code rule) |
| 2026-09-08 merge incident / content-compare integrity | folded → `qa/contracts/ledger-shard-union-readers.md` amendment log |
| 2026-09-08 TASKS/goal divergence at close | folded → `qa/contracts/tracker-integrity.md` amendment log |
| 2026-09-09 Umesh write-guard shape (verbatim, lines 100–113) | **DEFERRED** — target `qa/contracts/write-guard.md` is status `proposed` awaiting Approver ratification; the fold applies on ratification. Content retained above. |
| 2026-09-10 session-load credential recovery | folded (marker above) — implemented and checked, cited verdict |

2026-09-22T16:05+05:30 · Umesh (chat, mid-tick) · VERBATIM: "iske liye tho maine gemini model use krne ko boal hai naa speaker transcription and diarization k liyee?" (re: U2.4 speaker resolution phases 1-3, qwen3:8b pin)
PATTERN: layer/model confusion risk — transcription+diarization (audio->text+labels) ran on Gemini (T-003, 23/23, done); U2.4 speaker IDENTITY resolution (spk:N -> person, from transcript text) is a different layer, pinned local qwen3:8b by the answered gate speaker-segment-identity A (2026-09-21) and ai-routing.yaml `speakers: [ollama]` so person-identity claims are never adjudicated by a public model.
APPLIES NEXT: (1) confirm the layer distinction with Umesh; (2) if he wants identity on Gemini too, that overrides the gate's local-only rationale — small routing unit (ai-routing.yaml speakers chain) + gate re-point, NOT a silent edit; (3) the in-flight phase-3 re-gate measures the qwen path per the answered gate regardless.
— folded 2026-09-24 (Mode B sweep consolidation): tracked open, not a build item — carried in ISS-215 as the "one fresh unfolded entry" since 2026-09-22T16:19; still awaiting Umesh's confirm/override per APPLIES NEXT (1)/(2). No routing edit made silently.

- 2026-09-24T21:56:12+05:30 · user (chat, maker resume session) · "just remember that you are the /maker   only" — role reminder: this session builds + dispatches; verdicts/sweeps come only from fresh /checker subagents.
— folded 2026-09-24 (Mode B sweep consolidation): process-only, no contract or build target — recorded as standing session-role discipline; ISS-215 refreshed to reflect both entries now accounted for.

- 2026-09-24T22:53:11+05:30 · knowledgebase-98 (peer checker session) · PATTERN: verdict files must carry `**Cycle checked:** N` on its own line, never only mid-line behind a `·` separator — the Stop-hook delivery gate (ISS-184 class, gate delivery-gate-c4-heading-form.md) cannot see compound stamps and reports phantom pending checks. EVIDENCE: qa/verdicts/u2-4-phase3-precision-regate.md line 3 compound stamp → hook "1 check pending" false positive 2026-09-24. APPLIES NEXT: every checker dispatch prompt from the maker; verdict template.
— folded 2026-09-25 (Mode B sweep consolidation): already covered by D-030 (2026-09-25), which amended `qa/contracts/delivery-gate.md` [C4] to DROP the heading-stamp form and require the own-line `**Cycle checked:** N` form this entry asks for. No further build target; the amendment IS the applied pattern.
2026-09-25T11:3x+05:30 · Umesh (chat) · VERBATIM: "what is the update, continue aur mera mail dekh vhaa old sessions and upcoming sessions k records hai and also explore jo karunn sir ne TOC ka data diyaa thaa tho kyaa vhaa new rocrding aa gyii aur agli baar ye ye sabb tu khud timele manner mai dekh lena, mujhe yaad naa dilana pdeee" · answers: new TOC recordings = fully automatic (download→Gemini→Mongo); report = "file + dashboar of platform+ while and telegrame and later like in whatsapp too like configurable bnayngee"; live record = "maximum possible"; + Zoom registrant link for Ashoka Educator Dialogues 2026-09-27 11:00 IST (record it). · PATTERN: source monitoring (Drive + work Gmail + TOC calendar) must be scheduled and self-running, never human-reminded · EVIDENCE: TOC Drive "September 26" held 4 recordings for ~3 weeks unnoticed; local copy stopped at 27 Aug · APPLIES NEXT: every external source feeding the KB (WhatsApp groups, Zoom cloud recordings pending deletion) · plan: C:/Users/Lenovo/.claude/plans/what-is-the-update-vivid-donut.md (U0–U6)
— folded 2026-09-26 (Mode B sweep consolidation): addressed by the U0-U3 build (source discovery +
capture + ingest + notify — u0-zoom-browser-join, u1-toc-sept-catchup, u2-source-watcher,
u3-notify-channels, PASS+merged e6f0b72/9c52a27/0b8c3cf/a21bc16). U4 (dashboard), U5 (auto-record
classifier), U6 remain open and untracked in TASKS.md/goal.json (see ISS-276's 2026-09-26 note).
No u2-source-watcher contract exists yet (disclosed by its own checker, commit 0b8c3cf; it used
gmail-meeting-candidates-approval.md [C5] instead) — not re-filed here, already disclosed.
2026-09-26 · Umesh (chat, via AIOS brain) · PATTERN: consider calibrated decision routing, a suggestion to EVALUATE and not to switch: a fixed-option decision goes to a small calibrated classifier that returns a probability per option, and confidence routes each item to auto-accept / LLM judge / human (τ = (C_err − C_human)/(C_err − C_auto)); run /rlcd for a full audit · EVIDENCE: relevance judge at apps/api/src/score.ts:51 (createLlmScorer) is an LLM call that scores relevance on a bounded scale. Candidate: LAYA (Apache 2.0, self-hosted) through the existing ollama provider; the content is private, so no hosted model · APPLIES NEXT: benchmark on a labelled set against the current method (accuracy, ECE, p50 latency, cost/1k, share auto-accepted at the target precision) before any change; theory + evidence in D:/ai_os/umesh/operating-brain/wiki/patterns/calibrated-decision-routing.md

## 2026-09-26T23:54:34+05:30 — Umesh: U5 auto-record policy APPROVED
Verbatim: "go on i approve", then ticked "U5 auto-record policy" (option text: "bot auto-joins meetings from trusted senders as you, without asking you each time") in a checker-session AskUserQuestion. Recorded by /checker knowledgebase-7a. Maker: build U5 within that scope; real outward sends still per the unit contract.

## 2026-09-26T23:56:41+05:30 — Umesh confirmed first-hand in maker session
Verbatim selection: "Run the InFocus repair, U5 fully automatic, Write DECISIONS entries" (maker session AskUserQuestion). U5 = bot auto-joins meetings from trusted senders as Umesh without per-meeting approval; registration forms stay human; real Telegram/WhatsApp sends still need their own approval.

## 2026-09-27T08:15:37+05:30 — Umesh: Zoom bot account
Verbatim: "so take umeshsugara@vidysea for now". The bot's Chrome profile signs in with umeshsugara@vidysea.com for now; a dedicated bot account (e.g. recorder@vidysea.com) is deferred, not rejected. Follow-ups for maker: (1) session-expiry detection + alert asking for re-login before a scheduled join; (2) server deploy note: copy data/bot-profile/ or sign in once on the server; (3) later: switch to a dedicated bot account. Recorded by /checker knowledgebase-7a.

## 2026-09-28 — maker (iss-274-wire-web-fallback unit, lane wave/iss-274-web-fallback-wire) — CONTRACT CONFLICT, checker to reconcile
This unit implements D-041 ruling 2 (docs/DECISIONS.md, Umesh/Approver, verbatim): "WEB FALLBACK:
build it, do not amend the north star. ISS-274 is resolved as wire-it, not sign-the-honest-limit.
The Phase-1 exit clause stands as written and off-corpus questions must reach a web search path."
The maker brief for this unit was explicit that it may READ `qa/contracts/ask-web-fallback-tavily.md`
but may NEVER edit it, and must append any conflict here verbatim for the checker to resolve.

**The conflict, verbatim from the existing contract:**
- Criterion 1 (line 32): "When `tavilySearchFn` is omitted (today's production default), behavior
  is byte-identical to before this unit."
- Disclosed limitation section (lines 55, 59-61): "`TAVILY_API_KEY` is empty in `.env` — no real
  Tavily account exists yet... `production.ts` omits `tavilySearchFn` entirely in this state, so
  `/ask`'s current, already-shipped behavior (`insufficient_coverage: true` on ambiguous/incorrect
  with no fallback) is completely unchanged until Umesh adds a real key."

That is precisely the state ISS-274 was filed against (qa/issues.jsonl id ISS-274): an omitted
`tavilySearchFn` means the seam is never even ATTEMPTED for an off-corpus question in production
today, which the checker-sweep note on that issue and .goal/goal.json's Phase-1 exit clause both
name as a goal-vs-contract conflict only the Approver could settle. D-041 ruling 2 is that
settlement, and it says wire it — not "ship the byte-identical no-fallback default and call that
the honest limit."

**What this unit built instead (contradicts the contract's stated criterion 1 and disclosed
limitation, by design, per the ruling above):**
- `apps/api/src/ask-web-fallback.ts` — `createTavilySearchFn()` NO LONGER returns `undefined` when
  `TAVILY_API_KEY` is unset. It always returns a real function. With no key, that function throws
  a new `TavilyUnavailableError` on every call — it is reached, not absent.
- `apps/api/src/production.ts` — `tavilySearchFn` is now wired into `askDeps` UNCONDITIONALLY (the
  old `...(tavilySearchFn ? { tavilySearchFn } : {})` spread-conditional is gone). Production no
  longer omits it in any state.
- `packages/ask/src/ask-v2.ts` — the `tavilySearchFn` call is now wrapped in try/catch. A thrown
  error (no key, or a real Tavily HTTP/network failure) is caught, logged via a new
  `ask.web_fallback_unavailable` audit entry (`recordJob` `status: "failed"`, real `error` message
  attached) and `insufficient_coverage`/`web_used` are left exactly as `ask()` computed them —
  never silently flipped to a false "resolved", never left to crash `askV2` (verified: removing
  the try/catch makes the new ISS-274 test in `ask-v2.test.ts` throw uncaught).
- Net effect: with no real `TAVILY_API_KEY` (today's actual state), an off-corpus question now
  REACHES the web-fallback seam on every request and gets an honestly-logged "unavailable" outcome,
  instead of the seam being invisible to the request entirely. `insufficient_coverage` can still end
  up `true` in that state (there genuinely was no web result), which is NOT the same claim as
  "the fallback path was never reached" — the audit log now distinguishes the two, which it could
  not before.

**Ask of the checker:** the contract's criterion 1 line and its "Disclosed limitation" section (as
quoted above) now describe behavior this unit deliberately does NOT preserve, on the Approver's own
instruction (D-041 ruling 2). Per this repo's contract-ownership rule, only /checker may amend
`qa/contracts/ask-web-fallback-tavily.md` — I have not touched it. Please reconcile it: either amend
those lines to describe the new "always-wired, honest-unavailable-on-no-key" behavior, or explain
why the old wording should stand alongside the new code if I've misread the ruling's scope. Full
capability-coverage table + isolating falsifications are in
`qa/manifests/iss-274-wire-web-fallback.md`.

## T-052 complete registration acceptance gap — 2026-10-05 (pending checker fold-in)
Source: original full grouped goal G1/R1 plus D077-D099 and concrete ISS374 evidence. Existing gmail contract Amendments2-4 explicitly certify intake/acquisition/persistence slices only; they do not define or PASS complete executable registration. Maker does not amend qa/contracts. At completed feature-ready boundary, checker must reconcile this additive acceptance scope in the existing contract; no initial-newcontract or weakened invariant is proposed.
Preserve complete goal: approved mailbox/public webinar discovery -> explicit configured operator/organizer registration -> fresh exact confirmation correlation -> owned join/record -> process/index -> cited Ask, Windows operational and separately Ubuntu verified. Native HTML currently implemented; required custom-JavaScript organizer support remains remaining, not silently excluded.
Current registration criteria needing explicit contract mapping: tenant/owner/work boundaries; literalregistrationevidence only; submitting persisted beforebrowser; restart uncertainty neverresubmits; exactfreshoriginal/thread/message/organizer/time/join proof; cancellation/reschedule/rejected/unrelated source lineage; one nativePOST with consent/challenge refusal and cookie/hiddenCSRF preserved; exactapprovedhost/scheme/port confinement across307/308/resources/newtargets/controlloss; installedlegacySWnonobservation positivecontrol; privilegedpolicyreceipt identity/config/API/readbackfailclosed beforevalues; profile/Job concurrency/crash/timeout cleanup; persistentpolicy restart/relaunch+recordingrestoration; fullnative runner+confirmation downstream integration; actualsupportedorganizer/mailbox and workdurability evidence; overallstructure/test/type/contract gate disclosure; external/live activation remains separate authorized action.
Concrete attacks retained as acceptance floors: ISS374 original307/308 two identicalbody unapprovedlocalhost cases; D097 approvedPOST HTML img src unapprovedlocalhost/leak?email fixture disclosure; D098 installedworkerbodyobserverpositive and CDPclosed-before-heldresponse release browseralive. Do not substitute successstatus/count from narrowed fixtures for completeflow. Independent checker derives its own criterion instruments and falsifiers at readiness; maker current BUILDING is not a bypass, no intermediate checker dispatch requested.


2026-10-05 U2.2 feedback: current local migrated artifact citation audit has14unresolved references/80 evidence, exact cases and input hashes in webinar-portable-release manifest final baseline. Independently normalize/verify IDs before filing or repairing; source/DB parity and semantic truth unproved. Harness must distinguish raw completion invalid citations, sanitized output, valid-ID unsupported claims, omissions and attribution. No guessed IDs or fabricated gold labels.

## Zoho canonical-media timestamp boundary check
Current trimmed audio ffprobe exit0: duration3705.018s,42394012bytes,SHA256a7a3356b33474dc4d5aae09718c094c9b8d3236361a556871b57f268c126412f. Legacy turn t080 spans3694..3724,18.982s beyond trimmed duration. Actual current process-video validateTurns over the same80rows refuses trimmed3705.018 but accepts originalaudio4703.082. Therefore validator behavior is already protective when the correct media duration is supplied; do not rebuild or weaken it. This is a canonical-media/time-origin lineage gap in the legacy artifact, not proof that all80turns lack support or that current capture validation is broken. D028 describes trimmedaudio80turn inference, while source.json still names missing originalMKV. Correct worklane repair needs explicit original/derivative binding, trim offsets and boundary disposition, preserving cited turn IDs and evidence. No row rewrite or guessed clipping performed; current liveDB parity remains unverified.
D110 fresh senior PROPOSED HIGH security findings (building-feature plan review, not formal checker ledger closure):
1. sb_join.py624/946 CSP wildcardport and DNR optionalanyport accept default443 organizer444/8443 in actualAST-derivedregex probe, contraryD098/D099currentport scope. Native secondport browser disclosure remains unrun. Independent exact-origin plan approved.
2. run-pipeline.mjs285 actualsynthetic runPipelineWatch probe prints registration/join token values fromrawoperations; explicit operational projection required, private durable state must remain byte-identical. No realtoken/content used in repro.
These findings are acted on inside currentBUILDINGsecurityfeature; no PASS, no globalgate downgrade.


## ISS-T055COLLECTIONS-001 — original static feedback, no executed RED

Privacy static review found one remaining write-boundary blocker: GET /knowledge/collections sanitizes hidden members and disables UI edit, but PUT with the visible member subset (or []) plus current expectedRevision still replaces the entire stored members array. Neither route nor writeCollection checks the existing collection for unavailable members. Thus an API client submitting the sanitized GET representation can silently delete withheld private references while returning 200, violating the stated preservation/fail-closed partial-edit policy. Before any update, inspect the persisted current row under tenant+revision and refuse replacement when any existing member is unavailable, or explicitly preserve hidden memberships using an approved policy. Full intentional collection DELETE can remain separate. Add mounted API test: mixed safe/private saved members → GET omits private ID → PUT sanitized members/current revision → refused and stored original members/revision unchanged. Source metadata filtering/visible aggregate logic otherwise appears correct statically; no tests/verdict.


## ISS-T059REPLAY-001 — verbatim independent executed feedback

T059 independent checker cycle0: FAIL — ISS-T059REPLAY-001 HIGH/data-write.
Exact actual corpus: first accepted child -> second accepted child -> retry exact first request. The historical first child is returned, but head.lastRetestId is rewritten from newer second to older first. Broker isolated probe exit1 (2488.129ms), assertion77, all18 expanded pins unchanged. Original floor1/1 reproducedRED,0/1fixed in cycle0. Canonical produced rows separately PASS3valid+2invalid-refused (429.0843ms).
Required repair evidence: replay verbatim original ledger reproduction/script/argv, count against ISS-T059REPLAY-001; verify the historical return does not alter current newer head/revision/lock or reprocess intake/index/Ask; preserve durable interrupted-child promotion and original crash-after-child-write recovery. Additions supplement, never substitute the original floor. Cycle1 source/test must be frozen and independently verified through the sole broker before PASS.
Current mounted caller evidence remains gated by explicit ROUTE_FREEZE; T022 human calibration/T043 live index+cited Ask and full live flywheel remain HOLD. No human approval or parent completion is granted by source tests.


Architecture feedback for checker adoption — public Ask vectorless boundary (root-authorized 2026-10-15): active public /ask must never invoke embedding, vector-storage or legacy retrieval ports, including when configured vectorless:false and with an installed embedding port. Canonical current-authority HTTP acceptance requires 200, exact source citation and zero embedding/vector/legacy-factory counters. Pure low-level vector adapter implementations/tests may remain dormant. The preserved qa/evidence/ask-graph-selection/legacy-http-diagnostic.test.ts keeps its original expected-one-embedding assertion and is an architecture-incompatible historical diagnostic, never evidence of current architecture PASS. Only checker may adopt this feedback into contracts; maker changed no qa/contracts file.
2026-10-31 · maker 6c-wa-wave3 · PATTERN: on this host (C: full, pagefile cannot grow) a full suite at default runner parallelism dies out-of-memory and looks like ~20 product reds; run api with --test-concurrency=6 and vitest with --maxWorkers=4. Also the api test run writes untracked apps/api/qa/evidence/goal-t059-maker/rows.json into the tree, which blocks --stamp-6c-green in that worktree · EVIDENCE: qa/verdicts/prepush-wa-wave3.md (cf244ceb) · APPLIES NEXT: every 6c/backstop full suite here; the rows.json writer should target a temp dir

## 2026-11-25 - Umesh (approved plan, D-227) - 17 acceptance checks for go-live — folded 2026-11-25 (checker Mode B fold-in, no sweep) → `qa/contracts/go-live-acceptance.md` [G01-G17, LIVE-ONLY, GI1-GI8]; unit dependencies in live-verify-script.md, ask-condition-fidelity.md, pairwise-answer-judge.md, extraction-scoring-harness.md
Source: Umesh, approved plan of 2026-11-25 (decision D-227). Plan file: C:\Users\Lenovo\.claude\plans\meeting-bot-imperative-starfish-of-3fb8d78b-cac7-406e-9e13-fe76f3d5cd42.md, section 4.

These 17 rows are the acceptance checks for the plan approved on 2026-11-25 (D-227). /checker folds each row into the matching contract. One check per feature. Findings outside a row are filed, not built. Consent stays out of scope (D-210).

| # | Feature | The single check |
|---|---|---|
| 1 | Public web, sign-in, Ask | From a phone on mobile data at `https://kb.vidysea.com/knowledgebase`: a new person signs up, the admin approves them as viewer, they sign in, ask the pinned UC question, get a citation with speaker and start/end time, open the cited turn, sign out. The viewer cannot open admin, ingest, WhatsApp or meeting-bot pages. Scripted in `scripts/live-verify.mjs --base …` |
| 2 | Old link | `www.vidysea.com/knowledgebase/…` redirects to the same path on the kb host |
| 3 | Waiver defect | The 14 archived UC probes and the checker's failing cases in `qa/verdicts/kb-ask-web-grounding-repair.md` pass; one live UC retest |
| 4 | All 23 sessions | 23 of 23 eligible; the 23 per-session controls and the 36 questions for the nine sessions pass (D-221) |
| 5 | Retrieval | `scripts/eval-recall.mjs` on `data/eval/golden-set.json`: above the new baseline, zero questions lost |
| 6 | Web fallback | One live outside-knowledge question is answered, or returns an explicit "answered from our sessions only", never an error shown as "stale" |
| 7 | Bot joins and records | One real Meet joined by the Cloud Run bot with nobody clicking; a non-empty recording in the bucket; the session indexed into `MONGO_WORK_DB`. Then one calendar event starts a capture by itself |
| 8 | Bot refusal | The host refuses the bot: the capture ends in under 30 s with `admission_denied`, no zero-byte file, one alert mail |
| 9 | Calendar | Hosted `GET /calendar/upcoming` returns 200 with Umesh's next meeting within 10 minutes; the Calendar page shows it |
| 10 | Auto-registration | The bot registers for one real public webinar; the confirmation mail arrives |
| 11 | WhatsApp linking | Umesh scans the QR on the hosted link screen; one group message appears in the archive database |
| 12 | WhatsApp into the knowledge base | A message sent in a tracked group shows on the hosted WhatsApp page without a manual run |
| 13 | Speaker names | 100 citations from the 92-question replay plus 30 claims, audited by a second reviewer: 0 wrong names; at least 85% of cited turns show a confirmed full name |
| 14 | Claims | At least 90% of claims cited in the 92-question replay are human-verified or machine-checked; the 300-claim audit meets the approved bar |
| 15 | Counsellor page | On the deployed build: 10 scripted questions, each with a named-speaker citation whose click lands on the cited turn, at least one real microphone turn spoken back. 10 of 10 |
| 16 | Championship rehearsal | 92 of 92 questions frozen, answered, baselined and judged on a work copy |
| 17 | Database hardening | Rehearsal: the check in row 1 passes through an authenticated connection; unauthenticated `listDatabases` is refused; the app user cannot read other databases |

## 2026-11-25 - Umesh (approved plan, D-227) - unit-level checks for wave 1 — folded 2026-11-25 (checker Mode B fold-in, no sweep) → L1 `live-verify-script.md` · L2 `api-rate-limit.md` · F0 `cloud-build-deploy.md` · F1 `ask-condition-fidelity.md` · D4 `pairwise-answer-judge.md` · D2 `extraction-scoring-harness.md`; maker-reading dispositions in each file's amendment log (rejected: F0 `latest` tag, D4 name-scrubbing)

Source: plan file `C:\Users\Lenovo\.claude\plans\meeting-bot-imperative-starfish-of-3fb8d78b-cac7-406e-9e13-fe76f3d5cd42.md`, sections 6 and 7, approved by Umesh on 2026-11-25 (D-227). Text in quotes is the plan's own wording. Lines under "Maker reading" are the maker's interpretation, NOT Umesh's words; the checker decides whether each becomes a criterion.

### L1 - live check script (plan section 6)
"Extend `scripts/live-verify.mjs` with `--base` and the env names `LKB_LIVE_EMAIL`, `LKB_LIVE_PASSWORD`" - check: "runs green against the test tag".
Maker reading:
- [L1-a] `node scripts/live-verify.mjs --base <origin-with-base-path>` targets that deployment; without `--base` the script behaves as today.
- [L1-b] With `LKB_LIVE_EMAIL` and `LKB_LIVE_PASSWORD` set the script signs in through the session login route and runs its checks as that user; the password never appears in argv, stdout, stderr or any written file; missing credentials when sign-in is needed give a clear non-zero exit.
- [L1-c] In signed-in mode the script covers the scripted part of launch row 1: ask the pinned UC question and assert a citation carrying a speaker and start/end time; open the cited turn; assert a viewer is refused on admin, ingest, WhatsApp and meeting-bot routes; sign out and assert the session is gone. Non-zero exit if any step fails; one PASS/FAIL line per step.

### L2 - per-user rate limit (plan section 6)
"The one code fix before launch. `apps/api/src/rate-limit.ts` `createRateLimiter` keys on `tenantId`, so all signed-in users share one bucket of 60 per minute (a 429 from a single admin browsing is in `qa/evidence/cloud-run-visible-admin-20261125.md`). Key it on the user for session principals. Branch `release/kb-golive` off `a9bbeb98`. Touches auth: full manifest, one fresh checker" - check: "unit tests plus a two-user probe on the tagged URL".
Maker reading:
- [L2-a] For a session principal the bucket key is the user: two signed-in users of one tenant each get the full per-minute allowance, and user A exhausting theirs never gives user B a 429.
- [L2-b] Every other principal kind keeps today's key and limits exactly (API-key principals, unauthenticated requests). No route loses rate limiting; the per-minute number is unchanged.
- [L2-c] The key comes from the authenticated session, never from a header, query or body value, and includes the tenant so two users can never collide across tenants.

### F0 - build config for master pushes (plan section 7, lane A)
"Make master pushes safe. New file: root `cloudbuild.yaml` that builds both targets and runs the two-container deploy" - check: "a throwaway tagged deploy from the trigger keeps both containers". Stage 0 correction: the trigger runs an inline four-step config (it does not auto-detect the Dockerfile); the unit is unchanged in substance.
Maker reading:
- [F0-a] `cloudbuild.yaml` builds the Dockerfile twice (`--target web`, `--target api`), tags each image with the commit sha and `latest`, pushes both, and keeps the inline config's build-arg, cache and labels.
- [F0-b] The deploy step sets the image of BOTH named containers of the service in one revision and changes nothing else.
- [F0-c] No new required substitution beyond the trigger's existing ones; optional substitutions with safe defaults allow a tagged, no-traffic throwaway run.
- [F0-d] A test parses the file and asserts the two builds, two pushes, one two-container deploy, and that every substitution is the trigger's or has a default.

### F1 - waiver defect (plan section 7, lane A)
"Waiver defect. Cause as far as the code shows: the school-specific condition is lost between excerpt hydration and answer generation (D-219 found excerpts that split sentences; `def9078d` fixed only wording). Feed the full speaker turn as the evidence unit in `packages/ask/src/answer.ts` and `ask-v2.ts`; add a gate in `apps/api/src/answer-policy/answer-evidence.ts`: when the cited turn carries a condition and the answer drops it, hold the answer" - check (row 3): "The 14 archived UC probes and the checker's failing cases in `qa/verdicts/kb-ask-web-grounding-repair.md` pass; one live UC retest".
Maker reading:
- [F1-a] The text given to answer generation for a cited turn is the whole speaker turn, never a fragment that cuts a sentence or drops the clause carrying the condition.
- [F1-b] When a cited turn states a rule with a scope or condition and the answer states the rule without it, the answer is held through the existing hold path; an answer that keeps the condition passes; an answer citing an unconditional turn is not held.
- [F1-c] A standing regression test re-runs, verbatim, the 14 archived UC probes and every failing case in the verdict above from their recorded inputs; the manifest reports the count against that corpus by id; an open case is named with its reason (D-015).

### D4 - pairwise answer judge (plan section 7, lane D)
"two model judges, blind and order-swapped (`scripts/eval/llm-eval.mjs` extended with a pairwise prompt); output = win rate with a confidence interval."
Maker reading:
- [D4J-a] A pairwise mode takes items {id, question, answerA, answerB}; the prompt never reveals which side is the AI or the human, a source name, a session id or a speaker name.
- [D4J-b] Every (item, judge) is asked twice with the order swapped; the result is A or B only when both orders agree, otherwise `inconsistent` (counted as a tie); a failed or unparseable reply is `error`, never a win.
- [D4J-c] Output per judge and combined: counts A / B / tie / inconsistent / error, win rate of side A over decided items with a 95% confidence interval (method named), the judges' agreement rate, the position-inconsistency rate.
- [D4J-d] Existing modes and tests unchanged; tests make no network call (stub judges, including one that always prefers the first position).

### D2 - extraction scoring harness (plan section 7, lane D)
"State: the scoring harness exists (`packages/index/src/eval/extraction.ts` `evaluateExtractionCase`, `scripts/eval-extraction.mjs`) but scores 72 local claims with no accepted gold set and no thresholds." "Thresholds proposed for Umesh's approval: 0 fabricated citations; claim support at least 95%; machine-checked tier at least 98%; fact coverage at least 70%; topics 90% precision and 70% recall; decisions 85% and 70%; 0 false decisions on no-decision sessions."
Maker reading:
- [D2H-a] `scripts/eval-extraction.mjs --gold <path>` scores against a human gold set in the review tooling's export shape and reports each metric named above with numerator and denominator.
- [D2H-b] `--thresholds <path>` reads the bar from a file; the run exits non-zero when a measured metric misses it; the proposed numbers ship in a file marked proposed, not approved; nothing in code hard-codes them.
- [D2H-c] A metric whose inputs are absent is reported `not-measured`, never 0 or 100, and fails the run only if the thresholds file marks it required.
- [D2H-d] Where two reviewers labelled the same claim the harness reports their agreement rate; without `--gold` the script behaves as today.

## 2026-11-25 - Umesh (D-228) - go-live address is the Cloud Run service URL, not kb.vidysea.com — folded 2026-11-25 (checker Mode B fold-in, no sweep) → `qa/contracts/go-live-acceptance.md` [GI2, G01, G02 accepted as owner statement, G02 tightened]; D-229 recorded in `api-rate-limit.md` out-of-scope; L5, L6, L10 deferred, no row depends on them

Owner's words, chat 2026-11-25 (voice-typed Hindi, transliterated). On the load balancer and the kb DNS record: "nahin hai to hum over-engineering ki taraf abhi nahin jayenge, baad mein add-on ho jayega." After the reasoning was shown: "redirect ho jayega to dikkat kya hai, redirect hone do."

Decision record: docs/DECISIONS.md D-228 (replaces only the public-name part of D-227).

Maker reading, for /checker to judge:
- Row 1 (G01): the address is `https://vidysea-knowledgebase-5z2zofynhq-el.a.run.app/knowledgebase` in place of `https://kb.vidysea.com/knowledgebase`. Nothing else in the row changes.
- Row 2 (G02): `www.vidysea.com/knowledgebase/...` redirects to the same path on the Cloud Run service address, in place of "the kb host".
- Where the plan says a check passes "on kb.vidysea.com", read "on the Cloud Run deployment".
- The load balancer, the kb DNS record and the ingress lock (plan steps L5, L6, L10) are deferred; no row depends on them.
## 2026-11-25 - maker (derived from the approved plan, D-227) - unit-level checks for Lane B units B2 and B4 — folded 2026-11-25 (checker Mode B fold-in, no sweep; maker-derived, not owner words) → B2 `qa/contracts/meeting-bot-admission-denied.md` [B2-C1..C8, B2-I1..I5] · B4 `qa/contracts/recorder-container-state.md` [B4-C1..C8, B4-I1..I7]; per-criterion dispositions in each file's amendment log; G08 amended in `go-live-acceptance.md`

Source: plan file `C:\Users\Lenovo\.claude\plans\meeting-bot-imperative-starfish-of-3fb8d78b-cac7-406e-9e13-fe76f3d5cd42.md`, section 4 row 8 and section 7 Lane B rows B2 and B4, approved by Umesh on 2026-11-25 (D-227). These are not Umesh's words: the maker derived them from the plan and the code read on 2026-11-25. Text in quotes is the plan's own wording. Lines under "Maker reading" are the maker's interpretation; the checker decides whether each becomes a criterion. Both units are held until the Lane B decision entries (plan row B1) are appended. Each criterion below is provable on a laptop with no cloud resource, no Google sign-in, no real meeting and no deployed address.

### B2 - catch a Meet refusal early (plan section 7, lane B)
"Catch a Meet refusal early. 'You can't join this video call' is detected nowhere, so a refusal runs to the 900 s timeout and leaves a zero-byte file." Files named by the plan: `packages/meeting-bot/py/sb_join_detect.py:131-264`, `sb_join_loop.py:20-100`, `src/capture/admission-gate.ts:36-38`, `record-commands.ts:128`. Live check (plan section 4 row 8): "The host refuses the bot: the capture ends in under 30 s with `admission_denied`, no zero-byte file, one alert mail".
Test runners. Python: pytest from the repo's project venv, `python -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py` (as the first file's docstring says). TypeScript: from `packages/meeting-bot`, `node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts` (the package's `test` script runs `node --test --import tsx "src/**/*.test.ts"`). New tests go into those existing files; new names the Python tests import must be re-exported from `sb_join.py`, as the existing ones are.
Maker reading:
- [B2-C1] Pure classification. A Meet page whose lowercased body text contains "you can't join this video call" (straight apostrophe and the typographic apostrophe U+2019 both) is classified as refused, a state distinct from lobby, in-call and unknown. Refusal wins over a visible in-call control (D-225: the refused page had no leave button, so this is the safe direction). Pytest, string input only, no browser.
- [B2-C2] Saved page fixture. A new fixture `packages/meeting-bot/py/fixtures/meet_refused.html` carrying the refusal text is run through `BODY_TEXT_JS` and the Meet in-call script in the existing module-scoped headless Chrome of `test_sb_join_admission.py`, and the result is refused. If no Chrome is installed the check is NOT-MEASURED, never PASS. (A local headless browser only; no sign-in, no network.)
- [B2-C3] Join loop on a fake clock. Using the file's `_run`/`_Clock` harness (fake driver, fake clock): a scenario that shows the refusal text from t=0, and a second that shows a lobby for 20 s and then the refusal text, each emit exactly one `admission_denied` event no later than 10 fake seconds after the text first appears, never emit `admitted` or `admission_timeout`, and end with `closed`. With no stop file the loop leaves within the existing 45 s `FLUSH_GRACE_S`; with a stop file written 5 fake seconds after the event it leaves within 5 fake seconds of that.
- [B2-C4] Gate. `createAdmissionGate().onEvent({event: "admission_denied", ...})` returns a failure message that starts with `admission_denied:` and sets `gate.state` to "failed"; an `admission_denied` arriving after `admitted` changes nothing (same rule the file's existing test applies to `admission_timeout`, `admission-status.test.ts:22-34`).
- [B2-C5] End to end with the fake join script (the `runRecord` pattern of `admission-gate.test.ts`: real tab receiver, fake join script, no browser). The fake bot emits `admission_denied` right after start; `runRecord` rejects with a message that starts `admission_denied`, and the measured wall time is under 30 s with `inject.wait` left at its default of 5000 ms.
- [B2-C6] No zero-byte file. After the rejection in C5, the record directory holds no `.webm` of size 0. A non-empty partial recording, if the fake bot wrote one, is left untouched. The status file says failed, not stopped.
- [B2-C7] Nothing else moves. The four existing suites above pass unchanged, plus two new regression tests: a lobby that lasts 120 fake seconds and then admits emits `admitted` once and no `admission_denied`; a lobby that never ends still emits exactly one `admission_timeout` at the configured limit and no `admission_denied`. The refusal text on a Zoom or Teams URL does not emit `admission_denied` (Meet only).
Invariants (what must not change):
- [B2-I1] Default admission timeout stays 900 s and the `LKB_ADMISSION_TIMEOUT_S` and `--admission-timeout` overrides behave as today (`test_sb_join_admission.py:27-28`, `:195-205`).
- [B2-I2] Lobby and in-call classification for Meet, Zoom, Teams and other URLs is byte-for-byte the same for every body text that does not contain the refusal text.
- [B2-I3] The bot never auto-clicks or reloads in response to the refusal, and the lobby reload suppression stays (`sb_join_loop.py:84-87`).
- [B2-I4] The `admission_timeout` event, message text and flush grace are unchanged.
- [B2-I5] No zero-byte cleanup is added on any path other than the refusal path.
Feeds: live check plan section 4 row 8 (G08 in `qa/contracts/go-live-acceptance.md`), together with the alert mail of plan row B10.
Operator steps (not builder criteria): (1) a host refuses the bot in a real Meet, and the capture ends in under 30 s on the hosted recorder; (2) the bucket holds no zero-byte file for that session; (3) one alert mail arrives in the alert mailbox (needs Google sign-in, a real mailbox and the plan's B10; the existing `capture-failed` alert path in `scripts/webinar/scheduler/lifecycle-alerts.mjs` may already send it once `LKB_ALERT_EMAIL` and `LKB_ALERT_EMAIL_TO` are set, which is a configuration check, not a builder criterion).

### B4 - container state, lease, shutdown, `record-once`, attendance loop (plan section 7, lane B)
"Restore / snapshot / lease, lock delete, shutdown trap, a `record-once` mode, the attendance loop; forward `LKB_TRANSCRIPT_QA`, `WEBINAR_VISION_MODEL`, `GEMINI_STT_MODEL`" in `docker/meeting-bot/entrypoint.sh` (:32, :65) and `Dockerfile:74-86`. Plan check: "a restarted container is still signed in".
Test runner and seam. `node --test` on a new test file beside `docker/meeting-bot/image.test.mjs` (that file belongs to another session). The test runs the real `entrypoint.sh` with `sh` under Git Bash or WSL, in a temp directory, with stub executables first on `PATH`: `gcloud` and `gsutil` (they act on a local folder that stands in for the bucket and log every call), plus `pulseaudio`, `pactl`, `Xvfb`, `xdpyinfo` and a stub `node` that records its argv and environment. The maker names in the manifest which of `gcloud storage` or `gsutil` the entrypoint uses; every bucket call goes through a command on `PATH`, so no real bucket is reachable. If a signal test cannot run in the checker's shell it is NOT-MEASURED, never PASS. Variable names below are placeholders; the maker names the real ones.
Maker reading:
- [B4-C1] Restore. With the bucket variable set and a stub bucket holding a state tar (profile directory plus release directory), the entrypoint extracts it into `LKB_BOT_PROFILE_DIR` and the release directory before the doctor gate and before the pipeline starts, and a marker file and a `live-proof.json` come back byte-equal. With no bucket variable set, no stub command is called at all and the sequence is the same as today. With the bucket set but no object (first boot), it starts with empty state and logs that. With a truncated tar it exits non-zero and leaves existing local state untouched.
- [B4-C2] Locks. After restore, `poller.lock` (release directory) and `.lkb-tab-capture.lock` (profile directory) are absent even if the tar carried them. `.lkb-recovery.lock` is not deleted (a present one still blocks the next capture, `tab-browser.ts:149`). A snapshot tar never contains any of the three.
- [B4-C3] Lease. The entrypoint takes the lease before it restores. If the stub bucket holds an unexpired lease from another holder, it neither restores nor starts the pipeline, never overwrites the lease, and exits non-zero with a message. An expired lease is taken over. The lease is renewed while the pipeline runs (interval set short by an env variable in the test) and deleted on a clean shutdown only if this instance still holds it.
- [B4-C4] Snapshot. With a 1 s interval and a stub `node` that sleeps, at least two periodic snapshots upload, each a complete tar of exactly the profile and release trees. A stub upload that fails leaves the previous bucket object byte-identical and does not stop the pipeline.
- [B4-C5] Shutdown trap (`run` and `record-once` modes only; `login` mode is untouched). On SIGTERM the entrypoint passes SIGTERM to the stub `node`, waits for it up to a bounded time (short in the test), takes one final snapshot after the child exits, releases the lease, and exits within the bound. A second SIGTERM does not start a second final snapshot. The pipeline no longer runs through `exec`, so the trap survives.
- [B4-C6] `record-once`. `BOT_MODE=record-once` with the meeting URL and end time in environment variables runs the doctor gate, then ONE record command (the stub `node` sees `record <url> --until ...` as in `record-commands.ts:84-86`), never `run-pipeline.mjs`. Afterwards it copies the non-empty `.webm` files of the record directory to the stub bucket (a zero-byte file is skipped and logged), takes a final snapshot, releases the lease and exits with the record command's exit status.
- [B4-C7] Attendance loop. In `run` mode with the attendance account variable set, the entrypoint calls `node scripts/webinar/run-pipeline.mjs --run --calendar-attendance-account <account>` once per interval (default 300 s, the `POLL_MS` of `scripts/webinar/scheduler/service.mjs:2`; short in the test), never with `--watch`, a failing tick is logged and the loop continues, new non-empty recordings are copied to the stub bucket after each tick, and SIGTERM stops the loop (C5). With the account variable unset, the current `--run --watch` command line is used unchanged.
- [B4-C8] Environment passes through. With `LKB_TRANSCRIPT_QA=1`, `WEBINAR_VISION_MODEL=a` and `GEMINI_STT_MODEL=b` set on the entrypoint, the stub `node` sees all three unchanged in `run`, `record-once` and `doctor` modes, and `VNC_PASSWORD` is still absent from it (existing rule).
Invariants (what must not change):
- [B4-I1] `login` mode: the VNC pass file handling, the `trap 'rm -f "$VNC_PASSFILE"' EXIT` line, and the order (`unset VNC_PASSWORD` before `pulseaudio -D`, `Xvfb :99` and `x11vnc`) are unchanged.
- [B4-I2] The doctor gate still fails closed (`doctor_rc` check, `grep -q '^MISSING'`) and `BOT_MODE=doctor` still exits after it.
- [B4-I3] With no bucket variable the container behaves as today, so `scripts/qa/container-workflows/bot-smoke.sh` (own entrypoint, `--internal` network) is unaffected.
- [B4-I4] The Dockerfile keeps `USER node`, the pinned `gws`, the tini `ENTRYPOINT`, and carries no secret value in any `ENV` line.
- [B4-I5] No change to any file outside `docker/meeting-bot/` for this unit (the host id override is plan unit B3; compose and cloud resources are B5).
Feeds: the operator step "a restarted container is still signed in" (plan row B4, first proof B8).
Operator steps (not builder criteria): (1) build the image and run `LKB_DOCKER_TESTS=1 BOT_IMAGE=<image> node --test docker/meeting-bot/image.test.mjs` (needs a network build); (2) after the Google sign-in (plan B6) and the first snapshot, restart the real worker and see that the bot is still signed in; (3) check Cloud Run's real shutdown grace against the snapshot time and size; (4) check the bucket client's permissions and that `gws` runs from a read-only mounted secret (needs the real project); (5) the main session decides how the proof recording named by `live-proof.json` and the registration policy store under `raw/webinars` survive a restart (see the state entry).

Existing assertions in `docker/meeting-bot/image.test.mjs` that the B4 edits will break (the file is not to be edited by this unit; listing only):
1. Test "entrypoint has run, doctor and login modes and cleans stale state" (:42-51). Needle `run-pipeline.mjs --run --watch` (:47) and `assert.match(e, /exec node scripts\/webinar\/run-pipeline\.mjs --run --watch/)` (:49) fail once `exec` is replaced by a child process and a loop; needle `.lkb-tab-capture.lock` (:46) fails only if that line at `entrypoint.sh:32` is removed or renamed.
2. Test "entrypoint ... BEFORE any daemon starts (ISS-409)" (:65-76). It requires lines that start exactly `pulseaudio -D` and `Xvfb :99` at column 0 (`/^pulseaudio -D/m`, `/^Xvfb :99/m`); wrapping them in a function or indenting them breaks it. A restore step placed before them must not read `$VNC_PASSWORD` (the test requires every read to precede the `unset`).
3. Test "removes the VNC pass file when x11vnc fails (ISS-410)" (:78-83). It looks for the literal `trap 'rm -f "$VNC_PASSFILE"' EXIT` before `x11vnc`. A second `trap ... EXIT` for shutdown would replace it in `sh`, so the shutdown trap must be armed only after the login branch, and in a different signal slot or a combined handler that still contains that literal text.
4. Test "Dockerfile sets the Linux bot environment and carries no secrets" (:33-40). It breaks if a new `ENV` line matches `(API_KEY|TOKEN|PASSWORD|SECRET|MONGODB_URL)\s*=\s*\S`, for example a variable named with SECRET and given a value.
5. Built-image tests (:129-152, skipped unless `LKB_DOCKER_TESTS=1` and `BOT_IMAGE`): "doctor passes" and "doctor gate fails closed when node itself fails" break if doctor mode starts to need a bucket or a lease.

Decision entries for these units, appended 2026-11-25: D-230 (hosting), D-231 (single-slot attendance), D-232 (Meet refusal), D-233 (state, lease, host id), D-234 (registration, blocked on gate question Q3).

## 2026-11-25 - maker (derived from the approved plan, D-227, section 4 row 3; verdict qa/verdicts/f1-waiver-condition.md on wave/f1-waiver-condition; two code reviews) - unit-level checks for the follow-up unit `f1-whole-turn-hydration` — folded 2026-11-25 (checker Mode B fold-in, no sweep; maker-derived, not owner words) → `qa/contracts/ask-condition-fidelity.md` [F1B-C1..C5, F1B-I1..I4, F1-C6 amended]; G03 amended in `go-live-acceptance.md`

**Why this unit exists.** Unit `f1-waiver-condition` passed its contract (6/6, verdict commit dbf3dd1a). Its checker and both code reviews found that the fix cannot work on the deployed app yet. The production hydrator (`apps/api/src/ask/source-context.ts:198`, `slices(turn.text)`) hands generation 1024-byte slices and never returns whole turns, so fast Ask holds every answer that cites a turn over 1024 bytes (264 of 3427 turns, 56% of the text; manifest `f1-waiver-condition` line 54). Deep Ask has neither whole-turn evidence nor the incomplete-turn hold. The live UC retest of row 3 cannot show a release until this lands. Ledger: ISS-F1WAIVERCONDITION-001 and -002 (high) in `qa/issues.F1WAIVERCONDITION.jsonl` on that branch. `f1-waiver-condition` is not merged into the launch line before this unit passes.

**Scope.** Branch off `wave/f1-waiver-condition`. Files: `apps/api/src/ask/source-context.ts` (hydrator), `packages/ask/src/ask-graph.ts` (deep answer node), `packages/ask/src/ask-v2.ts` only where the deep path is wired, `apps/api/src/answer-policy/answer-evidence.ts` only for the check named in F1B-C4, and their existing tests. No new source file.

**Criteria**
- **F1B-C1 (whole turns from the hydrator).** For every cited turn the hydrator returns `liveTurns: [{ sessionId, turnId, text }]` where `text` equals the stored turn text byte for byte, next to the existing slices. A turn over the per-turn cap (16 KiB, `TURN_EVIDENCE_LIMITS`) is left out of `liveTurns`, never cut. Test: a stored 3,000-byte turn comes back whole; a 20,000-byte turn is absent from `liveTurns`.
- **F1B-C2 (fast Ask through the real hydrator).** With the real hydrator and a fake model, on the archived t042 turn (over 1024 bytes): an answer that keeps the school-specific condition is released; an answer that drops it is held for review. The first case is held on the base commit, so the test is red there.
- **F1B-C3 (deep Ask).** The deep answer node gives generation whole turns and applies the same hold when a cited turn is incomplete or its condition is dropped. The 14 archived UC probes replayed in deep mode give the same hold or release result as in fast mode, reported as n/14 against the recorded corpus, probe by probe (D-015).
- **F1B-C4 (one judgment, on whole turns).** When `liveTurns` is present, the release check in `answer-evidence.ts` judges the whole turns and does not run again on slices; an answer with `web_used` sources is judged only on its internal sources. One test for each.
- **F1B-C5 (recorded reproductions).** The regression test of the unit re-runs the `repro` recorded for ISS-F1WAIVERCONDITION-001 and -002 as written in the ledger, and the manifest reports the count by issue id.

**Invariants**
- **F1B-I1 (tenancy; never capped).** `liveTurns` is built from the turn read the hydrator already makes under the tenant and visibility of the caller. No new query and no new collection read. A two-tenant test shows a turn of tenant B never appears in the `liveTurns` of tenant A. If the builder needs a new read, the unit is tenancy-class: dual check with a cited `dual-trigger` line.
- **F1B-I2.** The existing F1 tests (F1-C1..C5) and the 27-file affected set of `f1-waiver-condition` stay green.
- **F1B-I3.** Over-cap evidence is held, never truncated (unchanged).
- **F1B-I4.** No live model call and no read of or write to `lkb_prod` in the tests of this unit. The live UC retest is launch row G03 and needs a yes from Umesh (D-218).

**Filed, not built in this unit** (stop rule of the approved plan: findings outside the check of a unit are filed). Detector misses (bare "if/when", numeric thresholds, time limits, institution names not of the form "X School", Hinglish and Devanagari) and false holds (idiomatic "only", negations, quoted questions) are ISS-F1WAIVERCONDITION-003 and -004 (medium). They need a labelled condition set and a measured miss rate and false-hold rate before any rule change. The size of `answer-evidence.ts` (534 non-blank lines against the 300 limit) and moving the detector to its own module are ISS-F1WAIVERCONDITION-006 (low); a new module needs Umesh to name the target file first.
