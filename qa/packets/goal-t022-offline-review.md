# Checker packet — goal-t022-offline-review cycle0

Status: ready-for-check
Manifest: qa/manifests/goal-t022-offline-review.md
Contract: qa/contracts/goal-t022-offline-review.md
Requested verdict: qa/verdicts/goal-t022-offline-review.md

ROOT specifically requests a locally usable genuine-human review path without a new DB/provider dependency or fabricated gold. Prior static HTML cannot collect judgments. This separate generator/page preserves old source PASS and old HTML. Source-only acceptance covers the new local capability; actual human review cannot be agent-completed.

## Changed code and immediate consumers

`scripts/eval/t022-offline-review.mjs`: exports current-source snapshot/generator, strict draft validator, individual local-revision save, literal-safe standalone renderer and current-source draft verification consumer. The CLI `generate` requires a current neutral packet and separately named new `data/eval/t022-offline-review*.html`; it refuses existing outputs. CLI `verify` revalidates the current source packet and refuses any stale/foreign/invalid draft. It performs no authorized server transfer or network work.

The HTML shows full query/title/summary, rubric, batch/item identity, input SHA and local/server revision distinction. It offers per-item save, packet-bound browser resume, matching draft restoration and partial/complete local download. No approve-all, score suggestion, inferred identity, remote asset, provider configuration or receipt pinning exists. An unavailable storage API never receives a durable-success claim; reviewed assertions can remain explicitly memory-only until a human exports a backup.

`t022-offline-review.test.mjs` uses existing web jsdom through its existing package dependency. It exercises actual generated controls (no browser/tool calls), including all30 displayed inputs/neutral controls, fractional save/amendment/re-affirmation, invalid score/rationale cases, strict/corrupt/foreign storage refusal, memory-mode failure/export, all30 individual synthetic submissions, hostile closing-script/text payloads and actual downstream live-intake rejection. Generator/consumer checks use an isolated copy of44 current files and verify packet/source drift and no-overwrite. All fixtures remain explicitly synthetic and no actual owner evidence is created.

## Proposed fresh ordinary commands

1. `node --test --test-concurrency=1 --test-timeout=30000 scripts/eval/t022-offline-review.test.mjs` — eight tests, outer45s, one worker, no socket/provider/DB/browser/real exports.
2. Only after command1 passes: `node scripts/eval/t022-offline-review.mjs generate --packet data/eval/calibration-human-review.json --out data/eval/t022-offline-review.html` — outer15s; exclusive new private HTML, expected30items/44bindings/0actualreviews. Print metadata only.

No command has run yet. The ordinary coordinator owns execution/immutable receipts and pre/post hashes. No old suites or frozen validator repeat is requested. Independently inspect all new code and derive acceptance-boundary probes; only matching formal READY/evidence/final bytes can PASS.

## Real owner workflow after the new artifact exists

1. Open the new standalone HTML locally. Inspect the exact query/title/summary using the displayed existing rubric. For each item, enter a score and rationale, personally affirm that item and save it. Work through all three batches. There are no preselected answers.
2. Browser storage may be unavailable for local files. Its visible memory-only message is authoritative: export a partial backup before closing; restore only a matching draft. Full export enables after30 distinct individual assertions. Downloads are private drafts, not authenticated approval receipts.
3. Before any later server transfer, an authorized operator runs the `verify` consumer against current sources, reconciles actual Umesh evidence, obtains the current authenticated `toc` view with `compete` scope and its item CAS revision, and transfers each item through the existing protected route or separately approved import. Never replace null `serverExpectedRevision` by an assumed0; never invent an actor or server audit.
4. Only the authoritative server export plus30 matching genuine owner confirmations can advance to the independently checked receipt. Operator `T022_VERIFIED_CONFIRMATIONS_SHA256` is SHA-256 of `JSON.stringify(parsedReceipt)`, not raw file bytes. No receipt/digest is generated or configured here. D164 approved-provider predecessor order and all real calibration/provenance gates remain.

