# Checker packet — goal-t053, fix cycle 0

State: BUILDING after user-authorized roadmap resume; fresh root CPU slot,
pinned-install/codegen and shared integration pending. No historical grant reused.
Repo: C:\Users\product\Desktop\KnowledgeBase
Contract: qa/contracts/goal-t053.md C1–C7; P1–P4 remain unverified.

## Complete change map and boundaries

`router.ts` composes authenticated scope middleware with `/connector-workflow`
inventory; POST recording-requests; PUT recording-requests/:id; POST intake;
POST recording-requests/:id/receive (URL intake followed by verified receipt);
POST watched/verify. Tenant comes only from req.auth. Public intake passes only
tenantId+normalized URL to existing SourceIntakeDeps.intake, then explicitly
awaits/checks the immediate bound indexing consumer. Failure writes a generic gap
and returns fixed 502; failure writing that gap returns truthful 503.

`gaps.ts` validates owner/description/SLA and optional tenant-owned source on
opening. Receipt requires a same-tenant recording or hosted URL source backed by
actual media rows, indexed session, valid timed turns, page and chunks in
`mongo-store.ts`; CAS moves open -> received/expired. Repeat
matching receipt is idempotent. Expiry is refused until due. Nonmatching receipt,
terminal-state change and lost CAS are explicit conflicts, never successes.

`watched.ts` runs per-tenant in-flight locking, a 25-source cap and a 120-second
between-source budget. Real guarded fetcher in wiring bounds each HTTP snapshot
to 10 seconds / 1 MB with existing resolved-address/redirect controls. No second
network fetch occurs while creating turns: `snapshot.ts` extracts visible HTML
paragraphs (or retains plain text), existing createUrlSource sees that snapshot,
and intakeFromSource + existing Mongo intake sink materialize source/session/turns.
Source metadata retains watched id/fetchedAt/diffFrom; consumed session/source ids
also accompany lastFetch to preserve URL-specific lineage when content dedupes.
Changed intake is indexed even after deduped retry. Legacy hash-only checks lack
a consumed receipt and therefore still enter intake even when text is unchanged.
Each watched row retains the consumed source/session receipt; resolved prior
watched-failure gaps move to received only after downstream consumption.
Degraded indexing is failure;
only successful required consumption permits CAS lastFetch persistence.
Unchanged previously consumed content skips intake/index; one ordinary source failure records a gap
and the remaining sources continue. Gap-write failure remains visible in the run
outcome. Corrupt cross-tenant store rows fail closed before their outbound fetch.

`mongo-store.ts` exclusively uses scopedCollection over existing schemas. Every
operation validates tenant and refuses protected/unconfigured work DB names.
`wiring.ts` default-off LKB_CONNECTOR_WORKFLOW flag composes real guarded HTTP,
existing Mongo intake sink and bound indexer. Root owns external capabilities,
source-runtime provider composition and all mounting. This unit does not infer
live verification from configured credentials.

`ConnectorsPage.tsx` presents actual readiness, recording owners/SLA/lifecycle,
ingested session links and watched changed/unchanged/failure/remaining outcomes.
Authentication-session revision blocks late tenant data/results. No automatic
email/notification send or periodic-cadence claim appears in the page.

## Caller/consumer paths

- apps/api/src/auth.ts: requireAuth verifies key -> tenant; requireScope requires
  exact sources/ingest scopes.
- apps/api/src/source-intake/store.ts: createSourceIntakeDeps + createMongoIntakeSink
  provide existing intake/rollback/idempotence; explicit producer indexing results report done/failed/pending. Positive producer
  receipts are reused without double indexing; failed results stay visible.
- packages/ingest/src/intake.ts and sources/url.ts: tenant-derived natural source
  identity, dedupe, paragraph turns and source/session/turn plan.
- apps/api/src/indexing/session.ts: actual immediate consumer writes grounded
  claims, page, tree, chunks and session status; degraded result is refused here.
- packages/ingest/src/sources/{guarded-fetch,node-transport}.ts: every resolved
  IP/redirect check, pinned address socket, byte/time caps.
- apps/api/src/db-name.ts and packages/db/src/lib/tenantScope.ts: DB refusal,
  auth-derived tenant pinning for every collection query/write/update.
- Root-only apps/api/src/server.ts + composition/integrations/{knowledge,routes}.ts + production.ts: optional deps/router
  mounting; root-only apps/web/src/App.tsx/nav: `/connectors` page mounting.

## Focused checks prepared, NOT EXECUTED

1. From repo root:
   `node --test --test-concurrency=1 --import tsx apps/api/src/connector-workflow/workflow.test.ts apps/api/src/indexing/generation.test.ts`
   Actual auth/Express Router, intake planner/Mongo sink and indexSession run over
   explicitly synthetic fixture Mongo/transport/AI rows. Assertions inspect written
   sources/turns/claims/page/tree/chunks, downstream evidence references, gap CAS,
   public errors, watched hash/provenance/receipt/retry and tenant isolation.
