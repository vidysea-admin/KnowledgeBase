# Parallel extraction adjudication packet — independent verdict

Status: PASS
VERDICT: PASS
Cycle checked: 0
Scope: preparation artifact only; full U2.2 remains gated.
ISSUES-WRITTEN: none

EXPLANATION: Independently read extraction-corpus.json, every available current turn/claim artifact, all requested historical Git blobs at 907c9c9434f474622181bbc179f6ac90d75853b9, and extraction-reconciliation-reviewed.json. No maker readback code was reused. The complete original claim objects, citation occurrences, literal current/historical matching records and text hashes, canonical source/claim bindings, reviewed proposals, unknown semantic fields, and raw-byte versus CRLF-to-LF-only pins agree. Seven reviewed mappings remain replacement proposals; none becomes approved gold. Acquisition failures and unavailable historical records remain explicit. No source, database, provider, browser, index, Ask, ledger, task or decision write was performed.

Packet SHA-256: `1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175`

Independent evidence source: `qa/evidence/parallel-extraction-adjudication-check.mjs`.

Actual command (after manifest ready-for-check, Fix cycle 0):

```powershell
& 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' qa/evidence/parallel-extraction-adjudication-check.mjs --refs | git cat-file --batch | & 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' qa/evidence/parallel-extraction-adjudication-check.mjs
```

Actual exit code: 0. Actual output:

```json
{
  "verdict": "PASS_PREPARATION_ONLY",
  "cycleChecked": 0,
  "packetSha256": "1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175",
  "coverage": {
    "declaredCases": 35,
    "inventoryDirectories": 32,
    "loadedCases": 29,
    "failedCases": 6,
    "sourceTurns": 3427,
    "claims": 72,
    "citationOccurrences": 80,
    "unresolvedCitationOccurrences": 14,
    "independentlyReviewedReplacementProposals": 7,
    "unreviewedReplacementClaims": 65,
    "humanAdjudicatedClaims": 0,
    "invalidTimeSessions": 3,
    "baselineArtifactPins": 16,
    "baselineByteMatches": 0,
    "baselineNormalizedLfMatches": 16
  },
  "verifiedArtifacts": 106,
  "historicalAvailable": 46,
  "historicalMissing": 12,
  "verifiedLiteralPassages": 162,
  "elapsedMs": 217,
  "fullU22": "GATED_SEMANTIC_GOLD_AND_THRESHOLDS_UNAPPROVED"
}
```

Execution is sequential and bounded to this artifact corpus; final invocation took 1.26 seconds wall time. Historical bytes flowed directly from Git to Node through the native shell pipe. Initial checker setup exposed nested Node child-process spawning being refused with EPERM; that transport was replaced with a native Git pipe. A subsequent checker assertion used the proposal record status for the packet's intentionally different wrapper status; the checker assertion was corrected to verify both explicit proposal statuses. Neither setup failure changed the packet.

Limits: This PASS certifies completeness and faithful source presentation for human adjudication. It does not certify semantic support, factual truth, omissions, topic/person precision, binding thresholds, historical provenance reconciliation, original citation acceptance, production/backfill readiness, or full U2.2 acceptance. All 72 human adjudications remain unreviewed/unknown; semantic gold is unaccepted and thresholds null.
