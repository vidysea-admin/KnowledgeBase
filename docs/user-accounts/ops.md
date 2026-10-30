# User accounts: operations and deploy (plan A8)

Audience: the Vidysea devops team and Umesh. Unit `ua-deploy-cookie-proxy`
(`docs/features/user-accounts/plan.md` A8; requirements UA-15 cookie, UA-23 rate limiting and
trust proxy, UA-26 shared origin). This file names variables only. **No value appears here and
none may be pasted into chat, git or a ticket**; values go to the server `.env` by devops.

What this turns on: people sign in with an email and password and get a browser session cookie,
beside the existing API keys (which keep working unchanged). Roles and scopes: `docs/user-accounts/roles.md`.
Everything is off until the variables below are set; unsetting them returns the server to API-key-only.

## 1. Environment variables

| Name | Read by | Required | Meaning |
|---|---|---|---|
| `AUTH_CSRF_SECRET` | api | yes, to enable accounts | Random, 32 bytes or more. Missing or short: the API logs `user accounts disabled` and the whole session path stays off; API keys are unaffected. Generate on the server, store in the server `.env` only. |
| `USER_SIGNUP_TENANT` | api | yes, to allow signup and sign-in | The tenant new accounts join. Set to `toc`. Unset or invalid: signup and sign-in answer 503 `signup_not_configured`. |
| `APP_PUBLIC_ORIGIN` | api | yes | The public origin of the site as the browser sees it, scheme and host with no path, no trailing slash (the vidysea.com origin). It is the allowed `Origin` for cookie requests (CSRF) and the base of every link in verification and reset mail. |
| `APP_BASE_PATH` | api and web | yes under a prefix | `/knowledgebase` in production (default `/`). Must be identical for the api and web containers: it sets the cookie `Path`, the SPA base and the nginx proxy prefix. |
| `TRUST_PROXY_HOPS` | api | yes | Number of reverse proxies in front of the API that append to `X-Forwarded-For`, integer 0 to 5 (anything else is treated as 0 and a warning is logged). Chain is front proxy, web nginx, API, so the expected value is `2` [ASSUMPTION, verify with the check in section 4]. Too high lets a client forge its IP; too low puts every user in the proxy's rate-limit bucket. |
| `USER_SIGNUP_DAILY_CAP` | api | no | Global signups per rolling 24 h per tenant. Default 200. |
| `APP_USER_ACCOUNTS` | web container | yes, to show the screens | `1` or `true` makes the container write `userAccounts: true` into `config.js` so the SPA shows sign-in, signup and the admin pages. Anything else (absent, `0`, `false`, `yes`) leaves it `false`. It is a UI switch only; the API is gated by `AUTH_CSRF_SECRET`. Set both or the screens and the server disagree. |
| `CORS_ORIGINS` | api | existing | Also counted as an allowed cookie `Origin`. Leave as is for the same-origin setup. |

`.env.example` carries these names with no values.

`docker-compose.yml` forwards only the names it lists. The forwards for the `api` and `web`
services need an `Approved-by` entry from Umesh (the file is an enforcement path); the exact lines
are in the manifest `qa/manifests/ua-deploy-cookie-proxy.md`, open point 1. Until they are merged
these variables never reach the containers.

Mail (verification, reset) needs a sender account that is not decided yet (plan Q-A, human item H-1).
Without it, an admin issues one-time links from the admin page; see the A5 unit when it lands.

## 2. Cookie and base path

The session cookie the API sets:

| Attribute | Value |
|---|---|
| Name | `__Secure-lkb_sid` (the prefix makes browsers insist on `Secure`) |
| `Path` | `<APP_BASE_PATH>/api`, so `/knowledgebase/api` here and `/api` for a root deployment. Never sent with static assets or to other applications on vidysea.com. |
| `HttpOnly` | yes (script cannot read it) |
| `SameSite` | `Strict` |
| `Secure` | yes, always in production. **HTTPS must hold end to end at the browser edge**, or the browser drops the cookie and sign-in appears to succeed and then fail. |
| `Domain` | none (host-only) |
| `Max-Age` | 400 days, refreshed on rotation |

Because the `Path` is `<base>/api`, a wrong `APP_BASE_PATH` on the api container is the usual
cause of "logged in but every call is 401": the browser never sends the cookie. The api and web
containers must read the same `APP_BASE_PATH`.

Residual risk, accepted (UA-26): the app shares the origin vidysea.com with other sites, so script
from another page of that origin could issue same-origin calls with the person's cookie. It is not
worse than the key in `localStorage` today. A dedicated subdomain would remove it.

## 3. The vidysea.com front proxy

Owner: the vidysea.com team. For `/knowledgebase/` (including `/knowledgebase/api/*`) the proxy
must pass these to the compose `web` port, with the full original path and no rewrite:

| Direction | Header | Why |
|---|---|---|
| request | `Cookie` | carries the session |
| request | `Origin` | the CSRF check compares it with `APP_PUBLIC_ORIGIN`; a proxy that strips it makes every unsafe request 403 `csrf` |
| request | `X-Forwarded-For` (append: `$proxy_add_x_forwarded_for`) | the rate limiter and lockout key |
| request | `X-Forwarded-Proto` (`$scheme`) | the API's idea of the scheme |
| request | `Host` | as today |
| response | `Set-Cookie` | must not be stripped, cached or rewritten (no `proxy_cookie_path` changes) |

Also: no caching of `/knowledgebase/api/*`, and no `proxy_hide_header Set-Cookie`. The web nginx
(`apps/web/nginx.conf`) already forwards `Origin` and `Cookie` (nginx does by default), appends to
`X-Forwarded-For`, and passes `X-Forwarded-Proto` from the front proxy.

