# Session Handoff — KnowledgeBase machine migration — 2026-10-09 12:44:13 +0530

> READ THIS FIRST when resuming. This checkpoint preserves work in progress for a second machine. Static rules are in AGENTS.md; verify runtime, paths and paused-unit conditions before acting.

## TL;DR — resume in one paragraph
Umesh asked to publish all current repository work to continue on a machine with more RAM/space. Clone the public admin repository on branch codex/machine-migration-2026-10-09 to obtain the complete current root source, QA, goal/task state and selected corpus artifacts. Four unmerged histories and a separate dirty alert worktree are also preserved; they are not automatically merged into this candidate. This is a migration backup, not a green release or live-deployment claim. First inspect the goal, QA and this handoff; then continue candidate reconciliation and U2.2 offline quality work without rebuilding already shipped features.

## Active task (what was in flight)
Machine-migration publication under D-117: preserve current code and all local unique histories, ship a portable handoff, audit secrets and verify by an independent fresh clone. Application north star remains the hosted Living Knowledge Base and AI virtual counsellor. Roadmap is unchanged: 95 tasks, 51 done, 5 in progress and 39 pending. Full R1/R2/R3 product scope remains.

## Done this session
- Inventoried all 30 registered worktrees and 42 original branch refs. Original root parent is 614d78b8966428296f394b8bf3e6c547d41beca5.
- Identified root 48 modified tracked paths and 20 new code/QA paths; eight new small corpus/source artifacts must travel with the code.
- Identified a separate worktree with two modified alert files; preserve it on codex/machine-migration-alerts-2026-10-09 without rewriting or cleaning the owner's working tree.
- Identified four histories absent from master: lane/a-speakers (2 commits), wave/u2-4-phase3-fix (13), wave/vector-gap-durability (2), worktree-agent-a035913864247fa58 (5). Their union is 22 unique commits.
- Secret audit across 3838 history blobs and 78 working files: two configured secret values and eight credential patterns; eight positive/eight negative controls; zero findings after credential-specific classification. No credential values are retained in the audit.
- Appended D-117 using scripts/append_decision.ps1; all pre-existing decision bytes preserved.
- Fresh contracts/verify_contracts.py exit 0 by vacuity. Fresh offline extraction replay exit 2: 29 loaded cases, 3427 turns, 72 persisted claims, 14 invalid references of 80; no independently labelled semantic cases. Existing failures retained honestly.
- Created this sanitized portable handoff and local archive. Publication success is established by remote/clone verification, not by this pre-publication note.

## In progress / paused mid-step
- U2.2: offline extraction-quality harness is BUILDING. Source/claims/corpus are available; six declared synthetic case artifacts are missing and three sessions have invalid source timing. Semantic gold, thresholds and independent final checker acceptance remain pending.
- U2.4: speaker precision re-gate is FAIL/paused. Read qa/.paused.u2-4-phase3-precision-regate; at least 8 GB free plus its other conditions are required. No model-proposed speaker writes/persona backfill until the gate passes.
- U3.1: Ask page exists and has historical real-browser citation click-through proof. The goal's old unreachable-UI title is stale. Broader answer UX/acceptance remains.
- T-051: real operational release, grounded notes/Q&A scope, actual alert receipt, complete feed acquisition, restart/recovery and actual Ubuntu-host proof remain open.
- T-052: acquisition/persistence subunits have scoped PASS; complete executable registration safety and confirmation-email correlation acceptance remain open.
- Unmerged branch verdicts include FAIL/paused work. Preserve history and use existing-file, independently approved maker/checker changes; do not bulk-merge stale branches.
- Historical HANDOFF tool handles refer to another machine/session. A number/lock/pending JSON is not live process proof. Inspect retained artifacts and present runtime before resuming or restarting.

## Next steps (do these to continue) — ordered
1. Clone the exact migration branch. Initialize the private WhatsApp submodule with your GitHub account if needed. Read AGENTS.md, ARCHITECTURE.md, current docs/DECISIONS.md and TASKS.md.
2. Read .handoffs/machine-migration-inventory-2026-10-09.json for all original branch names/SHAs/worktree paths. All original branch commits must be reachable from published migration/master/unmerged refs. Historical merged branch names can be reconstructed from that map without copying machine worktree metadata.
3. Install project dependencies on the new machine: Node 24+, pnpm 10.33.0, Python suitable for the pinned requirements, Chrome, FFmpeg/FFprobe and Docker where the work runtime needs it. Use the existing webinar setup script; do not copy node_modules, .venv or browser cookies.
4. Configure secrets locally using .env.example, reconnect GWS OAuth and establish an isolated MONGO_WORK_DB. Production Mongo remains read-only; never inherit an implicit production DB default.
5. Re-run typecheck and the relevant checks on this exact candidate. Latest source-wide evidence had typecheck PASS, published remux CI FAIL and structure/tracker failures; do not call this green or deployed.
6. In two non-overlapping light lanes, reconcile candidate/CI/structure work and finish U2.2's independent semantic/citation evaluation. Run the heavy speaker re-gate only under its resource/pause conditions.
7. Prove R1 on a real approved webinar: usable audio/video -> grounded speech/screen evidence -> cited Ask, sustained capture, actual alerts and interruption/restart. Registration-required coverage requires T-052; direct-link coverage can advance independently.
8. Independently verify the accepted release on the actual Ubuntu host. Then close R2 full-corpus/search/speaker/answer acceptance before broader R3 counsellor/platform/championship work.

