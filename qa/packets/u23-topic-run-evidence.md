# U2.3 acquisition evidence — cycle 0 maker packet

Root: C:/Users/product/Desktop/KnowledgeBase
Manifest: qa/manifests/u23-topic-run-evidence.md (building, cycle 0).
Base/reference HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; source candidate is uncommitted new bytes.
Verdict reserved for independent checker: qa/verdicts/u23-topic-run-evidence.md. No verdict requested yet.
Exact candidate ID: sha256:c5303a707b49776df8394657235767eeb8b697787699f7c2948864ddcaabeccf
Exact inventory: qa/packets/u23-topic-run-evidence.inventory.sha256.
Algorithm: SHA-256 of UTF-8 without BOM inventory of the two changed owned source/test paths,
sorted ascending; each line is repository-relative path + one ASCII space + lowercase raw-file
SHA-256 + LF, including the final LF. QA metadata/inventory are excluded to avoid self-reference.
Metadata identity repair only; cycle 0/source pins unchanged; still building until required broker evidence.

## Behavior and consumer map
`acquireTopicRunEvidence` is a standalone exported adapter; no barrel/composition mounts it.
It parses supplied exact session/page JSON strings, refuses foreign/mismatched/duplicate identities,
hashes original UTF-8 strings and snapshots options before inference. It calls actual `buildTopicIndex`
which calls `prepareTopicExtractFn`, `extractTopicsLlm`, `buildTree` / `regenerate`.
The completion wrapper records page-associated logical calls, prompt hashes, returned text/json,
provider/model, validated token counts and explicit price disposition. Exceptions are sanitized;
unknown or timed-out observations stay null/unsettled. Returned evidence cannot change when a timed-out
completion later resolves. The adapter does not cancel the underlying injected completion.
Returned completion text is NOT wire/HTTP raw response. Logical calls are NOT physical attempts;
an injected complete may contain hidden retries. `physicalAttempts` stays null.
The actual returned tree is traversed for topic nodes and hashed. Tests consume those nodes through
actual `treeSearch`; `topicPredictedEntities` feeds actual `evaluateExtractionCase` with no labels,
therefore semantic precision remains null. Empty answers, missing pages and disabled extraction remain distinct.
`configured-provider` is an unauthenticated caller declaration (`executionAttested=false`). Provider
spend/runtime authorization must be provided externally before using a real complete function.

## Security and scope
No auth identity minted; tenant is explicit operator input, checked against every supplied row before
inference. No persistence, DB, network client, environment/secret read, barrel edits or provider construction.
Captured completion text and returned tree can contain private knowledge: caller owns private storage.
No human gold/thresholds/quality/PASS invented. Missing transport/persisted/gold/semantic/acceptance stages null.
No filed-issue fix asserted; ledger replay corpus not applicable. Cached-root privacy repair stays separately owned.

