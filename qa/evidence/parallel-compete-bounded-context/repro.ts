import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "../../../apps/api/src/server.js";
import { requireAuth } from "../../../apps/api/src/auth.js";
import { buildTestDeps, fakeAskDeps, fakeKeyStore } from "../../../apps/api/src/fixtures.js";
import { BoundedAskError } from "../../../packages/ask/src/source-context.js";

// Executes the real mounted Express handlers with offline req/res objects.
// No listen/socket, Mongo, providers, secrets or implementation mutation.
const routePath = "apps/api/src/routes/compete.ts";
console.log(JSON.stringify({ kind: "binding", routePath,
  sha256: createHash("sha256").update(readFileSync(routePath)).digest("hex"),
  mode: "mounted-handler offline; not HTTP runtime proof" }));

async function run(name: string, mode: "sync-refusing" | "async-refusing" | "legacy" | "direct-refusing", scoped = true) {
  let factoryCalls = 0, hydrationCalls = 0, legacyArms = 0;
  const treeTenants: string[] = [], jobs: any[] = [], evalWrites: any[] = [], completionKinds: string[] = [];
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "synthetic-key": {
    tenantId: "tenant-a", scopes: scoped ? ["compete"] : ["ask"],
  } }) });
  const n = { node_id: "s1", title: "Session", level: "session", summary: "UNREVIEWED CLAIM: grant is guaranteed.",
    evidence: { sessionRef: "s1", turn_id: "absent-turn" }, children: [] };
  const tree = { node_id: "tenant-a", title: "Tenant", level: "tenant", summary: "", children: [n] };
  base.ask.tree = { load: async (tenantId) => { treeTenants.push(tenantId); return tree as any; } };
  base.ask.askDeps = { ...fakeAskDeps(),
    treeSearchFn: () => [n] as any,
    write: async (j) => { jobs.push(j); },
    complete: async (job) => {
      completionKinds.push(job.kind);
      return { text: job.kind === "ask.select_nodes" ? '{"node_ids":["s1"]}' : "The grant is guaranteed.",
        json: job.kind === "ask.select_nodes" ? { node_ids: ["s1"] } : undefined,
        provider: "offline-fixture", model: "fixture", costUsd: 0, usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
  const refusing = () => ({ ...base.ask.askDeps,
    sourceContext: { hydrate: async () => { hydrationCalls++; throw new BoundedAskError("literal cited turn absent"); } },
  });
  if (mode === "sync-refusing") base.ask.requestDepsFor = (tenant) => {
    factoryCalls++; assert.equal(tenant, "tenant-a"); return refusing();
  };
  // Intentional dynamically-injected probe: async factory is outside today's TS interface.
  if (mode === "async-refusing") (base.ask as any).requestDepsFor = async (tenant: string) => {
    factoryCalls++; assert.equal(tenant, "tenant-a"); await Promise.resolve(); return refusing();
  };
  if (mode === "direct-refusing") base.ask.askDeps = refusing();
  base.ask.extraCandidateArmsFor = () => { legacyArms++; return async () => ({ arms: [], degraded: null }); };
  base.evalRuns = { create: async (tenant, doc) => { evalWrites.push({ tenantId: tenant, ...doc }); }, recordScore: async () => false };
  const app = createServer(base);
  const mount = (app as any).router.stack.find((layer: any) => layer.handle?.stack?.some((x: any) => x.route?.path === "/compete/start"));
  assert.ok(mount, "real server must mount compete router");
  const route = mount.handle.stack.find((x: any) => x.route?.path === "/compete/start").route;
  const req: any = { body: { question: "Is the grant guaranteed?", counsellor: { name: "Fixture" }, tenantId: "foreign" },
    header: () => "Bearer synthetic-key" };
  let status = 200, response: any = undefined, rejection: any = undefined;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { response = value; return this; } };
  await requireAuth(base.keyStore)(req, res, () => {});
  assert.equal(req.auth.tenantId, "tenant-a");
  try { for (const layer of route.stack) { await layer.handle(req, res, () => {}); if (response !== undefined) break; } }
  catch (error) { rejection = { name: (error as Error).name, message: (error as Error).message }; }
  const result = { name, authenticatedTenant: req.auth.tenantId, treeTenants, factoryCalls, hydrationCalls, legacyArms,
    completionKinds, status: rejection ? "handler-rejected-no-route-response" : status, rejection,
    evalWrites: evalWrites.length, evalTenant: evalWrites[0]?.tenantId ?? null,
    credibility: evalWrites[0]?.credibility ?? null, answer: response?.aiAnswer?.text ?? null,
    jobsTenants: [...new Set(jobs.map(j => j.tenantId))], refusedAudit: jobs.some(j => j.kind === "ask.source_context_refused") };
  if (!scoped) { assert.equal(status, 403); assert.equal(evalWrites.length, 0); assert.equal(completionKinds.length, 0); }
  else if (mode === "direct-refusing") { assert.equal(hydrationCalls, 1); assert.equal(evalWrites.length, 0); assert.equal(rejection?.name, "BoundedAskError"); }
  else { assert.equal(factoryCalls, 0); assert.equal(hydrationCalls, 0); assert.equal(evalWrites.length, 1);
    assert.equal(response.aiAnswer.text, "The grant is guaranteed."); assert.equal(evalWrites[0].tenantId, "tenant-a"); }
  console.log(JSON.stringify(result));
}
await run("sync-refusing-factory-bypassed", "sync-refusing");
await run("async-factory-bypassed-outside-current-type", "async-refusing");
await run("legacy-no-factory-preserved", "legacy");
await run("direct-bounded-refusal-no-eval-write", "direct-refusing");
await run("missing-compete-scope", "sync-refusing", false);
console.log("CONFIRMED 5/5 offline mounted-handler probes; no implementation edits, provider calls, DB or sockets.");