### New-machine clone and setup
Commands below are instructions, not actions performed on this old machine:

    git clone --branch codex/machine-migration-2026-10-09 https://github.com/vidysea-admin/KnowledgeBase.git KnowledgeBase
    cd KnowledgeBase
    git submodule update --init --recursive
    corepack enable
    corepack pnpm install --frozen-lockfile
    node scripts/webinar/setup.mjs --install
    node scripts/webinar/setup.mjs
    pnpm -r typecheck
    node scripts/eval-extraction.mjs --input data/eval/extraction-corpus.json

The private submodule remains https://github.com/umeshsugara-ai/whatsapp-archiver.git at 7cdf1a18ac542ada34113b291a5cac51079ae9af; your account needs access. Parent CI does not initialize it. If local pnpm is installed directly, pnpm install --frozen-lockfile is the equivalent package-install command. Schema validation also needs jsonschema in the chosen Python environment, as the existing CI specifies. Use the existing setup doctor to identify missing tools.

To preview the app, configure the isolated work Mongo, tenant/API key and local credentials according to docs/webinar-release.md, then use pnpm demo:up. That command requires MONGO_WORK_DB. Do not start a live registration or paid provider batch just to verify a clone.

## Open threads / pending user decisions
- Umesh/checker: independent semantic gold adjudication and binding quality thresholds; previously rejected canonical grounded-notes/Q&A schema scope.
- External registration identity/scope and new paid provider batches remain separate human gates.
- DevOps: actual Ubuntu host/service owner and actual operator alert recipient/channel.
- Championship judges are later R3 scope and should not block R1.
- Other machine-local AIOS skills/brain at D:/ai_os and user-level credentials are outside this repository. Reconnect that context separately if required; do not publish their credentials/config as part of the public repo.

## Runtime state (VERIFY before resuming)
- Repo/branch on old machine: D:/KnowledgeBase, master; original working source/index preserved. Migration state is published via separate refs.
- API/UI/work Mongo were inactive at the report probe; Docker engine was unreachable. Latest report probe: 23.7 GB RAM total, 2.4 GB free. These are historical machine observations, not guarantees for the new host.
- No app server, paid model, browser capture, scheduler or deployment was started by this migration session.
- Browser/OAuth sessions do not transfer through Git. Authenticate locally on the new machine.
- Locked old worktrees are not evidence of live agents; old referenced PIDs were absent at the migration check.

## Key files & artifacts (paths)
Old-machine paths below remap to the chosen clone directory:
- D:/KnowledgeBase/.goal/goal.json — full roadmap and release order.
- D:/KnowledgeBase/TASKS.md — task evidence and current checkpoints.
- D:/KnowledgeBase/docs/DECISIONS.md — append-only history through D-117.
- D:/KnowledgeBase/docs/webinar-release.md — operational runbook and accepted proof limits.
- D:/KnowledgeBase/qa/manifests/t052-executable-registration.md — remaining registration seam.
- D:/KnowledgeBase/qa/manifests/u22-extraction-measurement-harness.md — extraction BUILDING state.
- D:/KnowledgeBase/data/eval/extraction-corpus.json — portable replay input.
- D:/KnowledgeBase/.handoffs/machine-migration-inventory-2026-10-09.json — branch/worktree/source inventory.
- D:/KnowledgeBase/.handoffs/KnowledgeBase-Analytical-Report-2026-10-09.md — full counts, all 44 unfinished tasks and plan.
- D:/KnowledgeBase/.handoffs/KnowledgeBase-Report-2026-10-09.html — standalone filterable report.
- D:/KnowledgeBase/.handoffs/machine-migration-public-audit.json — sanitized scanner evidence.
- D:/KnowledgeBase/.handoffs/2026-10-09-124413-previous-HANDOFF.md — previous canonical handoff, retained as historical context.

