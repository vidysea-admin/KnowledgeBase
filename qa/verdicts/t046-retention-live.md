# Verdict: t046-retention-live

VERDICT: FAIL
Cycle checked: 0
Commit checked: 5283ded3 (lane/t046-retention-live)

EXPLANATION:
1. Clip validation is too weak for a delete path (ISS-T046LIVE-001, high). Real ffmpeg 9.0.2 on a 10 s test mp4: normal windows extract correctly (3.2 s clips). But a window at 50-60 s, beyond the media end, returns ok:true "extracted" with a 1.22 s clip that is not the cited moment. Validation is only "exit 0 and size > 0"; there is no ffprobe or duration check, so the raw media would be unlinked with no valid evidence.
2. A pre-existing non-empty clip is trusted (ISS-T046LIVE-002, high). An 18-byte junk file at the clip name returned ok:true status "exists" (ffprobe: moov atom not found). ffmpeg writes straight to the final name, so a killed or crashed ffmpeg leaves a truncated file that the next run accepts, then deletes the raw. Mutation M12 survives all tests.
3. What holds. Ordering is right: M2 (unlink before clips) killed. ffmpeg failure, nonzero exit, empty output, a bad window and a partial clip set all veto and keep the raw (M1, M3, M4, M11 killed). A crash between clip and unlink leaves media plus valid clips. Dry run extracts and deletes nothing; --execute is the only delete path in both CLIs and the scheduler needs -Execute and -ConfirmDeletion (M5, M6 killed). The API has no purge route. processedAt: stamped only when transcribe and index are both "done", never moved, and changes no other field (M7, M8, M9 killed). last-run.json is version 1 (M13 killed). Clip file names are sanitized, so a traversal id cannot escape; media-root escape and junction handling are inherited from the PASSed executor and were not re-opened. Gaps in ISS-T046LIVE-004: M10 (non-atomic write) survives, processedAt trusts session.json status only (no index-proof check), no lock on the read-modify-write, and an evidence-clips junction is followed.
4. ISS-T046LIVE-003 (medium): the scheduler's default -ReportFile and the CLI's last-run default are the same path, so the full report is overwritten by the summary.
5. Evidence. packages/ingest suite: tests 364 / pass 364 / fail 0. tsc exit 0. lint-loc: only the inherited LOC (408) and stale SNAPSHOT failures. 13 mutations, per-mutation byte backup, restore in finally, each hash equal to the HEAD blob; the harness was deleted. Real ffmpeg was run once on a temp 10 s file outside the repo.

ISSUES-WRITTEN: ISS-T046LIVE-001, -002 (high), -003 (medium), -004 (low), in qa/issues.t046-retention-live.jsonl.
