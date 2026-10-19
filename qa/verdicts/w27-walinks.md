# Verdict: w27-walinks (WhatsApp link discovery, flag LKB_WA_DISCOVERY, default OFF)

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: 9cae455f583966579e46129fa619f77f0c69ca64
Base: a9b202b4

## Checked (independently)
1. Flag off is byte-identical. schedule-tick.ts: `loadWhatsappCandidates` is optional and `createWhatsappLoaderFromEnv` returns undefined unless env is exactly "1", so `candidates` is the same array as before. The only difference is an `undefined` property on the deps object. The loader test compares serialized tick output with the hook absent, with the env-loader off, and with groups set but flag off: identical.
2. Extractor output is {url, ts, groupIdHash, messageIdHash, needsRegistration}. The loader row carries sender "", the hashed message id and the URL. The test serializes the output and asserts no message text, sender or raw group id. Log lines carry hashed group ids only. The URL itself (incl. pwd/tk) is retained by design.
3. Allow-list (empty = nothing fetched) and consent=false are enforced. Rows have senderAuthenticated undefined and status pending, so the scheduler returns needs-review. Only an owner-set "approved" promotes a row.
4. Tests (timeout 600, exit 0, outputs in session scratchpad w27ev): extractor 18/18, loader 13/13, schedule-tick 14/14, rules-integration 4/4, auto-join 43/43. `tsc --noEmit` for meeting-bot: exit 0, no output.
5. Mutation: removed the consent check in whatsapp-candidate-loader.ts. The consent test failed as expected (exit 1). Per-mutation backup, EXIT/INT/TERM/ERR trap, cmp restore. Final `git -c core.autocrlf=true hash-object` = HEAD blob 5f7bb4c8.

## Not verified / limits
No real fetcher and no DECISIONS entry: the flag must stay OFF in production until both exist. No network, no full suite.

ISSUES-WRITTEN: none
Ledger rows may be flipped: none were cited by this unit.
