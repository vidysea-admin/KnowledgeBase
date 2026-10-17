# Vectorless publication

**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 7
**Task IDs:** T-008, T-043, T-054
**Priority tier:** 3 — approved roadmap architecture change (D-173).
**Authority:** User-approved Knowledge Brain implementation plan, 2026-10-15.
**Contract:** qa/contracts/vectorless-publication.md (checker-owned).

## Scoped behavior and changes

- `apps/api/src/indexing/session.ts`: default `retrievalMode` is vectorless, regardless of an accidentally supplied embedder. Explicit vector mode retains historical optional behavior. Strict preflight continues validated transcript/summary/claim/tree checks; completion remains an exact persisted-generation proof.
- `apps/api/src/indexing/chunk-write.ts`: new lexical source-reference inventory; stable content IDs and ordered turn references, no copied text or vectors. Replacement removes obsolete vector fields on the same content ID. Fenced writes/pruning require acknowledged persistence.
- `apps/api/src/indexing/generation.ts`: manifest records vectorless/vector policy. Vectorless verification re-derives the lexical plans from the pinned effective transcript, checks exact inventory, no vector fields and existing page/claim/tree binding. Missing policy retains legacy vector checks.
- `apps/api/src/indexing/vector-gap.ts`, `types.ts`: explicit policy avoids intentionally-disabled embedding backlog, retaining legacy vector-gap reporting for explicit vector mode.
- Existing `session.test.ts` and `vector-gap.test.ts` fixtures now explicitly select historical vector behavior. New `vectorless-publication.test.ts` covers throwing accidental embedder, exact receipt, tenant isolation, changed-source invalidation/reindex, removal of old vectors and failed preflight preservation.

Shared schema/generated integration is owned separately: sessions manifest gains optional retrievalMode. Production composition must explicitly select vectorless and omit embed; it is not owned by this manifest's maker.

## Callers, consumers and safety

Callers include API production indexing, connector workflow, recording upload and transcript correction. `verifyIndexGeneration` is consumed by connector and index-receipt publication; these must continue rejecting incomplete generations.

Security flags: tenant-scoped data writes and source evidence integrity. Collection access remains scoped; no auth, credentials, DB endpoint or production effects are changed. No provider or live DB calls were run by this maker.

## Evidence

Cycle 1 broker receipt: qa/goal-vectorless-2026-10-15/verification-index-source-retention-20261015T0820.json and matching stdout. Exit 1, 92/107 passed, 28.790 seconds, all pins stable. Preserve the receipt; it is not superseded evidence of success. Five generation/intake502 failures expose the downstream unconditional-vector gate (central fix); eight ordinary tests expose overstrict abstract-text substring matching (fixed to source identity/exact supplied quote validation); one legacy expected operation list omitted legitimate topicRefs tagging; one gap-ID fixture attempted aggregate indexing without matching tenant source rows (now directly tests the recorder boundary). Root broker will rerun original failing cases plus new vectorless/atomic cases; no direct maker test run.

Requested affected-stage command:
`node --test --import tsx apps/api/src/indexing/vectorless-publication.test.ts apps/api/src/indexing/session.test.ts apps/api/src/indexing/generation.test.ts apps/api/src/indexing/vector-gap.test.ts apps/api/src/indexing/chunk-write.test.ts`

Immediate downstream: connector-workflow index receipt tests, transcript-review reindex tests and Ask/search consumers; broker selects focused files after integration freeze. Run frozen contract validator through broker and disclose its empty registry.

## Known limits / remaining gates

- Full physical last-good preservation is now implemented for actual native Db-backed vectorless calls via transaction rollback; synthetic failure proof is pending broker execution. Fake collection-only handles model inner transaction behavior and do not prove Mongo MVCC. Long-running model calls inside a transaction may time out; no unsafe non-atomic fallback exists. Exhausted unknown commit results are reported unconfirmed and never replay paid work.
- Native vectorless indexing now uses one manual Mongo transaction (snapshot/majority). All work runs once; only unknown commit results retry commit up to three times. Unsupported transactions fail closed. Existing correction transaction views do not nest. Synthetic rollback/paid-call count tests added; real replica-set durability/restart, correction, revocation and cited Ask/search still require integrated proof.
- This packet does not certify all-source publication, 92-question quality, human quality acceptance or full parent-task completion.

