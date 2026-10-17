# T-043 packet — cycle 1, preparation only

Repository: C:/Users/product/Desktop/KnowledgeBase
Task: T-043. Contract: qa/contracts/goal-t043.md C1–C10; contract SHA256 3173892AE16821611AB9EF441C2A9DF1240AE63910F034E8C82E3EE26348B35D.
Manifest: qa/manifests/goal-t043.md. Not ready for full-parent check: seven frozen helper cases and ten narrow downstream fixture cases passed centrally; independent scoped review, the separate marker gate and all live evidence remain pending.
goal-t043 is the common manifest/packet/verdict slug, per coordinator lease alignment.

## Change map and hashes

No base existed for either new file:

- scripts/webinar/index-proof.mjs: SHA256 7E548F2C2F643D6D3F6AFBA6C2360AAF225A7B531B6DC7E2D0FB2439283843EB.
- scripts/webinar/index-proof.test.mjs: SHA256 A047145BB417E9ACEA61D25105D9E4C0FA59FF67ADFD0975C75E3256F3DA38FB.

`prepareWebinarIndexProof` takes the source discriminant selected by the verified loader, compares current parsed bytes to loader turns, captures confined realpath and SHA256 before indexing, checks the source's existing validation gate, and returns a completion finalizer. The finalizer requires strict successful indexing, the exact selected turn count and nonempty chunks, then rechecks unchanged source/gate bytes and paths before returning a version-2 proof. A stray knowledge-turns file never switches speech source selection.

Plain input requires existing validation status passed, transcriptValidated true, turnsSha256 equal to current turns bytes. Combined input requires existing video-stage status done and the selected output hash equal to knowledge-turns bytes. This helper creates no validation or provenance. Caller must use `loadWebinarSession` first; its timing, tenant, identity, combined-speech, frame and containment validation remain required.

Seven focused tests cover passed speech without combined data; explicit combined selection; stale/failed/missing validation; strict stage failures; source/gate mutations during indexing; mismatched loader turns and stale combined stage hashes; and a caller-mutated array that cannot change the captured count. Actual central CPU-broker evidence is below; these unchanged cases will not be duplicated.

## Actual helper evidence, attributed to central broker

Executor: /root/docker_checker, sole CPU broker. Immutable receipt qa/evidence/goal-t051checker-broker-t043.json and its stdout/stderr paths. Program C:/Program Files/nodejs/node.exe; cwd C:/Users/product/Desktop/KnowledgeBase; exact argv:

```text
--test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/webinar/index-proof.test.mjs
```

Outer timeout 60000 ms. Started 2026-10-14T19:41:44.777Z, ended 19:41:45.147Z; elapsed 367.1399 ms; exitCode 0, signal/error null. Actual output: tests 7, pass 7, fail/cancelled/skipped/todo 0; TAP duration 239.8191 ms. Before/after hashes equal the final helper/test pins above. This is a helper-stage result only, not actual webinar indexing, providers, Mongo, Ask or checker parent PASS.

## Root-owned integration

1. Import `prepareWebinarIndexProof` from ./index-proof.mjs into scripts/webinar/sync-session.mjs.
2. Immediately after loadWebinarSession, before any disk/DB mutation, initialize only for INDEX && !DRY_RUN:

```js
const finalizeIndexProof = INDEX && !DRY_RUN ? prepareWebinarIndexProof({
  dir, sessionId, tenantId: meta.tenantId,
  inputArtifact: screenEvidence ? 'knowledge-turns.json' : 'turns.json',
  selectedTurns: rawTurns,
}) : undefined;
```

3. Replace the post-index inline completeness check/inputHash/proof object with `const proof = finalizeIndexProof(res);`. Retain atomic proof file creation/rename and existing logging. Remove unused createHash import if appropriate.

Current tested integration hashes: sync-session.mjs 9896EFF9E8FDC9E6298ACA5CF751C708C45E8C24CFD2ACF8B42ACB96FD5A4012; repaired record-finalize.ts 2A65DFC82940EC5EE461E089C1852158AC0DBAE3AB46E5ED070A196A281237B8. Earlier untested sibling snapshot: session-rows.mjs 684A6D3C5E6FAFDD9879CE232D5B0703D6A1E7D667415E2BE2B0543B70DE8081; run-pipeline.mjs F7E2713E040A9D2EC578E12014DDFE909DD11EEE3C4CFF79FD564F8ED63EEFE2. T-038 owns its marker gate repair; refresh sibling hashes when that work freezes and before ready-for-check.

