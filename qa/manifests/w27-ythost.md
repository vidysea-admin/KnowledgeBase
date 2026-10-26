# w27-ythost: YouTube live extractor host matching (ISS-T036NEXT-001)

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w27-ythost.md
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-ythost, branch lane/w27-ythost
Base: 4264418c (origin/master)
Candidate: see commit on branch (self-referential SHA not recorded here)

## Changed paths
- apps/api/src/join-rules/youtube-live-extract.test.ts (one new test, tests only)
- qa/manifests/w27-ythost.md

## Finding
Production code already correct: youtubeVideoId uses `host === ...` for youtu.be, youtube.com, www.youtube.com, m.youtube.com. No source change. Host policy is EXACT-only (documented in the file header); proper-subdomain acceptance (e.g. evil.youtube.com, evil.youtu.be) is NOT accepted and is pinned as rejected. Widening to subdomains would be a policy change and was not made.

## Evidence
- Focused test (node --test --import tsx, apps/api): tests 8, pass 8, fail 0.
- D-020 mutations (script outside repo, per-mutation backup/trap; HEAD-fidelity hash equal after):
  - M1 `host === "youtu.be"` -> `host.endsWith("youtu.be")`: pass 6 fail 2 (killed)
  - M2 youtube.com triple -> `host.endsWith("youtube.com")`: pass 6 fail 2 (killed)
- D-015: ISS-T036NEXT-001 recorded reproductions (evilyoutube.com, evilyoutu.be, notyoutu.be, youtube.com.evil prefix): 4/4 refused, all in the test.