## Candidate hashes

Cycle6 frozen bytes; base remains existing HEAD plus preserved working-tree edits. New helper and vectorless test had no base.

| Path under apps/api/src/indexing | SHA256 |
|---|---|
| session.ts | CE0A64B509DC3C9AC1E85FF7D9D8C0EAE6774E097E7FAFCF2A3C2C5888AD69AD |
| types.ts | 136DFB18F401DA4B2ECF4A519061CB5C1BDC02A8F6FB770AAB2DE7ECF76B3254 |
| generation.ts | F03C53BF95EEB6BB440A483815A622B5E355313628385EDE1A4C6FFDDC42DD8B |
| chunk-write.ts | 79F549A0BA42E4604BF94CB23776941548A69AE92B14A6287C3E340EDBB333AE |
| vector-gap.ts | 61A4DB794359C10C918DE45862FFF16A3C793033A2A6AA1595FB9820074C269C |
| vectorless-grounding.ts | 4D144FBAAFF2BA44E6257F7DBF62EE1A39F5E51171727BF653FBAC0DCCB9410D |
| session.test.ts | DB9892B71959FBBB351E8E881F236C737EBE9490EB0ADEEB21A368881025D6D2 |
| vector-gap.test.ts | 01D5063B72FC1889DEABEA280B519EF8059D583621493C8F9EE02BC6217543AB |
| vectorless-publication.test.ts | F8AC8726F379DFD18E8871A8449926EA8F99DE920F4F6FDA6987DF2FE22CF6C5 |
| session-decisions.test.ts | 794B9DF694B2E3AE5A1A6D3766183116B408CEADB1B017A7C6790A04E030B7F8 |
| speaker-suggest.test.ts | 3ECF81D258E7ED79E7256821984E48B4CF5C4F32E6B2F2DFBA45DC9D954BAE86 |
| promote-entities.test.ts | 6DBC37084CADD4A63D76EDD7CC88CCD69E92F60C10AA118ED8FB3224DF40DA0F |
| session-grounded-notes.test.ts | 604EC6785858C58445F138E5D7BF5EE9B23AEC55D28F8BFE6F18C5E438246FEB |
| session-grounded-wire.test.ts | 6E178466968C0C75C336EBACFD260C981BEDFD4A4DB1F4205A0B854404FC5DB3 |
| generation.test.ts | 8BBFEF0D2A89AAE76C612AE73DED29650CBC390F71273835EAB95162FC746DA0 |

| promote-entities.ts | 673EA06B2862B7D8D575C8A04E94B32181563405EA143524D439783F51842108 |

| testutils.ts | 72EEB2BF990D562F3169FBB559B1AFA0331C7A8D7B8D042255F1FD90EEB61309 |

## Prospective maker metrics

Routing phase UTC 2026-10-15T07:55:10.4761420Z to07:56:31.9371487Z; monotonic ticks150003576138 to150818195023, frequency10000000; active81.4618885s, waits0. Cycle2 repair phase UTC08:03:53.8931358Z to08:10:52.2529572Z; ticks155237814302 to159421360811; elapsed418.3546509s, explicit mailbox waits20s, active398.3546509s. Comparable measured maker active subtotal479.8165394s. Earlier maker usage unknown; tokens/cost null. Broker shared execution separately accounted. No checker work charged to maker.

Routing metadata: accepted matching-tenant page summaries and safe-child ancestor summaries UTF8<=768 bytes, codepoint-safe; never answer evidence. Source-native abstracts may paraphrase: trusted producer validation plus exact current turn references and supplied source quotes remain required, and accepted reviewed claims are preserved in every vectorless mode. New integration case publishes a reviewed paraphrase through actual connector receipt validation and refuses tampered lexical inventory. Transaction tests cover mid-write rollback, unsupported-transaction no-fallback, driver callback avoidance and unknown-commit retry without repeated model calls or physical completion.

## Cycle2 failed receipt and cycle3 repair

Preserved qa/goal-vectorless-2026-10-15/verification-index-fix23-20261015T0842.json and stdout: exit1,18/23 pass,5 fail,9.378s,pins stable. Remaining failures: two entity coverage fixtures had no actual topic in summary; one reviewed payload gained derived topicRefs (real policy bug); two transactional mocks cloned session callbacks before the intended fault/commit boundary. Cycle3 fixes: source-backed Student Visa Rules/Acme University fixture; verified/conflicting rows excluded from annotation writes with status CAS; opaque recorder session metadata and actual onSession identity assertions. Root broker reruns exact5 only. Prior failures remain part of evidence.