**Observed incompatibility and scoped repair:** sync wraps base proof as v3 with sourceId/workDb/sourceHash, while the original finalizer only accepted v2. Root explicitly leased the validator hunk and new workspace helper/tests. The sole ordinary executor reproduced the actual producer block→actual original consumer refusal before repair, then replayed the original six cases unchanged after repair. Details and immutable receipts follow. The helper's seven-case v2-base result remains supplementary; no real provider/index/DB proof is implied.

## Frozen v3 downstream unit, original RED and actual replay

Original bytes remain at qa/evidence/goal-t043/v3-consumer-cycle1/original-sync-session.mjs (9896EFF...) and original-record-finalize.ts (9996474...). The original spec/source-pins/receipt were never rewritten. Original receipt SHA256 4870246C67CA09DB89FFD62854F171669D1F28ABCBA3345DE74E69C11A4C0A93: child 13332 terminal exit 1, 6 tests/4 pass/2 fail/0 skipped, test duration 1029.2706 ms. Actual failures were v3 proof refusal and speech-only ENOENT knowledge-turns.json.

Root-owned sync was not edited by this maker. The only existing-source change is capture/record-finalize.ts: import the typed consumer and delegate validateIndexProof(dir, sessionId, expectedWorkDb = process.env.MONGO_WORK_DB). Existing exported API/name and reexport remain; the optional third expected database is independent of proof contents. Provider/privacy/sealed-input/finalization flow stayed untouched.

New files, no base existed:

- packages/meeting-bot/src/workspace/index-proof-consumer.ts SHA1568F08EC400844F885DEFD9DB05D4B3B054A865BBB12911A2ECC7525B4B7E4A: secure bounded read-only snapshots; legacy v2 core; v3 source/session identity+status, current source/raw hashes, exact configured database with test-data staging rule, validated selected artifact, exact count and row identity/timing, and final unchanged-byte recheck. JSON values are unknown with guards; no any/type weakening/schema change.
- index-proof-consumer.test.mjs SHA9EA8A3B811B71035746F70FB32B56A12E2CAB69F68C69F8CFFFB7B5190AD4527 and index-proof-fixture.mjs SHA01498EA293641A4DF82AB472A0ACB8AB0C9FDBB9F08CE38682055756EDE2A844: unchanged six-case original floor executes the exact current sync proof block via VM using actual prepared helper and retention IO, with synthetic completed-index input only, then calls the actual finalizer.
- index-proof-identity.test.mjs SHAA33C5E184191CEE231470FB74837A7E0DE67BD1642AD64F86C574DCA515D9BCF: four added guard cases cover forged matching hashes over foreign/duplicate/invalid rows, stale gates, independent test-data database restriction and legacy count/generation refusal.

Actual replay executor /root/docker_governance_review (sole ordinary executor); spec replay-spec.json SHA24F4E6EDC4A3BD7DA2161C7FDAAB1B32CE7A63037ECD370D760800EB19BEAA69; nine final source pins in replay-source-pins.json SHA3B5FF9AC2C9A75C9F85472E549559F857A579B8933CF39B35D27BD3EDE808E56. Exact argv:

```text
--test --import tsx --test-isolation=none --test-concurrency=1 --test-timeout=30000 packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs packages/meeting-bot/src/workspace/index-proof-identity.test.mjs
```

Actual repair-replay.receipt.json SHAEF596313AF5837A3C44E57C5D384A742B2E58D27E3F4CBD26F1972F119EB1744: child16648 terminal exit0, started2026-10-14T22:48:41.9139090Z/end22:48:43.9396604Z, elapsed2028 ms, outer60000 ms not reached, all9 before/after pins unchanged. Actual stdout10 tests/10 pass/0 fail/cancel/skip/todo, duration1838.0198 ms. No provider/DB/browser/native/external actions. This is affected proof stage + immediate finalizer fixture consumption only; full parent acceptance and independent verdict remain open.

Post-generation relevant dependency snapshot (read-only, not a typecheck/validator result):

