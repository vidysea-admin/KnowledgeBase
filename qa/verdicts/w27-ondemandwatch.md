# Verdict: w27-ondemandwatch

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: ba4e57c190731568c3bed7923e74059eeec81af0
Base: a9b202b422af6436c52f61dc9850ecb12fd21fc4

## Evidence (independently produced)
- Diff base..candidate: only onair-watch.ts, onair-watch.test.ts, manifest (all new). File is imported nowhere else.
- Test (timeout 600): exit 0, pass 9 fail 0. tsc meeting-bot (timeout 600): exit 0.
- Allowlist probe (own script): cloudonair.withgoogle.com.evil.com -> origin-not-allowed; https://x@host and host@evil.com -> invalid-url; http -> origin-not-allowed; /other/a, /events/a/../b, %61, %2f..%2f, // -> slug-mismatch; trailing-dot host -> origin-not-allowed; only exact origin + /events/<slug> accepted (query dropped).
- Dedup claim: path = claimDir/<tenant>/onair-watch-<slug>.json, flag wx. Slug regex [a-z0-9-] and tenant regex (must start alnum, no slash/backslash) reject "..", ".", "../x", "a/b", "a\b", "". Files created only under tenant dirs. No traversal.
- Flag off: config.enabled false unless exact "1"; returns "disabled" before any claim or launch (test + code). No other module imports it, so live path unchanged.
- Own mutation: wx -> w. Result pass 7 fail 2 (dedup and failed-run-keeps-claim tests killed it). Per-mutation backup, trap INT/TERM/ERR/EXIT, cmp equal; `git -c core.autocrlf=true hash-object` = HEAD blob c28da1fe804809077091456cf017aa1807697084.

## Not verified
lint-loc --all (maker's env gap noted), real recorder launch, no network/browser. Budget metrics not recorded (ship-mode).

ISSUES-WRITTEN: none
Ledger rows may be flipped: yes (none specific to this unit).