Actual human reviews remain0/30. This artifact can make the task usable; it does not record that Umesh has done it.

## Current privacy gate; supersedes the proposed execution above

The test inputs are authentic private corpus inputs; only entered test judgments and hostile payloads are fictional. They must not be labeled public synthetic fixtures. Under the exact runtime test-only readiness lease, literal `KB_T022_PRIVATE_REVIEW_TESTS=1` now gates the authentic snapshot before-hook and all eight callbacks. Default execution yields eight explicit SKIP/HOLD cases, with no authentic packet/copy/generation by those callbacks. It cannot certify the eight-case private behavior.

Helper remains SHA-256 `48ab7207f4164a82d6fbc6af013706895db037c4fa0cf06b6ec7747b9c7b6201`; current test is SHA-256 `6d52afa30862d3193faa0a961a22d05db116c9c358cb1dcedca962728df85ea9`. Old request `72b10a16...` is retained as historical and must not run its ungated private generation. During the checkpoint, private opt-in execution and separate private HTML generation remain held. A coordinator must classify any future explicit private command separately. No tests/generation, genuine reviews, authoritative transfer or provider calibration are claimed by this readiness edit. The private HTML and input-bound QA artifacts are excluded from publication.

## ROOT-authorized private local stage now queued

ROOT explicitly authorizes the local-only authentic eight checks with command-scoped `KB_T022_PRIVATE_REVIEW_TESTS=1`, followed only after eight PASS/zero SKIP by private `data/eval/t022-offline-review.html` generation. Sole coordinator request: `qa/evidence/goal-t022-offline-review-local-authorized-spec.json`, SHA-256 `f7ca4901ed586433cc1d761fcd1dbfae07545b919a6da453e2deb66471b6387d`; 65 pinned inputs, all 44 current bindings and all fourteen prior candidates unchanged. Begin after the current 1951-input types/build phase; exact test outer timeout 45 seconds, conditional exclusive generator outer timeout 15 seconds. No source/test edits or local execution occur during the freeze.

Authorization covers local authentic packet reading, confined disposable input copies, DOM controls and the new private display artifact. It does not grant providers, DB, browser/device, network, external/public export, authenticated transfer or human evidence. Default opt-in remains off with eight explicit SKIP/HOLD. The generated artifact and input-bound request/receipts are private, excluded from public commit. Status remains building until actual broker evidence and matching independent verdict exist.

## Actual evidence and formal READY cycle 0

Authentic local eight checks are now executed: eight PASS/zero FAIL/SKIP, exit 0 in 2301 ms, 65 source pins unchanged. Receipt `qa/evidence/goal-t022-local-tests-20261015T011038Z.json` SHA-256 `a6e4f053a34c93ea242d78afb1c3be4ba94975292460228e1d0ebde6854c3ce5`.

Dependent exclusive generation then executed: exit 0 in 160 ms, thirty neutral items/forty-four bindings/zero human reviews, 65 pins unchanged. Actual private `data/eval/t022-offline-review.html` is 58,708 bytes, SHA-256 `2b617ff41ccc1fb1e3e68105d366da63b340237a9c8f1f263ddb585549d0c6e5`; generation receipt `qa/evidence/goal-t022-local-generation-20261015T011630Z.json` SHA-256 `38691b9f694911e92f2076e0810e8978a8ab1480db9413b274446996141df9cb`. Content-free summaries preserve private raw-output hashes; raw inputs/HTML/drafts remain excluded from public publication.

READY requests the existing independent checker specimen `qa/evidence/goal-t022-offline-review-checker-artifact-spec.json` against the actual emitted HTML/current sources, with no duplicate maker eight. Its current contract is SHA-256 `e6a24a9598d33f9fd0de9bed41b85572fee69e6a7a87fe0ac306be3e769097e1`. Maker has not written a checker verdict. Actual genuine labels remain 0/30, unknown server revisions remain null and full-parent acceptance stays HOLD.
