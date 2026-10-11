# Verdict - t041-slide-turn-alignment
VERDICT: PASS
Cycle checked: 0
Commit checked: 3b0b983 (lane/t041align, base 33baf6f)
Scope: pure alignment helper, unwired; no OCR; T-041 stays open.

EXPLANATION:
- Own sampling oracle (different method: on-screen slide sampled at elementary sub-intervals; unsorted/shuffled input, identical capture times, zero-length turns, blank and NFC/case variants): 500 seeded cases, 0 mismatches. 100 permutation cases byte-identical.
- Blank-slide ruling: a blank observation ENDS the previous slide ("screen went blank"), documented in source header and manifest A5; sensible, and tested (turn in the gap gets nothing). A, blank, A gives two intervals.
- Last-slide ruling: the last slide is open-ended (to = null) unless optional sessionEndSec; it is NOT derived from the last turn's end. A slide after the final turn attaches to nothing but is listed. Stated in manifest A6 and source.
- Boundaries: turn ending when slide starts has no overlap; turn starting at slide end gets only the next slide; zero-duration overlap never reported (zero-length turn is the sole, documented exception, overlap 0). Floats (0.1+0.2) fine; sums <= turn duration + 1e-9, no negatives.
- Merge: A,A,B,A gives 3 intervals; trailing whitespace merges; case differs, no merge.
- Totality: hostile input (non-arrays, null/undefined/sparse entries, NaN/Infinity/negative, end<start, non-string ids, duplicates, 1 MB text, __proto__/constructor ids) gives typed errors, deep-frozen inputs untouched, no prototype pollution.
- Cost: maker's 100k x 5k test counts the real inner loop (ops++ in while and for), bound 3*(n+m+k). Adversarial every-turn-spans-all (2000x2000) emits 4,000,000 attachments in ~2 s: inherently output-sized, which the manifest does not state (note only).
- Privacy: output holds ids and ranges only; manifest states slide text is untrusted, may hold passcodes/personal data, and storage/retention/redaction needs an owner decision.
- Scope: commit touches the source, two tests, manifest only; nothing imports it. Line counts 131 non-blank / 125 / 108; dirsize OK (115); post-merge domain count 10 (main 7 + 3) vs limit 30; git merge-tree clean. tsc exit 0; 19/19 tests pass.
- Mutations (own harness, per-mutation backup, finally-restore, hash == HEAD each time): 7 of 8 KILLED (boundary >= / > both sites, merge-across-blank, primary=last, blank-as-slide, last interval closed, case-insensitive sameness). Survivor: ids compared case-insensitively in the (time,id) tie-break; no test uses equal-time ids differing only by case. Low, not filed.
- Notes (low): a throwing getter or Proxy as an input item propagates an exception (not "never throws"); test gap above. Worktree clean after removing the untracked harness; source hash equals HEAD.

ISSUES-WRITTEN: none
