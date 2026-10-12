# Verdict: t041-keyframe-extraction-and-hashing

VERDICT: PASS
Cycle checked: 0
Commit checked: 16e40ab (lane/keyframes)
ISSUES-WRITTEN: none

## EXPLANATION

- Re-run: keyframes.test.ts 10/10 with real ffmpeg (LKB_FFMPEG_PATH to the main tree's .cache/tools binary); dedupe + alignment suites 32/32; `tsc --noEmit` in packages/core exit 0. Module is unwired (not exported from the barrel).
- Branch reset: the maker's `worktree add -B` reset `lane/keyframes`. Reflog old tip e315349 (checker PASS of t041-keyframe-dedup) is an ancestor of HEAD, `git rev-list HEAD..e315349` is empty. Nothing unmerged lost.
- spawn: `shell:false`, argv array, stdin ignored. My real run with a recording under a directory named `sp ace's & x$(echo hi);y` and file `my video 'q' %d.mkv`, plus an output dir with a quote and spaces: 4 frames hashed, 2 valid PNGs written, no injection. Input is `resolve()`d so a leading `-` cannot become an option.
- Raw-frame math: 9x8 = 72 bytes; `length % 72` rejected as bad-output; `dHashRawStream` throws on partial; tested with 71/73 bytes. Truncation cap and SIGKILL timeout map to typed errors.
- Bad media: zero-length file and a text file both give typed `ffmpeg-failed`; missing binary gives `ffmpeg-missing`. No product temp dirs exist (tests clean theirs; no os-tmp leftovers).
- Low notes (not filed): (1) a 0.5 s clip yields 0 frames and succeeds with empty output (fps=1/2 emits nothing), indistinguishable from "no slides"; (2) an outDir containing `%d` makes ffmpeg's image2 pattern fail (fail-closed ffmpeg-failed); (3) a mid-run frame-pass failure leaves earlier PNGs in outDir; (4) PNG existence is not re-checked after exit 0.
- Mutations (5, hash-verified applied, per-mutation byte backup in `finally`): hash bit order KILLED; nonzero exit ignored KILLED; env-directory handling removed KILLED; interval upper bound `> 3600` removed SURVIVED (untested bound); dedupe-failed throw disabled SURVIVED (untested path). Both survivors are low (validation branches). All three files equal HEAD blobs; both trees clean.
