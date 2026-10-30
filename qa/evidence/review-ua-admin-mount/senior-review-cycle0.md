# senior review ua-admin-mount cdc61b36..a956d368 - VERDICT: Approve
No finding at medium or above. Verified: /admin behind requireAuth + session guards; reads requireScope(user-admin); mutations requireAdminSession (session-only); subjectHash identical to A4 throttle HMAC; no-store; origin from APP_PUBLIC_ORIGIN only; opaque errors; no production caller yet (ua-production-enable).
Follow-up for ua-production-enable: add a request-level test through mountUserAccounts (anon 401, key POST 403, admin session POST 200); the [A6 wiring] test only checks typeof.
