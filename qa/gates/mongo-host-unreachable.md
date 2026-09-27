# HUMAN_GATE — the database host is unreachable, and only you can restart it

**Opened:** 2026-09-08T15:00:00Z
**Blocks:** every live verification, and (if this is the production store) the running product.
**Needs:** an infrastructure action outside this repo. Nothing here can fix it.

## What is measured, not inferred

`13.202.206.101:27017` — the store named by `MONGODB_URL`:

```
ping         2 packets sent, 0 received, 100% loss
TCP :27017   TIMEOUT after 8000 ms  (not "connection refused")
driver       Server selection timed out — 7 attempts across ~2 hours
```

**`TIMEOUT`, not `ECONNREFUSED`, is the diagnostic detail.** A refused connection means the host is
up and nothing is listening on that port — a `mongod` problem. A timeout with 100% packet loss
means the **host is not answering at all**: stopped instance, changed security group, or a network
path change. So this is not a database fault to debug from here.

## Why it matters beyond QA

If this instance backs the running API, then `/ask`, `/search`, `/sessions` and `/citations` are
all down right now, along with the 26 sessions, 2,118 turns and the tree index. **Nothing in this
repo can tell the difference between "the QA database is down" and "the product is down"** — same
host, same URL.

## What it is blocking here

Three PASSed units carry an explicitly **UNVERIFIED** live half rather than a passed one:

| unit | what cannot be checked |
|---|---|
| `chunk-schema-and-chunker` | the `chunks` collection's real state |
| `embed-on-index` | **C8 / ISS-113** — 26-session non-emptiness, `vector.length === dims` **as rows**, `turnRefs` resolution |
| earlier search units | live parity re-runs |

That debt is **deferred, not hidden** — each is a ledger row or a stated UNVERIFIED, and no timeout
was ever converted into a pass or a fail. But it compounds: `U1.4` (cosine retrieval) and `U1.5`
(hybrid merge) are both next, and both are ultimately judged on a **recall delta measured over real
rows**. Building them is still worthwhile — the retrieval maths is pure and genuinely testable — but
the further we go, the more lands in one big unverified batch.

## The decision

1. **Restart / reachability-fix the instance** (AWS console, security group, or whatever changed),
   then say so — one live run discharges most of the backlog at once.
2. **Point `MONGODB_URL` at a local `mongod`** for verification purposes. Unblocks the row-level
   checks immediately; the numbers then describe a local corpus, not production, and every claim
   must say which.
3. **Keep building the pure layers and accept the growing unverified batch**, on the understanding
   that the first live run may surface several units' worth of problems at once.

**My recommendation: 1, and if it will not be quick, 3 in the meantime** — the retrieval work is
pure functions over injected data, which is the most honestly testable kind of unit we have. I will
keep flagging the batch size each tick rather than letting it become background noise.

**I have not tried to restart anything.** Infrastructure changes are outward-facing and yours.

**Answered:** 2026-09-08 — SELF-RESOLVED (see the close-out note above). Left no longer pending.

**Answered:** 2026-09-08 — SELF-RESOLVED, no human decision was needed — maker tick, verified by
re-probe. TCP :27017 connects in ~31 ms and the driver reads all 23 `lkb` collections; the host
came back on its own. **Correction to this gate's own evidence:** ICMP `ping` still shows 100%
loss and always would, because ICMP is filtered at that host — `ping` was never a valid health
probe here and the "100% packet loss" line above overstates what it can prove. TCP connect is the
signal. Last night both agreed, so the wrong conclusion was not drawn, but the reasoning was luckier
than it looked. Nothing was built past this gate while it was open, and the deferred C8/ISS-113
row-level checks were discharged on real rows in the `chunk-backfill` unit (26/26 sessions, 0 dim
mismatches, 0 dangling turnRefs).

## Reopened — 2026-09-10T08:00:00+05:30

The live gate has regressed. A fresh `Test-NetConnection` resolved the same EC2 address but
reported `TcpTestSucceeded: False` for `13.202.206.101:27017`. The local WhatsApp Mongo endpoint
`127.0.0.1:27018` also reported `TcpTestSucceeded: False`. Docker CLI 29.6.1 is installed, but its
daemon pipe is absent and `com.docker.service` is `STOPPED`; an escalated
`sc start com.docker.service` returned `OpenService FAILED 5: Access is denied`. No local
`mongod`, Podman, or nerdctl executable is installed, and WSL distro enumeration is itself denied.