2. From apps/web:
   `node node_modules/vitest/vitest.mjs run src/pages/ConnectorsPage.test.tsx --maxWorkers=1 --minWorkers=1`
   UI request relist, rejected receipt, watched failure and late-tenant response.
3. `python contracts/verify_contracts.py` if required by current contract state.
4. Root-only centralized package typechecks after coherent integration: `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` in apps/api and apps/web.

Execution facts: node C:\Program Files\nodejs\node.exe exists; python
C:\Program Files\Python312\python.exe exists; workspace dependencies exist.
No browser, external network/provider action, live DB/production write, export,
deployment or external messaging is authorized. Tests use no external network.
No test/mutation run occurred before root CPU grant. No mutation is planned.

## Open integration and acceptance gates

Root metadata schema declarations exist in readback: optional sources.sourceMeta.connectorIndex
positive v2 completion receipt (sessionId, version, strict, complete, generation,
turnCount, treeWritten); optional gaps.watchedSourceRef,
gaps.sourceUrlHash (tenant-bound SHA256 of the normalized requested URL), and
watched_sources.lastFetch.sourceRef/sessionId; schema/generated/migration are
root-only. Default production lkb refusal is deliberate pending authorization.
Fixture transport/AI/Mongo success cannot close full-parent P1–P4; actual provider
credentials/permissions, authorized media/URLs, persistent isolated DB+tenant,
running cadence scheduler and delivery destination/evidence remain distinct gates.

Public source failures keep sourceUrlHash correlation without copying bearer URLs
into gaps/errors; successful consumed same-URL retry resolves those gaps and links
the actual sourceRef. Caller receipt requires both sources and ingest scopes,
real media row and indexed timed transcript/page/chunks; a generic article is refused.
Gap inventory uses stable tenant-scoped cursor pagination, so a 250-row page does
not strand older requests. The UI supplies an explicit load-more action.

## Resumed correction: positive index receipt and physical consumption

`assertConnectorIndexConsumed` now requires completion v2 with complete/treeWritten
true, positive turnCount and generation, summary/claims degraded exactly null,
and chunks written > 0 with skipped null. Missing/legacy/contradictory receipts
are refused. `consumption.ts` checks the persisted tenant tree contains the exact
session. `mongo-store.ts` checks timed turns/count, page evidence pointing to those
actual turns, dense chunk vectors and turnRefs, and the real session tree before
writing sourceMeta.connectorIndex. Deduped and unchanged skips require both that
positive receipt and the same physical floor. A prior nonthrowing partial index
cannot turn status.done or leftover rows into a fabricated success.

New boundary checks execute actual indexing writes, substitute incomplete or
legacy nonthrowing result receipts, and assert failure/gap/no lastFetch/no cached
consumption until a successful retry. Production-shaped sourceIntake glue now consumes the T045-owned explicit receipt
interface. Prepared tests use actual createSourceIntakeDeps with the real bound
indexSession and assert successful receipt reuse/no double index; failed producer
indexing followed by a deduped recovery must index once. No runtime result yet.

## Durable job caller and visible consumption

Optional SourceJobStore is supplied by root as the trailing buildConnectorWorkflowDeps
argument. In durable mode, intake and supported recording URL receipt enqueue202;
direct sourceIntake and legacy missing-proof indexing are refused. Actor key ID
comes from verified req.auth.keyId; body tenant/actor/approval fields cannot authorize
work. jobs.ts uses a fresh nonsecret server approvalRef. Root's source-jobs bridge
also checks configured tenant allowlist and the persisted nonrevoked ingest key
before enqueue, then again before worker execution. This server approval reference
is not a human approval claim. Canonical queued inputs permit only credential-free
YouTube/OnAir/Zoom recording URLs without bearer query parameters. Generic public
URLs need a future worker adapter and are explicitly unsupported in durable mode.

POST jobs/:id/check returns queued/running202 or uncertain with one deterministic
durable source-pending action gap. A succeeded spool result requires completed()
positive producer receipt matching safe job result IDs and real tenant artifacts.
Partial/missing artifacts remain failure; no provider/index retry is run.
POST recording-requests/:id/receive-job needs sources+ingest and only CASreceives
after that proof plus actual recording media. Matching finalized receipt is
idempotent. Failure-gap resolution uses a specialized source-pending CAS;
recording transition remains recording-kind-restricted. A previously resolved
source-job action gap reopens if later physical artifact loss is detected; recording
terminal state is never rewound, and no provider attempt is replayed. Safe DTOs omit URLs,
actor/approval fields, indexing receipts/generation and provider diagnostics.

