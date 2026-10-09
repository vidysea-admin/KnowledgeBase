# U2.2 offline extraction measurement harness

Status: BUILDING
Fix cycle: 1
Task: U2.2
Authorization: D104 new files; D108 independently reviewed implementation plan.
Independent final checker verdict: absent. Initial extraction QA contract: absent; maker has not authored one.

## Scope
New packages/index/src/eval/extraction.ts evaluateExtractionCase/aggregateExtractionReports; new scripts/eval-extraction.mjs loadManifest/main. Existing packages/index/src/pipeline/claims.test.ts additive tests appended after line113, using its existing turn/completion helpers. No extractClaims runtime, QA contracts, schemas, rules, budgets, DB/server/auth/browser or provider routing changed. No provider calls or production promotion.

## Behavior
Raw/parsed/filtered/persisted measurement retains citation occurrence and claim denominators, filter loss and degraded distinctions. Invalid IDs do not imply unsupported semantics, valid IDs do not prove support. Tenant/session/duplicate IDs, source times/media bounds and explicitly supplied span/speaker/excerpt checks are independent. Missing stages have available=false, rows=null, rate.value=null. Optional human/omission/entity labels bind case hashes and explicit targets; unknown/duplicate/foreign labels refuse. No gold labels or thresholds fabricated. Offline CLI uses bounded files/cases, local SHA256 fingerprints, deterministic reports and complete directory/failed-case inventory. Malformed/incomplete acquisition exits2.

## Maker command evidence
TDD command node --test --import tsx packages/index/src/pipeline/claims.test.ts initially exit1 ERR_MODULE_NOT_FOUND extraction.js. After implementation final same command exit0 tests18/pass18/fail0/cancelled0/skipped0/todo0 duration2430.8378ms. Ten preexisting extractor tests retained; eight additive measurement/CLI cases. Initial CLI fixture path failed and was corrected before final green.

node node_modules/typescript/bin/tsc --noEmit -p packages/index/tsconfig.json exit0.
node node_modules/dependency-cruiser/bin/dependency-cruise.mjs --config .dependency-cruiser.cjs packages apps workers exit0: no violations389modules1287dependencies.
node scripts/gen-types.mjs --check exit0:27generated types+index match schema.
All serial subprocess commands bounded120seconds.

Three isolated in-memory falsifiers under20second deadline all killed: removed citation counter; removed foreign citation owner refusal; removed human-label hash binding. No disk mutation.

Physical lines evaluator159/CLI89/test215. node scripts/lint-loc.mjs exit1 five other existing violations speakers-llm313/sb_join1058/obs-windows359/run-watch558/run-pipeline.test434. node scripts/lint-dirsize.mjs exit1 apps/api/src32vs31 and scripts33vs32. The new approved root CLI consumes unavailable directory capacity; lawful ownership relocation requires resolution before readiness. No budget exception or file hiding.

## Real corpus
node scripts/eval-extraction.mjs --input data/eval/extraction-corpus.json exit2 on both bounded20second repeats; stdout byte-identical. Corpus declares ALL35 data/toc-migrated directories including six synthetic artifact-missing directories; loads29sessions/3427turns/72claims/80citation occurrences. Undeclared inventory empty. Six missing-artifact cases and three invalid-turn-time sessions explicit. Legacy data not rewritten. Original23 TOC versus29 migrated transcript provenance remains unresolved.

Persisted invalid-ID citation occurrence rate14/80=0.175; all14 prior missing-reference identities retained; no newly missing/resolved changes; all eight recorded turns/claims SHA pairs match. Raw/parsed/filtered artifacts absent; semantic support/topic/person precision unmeasured. Report complete=false describes acquisition/source quality, not repaired data.

Corpus data/eval/extraction-corpus.json SHA25666ca2da2f58902626ee7469d44969169b90a121d3287663ebcfb80b043771661.
Report data/eval/extraction-report.json SHA2560af6a160fdf2a2321992fd118b35668e27b497a51e433ddd733549314a1011fc.

## Remaining gates
Independently owned extraction QA contract; independent semantic gold/omission/entity labels and threshold decision; lawful scripts capacity; completed-feature code/AI review and independent checker verdict. Full KB/provider/webinar/WhatsApp/UI/Ubuntu gates remain. U2.2 not marked done or ready-for-check; BUILDING retained.
