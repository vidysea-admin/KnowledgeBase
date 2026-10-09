/**
 * apps/api/src/production.ts — T-009 C3. Assembles the REAL `ServerDeps` `server.ts` needs:
 * `@lkb/index`'s real `treeSearch`, T-019's real provider `complete` routed via
 * `config/ai-routing.yaml`'s `ask` chain (this task adds that line — no `ask` jobKind existed
 * before it), Mongo-backed key/tree/job stores (`store.ts`), and the real `Transport`
 * (`ai-transport.ts`). Kept out of `server.ts` so that file stays <=80 LOC and injectable-only.
 * Never imported by tests.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { complete as routeComplete, embed as routeEmbed, parseRoutingYaml, GeminiProvider, ClaudeCodeProvider, OllamaProvider, type Provider } from "@lkb/ai";
import { treeSearch } from "@lkb/index";
import { listHeartbeats, listWatchState } from "@lkb/db";
import { createTelegramAlertSink } from "@lkb/core";
import type { ServerDeps } from "./server.js";
import type { WatchSilenceDeps } from "./routes/health.js";
import { createMongoApiKeyStore, createMongoEvalRunStore, createMongoJobWriter, createMongoTreeStore, createMongoBrainReadDeps,
  createMongoWatchedSourceDeps, createMongoCitationsDeps, createMongoHealthDeps, createMongoGraphReadDeps, createGwsCalendarReadDeps, createMeetingCandidatesDeps, createMongoKeysDeps } from "./store.js";
import { createMongoIngestDeps } from "./ingest-store.js";
import { createMongoSearchDeps } from "./search-store.js";
import { createMongoWhatsAppDeps } from "./whatsapp-store.js";
import { realTransport } from "./ai-transport.js";
import { createLlmScorer } from "./score.js";
import { createTavilySearchFn } from "./ask-web-fallback.js";
import { indexSession, type BoundIndexer } from "./indexing/session.js";
import { createAskArmsFor } from "./ask-arms.js";
import { createSourceRequestDepsFor } from "./ask/source-context.js";
import { withSessionArtifacts } from "./routes/brain.js";
import { createMongoJobsReadDeps } from "./jobs/store.js";

const ROUTING_CONFIG_PATH = fileURLToPath(new URL("../../../config/ai-routing.yaml", import.meta.url));

/** U4b/R2 (D-048): the real, Mongo-backed watcher-silence detector `/health` runs on every probe.
 * Lives here rather than in `store.ts` for a measured reason — `store.ts` is at 299 non-blank lines
 * against a 300 budget (`structure.config.json` loc.max), so any wiring added there fails
 * `lint-loc`; this file is the other "real deps" home and already does env-driven wiring (see
 * `corsOrigins` below).
 *
 * Tenancy: `tenantIds` comes from `WATCH_HEARTBEAT_TENANTS` (default "toc", the tenant
 * run-watch.mjs writes as) — CONFIG, never the request, because `/health` is unauthenticated and has
 * no caller to derive a tenant from. Each read goes through `@lkb/db`'s `listHeartbeats`, i.e.
 * `scopedCollection()`, so it is `withTenant`-merged per tenant and never a cross-tenant scan.
 *
 * `notifyWatchSilent` is now `@lkb/core`'s `createTelegramAlertSink` (packages/core/src/alerts/
 * alert-sink.ts), U4b/R2's D-053 resolution of the boundary noted below: `.dependency-
 * cruiser.cjs`'s `apps-only-ask-ingest-index-ai-db-core` rule forbids `apps/* ->
 * packages/meeting-bot`, so this file cannot import `createTelegramNotifier` directly (only
 * scripts/ can, which is how run-watch.mjs does it). `createTelegramAlertSink` is a SEPARATE,
 * independent Telegram sender living in the already-permitted `packages/core`, satisfying the
 * same `AlertSink`/`notifyWatchSilent` shape `packages/meeting-bot`'s `TelegramNotifier` already
 * does by signature — see alert-sink.ts's own doc comment for why this is two implementations,
 * not a shared one, and why that is disclosed rather than hidden. */
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

/** U4d (D-047/ISS-361/ISS-358): read-only `watch_state`/`watch_heartbeat` deps merged into
 * `ServerDeps.watchedSources` below, alongside the A13 create/listActive/run trio
 * (`routes/watched-sources.ts`). Both accessors are the SAME tenant-scoped `@lkb/db` functions R1's
 * alert (`markWatchState`) and R2's detector (`listHeartbeats` above) already read/write, and
 * `heartbeatIntervalMs` is the SAME number the detector uses — so the `/watch` page can never show
 * a watcher as healthy that `/health` would already have alerted on as silent. Lives here rather
 * than in `store.ts` for the same measured reason `createMongoWatchSilenceDeps` does: `store.ts` is
 * at 299/300 non-blank lines with no room, and this file already does this exact kind of env-driven
 * composition-root wiring. */
