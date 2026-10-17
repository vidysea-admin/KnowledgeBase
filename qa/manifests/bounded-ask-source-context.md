# bounded-ask-source-context
Status: BUILDING
Handshake status: BUILDING
Fix cycle: 1
Tier: 3 — phase-one Ask feature and uncapped tenant/source-evidence boundary.
Maker: Codex agent. Source scope authorized by root under the current user build request after independent checker PLAN APPROVE. This is no human canonical/schema/threshold approval.
Base: 68f1a4e4f3111d451216e15d6dcdf63301e672e1; concurrent later history retained.

## Scope and ground truth
Runtime source-only opt-in in the 14 paths below plus this manifest. Frozen router/evaluator, thresholds, schema/generated files, routing configuration, contracts, embedding backfill, alert/meeting work, original corpus and enforcement untouched. Relevant ground truth: qa/contracts/hybrid-retrieval.md C1/C2/C5/C6/C9/C10/C11; qa/contracts/ask-router-v2.md selection/refine/answer/call-audit clauses; AGENTS.md affected-stage plus immediate-downstream definition of done. Maker edits no QA contracts.
Security flags: tenancy/cross-tenant evidence reads YES (verified-key request factory and scopedCollection); auth scope retained; corpus writes NO; normal eventual Ask job ledger writes YES; credentials/providers untouched. Legacy callers retain defaults, including /compete.

## Change map and invariants
source-context.ts builds complete original-ID/title/session catalog clones without raw summaries; refuses duplicate/malformed or >64KiB metadata. askV2 resolves selection and hybrid/RRF IDs to ORIGINAL tree objects before trusted hydration; no arm/model payload text becomes authority and original tree stays immutable. Six higher-ranked candidates maximum, explicit omitted/degraded audit.
API ask/source-context.ts reads exact session IDs through tenant wrappers, hashes/parses the same frozen row serialization, validates ownership/identity/time and vector offset/full-turn/slice/span identity. Quotes use exact half-open UTF16/UTF8 offsets, original speakerRef and whole-turn timestamps. Context is excerpts, never whole-session accepted coverage. Speech/OCR/visual origins remain distinct. Model/prefix provenance follows producer's ordered-span join with a space, search_document prefix, pinned nomic digest and nomic-rag-prefix-v1.
production.ts -> requestDepsFor -> createSourceRequestDepsFor -> actual unchanged createLlmScorer -> askV2 logging/budgeted completion. Evaluator jobs remain on evaluator chain; remaining completions remain ask chain. Query embedding is one request-local memo shared by existing arms/hydrator. Actual score completion audited once.
Caps count UTF8 JSON-serialized job bytes before DISPATCH:12 completion dispatches,64KiB/job,256KiB total; frozen two-member ask/evaluator chains permit at most24 adapter attempts, separately ledgered. Four-minute START deadline stops NEW calls; existing transport owns in-flight timeout/child cleanup. No hard total-deadline/cancellation claim. Sticky failure survives scorer catch; any heuristic scorer degradation refuses, audits and returns explicit503 instead of a grounded answer.
bounded-refine.ts decomposes, batch-judges every exact strip (at most3 calls), rejects unknown/duplicate/missing/coerced decisions and recomposes in stable order. Correct verdict still skips refine/web. answer.ts binds each sentence to allowed source IDs and judges ONLY its cited strips, including speaker/time identity and origin; unsupported/category/answer relevance refusal is explicit.
AskPage renders source quotes separately from web, preserving stored speaker/time labels and links /sessions/<id>#turn-<turnId>; existing SessionDetailPage resolves those anchors. No names or sub-turn times invented.

