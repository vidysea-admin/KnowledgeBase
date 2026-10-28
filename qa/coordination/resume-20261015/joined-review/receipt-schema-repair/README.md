# Receipt schema repair — metadata only

Canonical independent verdict remains HOLD/NEEDS_EXTRA_REVIEW. This repair does not change the verdict or allocate/restart a checker.

Deterministic command: `python qa/coordination/resume-20261015/joined-review/receipt-schema-repair/validate-receipt-schemas.py`.
Own process exit0. `results.json` records all six linked raw receipts' expected/observed SHA256, exact successful-exit JSON path, test-count fields and complete-output count extraction, raw log SHA256, execution vector/cwd/PID/time/tree-closure provenance and relevant runtime/lock/bootstrap/supervisor bindings. Each row persists before the next; malformed/missing data becomes a diagnostic instead of an unattributed assertion abort. Six of six raw receipt hashes, output hashes, actual exits and expected counts match. Raw receipts remain unchanged.

First deterministic top-level-exit assumption failure is zero-based row3 (human row4), `t013-ui`: `$.exit` is absent; actual integer0 is at `$.execution.exit`. Row5 `t056-ui` has the same nested execution shape. Earlier rows0–2 contain top-level `$.exit=0`. Therefore the checker-described hash-plus-top-level-exit assertion fails first at row3 even though the receipt is successful. No product violation is established. The original checker did not persist its exact failing row; this repair reproduces the documented extraction assumption across every row and attributes its first failure.

Raw counts are13,2,19,38,7,21 respectively. The final21 receipt's reuse is explicitly scoped to the unchanged `directAnswer.test.ts`2 cases, with its exact per-file output line retained; the historical page19 is superseded by the current page19 receipt. This script does not independently adopt semantic receipt reuse or infer that the older epoch and current environment are interchangeable.

Smallest independent probe candidate for a separately authorized checker: contract F7 generation retirement, using the actual voice adapter and injected minimal synthesis/utterance controls. Speak an answer, stop the active generation, then deliver the captured old utterance's successful-end callback. Assert completion callback count remains0; separately prove a current un-stopped utterance completes once. This discriminates the stale-callback boundary without rerunning a whole UI suite or using real microphone/browser/provider. The reviewer must independently author/choose and run it under a fresh finite allocation; this metadata agent has neither written nor run that probe.

No source/test/build/provider/browser/database calls or semantic reviewer dispatch occurred. Current checker is DONE; no auto-wake or new allocation follows from this repair. Checker artifacts and canonical HOLD bytes are hash-bound in results.json for provenance.
