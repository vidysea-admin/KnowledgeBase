# Verdict: t036next
VERDICT: PASS
Cycle checked: 0
Checker: independent (Sonnet 5.5). Note: no qa/contracts/t036* file exists; the manifest cites gmail-meeting-candidates-approval.md and claims no new criteria. Checked against the manifest and the brief.

EXPLANATION:
- Probes (apps/api, node --import tsx): youtube.com.evil, evilyoutube.com, music.youtube.com, youtube.com@evil.com, evil.com@youtube.com, youtube.com%2eevil.com, youtube.com. (trailing dot) and a double slash path are all refused. m.youtube.com/live/<id> is accepted (by design). Percent-encoded or fullwidth hosts that the URL parser normalises to a real youtube host (youtu%2Ebe, %79outube.com) are accepted. This is harmless because the output URL is rebuilt from the 11-character id as https://www.youtube.com/watch?v=<id>.
- Redirect: /redirect?q=..., /attribution_link?u=... and any redirect-like key (case-insensitive, e.g. Redirect_URL) are refused. Params such as q or u on a /watch link are accepted but dropped from the canonical output.
- Never joinable: the result carries only `watch`, never `url`. resolveEventMeetingLink still returns {} for a YouTube link (tested).
- candidateUrls: a pure, added export that reuses the existing helpers and bounds. calendar-link-extract.ts differs from the base only by the added function. Nothing calls it except youtube-live-extract.ts, and scan() is unchanged.
- Flag: enabled !== true returns {}. Mutated, the test fails.
- Evidence: full apps/api suite with D2_FIXTURE_PYTHON set gives tests 811, pass 811, fail 0 (the manifest's 1 failure was the Python environment gap and is gone). tsc --noEmit exit 0. lint-loc --all: OK (10 stages, 0 failed).
- Mutations (hash-verified, restored, end hashes equal the HEAD blobs): 3 of 6 killed. Killed: redirect-key check removed, enabled gate, ambiguity branch removed. Survived: (a) host.endsWith("youtu.be"), (b) host.endsWith("youtube.com"). These are real test gaps, since the suffix-lookalike hosts evilyoutube.com and evilyoutu.be are not in the hostile list. The code is correct, so this is filed as medium, to be verified in the wiring unit (ISS-T036NEXT-001). (c) Removing the u.protocol check survived. It is an equivalent mutant, because the `/^https:\/\//i` check is redundant with it.
- Gaps (notes): real Calendar shapes unverified (synthetic fixtures only), and nothing is wired yet.

ISSUES-WRITTEN: ISS-T036NEXT-001 (medium, test gap, qa/issues.T036NEXT.jsonl)