## Focused evidence
Runtime Node24: C:/Program Files/WindowsApps/OpenAI.Codex_26.1002.7124.0_x64__2p2nqsd0c76g0/app/resources/cua_node/bin/node.exe. Repo dependencies ready; subprocess/loopback test and Desktop output writes need approved escalation already demonstrated. No browsers/full suites.
Command: Node --test --test-concurrency=1 --import tsx packages/ask/src/source-context.test.ts packages/ask/src/bounded-ask.test.ts apps/api/src/ask/source-context.test.ts apps/api/src/routes/ask.test.ts.
Final guard-adjusted37/37 PASS,0failures/skips/cancelled,11712.5935ms. Actual scorer/factory, sticky budget bypass,2MiB catalog/all29 IDs, real29dated sources/3424retained rows,23original+6September count, late Unicode span, adjacent country qualifier, same-buffer mutation, foreign/poisoned rows, complete batch judgments, answer support refusal and HTTP scope/503 are included. The corpus test is known-candidate source availability, not naturally phrased retrieval precision.
Immediate downstream command: Node --test --test-concurrency=1 --import tsx packages/ask/src/ask-v2.test.ts packages/ask/src/select-nodes.test.ts packages/ask/src/refine.test.ts packages/ask/src/answer.test.ts apps/api/src/ask-arms.test.ts apps/api/src/score.test.ts apps/api/src/production.test.ts apps/api/src/routes/compete.test.ts.
47/47 PASS,0failures/skips/cancelled,20951.7355ms. Final audit-only correction freshly reruns actual-factory/correct bounded/correct legacy consumers, reported below, rather than claiming a repeated47-case run.
UI command from apps/web: Node node_modules/vitest/vitest.mjs run src/pages/AskPage.test.tsx src/pages/sessions/SessionDetailPage.test.tsx --maxWorkers=1 --minWorkers=1.
16/16 PASS,76.09sec (environment startup included). Final source proof guards do not modify those UI sources.
Node node_modules/typescript/bin/tsc --noEmit -p packages/ask/tsconfig.json and apps/api/tsconfig.json: both PASS. Frontend tsc -b initially EPERM on Desktop tsbuildinfo; approved rerun PASS. Vite build PASS73modules,4.90sec. contracts/verify_contracts.py PASS by vacuity; frozen paths have no diff. No claim of canonical contract completeness.

## Pending check and real runtime gates
Independent final natural-question inventory work/ask-source-availability-probes-final.json SHA256bfd359a6f39c24b45615da548caf2c28d561637b46df47ee72ce8282f832a240 contains29natural+6special cases and exact literal source spans, NOT semantic gold/thresholds. Actual local scoped vector/lexical retrieval replay waits for independently accepted genuine embedding packet/backfill readiness and root's live-query boundary. Record misses/rankings; no oracle-selected IDs or fake vectors as retrieval proof. Separate known-candidate source availability can isolate extraction/offset errors.
One later public-source genuine Ask requires exact public payload/excerpts/budget and root approval. No provider corpus chat, automatic29generation batch, real fallback acceptance or request Ask credential yet. Full phase-one Ask, human semantic acceptance, U2.2 thresholds/gold, canonical rollout and release/roadmap task completion remain open.

