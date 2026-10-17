# t055-evidence-directory — cycle 0 maker packet

Current handshake: ready-for-check, cycle0. Manifest: `qa/manifests/t055-evidence-directory.md`. Checker ground truth: `qa/contracts/t055-evidence-directory.md` C1-C9. Priority tier 3; new independently checkable roadmap seam, no previous PASS. This is not an issue-fix unit. Final evidence section below supersedes historical pending statements.

## Behavior and limits

`/knowledge` consumes the existing authenticated sessions, sources and graph clients. URL `entity` selects an actual graph node; neighbor links permit repeated drilldown. Relationships preserve type, origin, confidence and literal turn references. Link ownership requires one known returned session: explicit edge/evidence session IDs must agree, and incident session nodes cannot contradict that ID. Missing/conflicting ownership remains inert. Turn references are not independently verified claims; the session page reports unresolved turns.

Directory entity lists include returned topic/person/org nodes, with unconfirmed identity and inferred-relationship notices. Returned counts and graph-reported gaps are distinguished from corpus completeness/extraction quality. Recorded valid month groups are derived views, explicitly not persisted curated collections. Source resources omit local `path`; absolute safe public http(s) URLs reject userinfo, whitespace and controls. New tabs use `noopener noreferrer`.

Unknown entity, empty collections/resources, graph 404, key/logout, safe errors, malformed responses and truncation have explicit states. Maximum rendering is 200 entries per entity/relationship/evidence/resource/group list, with visible count notice. Input limits: 10,000 sessions/sources/nodes, 20,000 edges; larger responses fail honestly. No DB/provider/browser/mutation tests, schema/backend/auth changes, entity promotion or gold updates.

## Changed source and consumer map

- New `apps/web/src/pages/knowledge/knowledgeDirectoryModel.ts`: shape validation, explicit evidence ownership, recorded calendar collections, safe resource projection.
- New `KnowledgeDirectoryPage.tsx`: authenticated client aggregation, key/generation fencing, query-selected entity detail, tabs and rendering.
- New `knowledgeDirectoryFixtures.ts`, `knowledgeDirectoryModel.test.ts`, `KnowledgeDirectoryPage.test.tsx`, `KnowledgeDirectoryIntegration.test.tsx`: scoped fixtures, negative ownership/lifecycle tests and actual App -> directory -> SessionDetail anchor consumption.
- Integrator-owned `apps/web/src/App.tsx` and `apps/web/src/layout/NavSidebar.tsx`: additive protected route/navigation; maker did not edit shared files.

Unchanged dependencies to pin: `apps/web/src/{safe-url.ts,api/client.ts,api/types.ts,api/sessions.ts,api/sources.ts,api/graph.ts,auth/AuthContext.tsx,auth/LoginGate.tsx,layout/AppShell.tsx,pages/sessions/SessionDetailPage.tsx,pages/sessions/SpeakerSuggestions.tsx}`, actual producer `packages/index/src/graph/{build-graph.ts,types.ts}` and `packages/index/src/tree/flatten-graph.ts`. New maker files have no base; baseline HEAD `4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd`.

Auth/tenant: existing API key only, no tenant field/input. All reads go through existing clients; current render checks both key and request generation before displaying loaded data, and cancellation rejects obsolete completions. No writes or credentials touched. Plain React text and encoded route/query IDs prevent label HTML interpretation.

## Checks and execution facts

Ready targeted command, cwd `apps/web`:

`node node_modules/vitest/vitest.mjs run src/pages/knowledge src/pages/sessions/SessionDetailPage.test.tsx --maxWorkers=1 --minWorkers=1`

Run with shell=false, subprocess timeout120 and output/receipt capture. Current toolchain: Node on PATH, web Vitest and root TypeScript modules present; pnpm absent from PATH. Coordinator `runtime_inventory` owns lightweight execution slots. No full suite/browser/provider/build run by this maker. Final web typecheck/bundle is an attributed integrator wave check, not duplicated per lane.

Required evidence still pending: independent real `buildKnowledgeGraph` producer probe, Vite bundle and independent checker verdict cycle0. Attributed semantic typecheck, maker source/consumer and vacuous verifier evidence follows. No elapsed waiting time substitutes for missing results.

## Executed maker evidence (2026-10-14)

Standing Vitest could not execute in this environment because the shared runtime coordinator established sandbox esbuild EPERM. This maker did not rerun the failed standing command or claim its tests passed. The coordinator authorized the demonstrated synchronous TS loader and actual React/jsdom harness. Alternate command from root:

`node --import ./.cache/coordination/safe-test-runtime/register-react.mjs --test --test-isolation=none .cache/coordination/t055-evidence-directory-cycle-0/maker-probe.test.tsx`

Result: **1/1 Node-test PASS; 50 behavioral assertions; exit 0; 3.641 seconds**. Actual production model, actual React page, protected App/Nav and SessionDetail anchor consumer were exercised. Exact UTF-8 output and timestamped shell=false timeout120 receipt: `.cache/coordination/t055-evidence-directory-cycle-0/maker-focused.log` and `maker-focused-receipt.json`. Assertions cover conflict/missing/unknown/incident ownership, encoded evidence links, unsafe credential/protocol source URLs, recorded local-date grouping, person/inference honesty, original literal turn resolution, unauthenticated no reads, 404 preserving sessions/resources, safe errors and refresh, obsolete-key success/401/503 fences, malformed source refusal.

