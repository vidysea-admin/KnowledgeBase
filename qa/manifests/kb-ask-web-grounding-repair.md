# Knowledge Base Ask grounding repair

**Status:** checked-PASS (engineering C1/C3/C4 at f445c61a, publisher C2 owner-authorized recheck at 13a6c546)
**Fix cycle:** 3 (explicit owner-authorized final recheck)
**Handshake status:** STALLED (2026-11-26). At cycle 3, verdict A is FAIL on the school-policy wording (def9078d) and verdict B is PASS for C2 only, so there is no same-cycle dual PASS. The wording release is held by D-218, and the repair continues as unit F1 (`wave/f1-waiver-condition`). Not a close-out. This canonical field also stops the session hook from counting old PASS blocks (qa/QUEUE.md:1249).
**Policy-Version:** proportional-verification/2026-11-22.19
**Dual check:** required
**Feature commit:** 13a6c546
**Authority:** Umesh authorized one release to the existing GCP kb-login-test tag and two signed-in Ask retests. Production domain promotion and other content writes have separate gates.
**Goal task:** Phase 1, public sourced answers.
**Plan approval:** qa/.delivery/bfcad860c3ad8ca7adf298dc85ebea63d1dc51a6d0320cd847dacfde12abec4a.log
**Maker protocol hash:** cb660ebcf3c729ad0f4b9a771618ca129196039fad469f1588f932d1e5290102
**Checker protocol hash:** d5bf6e4f9a39ab46eb4b33da7e926904f54c24e8f32ff111da06f91f6a4e2a8e

## Scope and acceptance

C1. Ollama discovery uses a fixed authorized endpoint, Gemini is secondary. Only bounded publisher evidence can be cited. Keys stay at the discovery provider. The setup screen accepts either key.
C2. Fresh publication, history and championship share the verifier. All publisher hops require public pinned HTTPS. Limit acquisition by total time, bytes and concurrency. Re-read the canonical destination, title and visible excerpt. Withhold changed content.
C3. Fresh valid zero-evidence refusals tell the reader whether search failed or no evidence matched. Historical and changed records remain subject to the standard freshness rules. Raw diagnostics and answer candidates remain withheld.
C4. Both answer generation and its independent judge retain material school, audience, location and date qualifiers. A broadened sentence is withheld. Richer generated-answer quality is confirmed by the two separately authorized public retests.

## Builder checks

Pre-check[C1]: 6ce91811 node --import tsx --test apps/api/src/ask/ask-web-fallback.test.ts apps/api/src/activity-health/setup-status.test.ts -> pass.
Pre-check[C2]: 6ce91811 node --import tsx --test apps/api/src/answer-policy/answer-persistence.test.ts -> 10 passed. Also verified separate live publisher reads against both public NASA Titan pages including the Mercury paragraph on /facts/.
Pre-check[C3]: 6ce91811 node --import tsx --test apps/api/src/answer-policy/fast/answer-fast.test.ts -> pass. PolicyAskPage and existing withheld-review UI tests passed.
Pre-check[C4]: 6ce91811 node --import tsx --test packages/ask/src/answer.test.ts packages/ask/src/fast/ask-fast.test.ts -> pass.
API and web production builds succeeded. API TypeScript check passed. Contract validator reported zero frozen contracts. No signed-in Ask re-test has been consumed on this patch.

## Release boundary

Candidate is on the isolated release/kb-ask-grounded-web branch in .worktrees/kb-password-min8 based on cce958a3. New image digests, Cloud Run tag, authenticated live answers and full 23-session coverage require their own receipts.

## Repair cycle 2

Release candidate f445c61a addresses the two independent review reports for 6ce91811. The first candidate's registry images were built by Cloud Build 5fa4735f-08c9-4193-bff4-90bef8ac1a40. Cloud Run still serves 00018-6cx on the test tag.

Pre-check[C1]: f445c61a node --import tsx --test apps/api/src/ask/ask-web-fallback.test.ts apps/api/src/activity-health/setup-status.test.ts -> passed in the 108-test run.
Pre-check[C2]: f445c61a node --import tsx --test apps/api/src/answer-policy/answer-persistence.test.ts packages/ingest/src/sources/node-transport.test.ts -> passed. LKB_TEST_LIVE_NASA=1 enabled the public publisher test. The exact NASA question produced an excerpt with Titan and Mercury. A fresh retrieval verified the same title, final URL and paragraph. The local NASA fixture loaded seven linked sheets plus one import on both reads. A browser rendered the cited paragraph visible with these styles. Two ordinary HTTP reads used separate sockets.
Pre-check[C3]: f445c61a node --import tsx --test apps/api/src/answer-policy/fast/answer-fast.test.ts -> 14 passed, including four deep/fast empty/outage permutations, and guarded lookups of the same run's history.
Pre-check[C4]: f445c61a node --import tsx --test packages/ask/src/answer.test.ts packages/ask/src/fast/ask-fast.test.ts -> passed in the combined run. API TypeScript and production bundle passed. Browser tests 43/43 on unchanged web sources, web production build passed.
The final cycle must independently retry each filed failure on the fixed commit. No provider calls, signed-in Ask, deployment or production writes are part of the independent local review.


