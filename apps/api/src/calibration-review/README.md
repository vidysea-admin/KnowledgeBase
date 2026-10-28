# T-022 human review workflow

Mount `createCalibrationReviewRouter({store})` after existing API-key authentication. Its routes require `compete` scope; tenant and the opaque key fingerprint come from the server. `Umesh` remains an asserted reviewer name, not a person identity authenticated by the key.

Create `store` with `createFileCalibrationReviewStore({root, projectRoot, packetPath})`. All paths must be absolute and configured explicitly. `root` is a private writable persistent directory; `projectRoot` is a read-only mount of the approved corpus plus the 44 source-bound inputs; `packetPath` is the immutable neutral `data/eval/calibration-human-review.json`. Do not bake private transcripts into an image or reset existing review snapshots on startup. Missing or drifted inputs fail closed.

The page is `CalibrationReviewPage` at `/calibration-review`. Each form stores one score and rationale with its server timestamp, current input hash, expected revision and audit. Failed saves never count. A foreign tenant cannot read, review or export this packet. A leftover cross-process lock refuses writes; operator recovery must first establish that its owner is no longer active. No stale-lock takeover policy is invented here.

The export endpoint requires all thirty individually submitted, current assertions and reads the authoritative store. Exports remain `humanGoldVerified:false`. The actual thirty Umesh judgments and their direct item-level evidence must still be independently reconciled; synthetic test fixtures and typed names are never actual human evidence.

The review page can stage a local `calibration-offline-draft-v1` download against the current authenticated tenant, packet bytes and all thirty input identities. Staging performs no write. Select an item and choose “Use this item's offline assertion”, re-read its current inputs, and give a fresh individual confirmation before saving. The existing server submission uses the current stored revision; local revisions, browser timestamps and asserted identity never become server audit. Reloading or changing login clears staged assertions. Offline drafts remain private and cannot be used directly as live calibration authority.

After real human review, download a new export and prepare a separate confirmation receipt file with `format:calibration-human-confirmations-v1`, the export tenant and neutral `packetSha256`, and exactly thirty items. Each item records `id`, `confirmedBy:Umesh`, current `inputSha256`, exact score/rationale, final revision, server-bound authenticated actor, canonical UTC `confirmedAt`, and an actual nonempty `evidenceReference` locating Umesh's confirmation. The runner validates bindings; software cannot establish that a receipt really came from Umesh. The checker independently establishes that attribution before final acceptance.

After independently establishing all thirty genuine owner judgments, the checker/operator supplies a separately named `calibration-checked-human-confirmations-v1` receipt binding the export, confirmation and neutral packet hashes, tenant, actual review count, checker identity, actual evidence reference and check timestamp. The trusted operator configures its exact JSON-value SHA-256 as `T022_VERIFIED_CONFIRMATIONS_SHA256`; a request/body/typed name cannot configure this gate. The runner never generates the verified receipt or its authorization. No receipt is configured while real reviews are pending.

Run a bounded model only after genuine reviews, confirmations and that independent receipt exist:

```text
node scripts/eval/human-calibration.mjs --review-export <new-export.json> --human-confirmations <actual-confirmations.json> --verified-receipt <independently-checked-receipt.json> --out <new-report.json> --llm --provider ollama --model <approved-model> --max-calls 30
```

Follow the authorized D-164 order: Ollama Cloud GLM/DeepSeek first, then Gemini where the accepted scope requires it. The existing provider configuration and production judge seam are used; no production tuning or database writes occur. Existing reports are never overwritten. Partial/capped/fallback results are retained as incomplete and cannot close calibration. Final acceptance needs all thirty actual labels, successful current judge receipts, independently reproduced MAE, integrated UI evidence and checker verdict. No MAE acceptance threshold is invented.

For DeepSeek, provide `--predecessors <reports.json>` containing the complete same-current-human-reference GLM report. For Gemini, provide both that GLM report and its successor DeepSeek report; the DeepSeek report must bind the exact supplied GLM bytes. Proxy, embedding, partial, fallback, source-drift, changed-reference or arithmetically inconsistent predecessors refuse before provider credentials/calls. The reports file is a separately retained JSON array; it does not replace actual independent provider evidence.
