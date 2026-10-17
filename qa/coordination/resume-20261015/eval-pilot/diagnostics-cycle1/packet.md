# Evaluator content-free diagnostics — cycle1

Candidate: e3274599a31c171b7eaf002b0a02f3df7b50aaafe77e00021e16a308414d41ce
Status: source-frozen; broker checks pending; no checker PASS.

Changed only evaluator source/test pair. Adds fixed stage/error enums, safe HTTP status, allowlisted finish reason, and observed output-cap flag. A length finish reason plus failed provider-output validation is distinguished from possible cap truncation and source hydration/authority refusal. Existing status values, guards, 92-row controls, provider admission and evaluator pipeline remain intact. No raw exceptions/model output/source/credentials enter diagnostic fields.

Evidence: broker-request.json and pins.json. Prior pilot: ../receipt.remaining-probe.json + immutable provider-request-ledger.jsonl (3requests consumed; original usage unknown; no further paid calls). Existing82.214s wall overrun remains. Maker actual/time/cost unknown. Independent admission remains HOLD.

## Repair1: fixture boundary, not production semantics

Original6:5passed/1failed (expected thrown refusal but actual malformed-selector path correctly abstained). Production source unchanged. Truncation diagnostic test now explicitly injects a synthetic consumer validation exception after real provider transport. A separate unmodified-production malformed-selector case preserves legitimate abstention, empty selected sources and no invented labels. Existing hydration authorization-refusal fixture remains the guard check.

Current candidate: d4e5d74be460db92c36c65cb330a4aa9f7d78853b5115de1fa2c9acc14c1eec5; exact pins/request in repair1/. No tests run by maker; original failure retained; paid request ledger untouched.