Cycle3 maker phase UTC2026-10-15T08:13:45.8284360Z to08:15:07.7618106Z, monotonic161157097291 to161976443179 at1e7Hz, active81.9345888s,wait0,tokens/costnull. Measured maker subtotal561.7511282s; earlier usage remains unknown.

## Cycle3 targeted execution

Broker receipt `qa/goal-vectorless-2026-10-15/verification-index-final-five-20261015T0850.json` and matching stdout/spec: exit0, five passed, zero failed/skipped/cancelled, 2526.694ms, all scoped pins stable. Exact checks: two ISS-154 full-index entity reach/tenant-filter cases; ordinary default-vectorless reviewed paraphrase through actual connector receipt then tampered inventory refusal; native-transaction model mid-write rollback preserving prior rows/current generation; unknown commit retry with no provider callback replay and one physical completion write. Real Mongo replica-set acceptance remains outstanding.

Earlier 18/23 successes are prior-candidate evidence: entity promotion/testutils dependency pins changed afterward. They do not establish a whole23 same-candidate PASS. Integrated type/build, shared release checks and independent checker are still pending. Manifest remains in-progress until those evidence prerequisites are reconciled; no parent task closure.

## Cycle4 coherent-consumer repair

Preserved receipt qa/goal-vectorless-2026-10-15/verification-api-coherent-20261015T0855.json/stdout:69/74 passed,3 failed,2 expected private skips,25.666s,pins stable; all23 prior publication cases green. Remaining failing clauses were real reviewed-meaning verification and rejection/no-new-generation semantics, plus one positive synthetic claim omitted exact source quotes.

Root approved existing independent noteJudge reuse for nonliteral reviewed claims, no new schema/review proof. Existing exact quote/turn validation remains; no-judge bypass requires exact claim=quote=complete current turn, avoiding polarity substring bypass. All other reviewed text uses complete current source context,16k payload cap and remaining configured judge budget. Missing/failed/unsure judgments refuse before publication, preserving claim bytes. Independent verdict is not written into human claim payload. Exact positive fee paraphrase fixture now carries actual FEE quote. Allfreshrejected with existing machine rows explicitly refuses before writes. T054 negative oracle/test unchanged. Added negated-source substring regression and updated positive paraphrase to supply explicit meaning judge.

Prospective phase UTC08:19:49.6743912Z to08:23:35.8376536Z, monotonic164795584707 to167057238442 at1e7Hz,active226.1653735s,wait0,tokens/costnull. Measured maker subtotal787.9165017s; earlier unknowns preserved. Broker five selected cases pending, then required coherent epoch/type/build and independent checker. No parent closure.

## Cycle5 precise fixture and test identity

Preserved verification-publication-current27-20261015T0918.json/stdout: actual26executed,25PASS,1FAIL,oneplannedname absent (renamed case),12.525s,pinsstable. Current source safety checks including unsupported reviewed human claim and negated-substring verifier refusal passed. Only remaining failure expected old pagep1 to be pruned but the fixture seeded no prior page. Seeded valid same-tenant p1 with actual FEE summary/quote evidence; unchanged insert-first then exact-p1-prune assertions now test a real previous artifact. No product source edit.

Explicit test identity migration: old "when the judge rejects every fresh claim, old machine claims are kept (never replace notes with nothing)" -> new "when the judge rejects every fresh claim, old machine claims are kept and the new generation is refused". Same preservation floor, strengthened refusal assertion; broker must select the new title. The absent old title is never counted as PASS. Root requests corrected27 once at final stable epoch.

Prospective phase UTC08:27:04.4924545Z to08:27:06.9779335Z,monotonic169143800828 to169168652267 at1e7Hz,active2.4851439s,wait0,tokens/costnull. Measured maker active subtotal790.4016456s; earlier unknowns unchanged.

## Final current-candidate source evidence

