# Vectorless publication — independent source review, cycle 6

Root: `C:/Users/product/Desktop/KnowledgeBase`. Manifest: `qa/manifests/vectorless-publication.md`, cycle6. Verdict ownership: independent checker only, `qa/verdicts/vectorless-publication.md`. Read global checker skill and repo AGENTS.

Candidate is SHA256 of adjacent `pins.json`: **8398a420331cd135944f727df98b0f25377f1c9bec1ffc9538574a5f1d894d06**. Indexed fingerprint, not a commit. Base and small source/consumer/schema/contract pins: adjacent receipt-index.json/pins.json. Preserve dirty-tree changes.

## Changed logic and acceptance

Contract `qa/contracts/vectorless-publication.md` clauses1–5, scoped source implementation only:

- **C1/C2:** `indexing/session.ts` defaults vectorless even with an injected throwing embedder. `chunk-write.ts` persists lexical source references, replacing old vectors. `vector-gap.ts` does not open a gap for intentionally disabled vectors. Explicit dormant vector mode retains historical behavior.
- **C3:** Native Db-backed publication uses manual snapshot/majority transactions and the existing serialized tenant-bound `transcript-review/transaction-db.ts` view. Work runs once; only unknown commit results retry commit(max3), never providers. Unsupported transactions refuse. Existing correction views have no client, so join their caller's transaction. `generation.ts` checks turn/artifact digests, lexical coverage and tree binding.
- **C4:** `vectorless-grounding.ts` validates current evidence; canonical summaries may paraphrase. Reviewed payloads remain immutable, including absent topicRefs. Literal bypass requires claim=quote=complete current turn; other reviewed paraphrases require an injected independent noteJudge on full current context, within remaining configured judge budget/16k payload limit. Missing/failed/unsure verification refuses before writes. No accepted fresh claims plus old machine rows refuses a new generation while retaining old rows. `promote-entities.ts` skips reviewed rows and CAS-excludes review races.
- **C5:** `connector-workflow/mongo-store.ts` consumes exact verified mode-aware publication instead of demanding vectors. Transcript refresh requires vectorless lexical/provenance proof. `bindIndexTree` emits accepted-page-derived routing summaries, UTF8<=768 bytes, for sessions/ancestors; routing text is never answer evidence.

Other owners supplied indexed composition/schema/connector joins. Independently check high-risk tenant/write/CAS boundaries.

## Existing mandatory evidence and minimal review nodes

R0–R5 are ordered receipts in receipt-index.json with exact commands/runtime/environment. Raw files: qa/goal-vectorless-2026-10-15/.

- R0:27/27, exit0, stable pins,11.714s. Covers strict caller, missing/mixed artifacts, changed source, no-vector trap, preserved paraphrase, invalid review, rollback, unsupported Mongo and commit-only retry.
- R1:10/10, exit0,3.484s; current typed test bytes. Only two indexing tests changed after27, using erased canonical type annotations; no behavior/assertion changes. This receipt covers their changed paths.
- R2/R3 API types/build:both exit0,13.997s/2.606s; current unit pins match. R4:47pass,2 explicit private skips, no failure; synthetic downstream correction/citation coverage.
- Frozen validator R5:exit0 **by vacuity**, empty registry. No substantive frozen coverage claimed.

Minimal independent behavioral nodes, through sole broker if required: `native transaction boundary rolls back a mid-write failure and preserves the accepted generation`; `unknown commit retries cannot replay paid model calls or duplicate physical completion`; `reviewed substring cannot bypass meaning verification of full negated source context`; actual connector paraphrase/tampered-inventory case; T054 unsupported-preserved-claim refusal. Check reuse identity/policy; no automatic27/full rerun. Manifest preserves failures/cycles/test rename; absent tests never PASS.

## Budget and limits before dispatch

Initial NEEDS_EXTRA_REVIEW retained. Root authorized shared debit180s/6000tokens: vectorless_checker-wip-shared, centrally charged once; actual overhead null. Authorized assess input/result adjacent: exit0 BOOTSTRAP_REVIEW. Next180s/6000tokens; cumulative360s/12000. Manifest records individual maker phases, known subtotal838.7586968s; earlier usage/tokens unknown. Ten-percent efficiency unverified. Maker has not dispatched.

No mandatory receipt missing. Outstanding: independent verdict; real Mongo/provider/capture; all-source/cited Ask;92-question/human quality; parent acceptance. Source PASS closes none of these.