## Pointers (deeper context already on disk — read on demand)
- D-104 through D-114: current work/testing authorizations; D-115/D-116: public repo migration; D-117: this cross-machine WIP backup.
- qa/contracts/, qa/manifests/, qa/verdicts/ and the union of qa/issues*.jsonl remain the maker/checker evidence surface.
- Copied analytical report contains older original-machine artifact links; use the report text plus relative repository paths when those links are unavailable on the new machine.
- Root/master is the accepted historical baseline, not an accepted completion of dirty candidate work.

## Gotchas / watch-outs
- This migration branch is intentionally WIP. Do not promote it directly to a live server merely because it is available on GitHub.
- Keep uncertain speakers unresolved and strict webinar indexing/media provenance checks intact.
- Do not claim the empty frozen-contract validator's vacuous PASS proves product quality.
- 14/80 invalid citation references measures structural integrity, not answer accuracy/hallucination rate.
- Gmail's historical full ID listing did not establish full body acquisition/classification; do not silently treat partial reads as a complete scan.
- Credentials, cookies, raw recording binaries, machine-installed dependencies, caches and Mongo volume files are not a Git transport. Retained source/transcript/corpus files are in the repository; regenerate runtime state or separately transfer required private media through an authorized private channel.
- No production promotion, live deployment, external organizer submission or paid model batch is implied by this backup.
- The normal push remote is the admin repository. Keep migration/FAIL/paused histories separate until independently accepted.

## Desktop continuation — 2026-10-09
- Current repo: C:/Users/product/Desktop/KnowledgeBase, migration branch; local agent checkpoint only, no push/merge/deployment.
- Installed plain Node executable verified v24.21.0: C:/Program Files/WindowsApps/OpenAI.Codex_26.1002.7124.0_x64__2p2nqsd0c76g0/app/resources/cua_node/bin/node.exe.
- Task-local pnpm10.33.0 CLI: C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work/pnpm-10.33.0/package/bin/pnpm.cjs. Run through Node. Core/AI/index85dependency hardlink install works; full/web install previously hit ENOSPC and its partial files were cleaned by its owning agent.
- U2.2 reviewed-metric followup:22/22 tests, independent21/21 adversarial probes and index typecheck green; omission/entity coverage remains explicit. Full U2.2 remains BUILDING pending independently confirmed gold, thresholds and real corpus acceptance.
- Stale citation cause verified: T003 replaced positional turn IDs while T002 claims/pages survived. New version-safe transcript/provenance unit preserves original bytes, invalidates derived knowledge before replacement and freezes same-buffer seed snapshots. Strict speech+screen/frame validation and explicit work-DB targets are preserved.
- Provenance targeted13/13 and independent27/27 checks pass; affected union54/55 FAIL at genuine realFFmpeg fixture (spawn ffmpeg ENOENT). Unit HOLD/BUILDING. No FFmpeg/FFprobe found; storage cannot safely provision them now. Global LOC6 and directory2 baseline failures remain; frozen-contract validator passes by vacuity only.
- Original corpus unchanged:72claims/80references,14invalid references and3invalid-time sessions. data/eval/extraction-reconciliation-reviewed.json contains7independently approved proposed mappings with65unreviewed IDs; proposals are not applied or reimported. Preliminary13labels are independent-AI review, not human gold.
- Existing local credentials/.env, isolated MONGO_WORK_DB/MONGODB_URL, Google OAuth and provider/media readiness remain setup gates. Production DB defaults are refused by seed/sync; no real DB/provider/browser/scheduler operation ran.
- Resume after storage recovery: install FFmpeg+FFprobe and finish dependency setup; rerun the failing affected-media gate, obtain independent provenance verdict close-out; then independently reconcile the retained corpus and prove full R1/R2/R3 acceptance. Do not stamp old claims/pages with current hashes or reimport unresolved knowledge. U2.4 pause still requires its original8GB/resource conditions.

