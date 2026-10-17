# Watched native-server lifecycle join — maker fragment

managed-review/1; unit watched-native-server-join, cycle 0, new integration seam with
zero prior PASSes. Root C:/Users/product/Desktop/KnowledgeBase; base HEAD
d50a25c200dcbcf574ecade0aa205f5fcb45c5f8; uncommitted candidate SHA unknown.
Explicit central/root broker RELEASE received before any source mutation. Two exact
leased paths only: existing scripts/native-capture/server.ts and NEW server-watched.test.ts.
Raw server.ts preimage is backups/server.ts; source/dependency hashes and counts packet.json.
Unrelated dirty/index state and every prior broker receipt were preserved.

Behavior: native startup retains connect -> archive service -> one bounded drain -> deps
-> HTTP listen. Only exact LKB_WATCHED_WORKER_ENABLED=1 requires the existing connector
workflow and starts the statically imported real watched supervisor. It waits for actual
HTTP listening before any supervisor tick. Default/nonexact opt-ins do not invoke it,
read its key or create its timer. Missing enabled workflow refuses before listen.

A WeakMap owns each returned HTTP server's AbortController, supervisor task, explicit
onStop callback and cached stop promise. stopNativeServer aborts and awaits initialized
work before HTTP close, invokes onStop once, and is idempotent. Pending listen abort
removes listeners without launching a tick. Supervisor task and logging failures are
caught with fixed messages; arbitrary provider/key/error content is never logged.
SIGINT/SIGTERM hooks are installed only in the CLI entrypoint, not on import/library use.

Mongo ownership: library and CLI onStop defaults are noops. connect() may reuse a foreign
singleton, so successful connection never authorizes disconnect. An explicitly supplied
caller-owned disposer is the sole additional cleanup seam; no lifecycle/schema ownership
expansion. HTTP/supervisor stop does not promise that shared Mongo handles/processes exit.

Actual imported supervisor/host is exercised by two authored join tests using a genuine
guarded fetcher with controlled zero-source stores. Verified stored auth determines the
tenant even with a foreign configured tenant; an in-flight key/tick blocks HTTP close until
released. Other tests cover exact disabled passivity, idempotent disposal, fixed auth/task
failure logs (including throwing logger), pre-listen stop, absent workflow and untouched
foreign/shared database/HTTP handles. No actual Mongo, sockets, fetch/provider or timers
are needed for the controlled active-tick paths; these are software fixtures, not live data.

Required sole-broker replay: existing scripts/native-capture/server.test.ts (6) and new
server-watched.test.ts (6), including actual startup/auth/shutdown; upstream watched host
7 and durable watched-job consumer 5, with exact source-identical prior receipts reusable
only if broker policy permits. Affected explicit root type coverage, full import graph
and scoped LOC/directory checks remain required. No blanket native FFmpeg/genuine/EXIT
replay is justified by this launcher-only join. Existing host7/job5 gates never replace
the new actual join tests. Exact frozen watched dependencies are pinned in packet.json;
full upstream policy/contract evidence is ../../watched-cadence/packet.md relative to the
resume root's native-next-maker directory (resolve from repo if viewing this fragment).

No tests/build/DB/ACL/provider/browser/decoder executed by maker. No PASS/readiness or
efficiency claim. token_metric actual_total; actual maker tokens/active seconds/cost are
null/unknown. Independent checking and live source/worker/deployment gates remain open.
