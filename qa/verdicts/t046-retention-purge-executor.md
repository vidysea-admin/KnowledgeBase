# Verdict: t046-retention-purge-executor

VERDICT: PASS
Cycle checked: 0
Commit checked: 31457268 (lane/t046purge)

EXPLANATION:
1. Deletion scope. Only one file per session is unlinked: the source.json media path, proven inside the real media root by probeMedia, and only if its extension is in the media allow-list (case-insensitive). Tested with temp dirs: a Windows junction out of the root, a junction swapped in after planning (VETOED media-path-outside-root), `..` and absolute paths, notes.md/turns.json/.vtt/.txt targets, `.webm.txt`, `.mp4.json`, no extension and an `:ads` suffix. All were refused and no outside file or transcript was touched. Uppercase `.MP4` is treated as media and deleted, as intended. File symlinks could not be created without privilege (EPERM) and were not exercised; unlink on a link removes only the link. The data root is never an unlink target.
2. Age source. createdAt is the upload time, which is the same as or later than capture, so media is never purged earlier than 90 days after capture. Future or malformed dates are kept. The clock-skew guard also vetoes. Owner note only.
3. Vetoes. Each item is fully re-evaluated from disk (planner, assess guards, age, type) just before unlink. No legal-hold concept exists in the planner or guards. Noted.
4. Logs carry path, age and size only. Exit 4 on failure, 0 otherwise. Dry run hashed identical before and after (files, sizes, mtimes), with no unlink calls.
5. purgedAt is not written back: a re-run reports media-not-found, which is harmless. Evidence clips are never extracted, so they do not affect deletion safety. The residual race between the final re-check and unlink is accepted.
6. Mutations (9, per-mutation byte backup, restored, hash equals HEAD blob each time): drop media rule, ignore re-check veto, ignore dry-run, off-by-one, ignore guard verdicts, wrong unlink path and remove outside-root probe check were all killed. Two survived: removing the future-date check and making the extension check case-sensitive. The first is equivalent because the clock-skew guard still vetoes. The second survives because no test uses uppercase, which is not unsafe (it would only keep files). Harness deleted.
7. tsc is clean. Retention suites: 96/96 pass.

ISSUES-WRITTEN: ISS-T046PURGE-001 (low, missing junction test), ISS-T046PURGE-002 (low, owner notes). Both in qa/issues.t046purge.jsonl.
