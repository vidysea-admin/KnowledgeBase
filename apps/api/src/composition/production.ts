/** Production composition: tenant-bound providers and durable stores behind authenticated routes. */
import { speakerSuggestEnabled } from "../indexing/speaker-suggest.js";
import { createMongoSystemStatusDeps } from "../system-status-store.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { complete as routeComplete, parseRoutingYaml, GeminiProvider, ClaudeCodeProvider, OllamaProvider, createOllamaCloudProviders, type Provider } from "@lkb/ai";
import { treeSearch } from "@lkb/index";
import { getDb, listHeartbeats, scopedCollection } from "@lkb/db";
import { createTelegramAlertSink } from "@lkb/core";
import type { ServerDeps } from "../server.js";
import type { WatchSilenceDeps } from "../routes/health.js";
import { createMongoApiKeyStore, createMongoEvalRunStore, createMongoJobWriter, createMongoTreeStore, createMongoBrainReadDeps,
  createMongoWatchedSourceDeps, createMongoCitationsDeps, createMongoHealthDeps, createMongoGraphReadDeps, createGwsCalendarReadDeps, createMeetingCandidatesDeps, createMongoKeysDeps } from "../store.js";
import { createMongoIngestDeps } from "../ingest-store.js";
import { buildSourceIntakeDeps } from "../source-intake/wiring.js";
import { createMongoSearchDeps } from "../search-store.js";
import { createRouteDeps } from "../route/route-store.js";
import { createSessionDecisionsDeps } from '../session-decisions/reader.js';
import type { WatchState } from "@lkb/core";
import { buildCalendarWorkerIntegrations, buildCapturePolicyIntegrations } from './integrations/capture-policy.js';
import { createMongoWhatsAppDeps } from "../whatsapp/store.js";
import { createConfiguredWhatsAppOwnerResolver } from "../whatsapp/owner-config.js";
import { realTransport } from "../ai-transport.js";
import { createLlmScorer } from "../score.js";
import { createGeminiWebSearchFn } from "../ask/ask-web-fallback.js";
import { indexSession, type BoundIndexer, type IndexSessionDeps } from "../indexing/session.js";
import type { IndexCommittedHook } from "../indexing/types.js";
import { composeGroundedPostProcessing, readGroundedJudgeCostLimit } from '../grounded-postprocessing/composition.js';
import { buildKnowledgeIntegrations } from './integrations/knowledge.js';
import { buildEvaluationIntegrations } from './integrations/evaluation.js';
import { buildAnswerIntegrations } from './integrations/answers.js';
import { buildHostingIntegrations } from './integrations/hosting.js';
import { buildTranscriptIntegrations } from './integrations/transcripts.js';
import { buildAutomationIntegrations } from './integrations/automation.js';
import { createHostBotPrivacyDeps } from '../bot-privacy/host-connector.js';
import { buildConfiguredSourceJobStore } from './integrations/source-jobs.js';
import { collectNotifications } from '../activity-health/notifications.js';
import { createHostCaptureReadinessDeps } from '../capture-readiness/host-connector.js';
import type { HostCaptureReadinessAdapter } from '../capture-readiness/types.js';
import { createAskArmsFor } from "../ask/ask-arms.js";
import { createSourceRequestDepsFor } from "../ask/source-context.js";
import { withSessionArtifacts } from "../routes/brain.js";
import { createMongoJobsReadDeps } from "../jobs/store.js";
import { createMongoUsageDeps } from "../usage/store.js";
import { createMongoSpeakerSuggestionDeps } from "../speaker-suggestions/store.js";
import { buildNativeProductionIntegrations } from "./integrations/native-production.js";
import { buildReviewIntegrations } from "./integrations/reviews.js";
import { createConfiguredPublicWebinarDiscovery } from "../gws/public-webinar-config.js";
import { createMongoWatchRunsDeps } from "../activity-health/watch-runs.js";
import { createMongoClaimsListDeps } from "../claims/store.js";
import { createConfiguredActivityHealthDeps } from "../activity-health/queue-reader.js";
import { createLazyDatabase, defineLazyProperties } from "./lazy-database.js";
import { resolveTileSuggest } from "./tile-suggest.js";

const ROUTING_CONFIG_PATH = fileURLToPath(new URL("../../../../config/ai-routing.yaml", import.meta.url));

/** D-048/D-053: health reads only configured WATCH_HEARTBEAT_TENANTS through tenant-scoped
 * DB accessors. The permitted core Telegram sink binds lazily; API cannot import meeting-bot. */
