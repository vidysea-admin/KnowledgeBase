# Extraction draft review batches — checker packet

Slug: extraction-draft-review-batches. Fix cycle: 0. Repository: C:/Users/product/Desktop/KnowledgeBase.
Priority tier 3: U2.2 authorized review preparation under D-163; root assigns additive main-tree ownership. Original preparation seam has one prior PASS (parallel-extraction-adjudication cycle0); this unit adds AI draft review under subsequent approval. No original manifest/contract/source edits.

## Authorized behavior and acceptance

Existing qa/contracts/parallel-extraction-adjudication.md clauses1–4 apply to preservation of unchanged original claims, all literal contexts, source hashes, unavailable identities and proposal distinctions. Clause5 remains satisfied by the ORIGINAL packet, untouched. D-163 authorizes separate AI drafts only; every item requires individual Umesh approval before any future gold label.

1. Eight batches preserve all72 original claim IDs/order/records, all80 evidence occurrences, all14 unresolved identities and all7 existing replacement proposals. Ten items maximum per batch;last batch2.
2. Each item includes complete original current/historical contexts and source packet/claim/session hashes. All58 current artifact exact hashes are checked;historical snapshots remain original packet records, not fresh provenance acceptance.
3. AI source-support rationale distinguishes literal citations from replacement candidates and unavailable citations from unsupported semantics. Factual truth, omissions and entity precision remain unknown. No assertion about support absent from a complete transcript.
4. Human review remains unreviewed/null;humanGold false everywhere;binding thresholds null. No accepted gold, replacement application, task acceptance or promotion/import function.
5. Source packets and runtime remain untouched. Builder accepts identical regenerated content but refuses overwriting changed review content. Downstream validator checks identities/hash/flags against original source;changed source bytes refuse.

## Files and caller/consumer

All candidate folder files below are new/untracked;no base existed. build.py reads original packet plus three reviewer rating inputs and writes only additive folder outputs. verify.py consumes index/batches and bound current source artifacts. README/Markdown are human review entrypoints;JSON carries full unchanged records. No application imports this folder.

Security flags: auth/tenancy/credential handlers untouched;no production data writes, runtime, providers, browser or DB. New local review artifacts only. No skill, frozen contract, enforcement, source schema, budget or task/decision status edits. No original issue reproductions claimed fixed.

## Maker evidence

Commands ran from repository root using local Python, no subprocess/service credentials/network/browser.

- `python data/eval/extraction-draft-review/build.py` — exit0,0.571s;72 claims,8 batches;draft counts supported2/partial2/unsupported54/unavailable14;humanGold0.
- `python data/eval/extraction-draft-review/verify.py` — exit0,0.432s;PASS,72/80/14 identities,7 proposals,58 exact current artifact checks,humanGold0;index SHA d2cb375e85d1048fde8f9a1d8160af64085a6f4ae2bdf0e8ee7ccdb21bc110a3.
- `python contracts/verify_contracts.py` — exit0,0.469s;no frozen contracts yet — PASS by vacuity.
- Bounded importlib readback in owned `.preservation-check.tmp`: write_preserving accepted identical rebuild, refused changed temporary review and byte-preserved it;exit0. Temporary owned file removed in finally. No source mutation test.

One initial preserving rebuild refused CRLF-only output differences;comparison now accepts CRLF-to-LF equality without rewriting existing bytes. Source/batch hashes stay exact. A system temporary-folder write check was denied by sandbox;the same check ran successfully on an explicitly owned scratch file. No outside-folder permission required for production commands. Full corpus, semantic gold, human review, threshold acceptance and U2.2 completion remain gated.

## Frozen candidate hashes

- `data/eval/extraction-draft-review/batch-01.json`: `d8419f5f193e267e2df8cec8f4e583182fa34bccbdb2db0d364b4a72c0a757c5`
- `data/eval/extraction-draft-review/batch-01.md`: `c5b90fc1d409ae4bc824648abac0eb33eb0168fe126039984c7e03d21e252cd2`
- `data/eval/extraction-draft-review/batch-02.json`: `4ebb977cdc5915ce856fb958a17c94bb3d7323b9516411255a2df6d9d42cae1b`
- `data/eval/extraction-draft-review/batch-02.md`: `82208b49d521a1318f5074e8140dceaf428d57b9463e5440744cd51d462983eb`
- `data/eval/extraction-draft-review/batch-03.json`: `b88896c8b65f7bee7bb30f6226bce9773fbaf2450e1d0f3ce1538a00cf9bb264`
- `data/eval/extraction-draft-review/batch-03.md`: `b796f4c3467d1b62243014a9e7ab1df110f843578d36049adb890d14c7baf964`
- `data/eval/extraction-draft-review/batch-04.json`: `ef02faa2b2678799535aeff092b4d6505bf77abd66753562a4553ca842f2fe74`
- `data/eval/extraction-draft-review/batch-04.md`: `173dae12a4673976a3426b1b9193bb9d50f4228a430fef267ffb5c2d971216bd`
- `data/eval/extraction-draft-review/batch-05.json`: `7ee80de7384877ffc53096bec3e2fcca1fc140741671c25748f50c1e7a0ef9ea`
- `data/eval/extraction-draft-review/batch-05.md`: `28e448546392009d55c350ecd6d1540f33bf8a2d21fe828d594964b95e811baf`
- `data/eval/extraction-draft-review/batch-06.json`: `918fafd572d498e0b4ab883c8af7fdd7131ad982dfd64ed5658ec83675ecb049`
- `data/eval/extraction-draft-review/batch-06.md`: `6f758e3fb86db3c7a31fd0a8c0e19c9c6ffc75a2e2ac20e7a07fde9710d61340`
- `data/eval/extraction-draft-review/batch-07.json`: `44427e1525be92cd9be9926421af0412c6d9238fa8c567065dd6b22215f2dac1`
- `data/eval/extraction-draft-review/batch-07.md`: `93ef652c7d8f540355d0855c0b9aa3e9b5c7688f45f3451d4315a3cf994554d2`
- `data/eval/extraction-draft-review/batch-08.json`: `0f8b2d4aa9e20dbed92ee4343e8abeffa2304458aa929aa7aea27b6ff7084920`
- `data/eval/extraction-draft-review/batch-08.md`: `cc999e101673e9a12dbb126ebc232c0d93d870440b977c25f0ce43a235a303a6`
- `data/eval/extraction-draft-review/build.py`: `3ef47bef13241155fe62568d1263d1084e372bc5d746d10a8cc1b4fc56cea36c`
- `data/eval/extraction-draft-review/index.json`: `d2cb375e85d1048fde8f9a1d8160af64085a6f4ae2bdf0e8ee7ccdb21bc110a3`
- `data/eval/extraction-draft-review/ratings-01-24.json`: `d2d644b01e3a7bb6311e2da3b7469e2e2a738877d6be9c3f23a6a21defe4f373`
- `data/eval/extraction-draft-review/ratings-25-48.json`: `22b4b8343fc97411feb7585595356abf8f96455ec5870dabfdaf9e6fb31c9f39`
- `data/eval/extraction-draft-review/ratings-49-72.json`: `256fd7d35ab95549aa6b811c869e5e8f613b0a101fc2fee36420e860297e3615`
- `data/eval/extraction-draft-review/README.md`: `de5b5c7d2369388f1fc141ddce052b9b4c56d778e4c0d3e5ea513665162af6ba`
- `data/eval/extraction-draft-review/verify.py`: `cc189be8ed64e9b4c8497b7f427d4ba564bacd3037494dfc616c4a0736b0da05`