The physical floor additionally checks full chunk turnRef coverage and valid
stored claim evidence for this actual session. Zero extracted claims remains
valid; the shared completion receipt has no expected claim count. Tests corrupt
real consumed chunk coverage and actual claim evidence to verify cached-proof
refusal. Protected DB refusal occurs before any external intake/index/watch.
Stable recording request nonce retries reject conflicting fields, and gap insert
must be acknowledged before a durable creation response.

ConnectorsPage shows queued/running/uncertain progress and only checked consumption
links. Queue acceptance cannot mark recording received. Opaque save/reopen job
links populate a resume form after reload and require an explicit check action;
no automatic finalize occurs from query navigation. Nonces survive failed retries
until inputs change. Synchronous auth-owner masking plus apiKey/sessionVersion
generation guards refuse late prior-tenant or same-key prior-login job results.
No automatic notification send or watched cadence claim.

In durable mode watched verification503 watched_job_snapshot_unsupported: URL-only
worker refetch cannot preserve the original guarded snapshot/hash. Immutable
watched-job payloads and actual scheduler cadence stay open parent gates. Direct
watched limits remain 25/run, 120s between-source and HTTP10s/1MB; no hard cancellation
claim is made for an arbitrary hanging DB/indexer dependency.

## Additional caller and test map

- source-intake/jobs/{input,store,receipt,worker}.ts (T045 owner): canonical input,
  private fsynced tenant spool, immutable receipt and no blind uncertain retry.
- composition/integrations/source-jobs.ts (root bridge): trusted tenant allowlist,
  current actor/revocation/scopes, configured worker composition.
- hosting/journal.ts (shared dependency): append/lock/replay/fsync implementation.
- Node prepared total27: actual auth/router/planner/Mongo sink/indexSession plus
  real private spool reopen/worker run and recording finalization. The durable
  hosted worker exercises actual strictWebinar indexSession with exact span inventory,
  quoted summary/claim extracts and separate synthetic judge verdicts; asserts strict
  positive v2 receipt. Another test performs real strict consumer writes then substitutes
  a nonthrowing incomplete receipt: worker must stay uncertain/no public result/no retry. Mongo, guarded
  HTTP, acquisition, STT, completion and embeddings remain synthetic stand-ins.
  Hosted fixture bytes [1,2,3] and /fixture-media/recording.mp4 are not actual media.
- UI prepared total9: owner/SLA relist, receipt refusal, watched failure,
  queued -> checked consumed link, uncertain recording stays open, saved-job
  explicit resume, late job and late inventory across tenant/same-key login.
- Required contracts/verify_contracts.py evidence must come from root's centralized
  result or a separately granted focused slot. No child full tsc/Vite build.
- Web Vitest is apps/web/node_modules/vitest, not root node_modules/vitest.
- Pinned install/codegen prerequisite and fresh focused FIFOgrant still required.
  No tests or mutation runs have executed; temporary synthetic spool tests register
  cleanup. No actual DB/network/provider/browser/deploy/export/external messages.

Readback confirms root routes.ts mount and App /connectors. Root same-store sourceJobs injection in knowledge.ts is verified at
d23f176d9524ceef0245b00ca843eb5ff063cbcf1fc761ee8f6e155a7f2e1239;
full coherent build and focused runtime evidence remain pending. Root metadata schemas exist; codegen
and validation remain root-owned. Durable generic-public adapter support, immutable
watched job/cadence, authorized live media/provider and real isolated tenant/DB/
shared worker/restart/revocation evidence remain unverified P1–P4 parent gates.

## Current source identity

All maker-owned source files are new: no base existed. The SHA256 table below is
current source identity only, not executed evidence. Shared dependency snapshots
must be reconfirmed after their owners stabilize the integration.



### Reconciliation after shared source security changes

The broker skipped API before launch because its expected shared hashes drifted;
that skip is not a failed test or executed evidence. Root's central compiler
reported no T053 diagnostics in the API39/web5 freeze (other owners repair those).
No child tsc launched. Source changes after that freeze are only the parent-approved
test-only queueFixtureStore import below; final compiler coherence remains root-owned.

T045 SourceJobApproval now has private optional sourceAuthority with exact tenant/
account/event/binding/session fingerprints; public SourceJobView is unchanged.
Worker executeJob can run the immutable approved source-account capability, with
fresh actor/account/session check. T053 serializer never exposes this authority.

SourceJobStore now defaults to native Windows owner/DACL or POSIX private owner/
modes before reading/writing any spool bearer URL. The T053 temporary protocol
tests explicitly import queueFixtureStore from jobs/test-fixture.ts: deterministic
ACL reader model only on Windows, still actual PrivateSourceJournal/HostingJournal,
immutable queue/worker and real strict indexSession. Production defaults are
unchanged. Native Windows ACL success remains a separate unverified actual-device
gate; no model fixture PASS can count as that security proof.