/** U4d (D-047/D-048): the ONE place `WATCH_HEARTBEAT_INTERVAL_MS` is parsed with its 1-hour
 * fallback — extracted out of `createMongoWatchSilenceDeps` (which used to inline this) so
 * `createMongoWatchStateReadDeps` below reads the exact same number instead of re-declaring the
 * fallback a third time (the first two are this file's former inline copy and
 * scripts/watch/lib/heartbeat.mjs's `watchHeartbeatIntervalMs`, pinned equal by
 * `health.test.ts`'s drift test). Writer, detector and now the page must all agree on one number,
 * or a watcher can look alive to one reader and dead to another. */
function watchHeartbeatIntervalMs(): number {
  const parsed = process.env.WATCH_HEARTBEAT_INTERVAL_MS ? Number(process.env.WATCH_HEARTBEAT_INTERVAL_MS) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 1000;
}

export function createMongoWatchSilenceDeps(): WatchSilenceDeps {
  const tenantIds = (process.env.WATCH_HEARTBEAT_TENANTS ?? "toc").split(",").map((t) => t.trim()).filter(Boolean);
  // U4b/R2 (D-053): a real alert transport, not a console sink. Construction reads env only
  // (token/chatId), matching this factory's lazy-binding style and production.test.ts's
  // "constructs without throwing or requiring a live network connection" guarantee -- the
  // actual HTTPS call happens only if/when notifyWatchSilent is invoked.
  const alertSink = createTelegramAlertSink();
  return {
    tenantIds,
    intervalMs: watchHeartbeatIntervalMs(),
    listHeartbeats: (tenantId) => listHeartbeats(tenantId),
    notifyWatchSilent: (tenantId, sourceType, lastHeartbeatAt, intervalMs) =>
      alertSink.notifyWatchSilent(tenantId, sourceType, lastHeartbeatAt, intervalMs),
  };
}

/** Public watcher metadata excludes private staging before the bounded query.
 * The interval stays shared with the watcher-silence detector. */
function createMongoWatchStateReadDeps() {
  return {
    listWatchState: (tenantId: string) => scopedCollection<WatchState>(getDb(), "watch_state")(tenantId).find({workerSnapshot: {$exists: false}, workerReceipt: {$exists: false}}).sort({seenAt: -1}).limit(200).toArray(),
    listHeartbeats: (tenantId: string) => listHeartbeats(tenantId),
    heartbeatIntervalMs: watchHeartbeatIntervalMs(),
  };
}
/** `write` for the router's own per-attempt ledger entries — a tenant isn't known until a
 * request resolves one, so router-level attempts (as opposed to askV2's own writes, which do
 * carry the real per-request tenantId) are logged under this fixed system id. */
const ROUTER_TENANT_ID = "system";

/**
 * The real routing wiring — parsed chains, registered providers, and the Mongo job ledger.
 *
 * Exported (U1.0 backfill) so an offline job gets the SAME chain config and the SAME provider set
 * as the running server. A script that re-registered its own providers would be a second
 * definition free to drift from this one, and the comment below is a standing reminder that the
 * membership of `providers` is load-bearing, not incidental.
 */
export function buildRouting(): {
  chains: ReturnType<typeof parseRoutingYaml>;
  providers: Record<string, Provider>;
  jobWrite: ReturnType<typeof createMongoJobWriter>;
} {
  const chains = parseRoutingYaml(readFileSync(ROUTING_CONFIG_PATH, "utf8"));
  const jobWrite = createMongoJobWriter();

  // Real bug found in this session's own senior-engineer review (2026-09-06): `router.route()`
  // eagerly resolves EVERY name in a jobKind's chain to a registered Provider before trying any
  // of them (packages/ai/src/router.ts:38-42) -- an unregistered chain member throws before the
  // first (working) provider is ever attempted. `summarize`'s chain (config/ai-routing.yaml)
  // lists `ollama` third; leaving it unregistered here meant every real `summarizeSession` call
  // threw immediately and silently degraded to its own fallback, even though gemini alone would
  // have succeeded. Registering the already-built (D-008, "Ollama is a required adapter from the
  // outset") `OllamaProvider` fixes this for every chain that lists it (`summarize`, `answer`),
  // not just a targeted patch for the one job kind that happened to be caught.
  const providers: Record<string, Provider> = {
    gemini: new GeminiProvider(realTransport, { apiKey: process.env.GEMINI_API_KEY ?? "" }),
    "claude-code": new ClaudeCodeProvider(realTransport),
    ...createOllamaCloudProviders(realTransport, {
      apiKey: process.env.OLLAMA_API_KEY ?? "",
      baseUrl: process.env.OLLAMA_CLOUD_BASE_URL,
      primaryModel: process.env.OLLAMA_CLOUD_MODEL,
      verifierModel: process.env.OLLAMA_CLOUD_VERIFIER_MODEL,
    }),
  };
  // Speaker-segment-identity gate (Option A, phase 2, answered 2026-09-21): the speakers
  // jobKind is pinned to the LOCAL chain and its model is the gate's frozen qwen3:8b digest,
  // with deterministic sampling (temperature 0, fixed seed). No env override silently swaps in a
  // public model for identity adjudication; changing the pin is a gate-level change.
  providers.ollama = new OllamaProvider(realTransport, {
    baseUrl: process.env.OLLAMA_BASE_URL,
    // The gate's frozen local model; deterministic sampling is passed per-job by the speakers
    // route, not here (other jobKinds on the ollama chain keep their own defaults).
    model: process.env.SPEAKERS_OLLAMA_MODEL ?? "qwen3:8b",
  });
  return { chains, providers, jobWrite };
}

