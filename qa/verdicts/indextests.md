# Verdict - indextests

**Date:** 2026-10-14
**Manifest:** qa/manifests/indextests.md (Status: ready-for-check, Fix cycle: 0)
**Cycle checked: 0**
**Checker:** independent, lane indextests, commits d22f79d3 + 45076785
**VERDICT: PASS** (2 medium issues filed: ISS-INDEXTESTS-001, -002; 1 policy question for Umesh)

## Re-run (my own execution)
- Free space 10.7 GB.
- Full packages/index `node --test --import tsx "src/**/*.test.ts"`: tests 676 / pass 676 / fail 0.
- tree-real-data + judge tests: tests 20 / pass 20 / fail 0.
- Read-only run, KB_REAL_DATA_DIR=C:\Users\product\Desktop\KnowledgeBase\data\toc-migrated: pass 10 / fail 0; logged "in-progress ingests skipped (2): 2026-10-13-zoom-webinar-p1 (validation failed), 2026-10-13-zoom-webinar-p2 (validated, awaiting finalize)". Real capture-only reproductions still classified captureOnly.
- tsc --noEmit -p tsconfig.json: exit 0. lint-loc --all: OK (10 stages, 0 failed).

## Review points
1. judge.test.ts: diff is exactly one line, `vision: ["ollama","gemini"]`, matching config/ai-routing.yaml:33. The file imports node:assert/strict, so `assert.deepEqual` IS strict deep equality; the map is still compared in full. Exact.
2. KB_REAL_DATA_DIR: only read via readdirSync/readFileSync; every write goes to mkdtempSync(tmpdir) and is rmSync'd. Safe. Only caveat: an override root lacking 2026-09-24-zoho-next-european-study-destinations fails (ENOENT) rather than writes.
3. Capture-exemption loosening: a legitimate consequence of the directed rule (capture-shaped dir + extra file/subdir has neither session file, so it is in-progress), and still never captureOnly/completed. BUT it (a) removed the old `status:"failed"` case, (b) accepts either outcome (missing+inProgress==1), which hides a real gap (ISS-INDEXTESTS-001), and (c) conflicts with contract index-corpus-stage-discovery C3 ("unknown partial processed folders must be reported as failures"; "extra turns/claims cannot turn a partial folder into capture-only") (ISS-INDEXTESTS-002). The T-034/T-035 capture contracts (meeting-bot-capture/live-capture) do not govern this test; C3 does.
4. Exposure: a finalized session whose BOTH files were deleted, but validation.json remains, is now skipped with a log line instead of failing. Mitigations present: >=23 completed floor, and the console log. No other signal (age, Mongo, index membership) is consulted; cheapest add is an mtime age cap. Not required for PASS; Umesh decides.

## Mutation (scripts/lib/mutate.mjs apply/restore per mutation, 180 s timeout, finally-restore, git hash-object == HEAD blob after each; final fidelity true; harness deleted)
Killed: drop session_page.json check; drop session.json check; label always "validated"; disable skipping; in-progress checked before captureOnly (fail 3).
Survived: parse-failure => in-progress (REAL gap, ISS-INDEXTESTS-001); non-object guard removed (partly equivalent: null is caught by TypeError, but "5"/string would be skipped, untested); dropping the validation.json-exists check (equivalent, ENOENT is caught).
