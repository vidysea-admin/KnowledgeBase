# Knowledge Base live admin browser checks

25 November 2026, 07:55–08:14 IST. Installed desktop Chrome exercised the `kb-login-test` Cloud Run URL in `vidysea-prod`, `asia-south1`. The test signed in as a KB administrator. Two test sessions returned HTTP 200 with an active admin role.

## Result

All 51 distinct signed-in routes rendered an HTTP 200 app page. 28 had no observed API or UI error on opening. 23 had at least one failing data request. The counsellor, championship and ingest landing pages only fetched session state in these checks. Their underlying actions remain untested.

- The query `admissions` returned 20 passages with 20 transcript links. Clicking a real result opened its exact turn and the transcript contained the search excerpt.
- On Inside the UC, the selected transcript turn `t042` showed Vaishnavi and the interval 2124–2297 seconds (35:24–38:17). Refresh retained the active admin session. The transcript UI formats its times in seconds.
- The user list and audit screens loaded. Ask opened and loaded its supporting data. No new model-generated answer, account change, external send, live meeting or production data promotion was exercised.
- The main Cloud Run URL returned `db=ok` on `/health` and HTTP 401 on `/knowledgebase/login`. The tagged URL returned `db=ok` through `/knowledgebase/api/health`. Its external `/healthz` path returned HTTP 404. The `kb.vidysea.com` lookup failed. The legacy `/knowledgebase/` address redirected to the prior debugging IP.
- The current GitHub master was `ce5cef49`. Google Developer Connect recorded a successful Cloud Build for that commit. The test URL served `index-C7MDQC3z.js`, matching the asset name in the release receipt for `a9bbeb98`, revision `00020-7ss`. The JavaScript fetched from the live server had SHA-256 `c2d5a84a86a795c6c50727e5c9536cad7f9c876ae3c40372ba6bff52822bfc6f`. The public health response supplied no backend commit identifier. [Master build](https://console.cloud.google.com/cloud-build/builds;region=asia-south1/f23fa5c1-26b7-46c5-a618-b2edc1b5b032?project=358281750133)

## Concurrent reads

Three browser tabs shared one active admin session. Each round issued one session check, one database health check and one UC transcript read. A successful read required HTTP 200 and the expected response content. The corrected check verified 5 of 6 reads across two rounds. The second transcript read returned HTTP 429 and the workload stopped. The subsequent session refresh returned HTTP 200 with the admin role. A clean-start capacity limit and multi-user throughput remain unmeasured.

An earlier batch issued 30 reads before its test code incorrectly called the native Fetch `status` property as a function. Its response scores are invalid. Those requests may have consumed some of the same rate-limit window. On the corrected run the six client-observed durations had a 96 ms median and a 969 ms maximum.

## Errors the server returned to this admin

| API path | HTTP | Server code |
|---|---:|---|
| `/calendar/upcoming` | 503 | `discovery_unavailable` |
| `/calendar/join-rules` | 503 | `join_rules_unavailable` |
| `/whatsapp/groups` | 503 | `not_configured` |
| `/whatsapp/links` | 503 | `workflow_unavailable` |
| `/whatsapp/links/notice` | 503 | `workflow_unavailable` |
| `/connector-workflow` | 503 | `not_configured` |
| `/retention/status` | 503 | `workflow_unavailable` |
| `/meeting-bot/capture-readiness` | 401 | `unauthorized` |
| `/bot-events` | 403 | `forbidden` |
| `/jobs` | 403 | `forbidden` |
| `/operations-integrations` | 503 | `operations_unavailable` |

Calendar reported unavailable discovery, and the join-rules response explicitly said its storage was unconfigured. Bot events and provider jobs reported a missing `jobs` scope. The WhatsApp notice endpoint returned `workflow_unavailable`, so the new-link workflow could not display the notice. The authenticated application's responses establish these failures for this account. A separate Cloud Run recorder's process state requires telemetry from that workload.

## Screen results

Each row describes loading and reading the screen. The table lists failed API calls even when the frontend itself returned HTTP 200. Endpoint counts include session reads. Repeat visits to the same UC transcript count as one distinct screen.

| Screen | API responses observed | Failed responses | Visible errors |
|---|---:|---|---:|
| `/ask` | 4 | None observed | 0 |
| `/search` | 2 | None observed | 0 |
| `/sessions` | 2 | None observed | 0 |
| `/sessions/2026-07-03-inside-the-uc-session` | 6 | None observed | 0 |
| `/admin/users` | 2 | None observed | 0 |
| `/admin/audit` | 2 | None observed | 0 |
| `/account` | 2 | None observed | 0 |
| `/meeting-bot` | 9 | `403 /meeting-bot/privacy`, `503 /retention/status`, `403 /bot-events`, `503 /calendar/upcoming`, `401 /meeting-bot/capture-readiness` | 6 |
| `/calendar` | 5 | `503 /calendar/join-rules`, `503 /calendar/upcoming`, `403 /meeting-candidates` | 1 |
| `/watch` | 4 | `403 /meeting-candidates` | 0 |
| `/join-rules` | 2 | `503 /calendar/join-rules` | 1 |
| `/whatsapp` | 3 | `503 /whatsapp/groups` | 1 |
| `/whatsapp/links` | 2 | `503 /whatsapp/links` | 1 |
| `/knowledge` | 4 | None observed | 0 |
| `/knowledge/documents` | 2 | None observed | 0 |
| `/knowledge/topics` | 2 | None observed | 0 |
| `/knowledge/speakers` | 2 | None observed | 0 |
| `/brain` | 2 | None observed | 0 |
| `/explorer` | 3 | None observed | 0 |
| `/transcript-review/2026-07-03-inside-the-uc-session` | 2 | None observed | 0 |
| `/answer-review` | 3 | None observed | 0 |
| `/answer-policies` | 3 | None observed | 0 |
| `/automation` | 3 | `403 /automation/runs`, `403 /automation/definitions` | 1 |
| `/connectors` | 2 | `503 /connector-workflow` | 1 |
| `/sources` | 2 | None observed | 0 |
| `/jobs` | 2 | `403 /jobs` | 1 |
| `/status` | 2 | None observed | 0 |
| `/ops-health` | 4 | `403 /jobs`, `403 /watch-runs`, `403 /activity-health` | 3 |
| `/notifications` | 2 | `403 /notifications` | 1 |
| `/analytics` | 5 | `403 /jobs`, `403 /usage` | 0 |
| `/operations` | 8 | `503 /operations-integrations`, `503 /operations-integrations/preview`, `403 /notifications`, `403 /activity-health` | 4 |
| `/counsellor` | 1 | None observed | 0 |
| `/` | 5 | `403 /keys` | 1 |
| `/calibration-review` | 2 | `403 /calibration-review` | 1 |
| `/extraction-review` | 2 | `503 /extraction-review` | 1 |
| `/label-review` | 2 | `503 /label-review` | 1 |
| `/championship` | 1 | None observed | 0 |
| `/automation/forms` | 4 | `403 /automation/forms/operations`, `403 /automation/forms/definitions`, `403 /automation/forms/targets` | 1 |
| `/knowledge/collections` | 3 | None observed | 0 |
| `/knowledge/resources` | 2 | None observed | 0 |
| `/knowledge/profiles` | 3 | None observed | 0 |
| `/knowledge-outputs` | 3 | None observed | 0 |
| `/accounts` | 2 | `403 /counsellor-accounts` | 1 |
| `/graph-confidence` | 2 | None observed | 0 |
| `/gaps` | 2 | None observed | 0 |
| `/activity-health` | 2 | `403 /activity-health` | 1 |
| `/settings` | 2 | `403 /keys` | 1 |
| `/setup` | 5 | `503 /calendar/join-rules` | 0 |
| `/claims` | 2 | None observed | 0 |
| `/ingest` | 1 | None observed | 0 |
| `/whatsapp/links/new` | 2 | `503 /whatsapp/links/notice` | 1 |

Both runs recorded zero uncaught page JavaScript errors. The screen checks did not exercise form submissions that change application data.

### Fresh three-tab read test on the existing GCP tag

On 25 November, visible desktop Chrome signed in to `kb-login-test` as an active admin. Login and session each returned HTTP 200. After a 65-second idle interval, three tabs used the same signed-in session. Each round read the account session, database health and the `2026-07-03-inside-the-uc-session` detail concurrently. The checks required an admin role, healthy database and matching session ID with transcript turns. Ten rounds completed with 30 valid HTTP 200 responses and zero retries. The slowest response was 1,214 ms. This measures these three read paths for one signed-in user. Calendar discovery, recording and WhatsApp pairing require their own end-to-end checks.