This reopens only the live main-Mongo/WhatsApp persistence portion of T-007 criterion 14. Isolated
unit/in-memory testing and code work may continue, but neither can be reported as the required
real persistence proof. Resolution remains option 1 or 2 above: restore the remote endpoint, or
start/provide a reachable local Mongo runtime. This new evidence supersedes the 2026-09-08
SELF-RESOLVED state until a fresh TCP and driver read both pass.

### Fresh live-browser audit — 2026-09-10T11:02+05:30

The Vite frontend was started directly from `apps/web` on `127.0.0.1:5173` without reinstalling
dependencies. A real in-app browser then exercised three shipped surfaces using a non-secret local
test key. `/meeting-bot` rendered its explicit "Not live yet" disclosure and correctly stated that
all three joiners are stubs. `/ingest` changed state to `enter a URL first` after an empty submit.
`/whatsapp` moved from `Loading...` to `failed to load WhatsApp groups`; `/ask` enabled after a
question was entered, showed `Asking...`, then returned to enabled with `failed to ask`. The
browser reported zero console errors and two React Router v7 future-flag warnings. This proves the
frontend's degraded states remain interactive and honest during the outage; it does not satisfy
T-007 criterion 14 because neither API nor Mongo persistence ran.

Immediately before the browser run, fresh TCP probes again returned `False` for both
`13.202.206.101:27017` and `127.0.0.1:27018`; `com.docker.service` remained `Stopped`.

### Partial recovery — 2026-09-19

Main Mongo recovered during the 05:29 UTC heartbeat. A read-only MongoClient check with
`serverSelectionTimeoutMS: 5000`, `db.command({ping:1})`, and
`db.collection("sessions").countDocuments({})` against ONLY
`lkb_codex_work_20260909` returned `{"ping":1,"sessions":23}`.
The local API was restarted using `node --import tsx src/index.ts`, with
`MONGODB_DB=lkb_codex_work_20260909`, `PORT=3300`, and both localhost/127.0.0.1
frontend CORS origins. Output: `@lkb/api listening on :3300` (exec session 52107).
Maker browser smoke at `http://localhost:5173/sessions` showed 23 session links;
clicking In Focus #4 loaded its overview, 3 claims and 51 transcript turns.

**Answered (partial):** main-Mongo runtime dependency self-resolved on these checks.
This does NOT close the local WhatsApp endpoint or T-007 persistence requirement;
neither was tested in this recovery. No production writes, model calls, or auth
code changes were made. Independent recovery smoke is separate from formal unit PASS.

### Both endpoints responding — 2026-09-19, 06:08 UTC heartbeat

Fresh read-only checks returned remote work DB `{"ping":1,"sessions":23}` and
local `mongodb://127.0.0.1:27018` `{"localMongoPing":1}` using MongoClient with a
5-second server-selection bound and `admin.command({ping:1})` for the local endpoint.
Frontend `/sessions` and API `/health` both returned HTTP 200.

**Answered (connectivity only):** both recorded endpoints are currently reachable.
T-007 criterion 14 remains unverified: no WhatsApp application read, ingestion or
persistence test was performed. Connectivity must not be counted as workflow PASS.

### WhatsApp read surface recovered — 2026-09-19, 06:40 UTC heartbeat

Maker live-browser smoke at `http://localhost:5173/whatsapp` transitioned from
`Loading...` to one real tracked group with 3 tracked participants and an enabled
`Ingest into knowledge base` button. Existing authentication worked. The button was
NOT clicked. The page continues to disclose that topic/decision detection, duplicate
flagging and the review-before-publish queue are not built yet.
This extends the recovery evidence to the application's group-list read path only;
T-007 persistence and review lifecycle remain unverified/incomplete.

### lkb scope — Answered (2026-09-24, Mode B sweep shard 2 check)

The `lkb`-tenant scope of this gate is answered for the live product surface: D-028 (2026-09-24)
records Mongo `lkb`/tenant `toc` holding the webinar session, source, 80 turns, 3 speakers, 6 orgs,
15 topics and 94 `graph_edges`, with read-back queries answered live. This is a real write-and-read
round trip on the same host this gate opened against, so the `lkb` connectivity question is closed
going forward — cite D-028, not this gate, for future `lkb` reachability claims.

**Not closed by this:** T-007's WhatsApp persistence half. This sweep's shard 2 check reports the
WhatsApp Mongo endpoint (`whatsapp_msg`, same host family) reachable but returning an **empty**
database on 2026-09-24 — no linked WhatsApp account, so there is nothing to read yet. That is a
different blocker (account linking, not host/network reachability) and keeps T-007 criterion 14
open under its existing terms. Do not read the `lkb` answer above as closing WhatsApp too.

**Gate status:** ANSWERED — recorded inline: 2026-09-08 — SELF-RESOLVED (see the close-out note above). Left no longer pending.