Receipt generation is returned by actual indexSession and stored in positive
source metadata; the earlier checkpoint did not generation-stamp actual artifacts; the newly
leased generation source candidate below supersedes that implementation. The checker cannot certify current artifact generation binding. The root-authorized producer repair below is now a source
candidate; runtime verification remains explicitly pending;
same source/session identity, physical completeness and exact-tree checks are
implemented and must still be exercised.

The isolated workflow.test.ts command does not import global server/routes,
knowledge integration, source-jobs root factory or worker entry. Their table hashes
are observed integration identities only. Mutable routes.ts/knowledge.ts/source-jobs.ts/
entry.ts must not block isolated fixture prehash checks; root production-factory,
stored actor/source-authority and app mount verification remain separate integration
gates. Imported store/types/worker/receipt/input/private-journal/test-fixture/
private-acl/HostingJournal and own fixture/caller/consumer are pinned below.



### Actual generation producer unit — source candidate, unexecuted

Root/runtime exclusively leased generation.ts and its new test plus generation-only
session.ts, chunk-write.ts, grounded-write.ts writer/lifecycle hunks. Connector and
web source files plus generation helpers are new; existing indexing files have
leased generation-only edits. Root must provide their preimage hashes from the
prior input freeze; session.ts baseline observed in the earlier packet was
b48ebb3a0e5e2d65ce2004d939e8c3bac11610cdcd410ebf5ee936851102de79.
No decisions extraction, tree derivation or visibility rule was changed.

Root pre-generation baselines are recorded in
qa/goal-2026-10-14/compile-current-freeze-before.json:
chunk-write.ts 84e5ed5bb84fee8abf5c658850f408d6cfa8cd66f7298efb922e812c174667b9;
grounded-write.ts bd0d5a06920ebf1f831ec542e67c6d1b5a16788ac794ea9ef2a7746e26b29886.
The existing file edits are generation-only writer/lifecycle changes, not new files.

Root authored canonical metadata and ran the original schema validator:
reported 43 schemas / 59 valid / 72 invalid PASS, PID19132,918ms. Root codegen
reported PID13560,722ms, exactly5 changed generated files for sessions/pages/claims/
chunks/tree. These are root-reported evidence, not maker-executed commands.
generation.ts stored shapes now alias canonical SessionIndexAttempt and
SessionPageIndexArtifact; no permanent stored shape copies or generated edits.

Maker read back actual root receipts:
qa/goal-2026-10-14/schema-index-generation-receipt.json command
C:\Users\product\Desktop\KnowledgeBase\.venv\Scripts\python.exe schema/validate.py,
exit0,918ms, stdout PASS43 collection schemas, stderr empty. Root tally59 valid/
72 invalid remains the per-fixture summary. Codegen receipt
qa/goal-2026-10-14/generate-index-generation-receipt.json runs bundled
C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
scripts/gen-types.mjs, exit0,722ms, stdout exactly5 generated outputs listed above,
stderr empty. These actual root runs satisfy schema/codegen prerequisite evidence;
they do not execute the34 API/generation or9 UI checks.

acquireIndexAttempt does a tenant/source-bound acknowledged session CAS before
indexing models/writes. Existing processing/running/uncertain/malformed attempts
refuse; no timeout-based takeover. Only completed or safely preflight-failed
attempts permit retry. phase writing is durably fenced before artifact mutation.
Any later failure remains uncertain with no healthy completion or automatic retry.
The exact effective transcript, all fields and timing/origin/review overlay, is
bound by stable SHA256. Existing source/session association must actually exist.

Real generated page/claim/chunk writes carry {version:1,generation,sessionId,
sourceId,turnDigest}. Root's exact session tree node receives the same binding at
actual persistence. Tree indexRevision CAS uses the exact base snapshot used to
derive the tree; legacy missing revision means0, failed match never upserts.
Existing Mongo _id is retained, first root uses deterministic tenant-root id with
collision refusal. Other session node bindings derive from actual matching pages.

Reviewed claims retain authoritative status/content/evidence. They are never
posthoc stamped as newly generated; only unchanged IDs/semantic digests plus fresh
literal source quote validation are allowed in preservedClaims. Missing/foreign/
unsupported preserved evidence prevents a strict positive receipt. Existing
zero-extraction semantics are preserved: leftover old machine rows cannot be
certified as new generation and therefore remain incomplete/uncertain.

