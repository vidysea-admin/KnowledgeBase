# Verdict - w27-spoolacl (ISS-T045WORKER-001)

**VERDICT: PASS** (for the unit as delivered: code correct, in scope; ledger row NOT flippable, see follow-up)
**Cycle checked:** 0
**Reviewed SHA:** 5d70542912556b58d1d5b9c8f396f5865c9877fc (base 4264418c)
**Reviewer:** Sonnet 5.5 checker. This is a Sonnet review because Opus is at its limit; a security unit would normally get Opus.
**Final hashes:** apps/api/src/source-intake/jobs/store.ts git blob 84a1187bfd57395e7c90b86a13f0ec04ad4dbfb5 (autocrlf=true hash equals HEAD:blob after mutation restore).

## Clauses
goal-t045 C5 (secrets do not leak), C7 (re-run cited corpus verbatim, per-ID counts).

## Findings by check
1. **Terminal paths.** All covered through `settle()` (store.ts:59): finish (:127), uncertain (:132), stale lease in update (:66), poll (:99), claim (:106). `SourceJobState` is `queued|running|succeeded|uncertain` (types.ts:3); there is NO failed state. Worker failure paths (worker.ts: authorization-unavailable, indexing-incomplete, execution-unconfirmed, abort) all call `store.uncertain`, so every failure redacts. No finding.
2. **Replay.** A marker is accepted only on succeeded/uncertain, with a prior row whose `redactedSourceUrl(prior.url)` matches, same inputHash and same watchedSnapshot (store.ts:30-32). A settled row cannot be followed by another (prior-state rule), so a redacted row cannot be re-claimed or re-fetched; worker uses the URL only from the claimed running job. Forged marker => `source_spool_corrupt` (test 3). Gap (note): the test covers only a wrong digest, not a wrong inputHash/snapshot or missing prior; those branches are untested by the unit but read correct.
3. **Residual (queued/running rows keep the URL in append-only audit.jsonl).** Judgement: this is the substantive weakness. The settled-row redaction gives NO at-rest benefit, because the earlier queued row holds the URL permanently (it only avoids new copies and stops replay re-use). Not blocking THIS unit (disclosed by maker, ACL gate on base limits exposure, change has no regression), but it IS blocking the ledger flip of a high/security (never capped) issue. Cleanest fix, follow-up unit: write only `url = redacted:sha256:<hash>` in the journal for queued/running rows (inputHash already pins the input), keep the URL in a separate per-job secret file in the verified-private tenant dir (`verifyPrivateArtifact` before write and read), written before the journal append, read by `claim`, hash-checked against the marker, and unlinked on settle. Missing/corrupt secret on a running job => `uncertain`. Sweep orphan secret files on enqueue/claim. Needs the replay change that queued rows no longer recompute `approvedSourceInput` from the stored URL. Alternative: a compaction primitive in HostingJournal (hash-chain rewrite), riskier.
4. **D-015 reproductions (ISS-T045WORKER-001, 4 recorded).** Replayed via privacy.test.ts: WINACL-ROOT-ALLOW-OTHER, WINACL-TENANT-ALLOW-OTHER, WINACL-FILE-ALLOW-OTHER, WINACL-OWNER-OTHER: 4/4 refuse with `source_spool_unavailable` (native-reader model; the gate was already on base, claim plausible and consistent with the code). Intentionally unreplayed: actual Windows native ACL receipt (test skipped without LKB_T045_NATIVE_ACL_PATH); the two controls beyond the model. C7 asks for actual process/filesystem boundaries, so the real receipt remains outstanding.
5. **Commands** (evidence in qa/evidence-w27chk/, untracked, not committed):
   - 4 test files under `timeout 600`: exit 0; tests 31, pass 29, fail 0, skipped 2 (native ACL receipt, POSIX-only).
   - tsc --noEmit apps/api under `timeout 600`: exit 0.
   - lint-loc not re-run (not requested; maker reports tracker stage timed out under load and reran alone green; reused, not independently verified).
6. **Own mutation.** Removed the digest comparison `|| job.url !== redactedSourceUrl(prior.url)` in replay. Per-mutation byte backup, trap EXIT/INT/TERM/ERR, `timeout 600`: url-redaction.test.ts exit 1, pass 2 fail 1 (test 3 "forged or unmatched redaction markers..." killed). Restored, cmp ok, `git -c core.autocrlf=true hash-object` = 84a1187b..., equals HEAD blob.

## Ledger
ISS-T045WORKER-001: DO NOT flip to verified. Keep open until (a) the retention follow-up above and (b) a real Windows native ACL receipt exist. The ACL repro corpus itself passes 4/4 in the model.

ISSUES-WRITTEN: none (the residual is already the named open issue; follow-up recorded here, not as a new row).
