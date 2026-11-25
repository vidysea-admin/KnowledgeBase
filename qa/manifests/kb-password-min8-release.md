# KB password minimum of eight characters

Status: checked-PASS
Fix cycle: 3 (Umesh explicitly approved the focused isolation recheck and release)
Policy-Version: proportional-verification/2026-11-22.19
Owner: maker
Tier: explicit release request from Umesh for the Knowledge Base admin setup
Scope: the release worktree at .worktrees/kb-password-min8, based on ce5cef49a388457bf1ab67315aafac0301496e4b.
Plan approval: qa/.delivery/e87613e8271b3c177be7d4d42edc36a7e459a3d821d6065446dffca153a48b63.log.
Protocol SHA256: maker cb660ebcf3c729ad0f4b9a771618ca129196039fad469f1588f932d1e5290102; checker d5bf6e4f9a39ab46eb4b33da7e926904f54c24e8f32ff111da06f91f6a4e2a8e.

## Acceptance
1. The shared UA-3 policy accepts an eligible eight-digit password and a valid eight-character Unicode password after normalization. Seven characters, blocked passwords, email-derived passwords, and passwords exceeding 128 characters are refused.
2. Signup, password reset, signed-in password change and the official first-admin command use the same policy. Existing accounts still authenticate.
3. The user-facing signup, reset, field-error text and private desktop first-admin prompt say 8. Desktop confirmation submits the password on stdin to create-admin and reports a closed-vocabulary refusal without echoing the input.

## Pre-check evidence
- Cycle 3 repairs only the private desktop test mode. It builds its own direct loopback URI from a port, checks the real scratch dbPath, bind address and process ID, and uses explicit runtime exceptions that are preserved under optimized Python. Production selects the approved account explicitly and gets the cluster URI from the protected work configuration. No production image source changed after cycle 1.
- The desktop command now refuses to start without either `--isolated-test` or the exact `--approved-production-admin` selector. The confirmation form identifies the account as the production `lkb_prod` admin. Umesh separately approved this production account on 2026-11-24. The corrected form passed the same disposable real-Mongo bootstrap check. Runtime application sources are identical to cycle 1.
- Baseline: checkPassword on the eight-digit test fixture yielded only too_short before the change.
- Node account policy, password hashing, service, HTTP router, and bootstrap test files passed. React account flows: 18 passed.
- Private desktop form: actual Tk submit with seven digits reached create-admin and displayed the expected safe refusal; eight digits created exactly one active admin and one bootstrap audit event in a disposable loopback database. No production account was used by this test.
- Provisioning, traffic, DNS and the user’s real credentials are outside the source change. Positive GCP sign-in requires the owner’s new password in the private window.

