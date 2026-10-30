# Checkpoint - ua-auth-api (checker B)
Cycle checked: 0 | Verdict: PASS | Policy-Version: proportional-verification/2026-10-19.17
Checked code: f4790297 (base 7a4ed51a); worktree HEAD at write time 7773f672; `git diff f4790297 HEAD -- apps packages` empty
Code identities (git blob, equal in bound tree, HEAD and my pristine copy): auth-service.ts dc18d4ff2a, auth-router.ts ad629bebce, throttle.ts 9358eb31b6, auth-service.test.ts c3b7b1409e, auth-router.test.ts 34d5d397c7, throttle.test.ts 354df5642b, composition/integrations/user-accounts.ts 7ae7ff0b35
Re-run: auth-service 17/0, auth-router 15/0, throttle 7/0, mongo (loopback, opt-in) 5/0; lint-loc, lint-dirsize, lint-dupes OK; tsc clean for unit files
Mutants: 12/12 killed (10 criterion + 2 extra); probe 68/70 ok (2 artefacts explained in verdict)
Evidence sha256 (first 16, working-copy bytes): 8b2003f44ce398b8*probe.out;8912bd071f3de0cf*mutate.out;29ac3879c1afd38f*mutants.json;f4e5661dfd32c7cc*mutate.py;999606bb58cc32c0*probe-adversarial.test.ts;
Independence: no other coordinator's verdict, checkpoint or evidence was read.
Metrics: coordinator_min=32 mutants=12 cycle=0 suite_runs=0