## Independent cycle 2 outcome

Functional check PASS for C1, C3 and C4 at f445c61a. Publisher check FAIL for zero-alpha CSS text colors at the same commit. Source check verified the earlier root, linked CSS, DNS/socket, and freshness repairs. Benign fixtures confirmed the existing reader admits rgba(20,40,60,0), #192f4700, and rgb(20 40 60 / 0%). It withheld transparent and admitted the opaque positive control. The next brief is limited to alpha-zero color matching in declared text colors and an offline plus real-publisher recheck. The third review cycle requires the owner decision.

Current Cloud Run test tag: 00018-6cx. First candidate images remain artifacts only. Signed-in Ask attempts consumed on the new candidate: 0 of 2.

## Owner-authorized cycle 3

Umesh approved a final independent check for the alpha-zero visibility repair, with a test-tag release and the same two Ask retests after PASS. At 13a6c546, only the publisher color check, its test and the existing dependency manifests differ from f445c61a.

Pre-check[C2]: 13a6c546 node --import tsx --test apps/api/src/answer-policy/answer-persistence.test.ts -> passed, including linked CSS inherited color and text fill across nine hidden and four visible color examples, both discovery and fresh saved-source verification. With LKB_TEST_LIVE_NASA=1, the combined focused suite passed 109/109 including the real NASA page. API typecheck, API production build and git diff --check passed. The previous functional verdict covers unchanged C1/C3/C4.

## Final check result

Independent publisher review PASS. All 16 zero-alpha cases withheld for fresh and saved answers, 12 visible controls allowed. The approved recheck changed four files. The 109 affected backend tests and 43 frontend checks passed. Cloud Run routing and the two approved user-level requests have separate receipts.

## Signed-in results on 00019-jvc and scoped UC follow-up

Build ed68b473-9108-45e8-af0c-71fcbb8d56b3 served commit 13a6c546 on the test tag. The owner signed in and out. Two POSTs returned allowed. The internal run 857d3653-d8b0-4fa9-8d43-e213d25409bb linked to Vaishnavi t042 at 2124 seconds, and also included unrelated Beauty t022. The web run 4e936484-4596-444a-a8f4-416cb3f7d994 answered Titan and Mercury, with two NASA links. The clicked Titan Facts page returned 200 and supported the answer.

Tier 3, T-056, citation precision. Umesh approved fixing the additional UC citation, one isolated test deployment after independent PASS, and one signed-in UC retest. Plan review APPROVE at 13a6c546. Only packages/ask/src/ask-v2.ts askFastV2 and packages/ask/src/fast/ask-fast.test.ts changed. The unit preserves the complete quote tuple, snapshot and locator when filtering each node to the question's retained source IDs. It does not migrate old records.

Status: checked-PASS
Fix cycle: 1
Candidate: a9bbeb989cfea3e28862ea0dcbb538fe5a3fd631
Pre-check[C1]: the same-session acceptance test failed on 13a6c546. After the edit all four permutations passed. The unchanged synthetic standalone reproduction now publishes only quote-t042. The six focused test files reported 73 passed, zero failed, one optional live publisher skipped. Ask and API tsc, API bundle and git diff --check passed. The verifier reported no frozen contracts.
Plan receipt: qa/.delivery/9a9511613a39087e1a803f6536ebc7b54b2442509d329ee9b012ea7344a8b189.log
Protocol: proportional-verification/2026-11-22.19; maker cb660ebcf3c729ad0f4b9a771618ca129196039fad469f1588f932d1e5290102, checker d5bf6e4f9a39ab46eb4b33da7e926904f54c24e8f32ff111da06f91f6a4e2a8e.

Cloud Build 02eae3b2-77e0-4fe8-af3e-048e8ec9c4b0 succeeded. The tag now serves vidysea-knowledgebase-00020-7ss. Both deployed image digests matched the build. The tagged login and JavaScript bundle returned 200. The default stays at 100% on 00015-rbd.

Public UC retest 67847e2e-51e9-4512-8b24-641af3696dc7 made one authorized POST. HTTP 200, allowed, exactly one internal source, Vaishnavi t042 at 2124 to 2297 seconds. The displayed identity and times and linked transcript text matched. No t022. Logout returned 200. The separate English-waiver claim in this answer failed scope verification against the 1024-character quoted source prefix. No audio or video element was visible in the cited-turn view.