function createMongoWatchStateReadDeps() {
  return {
    listWatchState: (tenantId: string) => listWatchState(tenantId),
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
    ollama: new OllamaProvider(realTransport, { baseUrl: process.env.OLLAMA_BASE_URL }),
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
 * Real "make ingested content searchable" step (ISS: summarize/claims/tree_index were declared
 * job kinds with no implementation until now — see indexing.ts). Bound once so every ingest
 * composition root only ever calls `(tenantId, sessionId) => Promise<void>`.
 *
 * Exported (ISS-296) for the same reason `buildRouting` is: `scripts/webinar/sync-session.mjs
 * --index` must index a bot-captured session through EXACTLY the binding the server's ingest
 * routes use, not a second copy of it that could drift.
 */
export function buildIndexer(routing: ReturnType<typeof buildRouting> = buildRouting(), options: { strictWebinar?: boolean } = {}): BoundIndexer {
  const { chains, providers, jobWrite } = routing;
  return (tenantId, sessionId) =>
    indexSession(tenantId, sessionId, {
      strictWebinar: options.strictWebinar,
      complete: (job) => routeComplete(job.kind, job, { chains, providers, write: jobWrite, tenantId }),
      // Wired only when a chain is configured for it (U1.3). Passing an embedder unconditionally
      // would make every index run fail on an install with no embedding provider, where today it
      // simply indexes without a vector layer — `indexSession` treats the absent dep as "skip
      // chunks" rather than as an error.
      embed: chains.embedding
        ? (job) => routeEmbed("embedding", job, { chains, providers, write: jobWrite, tenantId })
        : undefined,
    });
}

export function buildProductionDeps(): ServerDeps {
  const routing = buildRouting();
  const { chains, providers, jobWrite } = routing;

  const tavilySearchFn = createTavilySearchFn();

  const boundIndexer = buildIndexer(routing);

  return {
    keyStore: createMongoApiKeyStore(),
    evalRuns: createMongoEvalRunStore(),
    brain: withSessionArtifacts(createMongoBrainReadDeps(), fileURLToPath(new URL("../../../", import.meta.url))),
    citations: createMongoCitationsDeps(),
    // U4b/R2: the same Mongo health deps as before, plus the injected watcher-silence detector.
    health: { ...createMongoHealthDeps(), watchSilence: createMongoWatchSilenceDeps() },
    // U4d: the same A13 watched-sources deps as before, plus the watch_state/watch_heartbeat read
    // surface GET /watch-state serves (routes/watched-sources.ts).
    watchedSources: { ...createMongoWatchedSourceDeps(), ...createMongoWatchStateReadDeps() },
    search: createMongoSearchDeps(),
    graph: createMongoGraphReadDeps(),
    calendar: createGwsCalendarReadDeps(),
    meetingCandidates: createMeetingCandidatesDeps(),
    whatsapp: createMongoWhatsAppDeps(boundIndexer),
    keys: createMongoKeysDeps(),
    ingest: createMongoIngestDeps(boundIndexer),
    jobs: createMongoJobsReadDeps(),
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
      tree: createMongoTreeStore(),
      requestDepsFor: createSourceRequestDepsFor({
        dispatch: (job, tenantId) => routeComplete(job.kind === "evaluator" ? "evaluator" : "ask", job, { chains, providers, write: jobWrite, tenantId }),
        embed: chains.embedding ? (job) => routeEmbed("embedding", job, { chains, providers, write: jobWrite, tenantId: ROUTER_TENANT_ID }) : undefined,
        treeSearchFn: treeSearch, tavilySearchFn, write: jobWrite,
      }),
      // U1.5 C6: a FACTORY. There is no tenant at this point in the process, so there is nothing
      // here that could correctly bind the arms — routes/ask.ts calls this with the verified key's
      // tenantId, per request.
      extraCandidateArmsFor: createAskArmsFor({
        embed: chains.embedding
          ? (job) => routeEmbed("embedding", job, { chains, providers, write: jobWrite, tenantId: ROUTER_TENANT_ID })
          : undefined,
      }),
      askDeps: {
        complete: (job) => routeComplete("ask", job, { chains, providers, write: jobWrite, tenantId: ROUTER_TENANT_ID }),
        // T-009b: real LLM judge by default; createLlmScorer falls back to the keyword heuristic
        // internally on a parse failure or AllProvidersFailedError — /ask never crashes on this.
        scoreFn: createLlmScorer(
          (job) => routeComplete("evaluator", job, { chains, providers, write: jobWrite, tenantId: ROUTER_TENANT_ID }),
        ),
        treeSearchFn: treeSearch,
        // ISS-010 / ISS-274: ALWAYS wired now. createTavilySearchFn() (ask-web-fallback.ts) no
        // longer returns undefined when TAVILY_API_KEY is empty -- it returns a real function that
        // throws TavilyUnavailableError, so every off-corpus question actually reaches the
        // web-fallback seam (D-041 ruling 2) and ask-v2.ts's catch logs the honest
        // "unavailable" degradation instead of the seam being silently absent from askDeps.
        tavilySearchFn,
        write: jobWrite,
      },
    },
  };
}