`python contracts/verify_contracts.py`: **exit 0, 0.125 seconds**, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Exact `contracts.log` and `contracts-receipt.json` in the same evidence directory. This provides no source-dependent contract verification.

Execution corrections preserved: first alternate invocation omitted `./` in the loader specifier and exited7 before tests; `maker-path-failure.log`/receipt retain this. A second attempt's Python output capture failed decoding Windows cp1252; final explicit UTF-8 capture above succeeded. No product/source repair or acceptance inference came from either setup failure.

Initial source/dependency freeze: `.cache/coordination/t055-evidence-directory-cycle-0/inventory.json`, SHA256 `b11cb475627723185ef443c8f0ed655f7ee52adfc1bfffa3ef052cf5a5a9da78`. Eight candidate source files (six new maker files plus two integrator files), 17 dependency/runtime pins, checker contract hash, exact output/receipt hashes and full `complete.patch` included. Original App/Nav bytes retained in `base/`; new maker files correctly record absent base. Shared integration/type/bundle attribution and independent actual-producer probe remain pending; freeze must be refreshed if integrator bytes change.

Shared semantic typecheck attribution: `qa/evidence/t039-send-now-status-polling-web-typecheck.json` SHA256 `266e5697a6392fcb5799f924f8ac587d434874e82759f8b0d93c8c1f66430a20`. Executed by sendnow maker: `node node_modules/typescript/lib/tsc.js --noEmit -p apps/web/tsconfig.json`, root cwd, **exit0 8.6013715s**, stdout/stderr empty. All six T055 and two integrator source pins remained unchanged after this shared check; maker confirms no source edit during or after it. Original receipt lacks exact UTC start/end boundaries; this limitation is explicit. Inventory updated with receipt/config hashes to SHA256 `2b938b019f55a547b7467f46cf0cd9207d5cc5e376d744a86de97bb38c1bd291`. Remaining checks: independent producer, standing Vitest if newly approved prefix/coordinator enables it, Vite bundle and checker verdict.

Current-consumer superseding evidence: integrator added `GroundedContentPanel` to `SessionDetailPage.tsx` at 09:28:38 UTC, after previous semantic/build checks. The standing integration fixture and actualUI probe now provide the exact `/sessions/session%2Fone/grounded-content` empty valid DTO. Repeat actual production UI command above **PASS1/1, 51 assertions, exit0, 6.062s**, 09:31:44.337–09:31:50.408 UTC. It additionally confirms the real mounted panel renders its empty state and original source-turn anchor remains reachable. Exact `maker-final-consumer.log` and `maker-final-consumer-receipt.json` replace prior immediate-consumer acceptance. Refreshed inventory SHA256 `77fc9a91121661cbc65bebe1bb0426a950ee4eab9424582d554ccdc98dd68cbc` pins eight sources and 21 dependencies, including panel/client; full patch refreshed. Postconsumer shared typecheck/bundle attribution remains necessary.

Independent actual producer probe by documents checker: `qa/evidence/t055-evidence-directory-independent.mjs` through real `buildKnowledgeGraph`, **15/15 PASS exit0 .710s**, 09:27:54–55 UTC. Exact independent log/receipt in `qa/evidence/t055-evidence-directory-independent.*`; these are checker outputs, not maker-authored verdicts.

## Final ready candidate — current dependency state

Inventory `.cache/coordination/t055-evidence-directory-cycle-0/inventory.json` SHA256 **`9a539af0bfd264415701b46d75e493bce78c907a7751b0cc91323ba6361c6627`** pins8sources,21dependencies and24evidence files. Maker and integrator source/consumer pins rechecked unchanged. Grounded panel/client are included. Complete patch binds all eight source files; absent base provenance remains explicit for new maker files. Shared directory-consumer snapshot independently matches29source/dependency pins; checker independently verified actual producer15.

Postconsumer semantic web typecheck: `qa/evidence/execution-wave1-integration-expanded-web-typecheck.receipt.json`, exact `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`, **exit0 12.5086023s**,09:31:38.475–09:31:50.984UTC, output/error empty. Source snapshots: `execution-wave1-integration-expanded-typecheck-pins-before.json`/`after.json`. Exact directory consumer pins: `execution-wave1-integration-directory-consumer-pins.json`.

Postconsumer actual production Vite bundle: `qa/evidence/execution-wave1-integration-expanded-web-build.receipt.json`, actual public Vite build invoked through the approved one-worker Vitest build probe, **1/1PASS exit0 7.7681223s**, build09:32:19.540–09:32:24.488UTC. Source entry and emitted asset include Knowledge directory and Grounded notes and Q&A. Output/artifact at `execution-wave1-integration-expanded-web-build.stdout.txt`/`artifact.json`; probe/config SHA256 and exact command in receipt, all inventory-pinned. Greater-than-500kB chunk warning is retained.

Current actualUI51assertion repeat + independent producer15 + expanded typecheck/bundle + vacuous contracts verifier satisfy the scoped source evidence packet. Original standing Vitest suite was not executed; its source/tests remain for normal CI, and the alternate actual React/current App/session consumer probe is explicitly attributed. No additional tests were run on unchanged source. Cycle0 ready-for-check now requests the independent checker verdict; broader T055 remains open.

## Acceptance exclusions

PASS would certify only this directory slice. Whole T-055 remains open: document-page highlights, authoritative topic/speaker profiles and identity/precision gates, saved curated collections, program-directory semantics, browser/live runtime proof and broader product acceptance.