## 4. Forged `X-Forwarded-For` check (verifies `TRUST_PROXY_HOPS`)

A request must not be able to choose its own rate-limit key. Login is limited to 20 per 15 minutes
per IP. From a machine outside the server, send 25 logins, each with a different made-up email (so the
per-email lockout never triggers) **and a different forged `X-Forwarded-For`**:

```sh
BASE=https://<public-host>/knowledgebase     # the vidysea.com origin plus the base path
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code} " -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' -H "Origin: https://<public-host>" \
    -H "X-Forwarded-For: 203.0.113.$i" \
    --data "{\"email\":\"probe$i@example.invalid\",\"password\":\"not-a-real-password\"}"
done; echo
```

- Needs `USER_SIGNUP_TENANT` set first; without it login answers 503 and the probe proves nothing.
- **Pass:** 401 for roughly the first 20, then 429 (the forged values were ignored, so all 25 share your real IP).
- **Fail:** 401 for all 25. The API is trusting the client-supplied header, so `TRUST_PROXY_HOPS` is too high. Lower it and repeat.
- Wait 15 minutes (or restart the api container, the limiter is in memory) before repeating.
- Cross-check: the api log prints `trust proxy: effective hops=N` at start; N must equal the value you set. If the value is too low, all real users share one bucket: from a second network, the first request after the 429 above must still return 401, not 429.

Use only made-up `@example.invalid` addresses. The probe writes throttle rows for those addresses
and auth events with a closed-vocabulary detail and no secrets.

## 5. First admin

There is no web path to the first admin. On the server (work or staging database unless Umesh
approves production, D-196), with the password piped on stdin and never on the command line:

```sh
printf '%s' "$ADMIN_PASSWORD" | node scripts/create-admin.mjs --tenant toc --email <umesh-email>
```

Add `--display-name "<name>"` if wanted. For the production database the script also requires
`--i-know-this-is-production` and `MONGODB_DB=lkb` or `lkb_prod`; that run is a human-approved act.
Type the password at the host's prompt in a way that keeps it out of shell history (for example
`read -rs ADMIN_PASSWORD` first). Minimum 12 characters; spaces and non-ASCII are fine. Exit 0 means
created or already an admin (the password is not changed); exit 3 means the email exists in another
state and was left alone; exit 1 means refused. The script never prints the password.

## 6. Rollback

Fastest, no rebuild: remove `USER_SIGNUP_TENANT` (signup and sign-in answer 503) and/or
`AUTH_CSRF_SECRET` (the whole session path is off), set `APP_USER_ACCOUNTS` to `0` or remove it, and
`docker compose up -d api web`. API keys keep working throughout; no key is touched by any of this.
While `AUTH_CSRF_SECRET` is removed no cookie session is accepted. Sessions live in the database and are
not deleted by a rollback; to end them for good, revoke them from the admin page (or with the revoke-all
action) before rolling back. No database row needs removing for a rollback.

## 7. Local development (ISS-UAWEB-005)

`vite dev` serves the SPA on `127.0.0.1:5173` and the API listens on another port, so the browser
treats the API as cross-origin. The session cookie is `SameSite=Strict`, host-scoped with a `Path`,
and CSRF demands a matching `Origin`; across origins the cookie is not carried and sign-in will not
persist in dev. Use one of:

1. Same-origin serving: run the web container (`docker compose up web api`) and open it on `WEB_PORT`; or
2. a dev proxy that forwards `<base>/api/*` to the API on the same origin as the SPA.

Set `APP_PUBLIC_ORIGIN` to that origin (for example `http://localhost:8080`; `localhost` is the only
case where the unprefixed cookie `lkb_sid` without `Secure` is used, and only when `NODE_ENV` is not
`production`). Never loosen `Secure` for a real host.

## 8. A8 checklist (human; paste evidence into the Evidence column, never a secret)

| # | Item | Owner | Evidence |
|---|---|---|---|
| 1 | `APP_PUBLIC_ORIGIN` and `APP_BASE_PATH=/knowledgebase` set in the server `.env`, same on api and web | devops | `docker compose config` with values masked, or the entrypoint "set" lines |
| 2 | HTTPS end to end at the browser edge | devops | `curl -sI https://<public-host>/knowledgebase/` status line |
| 3 | Front proxy forwards `Cookie`, `Set-Cookie`, `Origin`, `X-Forwarded-For`, `X-Forwarded-Proto` for `/knowledgebase/api/*` | vidysea.com team | the proxy config block, plus a login response showing `Set-Cookie` with the section 2 attributes |
| 4 | `TRUST_PROXY_HOPS` verified | devops | output of the section 4 loop and the `effective hops` log line |
| 5 | `AUTH_CSRF_SECRET` generated on the server, in `.env` only | devops | "set" line from the API entrypoint (never the value) |
| 6 | `USER_SIGNUP_TENANT=toc` | devops | "set" line; signup no longer answers 503 `signup_not_configured` |
| 7 | `APP_USER_ACCOUNTS=1` on web; `config.js` shows `userAccounts: true` | devops | `curl -s https://<public-host>/knowledgebase/config.js` |
| 8 | Compose env forwards merged with `Approved-by: Umesh` | Umesh | the decision entry id |
| 9 | First admin created with the script | Umesh | script exit code and the `admin_bootstrap` audit row id |
| 10 | Rollback rehearsed once on staging (section 6) | devops | note of the commands run |