The producer computes manifest IDs/semantic digests from actual prepared generated
docs and read-back preserved rows. It checks actual current effective transcript,
one source, exact page/evidence, complete dense-vector turn coverage, exact
generated/preserved claims, matching artifact binding/digest, and exactly one
matching session tree node/revision. Only then acknowledged CAS publishes
indexAttempt complete + authoritative status.index done. A current state readback
rechecks generation, preventing cached old output during another attempt.
Completion generation comes from that persisted attempt, never randomUUID at return.

verifyIndexGeneration(db,tenant,sessionId,expectedGeneration?) is read-only and
returns {generation,sourceId,sessionId,strict,turnCount,chunkCount} or null. T053's
physical store uses it before recording/cache success. It can support genuine
already-ingested worker receipt reuse once the T045 owner integrates it, with
strict mode and source-id checks; no metadata-only fallback/provider retry.

New generation.test.ts prepares7 checks: actual strict producer/consumer positive
binding, stale/foreign/missing/mixed artifacts, exact tree node removal while other
nodes remain, competing same-session CAS/preflight retry/uncertainty no takeover,
legacy tree id + stale revision refusal, preflight fail preserves prior artifacts,
and immutable reviewed claim digest/current literal source support.

Updated exact focused Node command from repository cwd:
`node --test --test-concurrency=1 --import tsx apps/api/src/connector-workflow/workflow.test.ts apps/api/src/indexing/generation.test.ts`
Prepared total34 (27 workflow +7 generation), plus unchanged9 UI command above.
No tests have run. Root owns the next frozen compiler; broker alone owns CPU grant.
Old no-op fakeDb callers cannot establish genuine new generation completion and
may require their owning fixtures to model actual persistence/acknowledgment.
Real Mongo concurrency/durability/recovery and native ACL remain separate live
gates; model checks cannot close P1–P4 or count whole T053 complete.



### Narrow preserved-review compatibility correction on roadmap resume

Actual oracle: qa/contracts/goal-T040.md criterion3, SHA256
e4df5f7a6d3ad16ddcb2a7aef27aa5401842052b35e9a9b648da49d9efa507a9,
permits canonical human-reviewed paraphrase while requiring exact current evidence.
Accepted synthetic standing regression scripts/qa/t040-acceptance.test.mjs:69,
SHA256 7c8cd020128d4d2515776e93c689cc67d9c78001c73a29ee272b84481970c505:
claim1 verified text 'Tuition costs five thousand rupees.' with quote
'The fee is 5000 rupees.' from actual synthetic t1/person:rao/12–24 source.
Inspector provenance passes but emits reviewed-paraphrase-semantic-check-unverified
and keeps fullTaskStatus HOLD. Its needs-review and 'invented quote' versions refuse.
No real human-adjudicated paraphrase corpus was located. Historical
session-grounded-wire.test.ts:77 has quote-less reviewed rows, which cannot justify
bypassing required exact quotes.

The old generation helper incorrectly applied generated text==quote extractiveness
to every reviewed row. The narrow correction retains verified/conflicting status,
nonempty same-tenant identity/text, runtimeEvidence exact current source session/
turn/contiguous quote, and unchanged review ID/content/status/evidence digest.
Only reviewed-text equality is removed. Actual generated item/claim extractive gates
in session.ts remain unchanged. No claim is newly human-approved or stamped as a
new generated row by this helper.

The existing seventh generation test now reproduces the exact accepted synthetic
claim/source floor and needs-review/'invented quote' negatives plus missing quote,
foreign tenant/session/turn and unsupported quotation. It asserts no rewrite or
generation stamp on the original review row. Its additional actual strict grounded
indexSession rerun uses a synthetic stored reviewed paraphrase with current exact
recording quote; preserves canonical ID/text/status/evidence, records preserved
manifest digest, and checks actual current generation readback. Fixture note judge
and review status are explicitly synthetic policy models, not genuine approval/gold.

Current prepared counts remain7 generation +27 workflow +9 UI. No new source
semantic certification or full-task PASS follows. Source is ready for final root
freeze/compiler and fresh sole-broker focused execution; evidence is still pending
and manifest remains BUILDING cycle0 until actual matched results +checker verdict.

