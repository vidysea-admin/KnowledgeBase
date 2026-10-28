# Actual policy release: native evidence maker packet

Status: building
Fix cycle: 0
Priority: tier3, parent-approved native source vertical slice actual PolicyAskPage/history release integration.
Root: C:/Users/product/Desktop/KnowledgeBase
Base: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; shared candidate uncommitted. Owned tracked edit apps/api/src/answer-policy/answer-evidence.ts; new apps/api/src/answer-policy/native-answer-evidence.test.ts has no base. answer-evidence.test.ts was confirmed absent before edit; parent explicitly permitted this new direct test instead. Exact two SHA256 pins and original-six drift check: native-answer-evidence-pins.json beside this packet.

## Contract, behavior and immediate consumers

Loaded skills/maker/SKILL.md earlier in this unit. Applicable ground truth remains ARCHITECTURE H3/tenancy; qa/contracts/goal-t008.md C1/C4/C5/C8 and vectorless amendment; T007 C9 quarantine. Scope is native release verification only; no answer-workflow, policy-guard owner, schema, generated, shared composition, contracts or enforcement changes.

Frozen exported signature: createMongoEvidenceVerifier(db:Db, web?:VerifyEvidence, eligibleTurn?:(tenantId:string,sessionId:string,turnId:string,quote:string)=>Promise<boolean>, nativeResolver?:NativeEvidenceResolver):VerifyEvidence.

Native bindings require a nonempty all-native quote inventory. Each quote has exactly id/nodeId/quote/origin/sourceLocator, nonempty unique quote identity, matching bound node/source/revision and a locator accepted by the SINGLE shared resolver parser. Native source evidence cannot contain sessionRef; native quote audio fields and mixed legacy/native inventories refuse. The binding excerpt must equal the exact quote strings joined by newline. Source fingerprint verification remains ahead of this branch. verifyNativeSourceQuotes delegates to the same current-head resolver.revalidate used by graph release/navigation. No fake session/turn lookup, speaker or audio timestamp is introduced.

Existing transcript source/turn/overlay and web verification code remains after/beside this branch. Immediate consumer apps/api/src/answer-policy/answer-workflow.ts already calls its injected verifier through snapshotFreshness/freshness for published policy answers and cached get/history release. It is untouched. Central answers composition must supply input.nativeEvidence as argument4; a missing resolver refuses native evidence.

## Required checks / current evidence

Seven direct tests authored, zero executed: document+message acceptance without Mongo audio reads; fresh epoch/revision/withdrawal denial on repeated cached release; mixed/forged quote and source bindings; exact excerpt/fingerprint/missing capability; infrastructure unavailable; existing scoped transcript overlay/eligibility control; existing web verifier control. The current-head authority is the actual shared resolver with a synthetic trusted loadCurrent fixture, not Mongo proof.

Proposed sole-broker invocation from repository root after interpreter/import/writable-temp preflight, outer30-second timeout: bundled node --import tsx --test --test-concurrency=1 --test-timeout=10000 apps/api/src/answer-policy/native-answer-evidence.test.ts. Expected7 cases. Parent-owned fourth actual workflow receipt case is separate required downstream evidence. Current API types, relevant policy/history regression, frozen/schema/structure gates and independent checker remain pending. No local tests, DB/provider/browser calls or mutations occurred. Maker active time/tokens/cost remain unknown. Original six native-hydration file hashes were reread and all matched their freeze,0drift.

This is source/building evidence, not READY/PASS, actual mounted policy acceptance or full T007/T008 completion. Root owns composition and independent/broker execution.
