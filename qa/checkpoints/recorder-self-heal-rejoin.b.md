# Checkpoint (coordinator B): recorder-self-heal-rejoin, cycle 0
Head e327d86bc30307e98ec27d93fd9d1e2fa1a53d06, contract 7e683dff, policy proportional-verification/2026-11-22.19
Worktree: D:/KnowledgeBase/.worktrees/h1-check-b (detached at head, pnpm install --offline)
Evidence identities (all run in that worktree, final head):
- node --test scripts/webinar/scheduler/self-heal-rejoin.test.mjs -> 23/23; related suites 46/46, 36/36, 24/24; tsc exit 0; 5 changed files
- C10 probe: scratchpad h1-check-b/probe-c10.test.mjs via node --import tsx --test -> mail contains the passcode sentence (FAIL)
- Mutants A-J (dispatch.mjs, lifecycle-alerts.mjs, alerts.ts), --test-timeout 60s, per-mutation backup, hash equal to HEAD blob after each: A, C, D, E, F, G, H, I, J killed; B survived
Status: complete; verdict FAIL on C10.