/**
 * Bind the tenant-scoped indexer used by ingest and capture consumers.
 *
 * Exported (ISS-296) for the same reason `buildRouting` is: `scripts/webinar/sync-session.mjs
 * --index` must index a bot-captured session through EXACTLY the binding the server's ingest
 * routes use, not a second copy of it that could drift.
 */
/** U2.4 / D-141: an explicit caller choice wins; otherwise OFF unless KB_SPEAKER_SUGGEST=1. */
export function resolveSuggestSpeakers(option?: boolean, env: Record<string, string | undefined> = process.env): boolean {
  return option ?? speakerSuggestEnabled(env);
}

/** T-040 (D-162): grounded notes + Q&A with the note judge. An explicit caller choice wins; otherwise OFF unless KB_GROUNDED_NOTES=1. */
export function resolveGroundedNotes(option?: boolean, env: Record<string, string | undefined> = process.env): boolean {
  return option ?? env.KB_GROUNDED_NOTES === "1";
}

/** Optional per-session judge cost cap (USD) from KB_NOTE_JUDGE_MAX_USD; anything not a finite number >= 0 is ignored. */
export function resolveJudgeMaxCostUsd(env: Record<string, string | undefined> = process.env): number | undefined {
  return readGroundedJudgeCostLimit(env);
}

export function buildIndexer(routing: ReturnType<typeof buildRouting> = buildRouting(), options: { strictWebinar?: boolean; suggestSpeakers?: boolean; groundedNotes?: boolean; db?: IndexSessionDeps['db']; onIndexCommitted?: IndexCommittedHook } = {}): BoundIndexer {
  const { chains, providers, jobWrite } = routing;
  const grounded = resolveGroundedNotes(options.groundedNotes);
  return (tenantId, sessionId) => {
    const complete: IndexSessionDeps['complete'] = job => routeComplete(job.kind, job, { chains, providers, write: jobWrite, tenantId });
    return indexSession(tenantId, sessionId, {
      ...composeGroundedPostProcessing(complete, { strictWebinar: options.strictWebinar, groundedNotes: grounded, judgeMaxCostUsd: resolveJudgeMaxCostUsd() }),
      ...(options.db ? { db: options.db } : {}),
      onIndexCommitted: options.onIndexCommitted,
      // U2.4 / D-141: speaker NAME SUGGESTIONS (never final), OFF unless KB_SPEAKER_SUGGEST=1 or the caller opts in. Uses the `speakers` route.
      suggestSpeakers: resolveSuggestSpeakers(options.suggestSpeakers),
      tileSuggest: resolveTileSuggest(), // T-042: LKB_TILE_SUGGEST=1 only; fenced; context absent = no-op
      retrievalMode: "vectorless",
      complete,
      // D-173: active ingestion never requests embeddings, even with a stale config/flag.
    });
  };
}

