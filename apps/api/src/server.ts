/**
 * apps/api/src/server.ts — T-009 C1. `createServer(deps)`: Express app, JSON body parsing,
 * auth -> per-key rate limit -> routes. Everything DB/LLM-backed is injected (`deps`) so tests
 * never touch Mongo or a real network/CLI call; `startServer` is the thin `listen()` wrapper
 * `production.ts` (the real Mongo + real-provider entrypoint) calls. Budget: <=80 LOC (own note).
 */
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { ApiKeyStore } from "./auth.js";
import { requireAuth } from "./auth.js";
import { createAskRouter, type AskRouteDeps } from "./routes/ask.js";
import { createCompeteRouter, type EvalRunStore } from "./routes/compete.js";
import { createCompetePageRouter } from "./routes/compete-page.js";
import { createBrainRouter, type BrainReadDeps } from "./routes/brain.js";
import { createWatchedSourcesRouter, type WatchedSourceDeps } from "./routes/watched-sources.js";
import { createCitationsRouter, type CitationsDeps } from "./routes/citations.js";
import { createHealthRouter, type HealthDeps } from "./routes/health.js";
import { createSearchRouter, type SearchDeps } from "./routes/search.js";
import { createGraphRouter, type GraphReadDeps } from "./routes/graph.js";
import { createCalendarRouter, type CalendarReadDeps } from "./routes/calendar.js";
import { createMeetingCandidatesRouter, type MeetingCandidatesDeps } from "./routes/meeting-candidates.js";
import { createWhatsAppRouter, type WhatsAppRouteDeps } from "./routes/whatsapp.js";
import { createKeysRouter, type KeysDeps } from "./routes/keys.js";
import { createIngestRouter, type IngestDeps } from "./routes/ingest.js";
import { createPagesRouter } from "./routes/pages.js";
import { createStubsRouter } from "./routes/stubs.js";
import { createRateLimiter, type RateLimitOptions } from "./rate-limit.js";
import { createCors } from "./cors.js";
import { createJobsRouter, type JobsReadDeps } from "./jobs/router.js";
import { unavailableJobsReadDeps } from "./jobs/fixture-store.js";
import { createActivityHealthRouter, unavailableActivityHealthDeps } from "./activity-health/router.js";
import type { ActivityHealthDeps } from "./activity-health/types.js";

export interface ServerDeps {
  keyStore: ApiKeyStore;
  ask: AskRouteDeps;
  evalRuns: EvalRunStore;
  brain: BrainReadDeps;
  watchedSources: WatchedSourceDeps;
  citations: CitationsDeps;
  health: HealthDeps;
  search: SearchDeps;
  graph: GraphReadDeps;
  calendar: CalendarReadDeps;
  meetingCandidates: MeetingCandidatesDeps;
  whatsapp: WhatsAppRouteDeps;
  keys: KeysDeps;
  ingest: IngestDeps;
  jobs?: JobsReadDeps;
  activityHealth?: ActivityHealthDeps;
  rateLimit?: RateLimitOptions;
  /** apps/web's real origin(s) in dev/prod (e.g. "http://localhost:5173") — no default, an
   * empty list means no cross-origin browser call succeeds, which is the safe default until a
   * caller explicitly opts a frontend origin in. */
  corsOrigins?: string[];
}

export function createServer(deps: ServerDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(createCors(deps.corsOrigins ?? []));
  // Every *-page.ts route is static markup carrying no data of its own (its own JS/server-side
  // render is what attaches the API key to each fetch) -- mounted BEFORE requireAuth, or a plain
  // browser navigation (which never sends a custom Authorization header) 401s before the HTML
  // that would even prompt for a key ever loads. Real bug found live (2026-09-04) on /compete;
  // the same reasoning now covers every UI page. Every JSON/data route stays behind auth, with
  // ONE deliberate exception: /health (an ops liveness probe should not need a scoped key), which
  // is safe to expose unauthenticated because it returns only aggregate cross-tenant counts,
  // never tenant-scoped content.
  app.use(createCompetePageRouter());
  app.use(createPagesRouter());
  app.use(createHealthRouter(deps.health));
  app.use(requireAuth(deps.keyStore));
  app.use(createRateLimiter(deps.rateLimit));
  app.use(createAskRouter(deps.ask));
  app.use(createCompeteRouter({ ...deps.ask, evalRuns: deps.evalRuns }));
  app.use(createBrainRouter(deps.brain));
  app.use(createJobsRouter(deps.jobs ?? unavailableJobsReadDeps));
  app.use(createActivityHealthRouter(deps.activityHealth ?? unavailableActivityHealthDeps));
  app.use(createWatchedSourcesRouter(deps.watchedSources));
  app.use(createCitationsRouter(deps.citations));
  app.use(createSearchRouter(deps.search));
  app.use(createGraphRouter(deps.graph));
  app.use(createCalendarRouter(deps.calendar));
  app.use(createMeetingCandidatesRouter(deps.meetingCandidates));
  app.use(createWhatsAppRouter(deps.whatsapp));
  app.use(createKeysRouter(deps.keys));
  app.use(createIngestRouter(deps.ingest));
  app.use(createStubsRouter());
  return app;
}

/**
 * Default port is **3300**, not 3000 (D-024).
 *
 * Every other component in this repo already assumed 3300 — `apps/web/.env.development`'s
 * `VITE_API_BASE_URL`, `scripts/demo-live.mjs`'s `--api` default, and `scripts/live-verify.mjs`.
 * Only this line said 3000, so starting the API the documented way produced a web app whose every
 * call failed `ERR_CONNECTION_REFUSED` and a dashboard reading "failed to load dashboard data"
 * with 9 console errors.
 *
 * No unit test could see it: both sides were individually correct, and nothing threw. It was found
 * the first time anyone opened a browser, which is the whole argument for D-024's rule.
 */
export function startServer(deps: ServerDeps, port: number = Number(process.env.PORT ?? 3300)): Server {
  const server = createServer(deps).listen(port);
  server.once("close", () => { void deps.activityHealth?.close?.().catch(() => undefined); });
  return server;
}