## Frozen source hashes
- packages/ask/src/ask-v2.ts: 2a795cf8b0cb45ac6f3c5cc7298c66cf14a7b3db2f89af31080d8ec896b56629 (256 nonblank lines; base 8aebbd52a701af34379d57cee4f6292e25f8fa21bb036891cc90795261d6d605).
- packages/ask/src/answer.ts: 36d36b5c6be73a827cc93883f925c294d05d0bc51de399bcb693f06326abfd41 (68 nonblank lines; base cadb4a6e0efc4c69f5d8634b5781d31447f45e108ffd8acb03db6d524c581f46).
- packages/ask/src/index.ts: abed451dcd8ed8c6e545d9a6976c6d8d2e1c5774639eaaf9e2b746924c395315 (22 nonblank lines; base e61a06cf7495e5dc4c48f462e01c733c781c6b3bad72a5951c24905681d13c89).
- packages/ask/src/source-context.ts: 27402b3e0f23aa74e79afd2a296a6a9f4c88e43c210b52375f2603f46a8267dc (127 nonblank lines; base absent/new).
- packages/ask/src/bounded-refine.ts: 4050811626215806413d742c0e652d44ff69455c9279eb797dbf204c448e93eb (49 nonblank lines; base absent/new).
- packages/ask/src/source-context.test.ts: 9de95aff03f681256d45cb95c282a15a722b136e5135c1edd7cd73ccb0f68cb3 (78 nonblank lines; base absent/new).
- packages/ask/src/bounded-ask.test.ts: b0d92d37f7923fad01fb00cbb2004209e3c7202f316956b15ec53b2d93a90011 (111 nonblank lines; base absent/new).
- apps/api/src/production.ts: 7e155585e7096eec5973027af1a15b61265fee9a88a57d9255f4b215863cc365 (234 nonblank lines; base 446dbd26df0f87c4ffaed212a918481c3314b9855183aad204f1dbce3fd5a304).
- apps/api/src/routes/ask.ts: b9cea1cd3570651f8354c3fcc7607a5ac6e9194cece52987a2032cd126ec42e2 (62 nonblank lines; base 91be3e611b10f67e3374eb14983b4f62ee955ce965c1c9c161dbb70cf9014245).
- apps/api/src/routes/ask.test.ts: acb7f310303e9b6de01769a9577328fc13525de0b814798bcd65f8cb728f71c9 (86 nonblank lines; base absent/new).
- apps/api/src/ask/source-context.ts: e7516bb1133282431cbcb13b3dbc76e2fe50a1b178dc6cbc0b0d6d873ccfae98 (208 nonblank lines; base absent/new).
- apps/api/src/ask/source-context.test.ts: 27ee3110fc523364e90593dcc21db83084088aa935557010c4ac138de6f23560 (224 nonblank lines; base absent/new).
- apps/web/src/pages/AskPage.tsx: fa8a8d26dd974f2770d018eeaffc48307da4e3d527f07f039a266d59102e9b81 (165 nonblank lines; base acd60dce3363617c127399351d67c3e2e96dafcb2dcab33ff9f57c0b71c0b792).
- apps/web/src/pages/AskPage.test.tsx: 851c5831238afaefbaa259d57d7bbe1c428fe1b84061e4ef41b3e504a76b15be (197 nonblank lines; base 7a9990d62b79a60abf652d2dbc60f0fac1108bf0be21a7d7719b23700c154bc2).

## Checker-directed cycle1 corrections
Independent source review found HTTP route precedence overwrote the request factory's memoized arms with legacy arms. Corrected route uses legacy factory only when no requestDepsFor exists. Actual HTTP composition with BOTH fields confirms original source identity, real scorer facade and exactly one shared query embed:3/3 repaired route cases PASS,21230.5317ms.
Independent protected hybrid C5/I3 review required ordinary query-embedding outage to retain grounded lexical excerpts. Stored source ownership/span/hash/policy corruption still hard-refuses before embedding. Unavailable/malformed query embedding now returns bounded lexical context plus fixed visible failed-arm audit; actual factory still performs unchanged scorer/answer grounding, exactly one embed attempt. Repaired outage, real factory, policy and foreign/corrupt source boundaries:9/9 PASS,1427.6162ms.
Bounded successful empty web results now preserve insufficient_coverage=true/web_used=false, explicit empty-evidence audit and no fabricated answer. Legacy defaults unchanged. Affected empty/unavailable/legacy fallback consumers:5/5 PASS,854.8888ms.
Final source hashes above include all three corrections. Final API typecheck PASS after these corrections; final Ask typecheck reported to checker when complete. Earlier source/downstream/UI evidence is reused only for unchanged behaviors, never represented as a full final rerun.
Authoritative app dotenv.parse inventory now confirms Gemini present/Tavily blank; earlier regex presence inference was wrong. User file stays untouched. Prospective private smoke process must blank paid-model credentials, use only native Max OAuth, pin every stored source to the accepted public29 snapshot/recoverymapping before native dispatch, and retain exact loopback DB/Ollama bindings. Actual Tavily search remains blocked on a usable key. No live inference at this request.
