# Checkpoint wa-revoked-link-gate (checker a, cycle 0)
Base 15de5c76, Code head 056056b4, Branch head a4c969a2. Bound root .worktrees/wa-revoked-link-gate unchanged before this commit (git status clean).
Evidence: gate suite 34/34, gate+knowledge 86/86, call-site suites 109/109 (2 initial reds were missing data/ dirs in the isolated copy, fixed), visibility dir 151/151, in a git-archive copy with junctioned node_modules (junctions removed with cmd /c rmdir).
Mutation results: m1 live clause removed RED(5), m2 suspended clause removed RED, m3 live !== false RED, m4 over-close RED(6), m5 studentData removed RED, m6 non-WhatsApp branch RED, m7 call-site live removed RED (G1/G2/G3), m8 call-site suspended removed RED. Restores cmp equal, hash-object equals HEAD blob.
Leak sweep: no external-model path bypasses the predicate (Route tree, Ask tree, transcript and native hydrators, outputs reader, indexer/speaker suggest, graph context, ask arms checked).
Base reds (ask-tenant-isolation, message-vertical load failure, TS2305) reproduced at 15de5c76: pre-existing. Verdict: PASS, 1 low PROPOSED-ISSUE (state denylist). Consent untouched (D-210).
