# Local provider boundary
Status: checked-PASS
Fix cycle: 0
Owner: project_handoff
Tier: phase-one runtime prerequisite; accepted grounding stages require real providers.

## Exact changed paths
- packages/ai/src/providers/claude-code.ts
- packages/ai/src/providers/claude-code-boundary.test.ts
- packages/ai/src/providers/ollama.ts
- packages/ai/src/providers/ollama-boundary.test.ts
- apps/api/src/ai-transport.ts
- apps/api/src/ai-transport.test.ts
- qa/manifests/local-provider-boundary.md

## Behavior and verification
Claude uses existing OAuth with safe-mode/restricted, no built-in tools/skills/Chrome, empty strict MCP, no persistence or permission prompts. Input remains stdin. Portable native Windows resolver rejects shell shims. Child allowlist excludes app/DB/API secrets and retry-watchdog. Production limits:180sec,1MiBinput,4MiBcombinedoutput,16384outputtokens,1turn,0retries; byte overflow refuses rather than truncates. Ephemeral cwd removed after execution. Timeout/overflow kills the owned process tree. Errors omit captured output.
Ollama embedding sends truncate:false and options.num_thread:1, rejects non-finite vectors; existing arity/equal-width/empty checks retained.
Focused stage46/46PASS, no skips,8.61sec; includes native Windows child+descendant termination, stdout/stderr overflow, literal Unicode, input byte budget, credentials boundary. AI/API typechecks PASS after candidate freeze. Existing adapter consumer tests24PASS within46.
One authorized real existing-OAuth public synthetic prompt returned KB_OK:9.925sec,input2/output7,reportedcostmetric0.006942USD. This is provider availability only, not accepted corpus Ask or a new paid batch. Tiny overrides30sec/256outputtokens/64KiBinput/output.
Isolated Ollama0.35.1 PID7732 listens127.0.0.1:11435, task-owned modelstore, cloud disabled, shared11434 preserved. Official274302450byte manifestsha2560a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f plus every blob hash verified. Actual provider document+query each2finite/nonzero768-dimensional vectors; one CPUthread and no truncation. No corpusindex/DBwrites/providerbatch.
Known managed Windows policyfile/registry locations absent in presence-only preflight. Policies are not bypassed and future deployed policies still apply.

## Evidence
Task work: claude-installed-help.txt, local-provider-boundary-plan.md, claude-public-proof.json, ollama-nomic-manifest.json, ollama-installed-proof.json, ollama-public-proof.json, ollama-runtime.json. No credentials in reports.
Official CLI environment definitions: https://code.claude.com/docs/en/env-vars
Official embedding API: https://docs.ollama.com/api/embed

## Pending independent scrutiny
Independent checker Cycle0 scopedPASS:22/22 new focused tests, combined stdout/stderr cap probe PASS; exited-parent/inherited-pipes fixture resolved454ms and owned descendant absent on this machine. No universal orphan-cleanup assertion from that fixture. Matching verdict qa/verdicts/local-provider-boundary.md; evidence qa/evidence/local-provider-boundary-checker-2026-10-09.json. Live API restart awaits separate missing-provider-credentials verdict.

