# UI checker truncation diagnosis

Exact source-read call `call_e9ac706c2f0146acac7de271e68fb3dd`,12:06:40.081Z: outer functions.exec had **no pragma/explicit output cap**, so default10000tokens; nested exec_command requested **23000tokens**. It printed all seven named receipts plus full final-bundle/index.json, contracts, raw diff and keyword-window consumers. Webtype/build alone duplicated **6700before/after fingerprint entries**.

Nested stdout reported **260779 original tokens**, truncated; serialized response then reported **24611**, with **14611tokens truncated** by outer10000. Largest retained text40107UTF8bytes; matching result43268serialized bytes. Full original printed byte count unknown. These are actual limits/markers, not guessed reading failure.

Changed show/warning diff and consumer fragments survived in tail, but complete ownership blocks were not authenticated as read: KnowledgeOutputsPage.tsx19–45,46–67,97; TranscriptReview.tsx17–38,78–99; knowledge-outputs client1–21; ReviewHistory.tsx7–35; TranscriptReviewPage.tsx7–23; transcriptReview client16–32,62–70. Exact paths/symbols in JSON. Distinguish incomplete blocks from wholly absent lines.

Future bounded packet: programmatically compare **ALL fingerprints**, print only counts+mismatches; whitelist receipt exit/case counts/base/candidate/argv/runtime/lock/env/import/duration/mapcounts/artifactlinks; print only complete anchored logic blocks and scoped diffs above. Never dump full receipts/pinmaps/index/App/stdout or rely on keyword fragments. Use explicit outer cap sized to intentional output, nested no larger; any truncation means incomplete/HOLD.

Accounting remains224697+294849=519546, maker6052313frozen, breaches retained. No new reviewer, gate, tests, resumption or grant. Qualitycounter taskB cancelled before execution; existing root-supplied counter artifact remains authoritative.