export function buildProductionDeps(options: { onIndexCommitted?: IndexCommittedHook; captureReadinessHost?: HostCaptureReadinessAdapter; calendarWorkerDatabase?: Parameters<typeof buildCalendarWorkerIntegrations>[0]["db"] } = {}): ServerDeps {
  const db = createLazyDatabase(getDb);
  const worker = buildCalendarWorkerIntegrations({db: options.calendarWorkerDatabase ?? db, env: process.env});
  const routing = buildRouting();
  const publicWebinars = createConfiguredPublicWebinarDiscovery(process.env.LKB_PUBLIC_WEBINAR_TENANT, process.env.LKB_PUBLIC_WEBINAR_SOURCES);
  const capturePolicy = buildCapturePolicyIntegrations({root: fileURLToPath(new URL("../../../../", import.meta.url)), env: process.env});
  const { chains, providers, jobWrite } = routing;

  const tavilySearchFn = createGeminiWebSearchFn();

  const boundIndexer = buildIndexer(routing, options);
  const native = buildNativeProductionIntegrations(db);

  const deps: ServerDeps = {
    keyStore: createMongoApiKeyStore(),
    evalRuns: createMongoEvalRunStore(),
    brain: withSessionArtifacts({...createMongoBrainReadDeps(), ...(worker ? {listWebinarOperations: worker.listWebinarOperations} : {})}, fileURLToPath(new URL("../../../../", import.meta.url))),
    citations: createMongoCitationsDeps(),
    claims: createMongoClaimsListDeps(),
    // U4b/R2: the same Mongo health deps as before, plus the injected watcher-silence detector.
    health: { ...createMongoHealthDeps(), watchSilence: createMongoWatchSilenceDeps() },
    systemStatus: createMongoSystemStatusDeps(),
    // U4d: the same A13 watched-sources deps as before, plus the watch_state/watch_heartbeat read
    // surface GET /watch-state serves (routes/watched-sources.ts).
    watchedSources: { ...createMongoWatchedSourceDeps(), ...createMongoWatchStateReadDeps() },
    search: createMongoSearchDeps({ nativeEvidence: native.resolver }),
    route: createRouteDeps({ tree: createMongoTreeStore(native.resolver), complete: (job, tenantId) => routeComplete("ask", job, { chains, providers, write: jobWrite, tenantId }) }), // D-206 vectorless /route
    // D-173: dormant semantic routes cannot be enabled through an old environment flag.
    semanticSearch: undefined,
    graph: createMongoGraphReadDeps(),
    calendar: worker?.calendar ?? createGwsCalendarReadDeps(),
    meetingCandidates: { ...createMeetingCandidatesDeps(undefined, undefined, undefined, undefined, worker?.listGmailCandidates, worker || process.env.LKB_JOIN_RULES_ENABLED === "1" ? {joinRules: capturePolicy.joinRules, ownedDomains: worker?.ownedDomains, gmailSummary: worker?.gmailSummary} : undefined), ...(publicWebinars.configured ? { discoverPublicWebinars: publicWebinars.discover } : {}) },
    whatsapp: createMongoWhatsAppDeps(boundIndexer, { resolveOwner: createConfiguredWhatsAppOwnerResolver(process.env.WHATSAPP_TENANT_OWNER_MAP) }),
    keys: createMongoKeysDeps(),
    ingest: createMongoIngestDeps(boundIndexer),
    // T-045: OFF unless LKB_SOURCE_INTAKE=1 (route absent otherwise); see source-intake-wiring.ts.
    sourceIntake: buildSourceIntakeDeps(process.env, boundIndexer),
    jobs: createMongoJobsReadDeps(),
    activityHealth: createConfiguredActivityHealthDeps(),
    watchRuns: createMongoWatchRunsDeps(),
    usage: createMongoUsageDeps(),
    speakerSuggestions: createMongoSpeakerSuggestionDeps(),
    // CORS_ORIGINS is a comma-separated allowlist (e.g. "http://localhost:5173" in dev, the real
    // apps/web deployment origin in prod) — no default beyond "" -> empty list, matching
    // server.ts's safe-by-default stance.
    // Keep localhost and 127.0.0.1 in sync when one is configured, so local dev URLs
    // remain functional regardless of how the page is opened.
    corsOrigins: (() => {
      const parsed = (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const expanded = new Set(parsed);
      for (const origin of parsed) {
        if (origin.endsWith("://localhost:5173")) {
          expanded.add(origin.replace("localhost", "127.0.0.1"));
        }
        if (origin.endsWith("://127.0.0.1:5173")) {
          expanded.add(origin.replace("127.0.0.1", "localhost"));
        }
      }
      return [...expanded];
    })(),
    ask: {
      tree: createMongoTreeStore(native.resolver),
      requestDepsFor: createSourceRequestDepsFor({
        dispatch: (job, tenantId) => routeComplete(job.kind === "evaluator" ? "evaluator" : "ask", job, { chains, providers, write: jobWrite, tenantId }),
        treeSearchFn: treeSearch, tavilySearchFn, write: jobWrite,
        graph: native.graph, nativeSources: native.nativeSources, vectorless: true,
      }),
      // U1.5 C6: a FACTORY. There is no tenant at this point in the process, so there is nothing
      // here that could correctly bind the arms — routes/ask.ts calls this with the verified key's
      // tenantId, per request.
      extraCandidateArmsFor: createAskArmsFor({}),
      askDeps: {
        complete: (job) => routeComplete("ask", job, { chains, providers, write: jobWrite, tenantId: ROUTER_TENANT_ID }),
        // T-009b: real LLM judge by default; createLlmScorer falls back to the keyword heuristic
        // internally on a parse failure or AllProvidersFailedError — /ask never crashes on this.
        scoreFn: createLlmScorer(
          (job) => routeComplete("evaluator", job, { chains, providers, write: jobWrite, tenantId: ROUTER_TENANT_ID }),
        ),
        treeSearchFn: treeSearch,
        // ISS-010 / ISS-274 / D-202: ALWAYS wired. createGeminiWebSearchFn() (ask-web-fallback.ts)
        // is Gemini + Google Search grounding on GEMINI_API_KEY (Tavily is no longer called). It never
        // returns undefined: without a key it returns a function that throws TavilyUnavailableError, so
        // every off-corpus question reaches the web-fallback seam (D-041 ruling 2) and the ask graph's
        // catch logs the honest "unavailable" degradation. The dep keeps its name `tavilySearchFn`.
        tavilySearchFn,
        write: jobWrite,
      },
    },
  };
  if (worker) {
    const workerHeartbeats = (tenantId: string) => listHeartbeats(tenantId).then(rows => worker.mergeHeartbeats(tenantId, rows));
    deps.watchedSources.listHeartbeats = workerHeartbeats;
    deps.watchedSources.workerHealth = worker.workerHealth;
    if (deps.health.watchSilence) deps.health.watchSilence.listHeartbeats = workerHeartbeats;
  }
  const sourceJobs = buildConfiguredSourceJobStore(process.env);
  const reviews = buildReviewIntegrations(db, process.env);
  const input = { db, env: process.env, root: fileURLToPath(new URL('../../../../', import.meta.url)),
    index: boundIndexer, ask: deps.ask, sourceIntake: deps.sourceIntake, sourceJobs, routing, nativeEvidence: native.resolver,
    onIndexCommitted: options.onIndexCommitted };
  const knowledge = buildKnowledgeIntegrations(input);
  if (knowledge.knowledge) knowledge.knowledge.nativeDocuments = native.headStore;
  const evaluation = () => buildEvaluationIntegrations(input);
  const answers = () => buildAnswerIntegrations(input);
  const transcripts = () => buildTranscriptIntegrations(input);
  const hosting = buildHostingIntegrations({ ...input, keyStore: deps.keyStore, keys: deps.keys,
    notifications: tenant => collectNotifications({ activityHealth: deps.activityHealth!, jobs: deps.jobs!, watchRuns: deps.watchRuns!, fileQueue: deps.fileQueue }, tenant, 50) });
  const automation = buildAutomationIntegrations({ ...input, hosting: hosting.hosting });

  const botPrivacy = process.env.LKB_CAPTURE_CONTROL_DIR ? createHostBotPrivacyDeps(process.env.LKB_CAPTURE_CONTROL_DIR) : undefined;
  const captureReadiness = hosting.hosting && input.env.LKB_CAPTURE_SLOTS && input.env.LKB_TENANT_ID && options.captureReadinessHost
    ? createHostCaptureReadinessDeps({ root: input.root, env: input.env, hosting: hosting.hosting.service, host: options.captureReadinessHost }) : undefined;
  const result: ServerDeps = { ...deps, ...knowledge, ...hosting, ...automation, ...capturePolicy, ...reviews, botPrivacy, captureReadiness, sourceJobs, nativeEvidence: native.resolver,
    sessionDecisions: createSessionDecisionsDeps(deps.brain, db),
    ask: { ...deps.ask, get answerWorkflow() { return answers().answerWorkflow; } } };
  return defineLazyProperties(result, {
    championship: () => evaluation().championship,
    calibrationReview: () => evaluation().calibrationReview,
    evaluationFlywheel: () => evaluation().evaluationFlywheel,
    answerWorkflow: () => answers().answerWorkflow,
    answerPolicyService: () => answers().answerPolicyService,
    knowledgeOutputs: () => answers().knowledgeOutputs,
    transcriptReview: () => transcripts().transcriptReview,
  });
}
