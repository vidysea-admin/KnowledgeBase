# Verdict: cicase-t044w-case-sensitive-fs

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
- Diff: test-only. On Windows (NTFS, case-insensitive) the probe is true and process.platform is win32, so the distinct set is empty and every original assert.throws(/over the input/) plus input-unchanged expectation is still enforced. 8.3, symlink, hard link and junction cases are untouched.
- Non-win32 expectations match Linux: "name." and "name " are distinct files, and canonicalPath only strips trailing dot/space and lowercases on win32. isSameFile then finds different canonical paths, and statSync on the missing path throws, which gives false. The write creates a separate file and the test asserts the input is byte-identical. The probe (write caseprobe.txt, check existsSync of the upper-cased name) is sound. It sits inside the try, and its file is removed with the temp dir in finally. macOS case-insensitive is also covered, since the probe is true there and the dev+ino check refuses the write.
- Production isSameFile and ISS-T044W-001 (status verified) are unchanged; behaviour is correct on both filesystem types.
- Runs on this machine (Windows only): file 15/15 pass, full packages/ai 217/217 pass. WSL is not installed and docker is absent, so the Linux branch was NOT executed locally. It is reasoned only; CI re-run is the confirmation.
- Mutations, each with a per-mutation backup and a HEAD hash check afterwards:
  M1 isSameFile always false: 3 tests fail, including the alias-variants test.
  M2 probe inverted: the alias-variants test fails.
  Both files restored to their HEAD blobs; git status was clean.

ISSUES-WRITTEN: none