| Path | SHA256 |
|---|---|
|apps/api/src/connector-workflow/consumption.ts|b5bee5af0f7e132266332a38b9c4a2bba3f5aa56af1f806a84093f6a8f71134e|
|apps/api/src/connector-workflow/fixtures.ts|7e3cc8ca59a3091e4c678d282ba69bb70947e137c238e432c84b674ef18d70c7|
|apps/api/src/connector-workflow/gaps.ts|001bcffa3cc5b635c7cf80e0a530321f5e009a77b8afbf1dc2fedd24cf3272d4|
|apps/api/src/connector-workflow/intake-consumption.ts|fe480fa582b162f0a25b9814686a239c1cdc4e8249c6603ce02f9b77030fabb3|
|apps/api/src/connector-workflow/jobs.ts|1c73606cdf0729e3bcd33bc1e3ddc61ba87b2c6df8f3fb833338d16604134050|
|apps/api/src/connector-workflow/mongo-store.ts|135e9021eed64b5c8bc8800f2f28913f87ba2c61c81dbe1b8c765e59f6e8d6cb|
|apps/api/src/connector-workflow/router.ts|0879ab78cd24b9c213f0a2cb606c2ce004962508d0bde7e268557409a7ebeb52|
|apps/api/src/connector-workflow/snapshot.ts|a55d3b501b14f673ea6484e348050fe5fc3aa62000809c4bc07dec04487d15af|
|apps/api/src/connector-workflow/types.ts|339bd8ed5e54b8975512fefc9d95bbcbe9950cac340f2926cd74322057334af8|
|apps/api/src/connector-workflow/watched.ts|5cf41718a77794f476f81bf00b50de8d6dfa4e6868556d1437bfd0b2d8e0f4f0|
|apps/api/src/connector-workflow/wiring.ts|4c2ed4e0d31b8387c6597aa0ee3ac608ce45169f5efa1b4a5e5992a8f54bc3a7|
|apps/api/src/connector-workflow/workflow.test.ts|79830a77adc17da6539d3ec9c79a3b6157ec2a010e9908665eaa38882d0a82a5|
|apps/web/src/api/connector-workflow.ts|94b054d2a1ce7a03fc68499afa19bbc428a2e1bed721716e0fe96a99147eb762|
|apps/web/src/pages/ConnectorsPage.tsx|4b696aa4758a30d5327d5582f12d7278103dcc1beca84396d0f50eca40bde8fa|
|apps/web/src/pages/ConnectorsPage.test.tsx|edbc085681151cfe73ab3fc0746235509df4f7dcdc85d743a824a0c96ac502d1|
|apps/api/src/indexing/generation.ts|443b969a218a4ad9716f5e9e9fb04c284bfd276a8633f5f26a82284674646d0d|
|apps/api/src/indexing/generation.test.ts|25f5b6f2d6c95ce7fe8c224324ab583c951eef7e361c7a114c29475b71126745|
|apps/api/src/indexing/chunk-write.ts|80b6ae5c866cc8dfafb8c2fabb5872b52f702bd1f18c0b42edc811d806a143ae|
|apps/api/src/indexing/grounded-write.ts|c6fa3b092e4ce159ee6cfe738d8d24fde79581ed0eefe7494947ec078c39b247|
|apps/api/src/source-intake/store.ts|8f57fb2fcf1f245aa5d978b0e1858d6debc34126a82e6a26233be20dba35dcf6|
|apps/api/src/source-intake/jobs/types.ts|4d21094d10621281c2176987d10a6bd6d7019a3bccd93eb835648d4e61249581|
|apps/api/src/source-intake/jobs/input.ts|6670ef0b2cfd4ef4238a4486e41b998aaefef5227afd00b07147ad8d00584528|
|apps/api/src/source-intake/jobs/receipt.ts|c95ed1ae1943a27311cdb99181566c0b39f00cd6c5824b1e748f9868ab8e373f|
|apps/api/src/source-intake/jobs/store.ts|cc65d9826ad8d35f3289e636994517046454512299c38af1f9fbba1aa537096d|
|apps/api/src/source-intake/jobs/worker.ts|5760cfc5a6026ee38bb3d9e41b5eda6e349d4ddff04cd814e6a47356b1737fed|
|apps/api/src/source-intake/jobs/test-fixture.ts|a547e8519ff7bd58eab31b7f2e06b08f5384643cb745bb4dbcaecc9c7cfc8bf9|
|apps/api/src/source-intake/jobs/private-journal.ts|fdf33826f28438f1964d4c44d28f6bd322f1ed8d86d60a725b7b4e8eed4ee14e|
|apps/api/src/source-intake/jobs/source-privacy.ts|244adfee86121df68dc2667f8d79709620a33509d7746662e83f8c6fa10b5c79|
|apps/api/src/source-intake/jobs/entry.ts|a5112e9ad7c949ccb0f2976aaa05e4051b897c0c2fe8430cf07b475084e27fd1|
|apps/api/src/bot-privacy/private-acl.ts|db444c6de16632aec9ce8aa67ab367978688e5b6213b8d48efbe1665b41af5f0|
|apps/api/src/hosting/journal.ts|55dac9c879e4f6a0364f6bf12c7271b7f2b93e3932429066d684685c9e217725|
|apps/api/src/indexing/session.ts|6734738ce50f493bc27c9db7b4170ed4db590f3dba6bda47f47dcbaa6e2709f5|
|apps/api/src/indexing/types.ts|2d297b84c921504ce5b4806ff5f57bcbe5ac5ffc0f644232f4b22fa35a6dca00|
|apps/api/src/auth.ts|7492213e222053bb1e1120f0b5affc92639e4f913fceaf7ee866cdb65fd62cf1|
|apps/api/src/composition/integrations/source-jobs.ts|856267db87a4ce32a8e1993a35ca2cee88adabb39d8fb31f9978da1245bf5d6b|
|apps/api/src/composition/integrations/knowledge.ts|d23f176d9524ceef0245b00ca843eb5ff063cbcf1fc761ee8f6e155a7f2e1239|
|apps/api/src/composition/integrations/routes.ts|d4c1a5c9a374225a08936b1d43d2f8ab3888bd0e5c51734e4cc7d17b3d342ace|
|schema/sessions.schema.json|36e8396e57a796a85d66421e1144516407f1fe53ca89abd922d1abfa74027c51|
|schema/session_pages.schema.json|0e89bb80d3cb87ad729cb0baebce081bab45b9b9cff1ceb6f49917a10ec48e54|
|schema/claims.schema.json|fbee54668a189ead1336967b37b0ec27b610401385a933e89670260cb0e72c92|
|schema/chunks.schema.json|a9b4a36289c63a67ce72c6bb9a9cbae9feba4d59412daa0b4b83d2c8b2b467b9|
|schema/tree_index.schema.json|d2845fba39077d15ca6df2a8f52cff4c3bd55ddfa5bdd94d32e628cc81823ce9|
|packages/core/src/generated/sessions.ts|3977b5aaf6c516512974f727322f82751b19a2415b1a500b88a752aa54ce5516|
|packages/core/src/generated/session_pages.ts|9093b3d7ff480c149aadee4aa2625bf29afb57e3785646dbefc99cf3b6b7428b|
|packages/core/src/generated/claims.ts|d0f28938b51a3c92fcd8ac1a8c3eb28d6b00e474f5c652dfeb84cfd09efd36c2|
|packages/core/src/generated/chunks.ts|3b7ded2ba630f293231b3af76ea8e8e40136e7de186af52efdbdcdd4f69e1561|
|packages/core/src/generated/tree_index.ts|47f4514ba063718df6c7d1e05f0ebc09854b211ad536ab0d3d7a48c54e47f361|
|qa/contracts/goal-T040.md|e4df5f7a6d3ad16ddcb2a7aef27aa5401842052b35e9a9b648da49d9efa507a9|
|scripts/qa/t040-acceptance.test.mjs|7c8cd020128d4d2515776e93c689cc67d9c78001c73a29ee272b84481970c505|
|packages/db/src/lib/tenantScope.ts|c596fe4c7815a8c44af31b7590988d3b9c011874991c19b7d2f0deaee8fcf443|

