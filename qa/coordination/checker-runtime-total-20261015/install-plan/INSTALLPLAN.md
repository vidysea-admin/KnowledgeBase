# Prospective installation plan — no global writes authorized

Prepared local artifacts only. Helper/test review files remain unchanged; cycle4 adds only checkpoint-and-FINAL instructions to the staged skill and this derived full-skill candidate. No command below has been executed against global targets. Independent staged-helper verdict is still outstanding; root must explicitly authorize any installation after resolving review/accounting gates.

## Raw identities

- Current canonical helper target: C:/Users/product/.agents/skills/checker/scripts/review_budget.py; expected baseline SHA256 36b1650cf7d65d0cb4416f558486df279a519c75d2dae44d3f64875d3dbef66e.
- Helper candidate: C:/Users/product/Desktop/KnowledgeBase/qa/coordination/checker-runtime-total-20261015/review_budget.py; SHA256 2b4fe0b118269ef5cd63aa520df86f65d7d9453be2fbc1898ca73ceab3599ef2.
- Current canonical skill target: C:/Users/product/.agents/skills/checker/SKILL.md; observed raw baseline SHA256 ede0ad4d5854a74a0f0ed55d2c450b927510d1fcbbe1bba3dc7874c0b04a2e37.
- Preserved raw baseline: this directory/SKILL.baseline.md, identical SHA256 ede0ad4d5854a74a0f0ed55d2c450b927510d1fcbbe1bba3dc7874c0b04a2e37.
- Full skill candidate: this directory/SKILL.candidate.md; SHA256 3f49980a13c5e7e5da76c7b7e376ef983bbd946c30209c648bd3bb3c2f80a7df.

The skill candidate starts with every byte of the observed canonical skill. Only two LF bytes and the frozen amendment body are appended. Its heading becomes `## Runtime total-token accounting`; staging-only final sentence and YAML frontmatter are omitted. Operational paragraphs are unchanged. Existing Windows byte-proof and all other rules remain byte-for-byte present. Construction refuses an existing amendment heading. A later canonical baseline change requires restaging against new raw bytes and renewed candidate review, never overwriting another actor's changes.

## Reuse unchanged independently reviewed installer primitive

Reuse C:/Users/product/Desktop/KnowledgeBase/qa/coordination/checker-completion-reserve-20261015/install-canonical-helper.ps1 SHA256 ba16241a88e32e0b64cec0ea3740708cc43574044c9e97ced00a382e135066be, dot-sourced ONLY with `-DefinitionsOnly`. Do not run its old canonical entrypoint. Call its unchanged generic Invoke-LockedHelperInstall function once per authorized target with exact pinned candidate byte array/base/candidate hash and unique workspace backup path.

Independent safety receipt: same directory/rollout-verdict.md, authoritative PASS cycle1 Reviewed SHA ba16241a88e32e0b64cec0ea3740708cc43574044c9e97ced00a382e135066be. Reused isolated fixture evidence: verification-installer-lock-five-20261015T1110.json, five cases covering wrong base untouched, success/readback/backup, idempotence, competing writer lock refusal and injected partial-write rollback. No installer logic changed in this plan; no new fixture execution claimed. New call parameters/full-skill append candidate require separate review before installation.

The primitive obtains FileShare.None exclusive FileStream before reading/hash checking, validates candidate bytes and locked current base, creates an exclusive CreateNew backup, flushes and reads it back, then writes/Flush(true)/reads back through the same target handle. On an own attempted live failure it restores the original raw bytes and verifies their base hash while still holding exclusive ownership. Already-candidate targets return ALREADY_CURRENT without any backup/write. Existing backups refuse overwrite.

## Prospective target operations and receipts

1. Revalidate unchanged installer hash, independent helper PASS/cycle/content identity, skill append/prefix identity, and root's explicit global-write authorization. Refuse otherwise.
2. Helper operation: expected base36b165... to candidate2b4fe0..., target above; backup this directory/canonical-helper.before-install.py (CreateNew). Persist operation result and independent target readback hash as a new receipt.
3. Skill operation: expected baseede0ad... to candidate3f4998..., target above; backup this directory/canonical-SKILL.before-install.md (CreateNew). Persist result and independent target readback hash plus exactly-one amendment-heading count and full original-prefix byte equality.
4. Rerun only authorized installed smoke cases through sole broker; keep exact executable/helper/skill hashes and own exit/output. Never claim staged tests were installed-path tests.

These are two separately locked file updates, not a two-file transaction. If the second operation fails, preserve evidence of any successfully installed first file and HOLD; do not automatically roll back another actor's later update. If root authorizes a compensating rollback, invoke the SAME unchanged primitive with installed hash as base and preserved original bytes/hash as candidate, using a fresh post-change backup path. Unknown current hashes refuse. Process/OS interruption is not crash-atomic; durable backups enable separately reviewed recovery, never blind restoration over an unknown file.

Idempotent repeated invocation is safe only against the exact expected full candidate hash. No text matching may silently discard an existing unrecognized amendment. No canonical settings/hooks, repository contracts, governance decisions or other files are installation targets.
