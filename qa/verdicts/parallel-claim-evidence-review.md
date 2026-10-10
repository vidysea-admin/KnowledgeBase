# Parallel claim evidence review — independent verdict

VERDICT: PASS
Status: PASS
Cycle checked: 0
Scope: preliminary AI evidence packet completeness and integrity only.
ISSUES-WRITTEN: none

EXPLANATION: Independently checked the frozen source packet, index, all 65 task files, all 65 raw primary results, all 13 raw audits containing 65 comparisons, and the frozen aggregate. No maker aggregate code was read or reused. Exactly 65 unique unreviewed packet claim rows are exhaustively represented; the existing seven reviewed replacement proposals remain excluded. Packet/task/result/audit hashes, complete unchanged source row/session bindings, full text and canonical record hashes, primary citation quotes, speaker references, timings, revisions, missing references, label counts, aggregate copies, independent comparisons and all recorded disagreements agree. The operating instruction says maximum READY independent work up to 80 subagents; no claim that 80 ran simultaneously is made.

Four semantic disagreements remain at indices 02, 20, 34 and 39. The resolved preparation-state history at 63 is retained separately. Index 20 retains the initial blinded label and its corrected post-comparison opinion, without rewriting either. All primary/audit/aggregate humanAdjudication fields are null; semanticGold false and bindingThresholds null. No human semantic gold, factual truth, source repair, thresholds, production/backfill, or full U2.2 acceptance is granted.

Audit schema notes: 19 available audit-record entries omit optional speakerRef/tStart/tEnd display fields; 10 omit an optional revision display field. These omissions remain visible in raw audit entries and are counted in this checker evidence. Their verified canonical context hashes bind the complete supplied record, including speaker and timing. All primary citation display fields are present and independently match those complete records. This PASS does not claim complete audit display fields. Historical artifact bytes are accurately recorded as provided-context-only in this aggregate; 23 unique current artifact byte hashes were independently read and verified. All 65 primary reviewers accurately report provided-context-only inspection.

Aggregate SHA-256: `8ba3fa62e201fd8ffe44d6c5ca059ac8e4fc6d10879c5fda175749fd408136df`
Packet SHA-256: `1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175`

Actual bounded independent command after ready-for-check Fix cycle 0:

```powershell
& 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' qa/evidence/parallel-claim-evidence-review-check.mjs
```

Actual exit code: 0. Wall time: 1.16 seconds. One sequential worker, finite 65-row/13-audit pass; no browser, database, provider, full suite or source mutation. All 171 read inputs retained their exact SHA-256 throughout the final check. Only checker-owned contract, script and verdict files were written. Initial checker assertions were corrected for its artifact hash alias, legitimate audit agreement object variants, and per-citation source verification multiplicity; no candidate files changed.

Actual output:

```json
{
  "verdict": "PASS_PRELIMINARY_PACKET_INTEGRITY_ONLY",
  "cycleChecked": 0,
  "aggregateSha256": "8ba3fa62e201fd8ffe44d6c5ca059ac8e4fc6d10879c5fda175749fd408136df",
  "packetSha256": "1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175",
  "summary": {
    "reviewCount": 65,
    "auditCount": 13,
    "auditEntryCount": 65,
    "coverageComplete": true,
    "completedComparisons": 65,
    "integrityErrorCount": 0,
    "integrityValid": true,
    "primaryLabels": {
      "original": { "unsupported": 38, "contradicted": 1, "entailed": 26 },
      "current": { "unsupported": 51, "unresolvable": 13, "entailed": 1 }
    },
    "independentLabels": {
      "original": { "unsupported": 36, "contradicted": 1, "entailed": 27, "unresolvable": 1 },
      "current": { "unsupported": 51, "unresolvable": 13, "entailed": 1 }
    },
    "disagreementRows": 5,
    "reviewerArtifactVerificationModes": { "not-performed-provided-context-only": 65 },
    "semanticLabelDisagreementRows": 4,
    "retainedComparisonHistoryRows": 1,
    "suppliedSourceContextCounts": {
      "originalMigration:available": 73,
      "current:available": 60,
      "current:unavailable": 13
    },
    "uniqueArtifactVerificationModes": {
      "provided-historical-context-only": 23,
      "exact-current-artifact-bytes-verified": 23
    }
  },
  "primaryCitationsVerified": 158,
  "auditRecordsVerified": 133,
  "auditQuotesVerified": 27,
  "missingCurrentReferences": 13,
  "auditMissingOptionalFields": { "speakerRef": 19, "tStart": 19, "tEnd": 19, "revision": 10 },
  "semanticDisagreementIndices": [2, 20, 34, 39],
  "resolvedHistoryIndices": [63],
  "frozenInputs": 171,
  "elapsedMs": 297,
  "fullU22": "GATED_HUMAN_SEMANTIC_GOLD_FACT_TRUTH_AND_THRESHOLDS_UNAPPROVED"
}
```
