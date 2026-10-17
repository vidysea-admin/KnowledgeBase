# Checker packet — goal-u23, cycle 1

Repo: C:/Users/product/Desktop/KnowledgeBase
Manifest: qa/manifests/goal-u23.md
Verdict owner: /root/implementation_status/checker_u23, qa/verdicts/goal-u23.md
Contract: qa/contracts/goal-u23.md, clauses 1–7 only; parent clauses 8–10 remain HOLD.
Status: scoped helper source readiness ready-for-check; production glue and parent gates separate.

## Changed paths and base
New, no base existed: packages/index/src/tree/topic-indexing.ts; topic-indexing.test.ts.
New handshake only: qa/manifests/goal-u23.md; qa/packets/goal-u23.md.
Current source SHA256: topic-indexing.ts `c5cc23e69c9d118b990a1e8fae03aa4d6ec52af22274c5fbea2256914b83aedd`;
topic-indexing.test.ts `c6f08a1a7b94988057b1f7efc247301ba22b27d2837eec7c5d5f3ec43ee9f5a9`.
Rechecked unchanged after focused evidence; actual untracked edits are included above.
No historical extractor, contract, data/eval/media, tracker or shared composition edits.

## Change map and security boundaries
`buildTopicIndex(tenantId,sessions,pages,complete,opts)` filters sessions by exact tenant then pages by tenant and eligible session IDs before calling `prepareTopicExtractFn`.
Duplicate scoped session IDs, duplicate page IDs or duplicate pages for a session throw before calls; cache collision cannot silently select a different page.
`assertScopedRoot` verifies top-level tenant ID/path/level, every subtree path/stamp, every session node ID and every entity parent plus sessionRef/sessionRefs against scoped sessions before inference.
Existing evidence referencing a removed/unavailable session refuses; this unit does not silently repair deletion provenance.
No provider factory is constructed; `complete` is the caller's existing routed adapter.
Preparation invokes the old extractor exactly once per eligible page, returns its per-page degradation map and supplies its sync `extractFn` to the actual build/regenerate consumer.
Enabled regeneration refreshes all scoped sessions' years, avoiding an untouched year retaining old heuristic topics while new years use model topics.
Disabled uses original changed-session selection and the identical regex function; no model calls.
Output is a single candidate root, no persistence; no DB, auth or credentials access. Tenancy safety applies to mixed inputs and reused root provenance; central persistence remains outside this lane.

## Dependencies and consumers (unchanged)
- packages/index/src/tree/extract-topics-llm.ts: prepareTopicExtractFn caches tenant+page ID and text; errors/timeouts/invalid/all-ungrounded replies use regex; [] means no topics.
- packages/index/src/tree/build.ts: buildTree(sessions,pages,undefined,extractFn)[tenantId] builds topic children and shared evidence; helper scopes inputs before its sessionId-only lookup.
- packages/index/src/tree/regenerate.ts: regenerate(root,changed,sessions,pages,extractFn) consumes the prepared sync seam.
- packages/index/src/tree/promote-entities.ts: promoteTreeEntities consumes actual candidate topics and evidence, pure/no writes.
- packages/index/src/tree/search.ts: treeSearch resolves source-bound sample topic node IDs.
- apps/api/src/indexing/session.ts + packages/index/src/index.ts: central /root/docker_runtime owns pending production glue; helper-only certification cannot imply runtime integration.

## Reproducible checks and evidence
Runtime node: C:/Program Files/nodejs/node.exe; tsx from existing packages/index node_modules.
From C:/Users/product/Desktop/KnowledgeBase/packages/index:
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import tsx src/tree/topic-indexing.test.ts src/tree/extract-topics-llm.test.ts`
2026-10-14 executed in root serial CPU lease; exit0, tests21/pass21/fail0/skipped0, node487.4704ms, exec wall0.8987377s.
7 new integration checks plus 14 existing extractor cases; fake/injected providers only, no network.
Source-bound real migrated sample: data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/session.json and session_page.json.
The source raw page is wrapped with explicit ID/tenant/session metadata from the session document in the test, without mutating either artifact.
Printed SHA256: session `166dc3d80875b3140831e9d24bedd3f82b8043eea61e7c0a32e97fbefebf481f`;
page `ebede4a4df2115fad29873dfeb376a05ebda0322603165475859a7ea74f515cd`.
Injected model selects a phrase present in that source. This verifies mechanism, never semantic gold or provider quality.
Affected-stage outcomes: full regex identity; pre-inference mixed-tenant filtering; all-year regeneration; four degraded paths and []; foreign-root/subtree/evidence refusals; cache ambiguity; absent pages.
Immediate consumers: actual build/regenerate, promoteTreeEntities and treeSearch source topic resolution.
Known tsx/esbuild subprocess restriction was identified by CPU owner; used require_escalated directly and run approved. No failed default retries. CPU grant applies only to declared two files; checker queues its independent probes with /root/docker_checker. No browsers/full suites.
Central unchanged frozen-validator receipt: qa/evidence/goal-t051checker-validator.json SHA256 `53ef35f5204aea32db0a4701dd60ebeee10cbbf24ae5af9287f16eb7eed0d6db`; exact Python command exit0 (vacuous), script and registry hashes recorded there. Reused per CPU owner, no duplicate validator run.

## Known acceptance limitations
U2.2 human topic gold and binding quality thresholds are unapproved; real provider corpus scoring is not authorized for this lane.
Historical u23topic scoped PASS certifies its old preparation bytes, not this helper/caller integration or full task.
Root-owned production glue, real runtime/provider quality and authorized rollout remain separate evidence gates.