## Later Desktop runtime checkpoint — 2026-10-09
- Earlier storage/prerequisite hold resolved: FFmpeg and FFprobe9.0.2 are verified at task work/ffmpeg. Provenance Cycle2 independently checked-PASS: prior54 unchanged affected cases plus freshly executed formerly failing real-media1/1, independently rerun; do not describe this as a new full55-case run.
- Full frontend build and configured API/index typechecks pass. Strict runtime extraction source unit now submits/judges complete bounded speech/screen spans, carries pending questions across windows, preserves exact item/question/answer quotations, and preflights a real candidate session tree and finite vectors before replacing knowledge. Runtime schemas/generated types remain unchanged; historical canonical-schema approval/rollout is still separate.
- Maker affected62/62 and immediate downstream35/35 pass with zero skips; final index/API typechecks pass. Independent checker verdict is recorded separately at qa/verdicts/strict-webinar-runtime-extraction.md. The1011-turn/>100K fixture proves bounded local context and all10 pending questions; individual over-budget full context fails honestly. No provider precision, human gold or full-release acceptance follows.
- Actual local services at checkpoint: Mongo7.0.43 PID22376,127.0.0.1:27019; API production factory PID13656,127.0.0.1:3300 with health200/dbok; static built frontend PID22112,http://127.0.0.1:5173/ with API base3300. Environment helper/logs/identity files are under C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work. Only those exact owned processes may be restarted or stopped after revalidating ownership.
- API database is explicit isolated lkb_work_20261009_01a11f9c; generated read-key in gitignored .env is never printed or committed. Authenticated sessions currently returns an empty list; absent/malformed keys are401. This proves local app plumbing, not corpus acceptance. No real corpus seed, paid provider call, OAuth-token setup, live capture or production DB write occurred.
- Original72claims and7proposed independently reviewed replacements remain unchanged, with65unreviewed IDs explicit. Next work needs legitimate source-bound recovery, provider/OAuth readiness, human gold/thresholds and actual webinar/Ask acceptance. Keep full R1/R2/R3 roadmap gates open.
- Concurrent calendar-attendance files, docs/DECISIONS.md and scripts/webinar/run-pipeline.mjs have unconfirmed ownership in this worktree. They were preserved and excluded from this source/runtime checkpoint; do not call the whole worktree clean or stage them implicitly. No push, master merge, deployment or activation was performed.

## Source recovery and provider checkpoint — 2026-10-09
- The Desktop migration checkout now has a real local product corpus. Original repository corpus bytes are preserved; task packet work/toc-recovery-v1 projects29 real dated sessions (23 originals plus6 September additions),3424 valid source turns,29 extractive transcript pages,7 independently reviewed replacement claims and58 visible source/vector gaps. The65 other legacy claims remain unresolved. Three reversed intervals remain archived/excluded with exact IDs; six declared synthetic cases still lack artifacts. Claims stay needs-review, speaker identity/external truth remain unverified, and session semantic/index status stays pending.
- Recovery packetId477255b83bb0f001a7fce53d48af7631bdc8a92c2e24e85b3108a3c9ece749ef is bound to preserved original byte hashes and independently approved review SHA2568aa7ce9c90ae2b83107fdf815e90491194ac4fea830ae79a4b957d52dc5ea0e5. Build/import refuses changed review authority, altered source/evidence, nonempty knowledge collections and partial-import retries. Insert-only initialization into mongodb://127.0.0.1:27019/lkb_work_20261009_01a11f9c completed; existing API keys/unrelated collections were preserved. Durable receipt is under task work/toc-recovery-v1-import-receipt.json. Recovery CLI has --build, --dry-run and --import; the current initialized DB must not be reseeded.
- Maker recovery33/33 and immediate downstream31/31 passed; actual production session/search/citation/tree readers resolve all29 sessions and8 supporting citation turns, with foreign tenant reads empty/null. The independent checker owns the matching recovery verdict. This is source recovery; genuine corpus vectors and complete accepted Ask remain separate gates.
- Current loopback runtime: Mongo PID22376 at27019; accepted-source API PID29316 at3300 health200/dbok, authorized /sessions200 returns29, missing/malformed auth401; built frontend PID22112 at http://127.0.0.1:5173/ uses API3300. Isolated Ollama PID7732 at11435 uses a task-owned model store with cloud disabled. API read key and .env remain local/ignored; provider/auth values are never recorded here. Revalidate ownership before stopping these processes. Runtime helpers/logs remain in C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work.
- Provider boundary and missing-Gemini-credentials units are independently scoped checked-PASS. Claude uses the existing native OAuth login with an isolated ephemeral cwd, restricted/no-tool/no-MCP/no-Chrome execution, bounded input/output/time and owned process cleanup; one public synthetic KB_OK prompt succeeded. Blank Gemini credentials fail before prompt transport and retain legitimate router fallback. Actual local nomic-embed-text document/query outputs are finite/nonzero768-dimensional vectors; truncate:false and oneCPUthread are enforced. Only public synthetic provider proof ran; corpus embedding backfill remains pending.
- Next implementation: opt-in bounded Ask catalog and tenant-scoped source hydration preserving exact source excerpts/turn IDs/speaker labels/times, followed by genuine corpus-vector backfill and real in-corpus/off-corpus Ask acceptance. The current full extractive tree is2096418bytes; do not submit it through the legacy whole-tree provider path. Preserve standing evaluator/routing thresholds and strict speech/screen guards. Human semantic gold, canonical grounded-schema rollout, full U2.2 and product/release acceptance remain open; roadmap51/95 count is unchanged. These are local checkpoints, with no public push/master merge/deployment.
