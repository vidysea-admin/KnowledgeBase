# T-045 full source coverage

**Handshake status:** ready-for-check (non-live criteria only; live gates pending)
Status: ready-for-check
Fix cycle: 0
Date: 2026-10-14
Task: T-045
Priority tier: 3, next unblocked roadmap task selected by the root ALL40 execution instruction.
Maker: /root/docker_governance_review
Checker: /root/docker_dependency_review/checker_t045
Contract: qa/contracts/goal-t045.md, C1-C8.
Packet: qa/packets/goal-t045.md

## Scope and authorization

Root explicitly leased source-acquisition/**, hosted-recording.ts/youtube.ts acquisition safety edits,
source-intake/adapters.ts+wiring.ts+media-runtime.ts/tests and this lane's QA/docs.
T-053 owns connector workflows/dashboard/stores; T-048 owns script-only recording transcription.
Shared composition, package/lock/Docker, exports, trackers, decisions and Git mutations remain root
integration-owner work. No qa/contracts or checker verdict was edited by this maker.
On resume, root additionally leased the existing source-intake/store.ts truthful-indexing correction;
T-053 acknowledged this exception. Its new connector workflow/store remains exclusive to that lane.

The implemented candidate composes actual Gemini File API transcription under explicit model/key
configuration, a bounded sanitized yt-dlp runner, physical isolated media scratch and a pinned OnAir
event-page resolver that accepts exactly one embedded YouTube recording. It also supplies Zoom-specific
hosted extraction. It does not substitute that hosted path for the required live Zoom bot proof.
Production media carries a bounded file-only ffprobe measurement into real STT, which requires/clamps
that duration and refuses missing beginning/tail coverage. Source intake exposes explicit indexing
done/failed/pending; done includes only a narrowed positive completion receipt without diagnostics.

## Acceptance state

This manifest deliberately remains in_progress. No full five-source READY/PASS claim is made.
Actual YouTube tool acquisition, protected OnAir session and each Meet/Teams/Zoom live browser run,
received-media/duration/speech checks, real STT, tenant Mongo persistence/readback, actual index and cited
Ask consumption are absent. Root owns resource/CPU/provider/browser scheduling; focused checks are queued.
The existing /ingest/source store now reports downstream failure explicitly rather than logging and
silently omitting it. T-053's connector consumer independently validates/reuses positive receipts and
records durable failure gaps. Actual receipt, persistence/index/Ask and recovery execution remain gates.
Exact portable/CI provision proposal: docs/t045-runtime-provision-proposal.md. No provisioning was run.

Source implementation can be reviewed while these gates remain pending. Its review cannot close T-045.
Only a matching-cycle independent full PASS on unchanged checked bytes can close the handshake.

## Durable worker extension

Root extended the exclusive source lease to source-intake/jobs/**. Immutable private shared-spool enqueue/poll/claims plus separate runSourceJob execution and eight meaningful FS fixtures are authored. Default API source wiring refuses inline SDK transcription; explicit worker composition is required. T053 owns safe202/poll/physical receipt consumption/request CAS and gates unsupported watched snapshots. Actual root factory/compiled worker/runtime integration and broker execution remain pending, so status stays in_progress. No automatic replay of uncertain claims and no new canonical Mongo collection.

## Current worker factory update

Actual lazy source-jobs.ts factory and jobs/entry.ts source are present, shared esbuild two-entry output configured but unrun. API queue needs no worker provider key/model. Fresh stored ingest identity plus configured hosting/account lifecycle are rechecked before worker acquisition. Job/type interfaces stable; ten FS fixture tests authored and queued. Current hashes are in the packet. Full C1-C8 and container/live acceptance remain HOLD/pending.

## Security floor prerequisites

ISS-T045WORKER-001/002 checker shard cases are authored into privacy.test.ts (4 ACL +4 OnAir exact recorded inputs); executed0/4 each, no closed issue/PASS. Real Windows native ACL receipt remains independently required. Source spool now requires default actual private-owner/ACL proof. Protected OnAir requires exact source-session tenant/account/event/actor/provider-processing grant plus immutable binding/session fingerprints, with fresh worker verification before any page/tool/provider. Generic worker intake has no cookie. Source/API session binding metadata cannot establish actual login or real source success.

## Ready-for-check submission, non-live scope (2026-10-16, lane w16-t045src)

Status: ready-for-check. Fix cycle: 0. Base SHA a9fac545. Candidate SHA: the single lane commit on
lane/w16-t045src (see commit that adds this section). Source files are byte-identical to base; this commit
changes only this manifest. This submission asks for review of the NON-LIVE parts of C1-C8 only. The parent
cannot PASS on it: every live gate below is pending and is not claimed.

### Key source hashes (sha256 prefix, base == candidate)
adapters.ts 960012c588bb0696 / source-reader.ts 3de5d356a593624f / store.ts 8f57fb2fcf1f245a /
media-runtime.ts 3f62fc4b920b8332 / source-acquisition duration.ts e87c4c51e14ea8bb, exec.ts d5631b7949a96ab4,
hosted.ts 3f5886c4c1bba042, onair.ts 76c31ea303d70436 / sources/onair.ts 7d736fc6f035f22b.

### Checks run (node via codex runtime; no network, no yt-dlp, no browser, no bot, no Mongo, no paid STT)
- apps/api: source-intake.test, source-intake-hardening.test, source-reader.test, media-runtime.test: tests 35 pass 35 fail 0.
- apps/api jobs: jobs.test.ts tests 10 pass 10 fail 0 (first run timed out under load at 110 s wrapper, re-run alone 72.6 s);
  privacy.test.ts 5 tests, 3 pass, 2 skipped (native Windows private-dir receipt prerequisite; POSIX control). The skips mean the
  ISS-T045WORKER-001/002 native ACL receipts stay UNEXECUTED here.
- packages/ingest: onair, youtube, zoom-recording, recording, media-sources-registry, tenant-scoped-ids, url, guarded-fetch,
  node-transport, source-acquisition/hosted tests: tests 179 pass 179 fail 0.
- apps/api tsc --noEmit -p tsconfig.json: exit 0.
- No defect found; no source edited.

### C1-C8 mapping
| Clause | Non-live evidence (source-tested) | Live gate still pending |
|---|---|---|
| C1 five real runs | URL recognition, adapter selection, OnAir single-embedded-YouTube resolver, Zoom hosted extraction, fake-runner tests | real yt-dlp YouTube; protected OnAir login session; live Meet, Teams, Zoom bot runs |
| C2 real entrypoint/host | wiring.ts default-OFF gate, worker composition, inline-STT refusal tests | actual composed run on Windows host with real downloader/STT/browser profile |
| C3 usable acquisition | bounded ffprobe duration, STT duration clamp/coverage refusal, media signature/size tests (fixtures) | real received media probe, paid STT on real bytes, bot capture finalization |
| C4 durable + downstream | store.ts indexing done/failed/pending truthfulness tests | real tenant Mongo persistence and readback, real index, cited Ask on new bytes |
| C5 auth/tenant | tenant-scoped-ids, hardening tests, worker privacy/tenant tests | live cross-tenant probes against real Mongo; Windows native ACL receipt |
| C6 duplicate/failure | duplicate 200 with no create/delete, failure states, safe retry in tests | concurrent duplicate/rollback on real database |
| C7 acquisition security | guarded-fetch, node-transport, url, exec.ts bounded runner, hosted scratch tests; ISS-T045WORKER cases in privacy.test | real redirect/private-network behaviour with live tool; ISS-T045WORKER-001/002 corpus executed 0/4 ACL (skipped), OnAir cases within the 3 passing tests, not separately counted |
| C8 packet | this section; run contracts/verify_contracts.py and disclose if vacuous (not run by maker) | checker independent probes under root CPU lease |

### Not run by maker
contracts/verify_contracts.py, any real-Mongo, browser, bot, yt-dlp, network, paid-provider or Docker check.
