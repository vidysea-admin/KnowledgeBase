# Verdict: iss-webhigh-001-join-rules-api-nonascii-sender

VERDICT: PASS
Cycle checked: 0
Checked commit: 68f9b402 (lane/webhigh2)

EXPLANATION:
- Write paths: join rules accept a sender only via POST /approvals (kind sender) and PUT match.email; both gated. POST /approvals domain and /opt-outs(/remove) take domains and event ids, not senders. No PATCH, no bulk import route exists. PUT cannot inject approvedSenders: state comes from the store (saveIf keeps it), body state is not written. No other email-bearing field in the rule schema (match keys: email, domain, subdomains, platform, scope).
- Replay ISS-WEBHIGH-001 (U+200B, U+202E, U+0430 plus 4 extra variants, 7 cases): 7/7 refused 400 sender_not_printable_ascii on approvals and 7/7 on PUT; store bytes identical, no ETag on the 400, GET ETag unchanged (test asserts all). The ledger records no literal strings, so none omitted.
- Copy fidelity: only the character class matches the engine (/^[!-~]+$/). Engine parseStrictEmail also rejects length>320 and <>(),;:"\ and demands canonical form; the gate does not (ASCII, inert, declared by the maker, and the store still validates structure). Gate is stricter than the engine's trim (ASCII trim only), which is safe. No cross-check test exists; core parseSender is a third copy. Filed ISS-WEBHIGH-002 (medium) recommending one shared fixture list read by tests in both packages.
- Mutations (per-mutation backup, HEAD hash verified, tree clean after): class narrowed KILLED (1), class widened to U+FFFF KILLED (3), approvals check removed KILLED (1), PUT check removed KILLED (1), anchor removed KILLED (2), trim-any-\s KILLED (2). SURVIVED: ruleEmailMatchers limited to first rule (0 fail); behaviour at HEAD is correct, test gap only, filed ISS-WEBHIGH-003 (low, ledger only).
- tsc --noEmit exit 0. Full apps/api suite with D2_FIXTURE_PYTHON=main .venv: 790 tests, 789 pass, 1 fail: src/activity-health/router.test.ts:60 "actual producer -> Python ... consumer output", AssertionError null !== 0 at :149 (spawnSync of Python returned status null, i.e. its 5000 ms timeout hit under suite load). Run alone it passes 3/3 in this lane AND in main (read-only run, 3/3). Load-flake, unrelated to this change.
- Ledger row ISS-WEBHIGH-001 is verified for the API write paths by this check; status flip left to the maker close-out.

ISSUES-WRITTEN: ISS-WEBHIGH-002 (medium), ISS-WEBHIGH-003 (low)
