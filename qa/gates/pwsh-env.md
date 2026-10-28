# Gate: pwsh-env (blocks the go-live push)
Opened: 2026-10-28T18:05+05:30
Question: scripts/webinar/start-calendar-attendance.test.mjs fails on this machine with "Attendance runtime prerequisite is missing: pwsh" (PowerShell 7 not installed). It is the sole red in qa/verdicts/prepush-6c-2026-10-28-r3.md.
Options:
  A (recommended) — record it in qa/checkpoints/baseline-reds.md as an environment red (node id + message hash); the next 6c checker stamps green; push proceeds.
  B — Umesh installs PowerShell 7 on this machine; re-run that one test; then stamp.
Answer format: "pwsh: A" or "pwsh: B".
Blocks: push of docs/devops-golive-2026-10-26 and the PR to master.
