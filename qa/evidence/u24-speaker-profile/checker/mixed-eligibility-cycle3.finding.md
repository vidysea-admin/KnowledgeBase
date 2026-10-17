# New mixed-eligibility finding — ISS-U24PROFILECHECK-002

Actual result: source-privacy violation reproduced on the frozen cycle-3 candidate.
This finding does not certify a matching unit or whole-task completion.

At 2026-10-15T00:25:55.6077074Z–00:25:56.555175Z the sole ordinary coordinator executed:

```text
node --test --test-timeout=30000 --test-concurrency=1 --import tsx qa/evidence/u24-speaker-profile/checker/mixed-eligibility-cycle3.test.mts
```

Private input flag0, outer timeout30000ms; EXIT1,947ms,2cases/1healthy PASS/1invariance FAIL,
0SKIP,12pins stable. Receipt A9F75B1630DFD811AF551646B71E58916AA75BFE016597182CD3830B5261B3BD;
corpus F2492989A9624D4B2E060C1FEDBCABA03F436C249AD67E4C4A0835E4B4E71EEA.

The two negative variants have identical eligible identity/evidence/claims/turns and identical
withdrawn secondary-source state. Only speaker-row metadata derived from that source changes.
Public recordedConfidence changed0.13→0.93; withheld.profileFields changed2→0. Secret org/role
strings themselves remained absent. The healthy all-visible control established that accepted
org/role values and recorded metadata are available when their sources are eligible.

The oracle is public-output invariance or equal refusal, not a prescribed numeric confidence or
withheld-field counter policy. Store A75C3E99 passes the unsanitized Speakers row into the builder,
whose recordedConfidence copies row.confidence and whose field withholding counts expose
unsupported stored field presence. A coherent snapshot does not make ineligible row metadata eligible.

ISS-U24PROFILECHECK-002 is high/open in the checker-owned shard. Preserve both cases and their
oracle verbatim. The earlier topic-race floor is separate: original six cases plus two legitimate
SDK capability controls passed on this candidate (receipt25C67DC5...), with both withdrawal latches
actually true and safe own-source claim retained. Its original failure, corpus and adapter lineage
remain unchanged. Both ledger issues stay open until qualifying independent unit evidence.

All inputs are authored synthetic, using a genuine disconnected SDK Db/ClientSession over
synthetic collection reads. No connected Mongo/server snapshot, private input, provider, browser,
deployment or publication is claimed. Current matching cycle and fresh affected/coherent proof
remain required; full U2.4 live/persona gates remain HOLD.
