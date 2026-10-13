# Verdict: iss-u24smart5-001-devanagari-second-name

VERDICT: PASS
Cycle checked: 1
Commit checked: 61dc3554 (lane/u24deva). No model calls. Supersedes the cycle 0 FAIL.

EXPLANATION:
1. The skip-NFC-on-known-set mutant now fails the new test (1 failure in speakers-grounded.test.ts); the file was restored in finally and its hash equals the HEAD blob.
2. The diff from f9c855bb is test-only: speakers-grounded.test.ts (+12) and the manifest. speakers-grounding.ts is unchanged.
3. tsc clean; full packages/index suite 635 pass, 0 fail (the kill test lives inside an existing test, so the count is unchanged).
4. Cycle 0 findings otherwise stand: all NFD/ZWJ/ZWNJ/romanized attacks refused; 3/16 Devanagari false abstains are recall-only, for the owner under D-132/D-141.

ISSUES-WRITTEN: none (ISS-U24DEVA-001 can be marked verified)