## Broker request — source frozen, not yet run
Working directory: C:/Users/product/Desktop/KnowledgeBase.
Use existing compatible bundled Node/tsx environment; sole broker owns bounded process execution.
Command: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import tsx packages/index/src/eval/topic-run-evidence.test.ts`
Outer wall timeout: 30 seconds, no providers/network/DB. Eight authored test nodes:
1. Exact-byte source and returned completion, actual treeSearch and extraction evaluator; no semantic labels.
2. Disabled/missing/empty input distinctions and unknown no-call totals.
3. Error/timeout/schema-invalid/ungrounded regex fallbacks and genuine empty result.
4. Missing/malformed usage and unknown-priced zero.
5. Foreign/mismatched/duplicate/invalid input refusal before completion.
6. Late timeout result plus caller mutation cannot rewrite returned evidence.
7. Regeneration and exact-byte changed-source identity.
8. Unchanged migrated source sample -> actual producer -> searchable topic node (injected fixture only).
Do not replace real-provider or full parent acceptance with these fixtures.
Required frozen-contract command: `python contracts/verify_contracts.py`; broker may reuse only exact
same-script/registry/environment receipts under policy, recording vacuous-registry limitation if applicable.
Import/working-directory containment and compatible interpreter preflight belong to broker. No pytest/build.
Potential runtime/Node/tsx availability has not been executed by this maker; do not imply preflight success.

## Exact candidate and direct dependency/sample SHA-256
All pins read 2026-10-15T10:07:43Z. Direct pins guide navigation; broker must capture actual imported
transitive dependency/environment pins before/after. No dependency mutation authorized.

| Path | SHA-256 |
|---|---|
| packages/index/src/eval/topic-run-evidence.ts | b6b6908f31a2de9150d037bf15a36e9ad9a61dcf67b800aee0ba0cde14f6fcbc |
| packages/index/src/eval/topic-run-evidence.test.ts | 18cc36e3fbbfc1519ad9b8235db68c50dcd6ed1d28f9e6f850cb6368444ae608 |
| packages/index/src/tree/topic-indexing.ts | c5cc23e69c9d118b990a1e8fae03aa4d6ec52af22274c5fbea2256914b83aedd |
| packages/index/src/tree/extract-topics-llm.ts | ebbbd23c802482b8b727440918baddc92c845507a7b639eb9bcb5434bdd64d5a |
| packages/index/src/tree/extract-topics.ts | cbf6979098295aaf1cbf2a48ddc1b362900d7d3e967c3a3dca9a71988ffd36f6 |
| packages/index/src/tree/build.ts | a4c2dfb4b2c3d5677b196804b12f93ca621778582c073ca84b7924934aad7085 |
| packages/index/src/tree/regenerate.ts | 23953f98ca2564454efe1f1f29b6a44853e6f2815e6d6284c64f048084edf1ca |
| packages/index/src/tree/search.ts | 44dc55f5a88e29433faa7e33ae2af6d0f64f116d6c9574d7da9a866207874878 |
| packages/index/src/eval/extraction.ts | f61db7de33998eb2e9bf5d27904b22f625672df002f35101a86a80675be11430 |
| packages/ai/src/provider.ts | 224011a106893ba8d42cecc5d9c43e4897df6d3d15e692f9e196d10aa050c4c1 |
| packages/index/package.json | cc3a73c55269cba38982ede806cd3cb6d545ef263413c86c987e2dfbbc2a4d2c |
| packages/index/tsconfig.json | e37d70f01dd85f180c1e3070dbed968acd2d610beb3ec9040a78259aa8ca1b03 |
| pnpm-lock.yaml | 2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd |
| contracts/verify_contracts.py | 1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 |
| contracts/contracts.json | d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940 |
| data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/session.json | 166dc3d80875b3140831e9d24bedd3f82b8043eea61e7c0a32e97fbefebf481f |
| data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/session_page.json | ebede4a4df2115fad29873dfeb376a05ebda0322603165475859a7ea74f515cd |

Maker source elapsed 141.174s conservatively measured; survey/packet/total active usage unknown, tokens/cost
unknown. Checker budget therefore requires explicit bounded BOOTSTRAP_REVIEW and assess gate, not claimed ratios.
No checker dispatch until required broker evidence; only checker may issue persisted verdict.

## Later authenticated shared broker result — candidate unchanged, still building
Receipt: qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six.json
SHA256 57bccf47cb929ba448193bed0186e404b259fe0cd5dbade9911940492e6f244a.
Name mapping: same prefix `-units.json`, SHA256
5bed18972feb608a9c08fa99fdc089525aa04fa77d909d9936ca734233395625.
Actual stdout: same prefix `.stdout.txt`, SHA256
ae86ec91ab19ea483270b637459eebdc0fe83634e6e466fb6d2e09b6c9430af6;
stderr is empty, SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
The actual receipt's full command array is authoritative: bundled Node `--test --test-concurrency=1
--test-timeout=30000 --test-name-pattern=<anchored exact26 union> --import tsx` plus six mapped files.
It differs from the proposed standalone request above: no test-isolation switch, actual outer timeout
120000ms. All eight exact topic names listed above occur as PASS in actual stdout; union 26/26,
0 fail/cancelled/skipped/todo, shared process exit0. No standalone topic exit code exists.
Shared process UTC 2026-10-15T10:51:54.028Z–10:52:00.126Z; broker elapsed6096.396ms,
Node duration5976.0348ms. These are shared six-unit costs, recorded once, never added to each maker.
Receipt union candidate d6ad4fc2172711a8651c39a64963f379a74b1668e0a07936d4e1c86ddd480ebe
is distinct from this unit's exact candidate sha256:c5303a707b49776df8394657235767eeb8b697787699f7c2948864ddcaabeccf;
both unit source/test hashes match receipt before/after/current.
Runtime v24.19.0 at C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe;
executable SHA256 3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237,
independently rehashed current. Environment fingerprint
1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac and whitelist hashes
are receipt-attributed, not independently reconstructed from current environment; no environment read here.
Windows host, require_escalated auto-review-approved, serial CPU command; cwd/import root matches repo.
All62 receipt before/after file pins independently compared to current bytes with zero mismatches,
including tsx resolution files, AI barrel/provider/parser dependencies and lock. This is the receipt's
scoped dependency inventory, not proof of an exhaustive runtime import trace.
Receipt does not pin the two migrated sample files before/after. Current sample pins remain above;
the passing sample case proves runtime consumption but cannot establish historical exact sample-byte continuity.
Central FINAL shared checkpoint plus applicable types/build/frozen-verifier/static receipts remain pending,
then fresh independent source/consumer check with assess gate. No READY/PASS promoted. Full parent live,
gold, thresholds, configured-provider, transport, actual persistence and rollout gates remain unverified.

## Targeted sample continuity receipt and FINAL public checkpoint
Later broker receipt qa/goal-vectorless-2026-10-15/verification-u23-actual-sample.json,
SHA256 4cb05e1f4c6d7fa55f5e95765b5026b04f5b1699f490c1c40d57d8b280d321d8,
executes exactly the saved request's anchored actual migrated sample name and original test file.
One selected case PASS, zero fail/cancelled/skipped/todo, process exit0;
UTC11:02:25.139Z–11:02:25.524Z, broker383.0218ms, Node275.3988ms, outer timeout30000ms.
Actual stdout `.stdout.txt` at same prefix SHA256
b4c238ddddc0734bd7b45a686a8279102572b1ba1b916881f49c29926bf97b1e;
empty stderr same prefix `.stderr.txt` SHA256
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
All19 requested pins are in the actual44-pin receipt inventory, including both original sample
session166dc3d80875b3140831e9d24bedd3f82b8043eea61e7c0a32e97fbefebf481f and
pageebede4a4df2115fad29873dfeb376a05ebda0322603165475859a7ea74f515cd;
all44 before/after/current independently compared without drift. Runtime executable rehashed current
3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237, receipt v24.19.0,
same attributed environment fingerprint1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac.
Receipt candidatef9b60953ba2f45abbe2d13e02c693010a14a4e455efcf5d49c5f288cba72109c is its expanded
execution-closure identity, not a replacement unit candidate ID. Unit candidate c5303a707b49776df8394657235767eeb8b697787699f7c2948864ddcaabeccf/cycle0 unchanged.
This targeted receipt closes exact-sample continuity at its current execution. The earlier shared26
receipt remains green with its original pin limitations; no blanket repeat or accounting reassignment.
The completion is injected, semanticQuality=null; real provider/semantic/persistence acceptance unverified.

FINAL public checkpoint qa/coordination/knowledge-brain-20261015/final-shared-public-checkpoint.json
SHA256 90cc8734ac76eab1e3ff8a6824dcb0085a7834224a8b5844d40010d9999a464b, state
FINAL_SHARED_SOURCE_FROZEN_NOT_CHECKED. All24 file pins independently compared to current without drift.
This freezes its18 public schema/export plus6 selector-binding files only; separate WhatsApp native
publication/tree-admission epoch remains explicit. No whole-repository freeze/type/test claim inferred.
Remaining engineering evidence: applicable current types/build, frozen-contract verifier and static receipts;
then fresh checker admission only after installed actual_total helper and root finite ceilings allow it.
No independent reviewer dispatched and manifest remains building. Actual maker usage unknown stays unknown.
