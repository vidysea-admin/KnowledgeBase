# Senior review ua-web (A7), cycle 0, diff 146f23da..7d5eef2f — VERDICT: Warning
- medium: signOut clears local state when POST /auth/logout failed; callers `void` the result, cookie stays valid (NavSidebar.tsx, AccountPage.tsx, PendingPage.tsx, AuthContext.tsx).
- medium (dev-only, ~80%): takeFragmentToken side effect in useState initializer; under StrictMode (main.tsx:10) the second render sees an empty hash (VerifyPage.tsx, ResetPage.tsx).
- low: refreshCsrfToken re-check of authSession happens before the await, not after (client.ts).
- low: describeAuthError returns raw server text for unknown 409 (user-accounts.ts).
- Sound: fragment tokens stripped, safeFrom open-redirect guard, memory-only CSRF, no Authorization header in session mode, race fences, generic login errors.
- Open: userAccounts runtime flag not written; live persona walk; viewer write controls not hidden on existing pages.
