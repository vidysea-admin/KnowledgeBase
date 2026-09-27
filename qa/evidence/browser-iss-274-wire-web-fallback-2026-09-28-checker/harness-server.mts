/**
 * qa/evidence/browser-iss-274-wire-web-fallback-2026-09-28-checker/harness-server.mts
 *
 * CHECKER-OWNED EVIDENCE TOOLING, NOT SOURCE. Not part of the unit, not imported by anything in
 * apps/api or apps/web, never touched by the maker.
 *
 * Why this exists: the real `apps/api/src/index.ts` entrypoint requires a live Mongo connection
 * (`await connect(...)`) before it will even start listening, and this worktree has no `.env`
 * (no MONGODB_URL, no live Mongo reachable at all) -- confirmed absent, not merely unset. Running
 * the actual production server was therefore not possible in this environment, independent of
 * anything this unit changed.
 *
 * To still verify the REAL code this unit shipped, live, through a real Express server and a real
 * browser hitting AskPage.tsx, this harness wires `createServer()` (apps/api/src/server.ts,
 * UNMODIFIED, imported directly) with:
 *   - the REAL `createTavilySearchFn()` from apps/api/src/ask-web-fallback.ts, UNMODIFIED, imported
 *     directly, run with no TAVILY_API_KEY in this process's env -- so it throws the real
 *     `TavilyUnavailableError` exactly as it would in production today.
 *   - the REAL `askV2` (reached via the REAL `createAskRouter` in apps/api/src/routes/ask.ts,
 *     UNMODIFIED, imported transitively through server.ts) -- so the REAL try/catch honesty wiring
 *     in packages/ask/src/ask-v2.ts runs for real, not simulated.
 *   - FAKE retrieval/scoring/LLM-completion stand-ins ONLY for the parts this unit did not touch
 *     and that require live Mongo/embeddings/LLM API keys this environment does not have
 *     (treeSearchFn, scoreFn, complete) -- same fakes shape as packages/ask/src/testUtils.ts and
 *     ask-v2.test.ts already use, just wired through a live HTTP+browser round trip instead of
 *     vitest/node:test.
 *   - a FAKE ApiKeyStore/TreeStore standing in for store.ts's real Mongo-backed versions (also
 *     untouched by this unit).
 *
 * The fake scoring path deterministically produces treeSearchFn -> [] (no candidates), so
 * evaluate() returns verdict "incorrect" with zero good_docs -- an "off-corpus question" by
 * construction -- and, with no sync webFallbackFn supplied, router.ts's finishAsk() sets
 * insufficient_coverage: true. That is what makes askV2 reach the REAL tavilySearchFn call this
 * unit exists to wire.
 */
import { createServer } from "../../../apps/api/src/server.js";
import { createTavilySearchFn } from "../../../apps/api/src/ask-web-fallback.js";

const CHECKER_KEY = "checker-e2e-key";
const TENANT = "checker-tenant";
const PORT = 3399;

const TREE = {
  node_id: `tenant:${TENANT}`,
  title: "root",
  level: "tenant",
  summary: "",
  children: [
    {
      node_id: `tenant:${TENANT}/session:a`,
      title: "A",
      level: "session",
      summary: "Apples are red.",
      children: [],
    },
  ],
};

const keyStore = {
  async verify(key: string) {
    if (key === CHECKER_KEY) return { tenantId: TENANT, scopes: ["ask"] };
    return null;
  },
};

const tree = {
  async load(tenantId: string) {
    return tenantId === TENANT ? TREE : null;
  },
};

function fakeComplete() {
  return async (job: { kind: string }) => {
    if (job.kind === "ask.select_nodes") {
      return { text: "", json: { node_ids: [] }, usage: { inputTokens: 0, outputTokens: 0 }, provider: "checker-fake", model: "checker-fake", costUsd: 0 };
    }
    if (job.kind === "ask.refine_strip") {
      return { text: "", json: { keep: false }, usage: { inputTokens: 0, outputTokens: 0 }, provider: "checker-fake", model: "checker-fake", costUsd: 0 };
    }
    // ask.answer
    return {
      text: "I could not find enough internal coverage to answer this confidently.",
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: "checker-fake",
      model: "checker-fake",
      costUsd: 0,
    };
  };
}

// Never actually called (treeSearchFn always returns []), kept only to satisfy the AskV2Deps shape.
const scoreFn = () => 0.05;
// No candidates ever resolved -> evaluate([]) -> verdict "incorrect", good_docs: [] -> a real
// "off-corpus question" from evaluate()'s own perspective, deterministically, every run.
const treeSearchFn = () => [];

const write = async () => {};

// REAL production code. No TAVILY_API_KEY is set anywhere in this process's env (confirmed by
// this file never setting it and no .env existing in this worktree) -> the returned function
// throws the real TavilyUnavailableError on every call, exactly as apps/api/src/production.ts
// wires it in production today.
const tavilySearchFn = createTavilySearchFn();

const askDeps = {
  complete: fakeComplete(),
  scoreFn,
  treeSearchFn,
  tavilySearchFn,
  write,
};

const notUsed = (name: string) => (..._args: unknown[]) => {
  throw new Error(`checker Mode D harness: ${name} is not exercised by this check`);
};

const deps = {
  keyStore,
  ask: { tree, askDeps },
  evalRuns: { create: notUsed("evalRuns.create"), recordScore: notUsed("evalRuns.recordScore") },
  brain: {
    listSessions: notUsed("brain.listSessions"),
    getSessionDetail: notUsed("brain.getSessionDetail"),
    listSources: notUsed("brain.listSources"),
    listGaps: notUsed("brain.listGaps"),
  },
  watchedSources: { listActive: notUsed("watchedSources.listActive"), watch: notUsed("watchedSources.watch"), runCheck: notUsed("watchedSources.runCheck") },
  citations: { getCitation: notUsed("citations.getCitation") },
  health: { checkHealth: async () => ({ db: "error" as const, collections: {} }) },
  search: { search: notUsed("search.search") },
  graph: { getGraph: notUsed("graph.getGraph") },
  calendar: { listUpcoming: notUsed("calendar.listUpcoming") },
  meetingCandidates: {
    scan: notUsed("meetingCandidates.scan"),
    list: notUsed("meetingCandidates.list"),
    approve: notUsed("meetingCandidates.approve"),
    reject: notUsed("meetingCandidates.reject"),
  },
  whatsapp: { listGroups: notUsed("whatsapp.listGroups"), ingestGroup: notUsed("whatsapp.ingestGroup") },
  keys: { listKeys: notUsed("keys.listKeys"), createKey: notUsed("keys.createKey"), revokeKey: notUsed("keys.revokeKey") },
  ingest: { ingestUrl: notUsed("ingest.ingestUrl") },
  corsOrigins: [
    "http://127.0.0.1:5180",
    "http://localhost:5180",
  ],
};

const server = createServer(deps as never);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`checker-harness-api listening on :${PORT}`);
});