## Local follow-up on the English proficiency waiver

The next unit concerns answer scope on a correctly cited statement. The test tag continues to serve 00020-7ss at a9bbeb98. The local branch repair/kb-school-waiver-scope contains candidate 93be5cd999c838aabdb8671a29e292d6c4d21cd1.
Status: ready-for-check
Fix cycle: 1
Tier: 3, T-056.
Pre-check[C1]: On a replay of the four sentences in public run 67847e2e-51e9-4512-8b24-641af3696dc7 using a fixture judge that accepts all, the prior code returned the unqualified waiver. The new code removed that sentence and retained the other three. The cited 1024-character prefix of t042 matched its actual SHA256 and contained both the school and instructional-language condition. Across six focused test files, 79 passed and one optional external-publisher test was skipped. Ask and API typechecks, the API bundle, and diff check passed. This is local maker evidence only.
Plan review: qa/.delivery/517a230d5155a324b84bff3c4ad46f6cecf38a1877b9e9f9768ea2c273160ef2.log. The managed maker wrote the two changed files and timed out. The release operator completed the scoped query rule and prompt and re-ran the checks before independent review.

## Waiver repair cycle 2

The first checker blocked 93be5cd9 on ordinary universal paraphrases; the engineering review blocked a partial quotation and a false rejection when a following orientation sentence mentioned English. A separate verbatim visa-fee control was incorrectly withheld. The checker reports are recorded in the evidence. Umesh approved a tagged deployment on independent PASS and one further UC retest. Requests under that approval used so far: 0.
Status: ready-for-check
Fix cycle: 2
Candidate: eb74df3a6dbcb309a3ecef5ae61c66a606a62e72
Pre-check[C1]: All three newly added regression groups failed against cycle one. At this candidate, eight focused test files reported 107 passed and one public-publisher test skipped. Both API and Ask typechecks, the API production build and diff check passed. Replaying the four live sentences with the actual t042 excerpt retained the three related remarks and removed the generalized waiver.

## Source passage release, owner-authorized cycle 3

Both independent reviewers rejected cycle 2: a reversed formulation of English proficiency, a fee-only source and an adjacent qualifier still produced a wrong or withheld answer. No GCP build/deployment and zero user Ask requests for the wording change through cycle 2. Umesh authorized a final source-based implementation: show the complete grounded passage or hold the question for review.
Status: STALLED
Fix cycle: 3
Candidate: def9078d19f312c58a40b27defcbb410e4e231cd
The admitted source and query choose the scoped path. For the UC admissions question the model sees a complete verified SAT/ACT admissions statement, which is selected from a cited source before the independent grounding call. School-specific conditions use the complete bounded source passage; an incomplete or over-budget selection becomes an ordinary durable review candidate. The API hides held answer text and does not launch a web retry. A scoped deep result binds only its verified quotes.
Pre-check[C1]: nine focused files returned 132 passed, 0 failed, and 1 optional public publisher test skipped. API and Ask typechecks, API build, diff check and contract validator passed. The verifier currently has no frozen contracts. The fully mocked four-sentence replay of the 00020 public result now keeps the exact archived sentence on SAT/ACT admission and scholarships, and withholds the unqualified waiver. Fresh acceptance is pending. The owner-approved single live test has not been spent.


## Final local cycle outcome

The fresh checker returned FAIL and engineering returned BLOCK on def9078d. The 14 archived waiver variants stayed private in review, and the correct SAT/ACT line kept Vaishnavi and t042. In a different source the phrase "scores demonstrating their English ability" did not activate the grade-school scope check and an all-applicants claim reached public history. A transfer-only or recruited-athlete SAT rule lost its adjacent exception. A source that only asked the question could be published as an answer. A long exact school quotation could error before the review path. A supported TOEFL-related fee paraphrase could be withheld. Fast and deep have different treatment of a partly supported source-controlled result. No GCP build, deployment, or live Ask for the wording unit. The one post-PASS UC request remains unused.

The two retained verdicts are qa/.delivery/cb83c01058334c10d11177acc9b90af6d4a10005aba1d2484c96f1b80acd1c3b.log and qa/.delivery/f7db56dfd2f94ac9ff5bd34e7a7cfaeca1b89df561976f4ec31a001edef2741b.log. The operator held the release under the user-approved PASS condition. The separate prior citation repair remains on tagged revision 00020-7ss, with its successful single public UC test.

A subsequent repair should start from the question being asked rather than depending on which vocabulary the retrieved transcript uses. A SAT admission sentence alone is insufficient when the surrounding excerpt limits the group covered. When the full applicable context cannot be bound, send the case to review. Include the actual counterexamples above and the long-quote review path in the acceptance suite before considering another release.
