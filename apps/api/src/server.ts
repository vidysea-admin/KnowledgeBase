/**
 * apps/api/src/server.ts — T-009 C1. `createServer(deps)`: Express app, JSON body parsing,
 * auth -> per-key rate limit -> routes. Everything DB/LLM-backed is injected (`deps`) so tests
 * never touch Mongo or a real network/CLI call; `startServer` is the thin `listen()` wrapper
 * `production.ts` (the real Mongo + real-provider entrypoint) calls. Budget: <=80 LOC (own note).
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import type { ApiKeyStore } from "./auth.js";
import { requireAuth } from "./auth.js";
import { createAskRouter, type AskRouteDeps } from "./routes/ask/ask.js";
import { createAnswerPolicyRouter } from "./answer-policy/routes.js";
import { createGroundedContentDeps } from "./grounded-content/reader.js";
import { createGroundedContentRouter } from "./grounded-content/router.js";
import { createCompeteRouter, type EvalRunStore } from "./routes/compete/compete.js";
import { createCompetePageRouter } from "./routes/compete/compete-page.js";
import { createBrainRouter, type BrainReadDeps } from "./routes/brain.js";
import { createWatchedSourcesRouter, type WatchedSourceDeps } from "./routes/watched-sources.js";
import { createCitationsRouter, type CitationsDeps } from "./routes/citations.js";
import { createClaimsListRouter, unavailableClaimsListDeps, type ClaimsListDeps } from "./claims/router.js";
import { createHealthRouter, type HealthDeps } from "./routes/health.js";
import { createSetupStatusRouter } from "./activity-health/setup-status.js";
import { createSystemStatusRouter, unavailableSystemStatusDeps, type SystemStatusDeps } from "./routes/system-status.js";
import { createSearchRouter, type SearchDeps } from "./routes/search.js";
import { createRouteRouter, type RouteRouterOptions } from "./route/route-router.js";
import type { RouteDeps } from "./route/route-store.js";
import { createSemanticSearchRouter, type SemanticSearchDeps } from "./semantic-search/route.js";
import { createGraphRouter, type GraphReadDeps } from "./routes/graph.js";
import { createCalendarRouter, type CalendarReadDeps } from "./routes/calendar.js";
import { createJoinRulesRouter, unavailableJoinRulesRouter } from "./join-rules/router.js";
import type { JoinRulesDeps } from "./join-rules/deps.js";
import { createMeetingCandidatesRouter, type MeetingCandidatesDeps } from "./routes/meeting-candidates.js";
import { createWhatsAppRouter, type WhatsAppRouteDeps } from "./routes/whatsapp.js";
import { createKeysRouter, type KeysDeps } from "./routes/keys.js";
import { createIngestRouter, type IngestDeps } from "./routes/ingest.js";
import { createSourceIntakeRouter } from "./routes/ingest-source.js";
import type { SourceIntakeDeps } from "./source-intake/store.js";
import type { SourceJobStore } from './source-intake/jobs/types.js';
import { createPagesRouter } from "./routes/pages.js";
import { createStubsRouter } from "./routes/stubs.js";
import { createRateLimiter, type RateLimitOptions } from "./rate-limit.js";
import { createCors } from "./cors.js";
import { createJobsRouter, type JobsReadDeps } from "./jobs/router.js";
import { unavailableJobsReadDeps } from "./jobs/fixture-store.js";
import { createActivityHealthRouter, unavailableActivityHealthDeps } from "./activity-health/router.js";
import { createBotEventsRouter, unavailableBotEventsDeps, type BotEventsDeps } from "./bot-events/router.js";
import type { ActivityHealthDeps } from "./activity-health/types.js";
import { withFileQueueActivity, type FileQueueActivityDeps } from "./activity-health/file-queue-activity.js";
import { createNotificationsRouter } from "./activity-health/notifications.js";
import { createWatchRunsRouter, unavailableWatchRunsDeps, type WatchRunsDeps } from "./activity-health/watch-runs.js";
import { usageRecorder } from "./usage/recorder.js";
import { createUsageRouter, unavailableUsageReadDeps } from "./usage/router.js";
import type { UsageDeps } from "./usage/store.js";
import { createSpeakerSuggestionsRouter, unavailableSpeakerSuggestionDeps, type SpeakerSuggestionDeps } from "./speaker-suggestions/router.js";
import { createSpeakerProfilesRouter, unavailableSpeakerProfileDeps, type SpeakerProfileDeps } from "./speaker-profiles/router.js";
import { logger as defaultLogger, type Logger } from "./composition/logger.js";
import { requestLogger } from "./composition/request-log.js";
import { bodyParserErrorHandler } from "./composition/body-parser-error.js";
import { mountIntegratedWorkflows, type IntegratedWorkflows } from './composition/integrations/routes.js';
import { applyTrustProxy, mountUserAccounts, type UserAccountsDeps } from './composition/integrations/user-accounts.js';

export interface ServerDeps extends IntegratedWorkflows {
  keyStore: ApiKeyStore;
  ask: AskRouteDeps;
  evalRuns: EvalRunStore;
  brain: BrainReadDeps;
  watchedSources: WatchedSourceDeps;
  citations: CitationsDeps;
  /** T-007 read-only claims list. Optional: absent -> GET /claims answers 503 (fail closed). */
  claims?: ClaimsListDeps;
  health: HealthDeps;
  /** Tenant-scoped status counts for the signed-in caller; absent = fail closed (503). */
  systemStatus?: SystemStatusDeps;
  search: SearchDeps;
  /** D-206 vectorless GET /route (same auth/scope/shape as /search). Optional: absent -> route not mounted. */
  route?: RouteDeps;
  routeOptions?: RouteRouterOptions;
  /** T-008 semantic (vector) search. Optional + flag-gated (LKB_SEMANTIC_SEARCH=1): absent -> route not mounted, behaviour unchanged. */
  semanticSearch?: SemanticSearchDeps;
  graph: GraphReadDeps;
  calendar: CalendarReadDeps;
  meetingCandidates: MeetingCandidatesDeps;
  /** T-037 join-rules edit API. Optional: absent -> the routes answer 503 (fail closed). Production wiring pending. */
  joinRules?: JoinRulesDeps;
  whatsapp: WhatsAppRouteDeps;
  keys: KeysDeps;
  ingest: IngestDeps;
  /** T-045 `POST /ingest/source` (YouTube / OnAir / Zoom intake). Optional, OFF by default: absent -> the route is not mounted. */
  sourceIntake?: SourceIntakeDeps;
  sourceJobs?: SourceJobStore;
  jobs?: JobsReadDeps;
  activityHealth?: ActivityHealthDeps;
  /** Autojoin bot activity feed (GET /bot-events, scope jobs). Optional: absent -> 503 (fail closed). Wired by scripts/webinar/join-rules-api-host.ts. */
  botEvents?: BotEventsDeps;
  /** D-139/D-158: tenant-scoped dead jobs of the packages/core file queue (FileJobQueue.listDead), shown in /activity-health (source job-queue) and /notifications. Optional: absent -> unchanged. Production wiring pending (runner unwired). */
  fileQueue?: FileQueueActivityDeps;
  /** T-057 D2 watcher run history (GET /watch-runs, scope jobs). Optional: absent -> 503 (fail closed). */
  watchRuns?: WatchRunsDeps;
  /** T-057 D4 usage events: recorded after /ask and /search respond, read by GET /usage (scope jobs). Optional: absent -> nothing recorded, /usage 503. */
  usage?: UsageDeps;
  /** U2.4 suggested speaker names (D-141): list/confirm/reject. Optional: absent -> 503. */
  speakerSuggestions?: SpeakerSuggestionDeps;
  speakerProfiles?: SpeakerProfileDeps;
  rateLimit?: RateLimitOptions;
  /** D-206 user accounts (cookie sessions beside API keys). Optional: absent -> the cookie is ignored and `/auth`, `/admin` are not mounted. */
  userAccounts?: UserAccountsDeps;
  /** Number of reverse proxies in front of the API (UA-23). Default: env TRUST_PROXY_HOPS; unset/invalid -> none trusted. */
  trustProxyHops?: string;
  /** apps/web's real origin(s) in dev/prod (e.g. "http://localhost:5173") — no default, an
   * empty list means no cross-origin browser call succeeds, which is the safe default until a
   * caller explicitly opts a frontend origin in. */
  corsOrigins?: string[];
  /** D7 structured logger (JSON lines on stdout, redacted). Default: the process-wide logger; tests inject a capturing one. */
  logger?: Logger;
}

