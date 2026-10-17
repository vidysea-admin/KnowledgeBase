# Resume installer rollout review — cycle1

Root C:/Users/product/Desktop/KnowledgeBase; paths below use qa/coordination/checker-completion-reserve-20261015/. FIRST tool monotonic start. Installed canonical assess: installer-cycle1-review-input.json. Root finite allowance120active seconds/3000allocated tokens, including40seconds for final hashes, verdict persistence/readback; stop investigation by80seconds. Preserve prior FAIL/unknown startup overhead and usage; no savings claim.

## Scope

ONLY repaired install-canonical-helper.ps1 and its relevant five-case test/evidence. Approved helper36b165... and documentation924f571... remain unchanged; do not reread their implementation or re-run prior suites. Existing rollout-verdict.md FAIL remains authoritative until independent replacement; preserve it in a separate cycle0 history file before cycle1 verdict persistence.

Target FileStream opens FileShare.None BEFORE target reading/hash check, retaining the SAME handle through base validation, candidate write, Flush(true), same-handle readback and rollback of an own attempted write. No target rename/copy occurs after releasing the lock. File identity/ACL are preserved. Wrong base or lock acquisition failure refuses before modification. Exclusive durable QA backup is readback-verified. Already-current returns without writes.

Live failure restores only original bytes from our own attempted write while exclusive ownership remains held. Crash/process interruption is explicitly NOT atomic: partial bytes may remain, and automatic subsequent install refuses unknown state. Recovery requires reviewed backup/current bytes. Do not claim atomic replacement.

## Pins and actual focused evidence

- Installer ba16241a88e32e0b64cec0ea3740708cc43574044c9e97ced00a382e135066be.
- Test204001b889e3e24c1e3eadef72aec632a458e1a61e4ff4c5ad5cbc688bec145f.
- Failed→repaired installer-cycle1.diff4f4b774fbe4748b87865b531b13150f49a276e01a6734fd5109f86a362775370.
- Retained FAIL194f69bd5c781add7bacad62c08f6af96930b4da0f5de6ab0edccd12b8294c0b.

verification-installer-lock-five-20261015T1110.json: PowerShell7, exit0,1092.1338ms,5PASS/0FAIL. Linked spec and full stdout/stderr retained; inspect compact receipts/pins and required provenance rather than whole unrelated history. Cases: wrong base untouched, success/readback+backup, idempotence, competing writer lock refusal, injected partial-write rollback. Only dot-sourced -DefinitionsOnly functions were exercised, NOT the main canonical installer. Fixtures retained at installer-fixtures/b1bf1084e44f4b3e90784fd5b2c15c71; no global writes or destructive cleanup.

Independently assess concurrency repair and direct call effects; reuse is policy/provenance-dependent. No new execution/install is authorized here. Any indispensable new probe requires bounded checkpoint/appropriate authorization. Write rollout-verdict.md cycle1 with exact final pins, remaining rollout limits and measured actual phase metrics. Admission keeps prior allocated debits500.6927seconds13000tokens; cumulative limits621/16000 include this120/3000phase. Historical actuals/nulls and failed-tool overhead remain retained; ratio unverified.