`qa/goal-vectorless-2026-10-15/verification-publication-current27-final-20261015T0922.json`, matching stdout/spec: **27/27 PASS**, exit0, no failures/skips/cancellations, 11714.2129ms, all1331 scoped pins stable. Exact selected cases and complete runtime/environment/fingerprint are in that receipt. Renamed rejection case and valid-p1 prune case both executed. This current-candidate receipt establishes the publication regression/consumer scope; failed historical receipts above remain preserved. Do not rerun these27 without source changes or an independently justified uncovered case.

Shared coherent type/build, frozen registry validator and independent checker verdict remain separately required. Real Mongo replica-set acceptance, real providers/corpus quality and complete parent acceptance are not established by synthetic source checks.

## Cycle6 test-only TypeScript epoch

Preserved API typecheck failure qa/goal-vectorless-2026-10-15/verification-api-types-20261015T0932.json/stdout,exit2. Root leased only two indexing test files for fixture-type repair. Generic Mongo collection defaults infer ObjectId; now canonical generated Turns/Claims/Chunks/Sessions/SessionPages models express actual string IDs. Canonical Claims annotations contextually enforce nonempty evidence tuple; existing turns-as-never removed because collection has true Turns type. No casts added, no fixture values/assertions/production behavior changed. Indexing-owned eight diagnostics addressed; broker typecheck pending after other owners finish their diagnostics. Prior27 runtime receipt is historical runtime evidence; its test byte pins changed in this erased-type-only epoch, so do not imply same-byte proof.

Prospective phase UTC08:33:57.9622183Z to08:34:46.3148147Z,monotonic173278493500 to173762064012 at1e7Hz,active48.3570512s,wait0,tokens/costnull. Measured maker active subtotal838.7586968s; earlier unknowns preserved. Source frozen; no own commands beyond reads/hashes/doc writes.

## Cycle6 review admission

Compact packet: qa/packets/vectorless-publication-cycle6/packet.md. Indexed source candidate8398a420331cd135944f727df98b0f25377f1c9bec1ffc9538574a5f1d894d06 (not a commit). APItypes/build and typed10 receipts current; mandatory frozen validator vacuous. Initial NEEDS_EXTRA_REVIEW preserved. Root-authorized cumulative360s/12000tokens including shared historical debit180/6000 produced canonical assess exit0 BOOTSTRAP_REVIEW; next180s/6000. Prior shared ID vectorless_checker-wip-shared actuals null, centrally charged once. Efficiency ratios unverified. Source unchanged; no maker dispatch or reviewer verdict.

## Cycle7 delta readiness — sole cycle6 C3 repair

Ready-for-check cycle7 packet qa/packets/vectorless-publication-cycle7/packet.md; exact combined28pin candidate59316179f26032191c6c11cbf7d87e540a66d1722bb9379f3b1eca2f64629066. Prior cycle6 manifest snapshot retained in that directory; canonical cycle6 FAIL remains unchanged. Twenty-three of original24pins unchanged; refresh-executor plus four newly tracked immediate repair/fixture files are the only delta. Current six regressions and APItypes/build ownexit0 receipts/fingerprints are indexed. Root authorizes delta-only independent C3 original reproduction and ambiguous-commit consumer boundary; prior C1/C2/C4/C5 inspected source is unchanged. Cumulative finite810s20000 gate assessed BOOTSTRAP_REVIEW, ratios unverified, all prior630s17000 debit history retained, finalization reserve40s. No source edits or independent PASS by maker; real/native/fullparent gates remain HOLD.

## Independent cycle7 close-out and next epoch

Central independently parsed canonical qa/verdicts/vectorless-publication.md: VerdictPASS, Cycle checked7, reviewedSHA59316179f26032191c6c11cbf7d87e540a66d1722bb9379f3b1eca2f64629066. Rehashed all28current pins: zero drift. Same manifest now checked-PASS cycle7 for the C3 correction-retry repair and previously inspected unchanged source scope; cycle6FAIL remains preserved at qa/packets/vectorless-publication-cycle7/verdict-cycle6-preserved.md. Unknown usage/debits and all historical failures remain intact. No parent/native/live acceptance is inferred.

Next epoch is separate: narrow WhatsApp consent fence repair and new speaker relationship proposal/review service. Old scoped receipts remain attributed to their exact candidate and cannot certify changed next-epoch files. Source writes outside those explicit leases remain frozen; native standalone transaction proof remains HOLD.
