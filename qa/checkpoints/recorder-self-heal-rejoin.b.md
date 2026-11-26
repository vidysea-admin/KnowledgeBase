# Checkpoint (coordinator B): recorder-self-heal-rejoin, cycle 1
Head c42c9559ca7c92fbb1378b41cd90e85404e7ec4b, base e327d86b, contract 7e683dff, policy proportional-verification/2026-11-22.19
Worktree: D:/KnowledgeBase/.worktrees/h1-check-b (detached at head)
Evidence identities (final head):
- git diff --stat e327d86b c42c9559: bot-events.ts, self-heal-rejoin.test.mjs only
- probe-c10.test.mjs verbatim via node --import tsx --test: 3/3 clean mails; probe-clean.test.mjs 14/15 redacted ("Passcode - 445566" leaks, medium hardening)
- autojoin/*.test.ts 54/54; scheduler/*.test.mjs 92/92 (incl. self-heal-rejoin 26/26); tsc --noEmit meeting-bot exit 0
- mutants K-N on bot-events.ts, 60 s timeout, per-mutation backup, hash == HEAD blob c47b198d: all killed
- cycle-0 evidence (C1-C9, I1-I6, mutants A, C-J) reused by identity: dispatch.mjs, lifecycle-alerts.mjs, alerts.ts unchanged since e327d86b
Status: complete; verdict PASS.
