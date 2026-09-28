// @lkb/db — Mongo accessors. schema/ is the shape source of truth (@lkb/core); this
// package owns tenant-scoped access (ARCHITECTURE §5, T-018 C6).
export * from "./client.js";
export * from "./lib/tenantScope.js";
export * from "./collections/sources.js";
export * from "./collections/sessions.js";
export * from "./collections/turns.js";
export * from "./collections/claims.js";
export * from "./collections/session-pages.js";
export * from "./collections/eval-runs.js";
export * from "./collections/watched-sources.js";
export * from "./collections/gaps.js";
export * from "./collections/meeting-candidates.js";
export * from "./collections/trusted-senders.js";
// U-BRAIN [C1]: `GET /graph` reads the real `graph_edges` rows; the accessor existed since
// plan §10 U0.9 but was never exported, which is part of why no route could read them.
export * from "./collections/graph-edges.js";
// U2 source-watcher: dedup/idempotence record (watch_state) + per-run digest mirror
// (watch_reports) for scripts/watch/run-watch.mjs.
export * from "./collections/watch-state.js";
export * from "./collections/watch-reports.js";
// U4b/R2 (D-048): watcher liveness. Written by scripts/watch/run-watch.mjs at the end of each
// polling phase; read by apps/api/src/routes/health.ts's staleness detector, in a DIFFERENT
// process from the writer (a detector inside the writer dies with it).
export * from "./collections/watch-heartbeat.js";
