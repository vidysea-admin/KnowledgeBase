# Individual extraction review

Open `review.html` locally. It contains all 72 unchanged original claims, complete current/historical citation passages, and seven separate replacement proposals. Read each item, choose a source-support ruling, and enter your rationale. Each button records one declaration. Download retains all 72 items, including pending entries. Export before leaving the page; the page has no network access or persistent browser storage.

Declarations naming Umesh are not authenticated proof of actual human approval. No export creates human gold, replaces citations, edits source data, supplies factual truth/omission/entity labels, approves thresholds, or completes U2.2. Root must record the actual individual Umesh authorization through a separately accepted path before importing gold. Zero human labels are imported even if all 72 declarations are filled.

From the repository root:

```text
node scripts/eval/extraction-review.mjs build
node scripts/eval/extraction-review.mjs validate path/to/individual-review-declarations.json
node scripts/eval/extraction-review.mjs replay path/to/individual-review-declarations.json
```

Build verifies the original packet, batches and current source artifact hashes. It is byte-idempotent and refuses differing existing output. Source changes invalidate the packet: review must be refreshed and independently checked, never forced. Replay binds the exact original corpus bytes and rejects alternate corpus inputs. The declaration validator rejects missing/duplicate/foreign items, wrong bindings, bulk approval fields, invalid dates/identity/labels and inconsistent pending records.

The current replay is incomplete: 35 declared cases, 29 acquired cases, six missing synthetic artifacts, and two newer Zoom directories outside the original manifest. Persisted claims: 72; citation occurrences: 80; missing turn references: 14. Citation existence is measured separately from semantic support. The complete replay is in `replay.json`; unavailable stages have unknown metrics.

## Actual stage acquisition needed

For each real source-bound session, preserve the exact pre-parser extractor response as `rawText`, the parser's actual JSON claim array as `parsed` (original `turnIds`), the actual verifier output as `filtered` (`claims` with `evidenceTurnIds`, plus any `degraded` disposition), and the actual written claim rows as `persisted` (original `evidence`). Add those file paths to that case's artifact inventory in a separately authorized acquisition unit, with source/call/provider/model provenance and exact-byte hashes. Do not synthesize earlier stages from persisted claims: that would conceal filtering loss or hallucinated raw output.

Independent fact targets and covered/omitted labels require full-source human review. Topic/person predictions require independently reviewed entity labels. Binding thresholds require a separate Umesh decision. Pending/unavailable stages, facts, entities and thresholds remain unknown. This review interface supplies original literal-citation support declarations only; it cannot complete those broader gates.
