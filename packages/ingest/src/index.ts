// @lkb/ingest — T-020. Source adapter seam: source.ts (interface + consent gate), sources/
// (recording, document, url), registry.ts (detectSource). gap-tracking.ts (T-006) gives
// assertProvidedFirst warnings / join failures / fetch 404s a durable `gaps` doc. watched/
// (T-027) is the pure due-check + fetch-diff pair a future scheduler composes.
export * from "./source.js";
export * from "./registry.js";
export * from "./gap-tracking.js";

export * from "./sources/recording.js";
export * from "./sources/document.js";
export * from "./sources/url.js";
export * from "./sources/whatsapp.js";
export * from "./sources/gdrive.js";
export * from "./sources/toc-calendar.js";

export * from "./watched/schedule.js";
export * from "./watched/check.js";
export * from "./watched/run.js";

export { createGuardedFetcher, isBlockedAddress, isGuardedFetcher, GUARDED, type GuardedFetchDeps, type GuardedFetcher } from "./sources/guarded-fetch.js";
export { resolveAll, httpRequest, type HttpTransportResponse } from "./sources/node-transport.js";
