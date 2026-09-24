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