### Resumed bounded execution specification (2026-10-15)

SOURCE/TEST INPUT_FREEZE remains active for the central U24 priority check. This
entry changes QA metadata only. The tenantScope dependency above is the current
C596 boundary; all actual imported source pins must match before execution.
The sole ordinary CPU executor is /root/docker_governance_review. No earlier
grant transfers to this resumed candidate. Request a 120-second bound for the
34 API/generation tests and a 120-second bound for the 9 UI tests, serially,
using the exact commands in Focused checks above, with stdout/stderr, exit code,
elapsed time, counts and pre/post source hashes recorded by that executor.
No source-private payload, transcript/media, provider or actual Mongo input is
authorized by these commands. Fixture protocol/AI/ACL results remain models;
they cannot certify native ACL or human review semantics. Existing tests/fixtures
remain excluded from publication pending the root's public-artifact decision.
The accepted public synthetic paraphrase oracle is the T040 script cited above.
A standalone public actual-grounded-writer/generation-reader floor is still
requested; no new file or validator change is made while source freeze is active.

### Exact public writer/reader floor saved under root test-only lease

Root subsequently authorized only two new adjacent public synthetic test paths,
outside the active U24 production/floor pins. Production source is unchanged.
apps/api/src/indexing/public-preserved-review.fixture.ts imports only node crypto,
type-only Mongo/core/session dependencies. It declares the exact accepted T040
t1/tenant-a/session-a/person:rao/Dr Rao/12–24 source text, fee quote and claim1
verified canonical paraphrase locally; no authentic corpus, media, credential,
connector fixture, legacy testutils or private fixture accessor is imported/read.
Actual session/generation implementation imports execute in the test, with a
stateful acknowledged CAS/readback model and synthetic completions/vectors/judge.
This models standing review policy; it does not provide authentic human approval,
semantic gold, Mongo/native ACL or provider evidence.