| Path | SHA256 |
|---|---|
| apps/api/src/indexing/session.ts | B48EBB3A0E5E2D65CE2004D939E8C3BAC11610CDCD410EBF5EE936851102DE79 |
| apps/api/src/composition/production.ts | E123B590FE3F0B27A0FAC6BBF0BA50ADFCB1FC0BDC51CEACFCEAD296B12243CE |
| apps/api/src/routes/ask/ask.ts | C40D50D5364C18144838C9FE67E950BFB1C781DC22F42EC51864010337CA7500 |
| apps/api/src/ask/ask-arms.ts | 2C0BCF6AD141C11BA9FA90F22CB94A939D9472E54823210BA09397F166D1FF41 |
| apps/api/src/ask/source-context.ts | 5343C1A8FA05BD8BD810032B21918BE0374EF9026DDA3CA28038C31BFAA0A872 |
| packages/core/src/generated/sources.ts | F50549030C7E363BAEA6B9855DC74422EA46A1132B1831F62A2ED4D5092B3993 |
| packages/core/src/generated/sessions.ts | FE53A0A4EA7B989257F6BD3377415807CCFBB4C939794FEBE85AA8F456102B11 |
| packages/core/src/generated/turns.ts | B4969CB780F97AC1579D753F271C4E4F7A69F95FCAC9FD76BA8D792F082D0205 |
| packages/core/src/generated/chunks.ts | BADA40CF96D687D98D5A047EE02E23F4F49D00267D0A2BF7FC3FD4FD738A9A0A |
| packages/core/src/generated/claims.ts | 7F0EC43C94C0140FDFB220B311D775653FF9D25B2E492C80796F766CE70B2A5C |
| packages/core/src/generated/session_pages.ts | EF50F0DF33F8F72FEC333D71C61660380344C3ECA6A7D9C3C438AB549BCD22AA |

Consumers: sync produces retention-bound v3; the narrowly repaired finalizer validates combined or passed speech-only v3 selected bytes. The separate run-pipeline complete gate still needs its owner's marker.version/proof.version and v3 field alignment; this maker did not edit it. The capture CLI still requires actual video processing for its --index mode. Parent acceptance should use genuine processed artifacts and must not claim the full capture chain from these local synthetic guards.

## Real input readiness, no execution claim

Selected viable session: 2026-10-13-zoom-webinar-p2, source tenant vidysea, title The Roadmap to becoming a FDE (part 2), real silent capture. Media paths raw/webinars/2026-10-13-zoom-webinar-p2.playable.webm and .m4a exist. Source SHA256 677920589570F4C72521E67CA89F088E5453445B2CA4CF13ED98FA25E2AD006E; turns SHA256 01899D788E7461323A797D1871560A809112D327819D0C04645F4EBBED0BCB67; validation SHA256 DF4791F42DFE75795E4B3CA592042F63D097C196D6923F6E6E2C61FDD14B8BAF; derivation-provenance SHA256 6FB8E73ECF95D36A59B7C834A2B08530C1B1090C8DCAD4CA8867FABF8221F728.

Persisted validation: passed, transcriptValidated true, duration 899.26 seconds, 73 turns, coverage 1, partial false, no gaps/clamping/overshoot, validatedAt 2026-10-14T06:54:17.571Z; matches current turns hash. No video-stage/knowledge-turns/index-proof yet. This is input readiness only; provider/Mongo/readback/Ask are not verified.

Other seen artifacts: zoom p1 validation failed at transcription stage; 55 turns cover first 15 to last 356 seconds of its 898.052-second media and provenance is stale/transcript-replaced, so full transcription is still required. Old 2026-09-24 Europe source is a silent capture lacking validation and cannot bypass the loader. Original TOC staging summary remains partial: 751/1905 chunks, 9/21 sessions, temporary 19-session tree and two malformed-turn exclusions. D-149 legacy seeding exception is explicit and does not create validated webinar media provenance. p2 has tenant vidysea while existing TOC data uses toc: never relabel sources to manufacture same-tenant two-webinar evidence.

## Commands and prerequisites

- Focused helper check after CPU lease: `node --test scripts/webinar/index-proof.test.mjs`.
- Immediate existing caller checks after CPU lease: `node --test scripts/webinar/session-inputs.test.mjs`; integration checks assigned by root.
- Contract validator after lease/runtime readiness: `python contracts/verify_contracts.py`.
- Actual combined preparation, delegated/coordinated with T-041: `node scripts/webinar/process-video.mjs 2026-10-13-zoom-webinar-p2 --recording raw/webinars/2026-10-13-zoom-webinar-p2.playable.webm` with an authorized actual vision provider.
- Actual indexing after root live lease: `node scripts/webinar/sync-session.mjs 2026-10-13-zoom-webinar-p2 --index`.

For live commands explicitly name LKB_ALLOW_STAGING=lkb_staging, MONGO_WORK_DB=lkb_staging and MONGODB_DB=lkb_staging and assert the actual database before writes. MONGODB_URL/provider/API credentials are runtime inputs, never evidence values. Provider/model/usage/cost, exact command exit/duration/output and scoped persisted readback still owed. No real-call attempt has been made by this maker. Network/runtime approval facts are unknown until root's lease; prior quota failures do not authorize retries.