export function createServer(deps: ServerDeps): Express {
  const app = express();
  const log = deps.logger ?? defaultLogger;
  applyTrustProxy(app, deps.trustProxyHops ?? process.env.TRUST_PROXY_HOPS, log);
  app.use(requestLogger(log)); // first: every response (incl. body-parser/auth failures) gets X-Request-Id + an access line
  app.use(express.json({ limit: '1mb' }));
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
  mountUserAccounts(app, deps.userAccounts, deps.keyStore); // public /auth + self-authenticating /admin, BEFORE the shared perimeter
  app.use(requireAuth(deps.keyStore, deps.userAccounts?.session));
  app.use(createRateLimiter(deps.rateLimit));
  app.use(usageRecorder(deps.usage, log)); // T-057 D4: fire-and-forget, after the response; never fails or delays a request
  mountIntegratedWorkflows(app, deps);
  app.use(createUsageRouter(deps.usage ?? unavailableUsageReadDeps));
  app.use(createSystemStatusRouter(deps.systemStatus ?? unavailableSystemStatusDeps));
  app.use(createSetupStatusRouter()); // T-057 E4: booleans only, authenticated
  app.use(createAskRouter(deps.ask));
  app.use(createAnswerPolicyRouter(deps.ask));
  app.use(createCompeteRouter({ ...deps.ask, evalRuns: deps.evalRuns }));
  app.use(createSpeakerSuggestionsRouter(deps.speakerSuggestions ?? unavailableSpeakerSuggestionDeps));
  app.use(createSpeakerProfilesRouter(deps.speakerProfiles ?? unavailableSpeakerProfileDeps));
  app.use(createBrainRouter(deps.brain));
  app.use(createGroundedContentRouter(createGroundedContentDeps(deps.brain)));
  app.use(createJobsRouter(deps.jobs ?? unavailableJobsReadDeps));
  const activityHealth = deps.fileQueue ? withFileQueueActivity(deps.activityHealth ?? unavailableActivityHealthDeps, deps.fileQueue) : deps.activityHealth ?? unavailableActivityHealthDeps;
  app.use(createActivityHealthRouter(activityHealth));
  app.use(createBotEventsRouter(deps.botEvents ?? unavailableBotEventsDeps));
  app.use(createWatchRunsRouter(deps.watchRuns ?? unavailableWatchRunsDeps));
  // T-057 D5: read-only aggregation of the three sources above; no store of its own.
  app.use(createNotificationsRouter({ activityHealth, fileQueue: deps.fileQueue,
    jobs: deps.jobs ?? unavailableJobsReadDeps, watchRuns: deps.watchRuns ?? unavailableWatchRunsDeps }));
  app.use(createWatchedSourcesRouter(deps.watchedSources));
  app.use(createCitationsRouter(deps.citations));
  app.use(createClaimsListRouter(deps.claims ?? unavailableClaimsListDeps));
  app.use(createSearchRouter(deps.search));
  if (deps.route) app.use(createRouteRouter(deps.route, deps.routeOptions));
  if (deps.semanticSearch) app.use(createSemanticSearchRouter(deps.semanticSearch));
  app.use(createGraphRouter(deps.graph));
  app.use(createCalendarRouter(deps.calendar));
  app.use(deps.joinRules ? createJoinRulesRouter(deps.joinRules) : unavailableJoinRulesRouter());
  app.use(createMeetingCandidatesRouter(deps.meetingCandidates));
  app.use(createWhatsAppRouter(deps.whatsapp));
  app.use(createKeysRouter(deps.keys));
  app.use(createIngestRouter(deps.ingest));
  if (deps.sourceIntake) app.use(createSourceIntakeRouter(deps.sourceIntake, deps.sourceJobs));
  app.use(createStubsRouter());
  app.use(bodyParserErrorHandler(log)); // ISS-APILOGGER-001: body-parser errors: structured log, no body echo, production-identical response
  // Terminal handler (ISS-AUTHTENANT-002): an error with no HTTP status (e.g. a tenant guard throwing in a store) gets a fixed 500 body, never
  // Express's default stack page. Errors that carry a 4xx/5xx status (body-parser) still go to the default handler, unchanged.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const e = err as { status?: unknown; statusCode?: unknown } | null, s = e?.status ?? e?.statusCode;
    if (res.headersSent) { next(err); return; }
    if (typeof s === 'number' && s >= 400 && s < 600) {
      res.status(s).json({ error: s === 403 ? 'forbidden' : s === 401 ? 'unauthorized' : 'service_unavailable', message: 'service unavailable' });
      return;
    }
    (req.log ?? log).error("unhandled error", { err }); // server log only (stack stays out of the response)
    res.status(500).json({ error: "internal_error", message: "internal error" });
  });
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