The four public tests exercise actual strict/dropUnverified indexSession and
insert-first reviewed-preserving writer through immutable manifest ID/digest and
read-only current generation verification; missing/invented/foreign source quotes
refuse before artifacts/receipt; edited canonical text/status/evidence and changed
current source speaker/time/text/tenant invalidate the old receipt; generated
needs-review paraphrase still fails runtimeExtractive and actual strict producer.
The original reviewed row gets no newly generated stamp or altered review identity.

**Superseding ordinary public API execution specification:** from repository root,
`node --test --test-concurrency=1 --import tsx apps/api/src/indexing/public-preserved-review.test.ts`
(4 tests; 120-second sole-executor supervisor bound). This command imports neither
legacy generation.test.ts nor connector-workflow/fixtures.ts/workflow.test.ts.
The earlier 34-test command is separate HOLD/default OFF pending the root privacy
boundary decision; do not run it with a test-name filter or count private SKIPs as
PASS. The unchanged 9 UI command remains separately queued. Source pins must match
before/after each execution. No tests have run yet, and manifest remains BUILDING0.

| New public path | SHA256 |
|---|---|
|apps/api/src/indexing/public-preserved-review.fixture.ts|2d4e6c821a7658458add47f32e5157cfb64d3a6d8548f275f2bfeee310329341|
|apps/api/src/indexing/public-preserved-review.test.ts|791ea8da28354e8bcaf5df7cedfd352f805ce64a88ae76842c0c29d9c9b82cb1|

Root's centralized diagnostic-only API check returned exit2/17.738s with three
diagnostics, one belonging to this new synthetic CompleteResult fixture: missing
costUsd. Exact test-only repair adds costUsd:0 to that model result. No production
source, accepted source/review row or test assertion changed. Fixture pin above is
the repaired frozen input; remaining two diagnostics belong to the U24 SDK owner.
That compiler receipt had unrelated T037 source drift and does not certify this
candidate. No local CPU or focused runtime test was launched by this maker.

### Actual public4 RED receipt (sole ordinary executor)

qa/evidence/goal-t053/ordinary-public4-20261015T003325Z.receipt.json,
SHA256 abe5c686a890dcd4eb8d33c704fe6109cc7d3e3b9a28bfbf47f7c734bf7619b6.
Bundled Node PID12016, terminal exit1, 1069ms wall/913.6013ms Node,
3 PASS /1 FAIL /0 SKIP, all 13 selected production/public-corpus pins stable.
The exact accepted reviewed paraphrase through real writer/generation reader
passed, canonical/current-source digest tampering passed, and freshly generated
paraphrase refusal passed. The invalid reviewed-evidence loop failed at test line42
with Missing expected rejection. Legacy34/private corpus was not imported/executed.
Earlier capture-failed-20261015T003142Z metadata is retained but is not credited.

Read-only triage: the foreign-session-only fourth fixture removes all current
session-a evidence, so canonical claims evidence.sessionId queries exclude that
unrelated row from the current writer and manifest/readback. It cannot demonstrate
consumption of a poisoned current-session claim. Proposed test-only repair retains
that original detached row as an explicit unchanged/unconsumed scope boundary and
adds current fee evidence plus a foreign-session quote, which remains selected
and must refuse before artifacts/receipt. Root/checker concurrence was requested;
no automatic product fix, oracle removal, evidence rewrite or PASS is claimed.

### Corrected public selection oracle, production policy unchanged

Independent checker and root/runtime concurred on the canonical ownership
distinction and authorized a finite TEST-only repair. Original detached
foreign-session-only input is retained unchanged: the writer must leave that row
byte-equivalent, without a new stamp or current generated/preserved manifest ref;
the unrelated row cannot block a valid current generation. A separate labelled
mixed current exact fee +foreign-session evidence case remains current-bound and
must reject before artifact writes/receipt. Invented/missing quote and foreign-turn
cases, the exact healthy fee paraphrase, digest/current-source tamper and generated
extractive assertions are unchanged. Top-level test count remains 4.

Original c389 test bytes were reconstructed by the exact inverse TEST-only edit,
SHA-verified against the captured original, and saved to
qa/evidence/goal-t053/source-backups/public-preserved-review.c3894792.test.ts.bytes.
This is a verified original-byte reconstruction, not a claimed pre-edit backup.
The original abe5c686 RED receipt and stdout/stderr remain untouched. Source
backups/receipt host traces remain excluded from publication. Current test pin is
791ea8da28354e8bcaf5df7cedfd352f805ce64a88ae76842c0c29d9c9b82cb1;
fixture remains 2d4e6c821a7658458add47f32e5157cfb64d3a6d8548f275f2bfeee310329341.
Production generation443b/session673 remain unchanged. Same public-only command
and 120s sole-executor bound require a fresh measured result; no new PASS claimed.






