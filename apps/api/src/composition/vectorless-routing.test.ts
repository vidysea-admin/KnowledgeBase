import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRouting } from "./production.js";
import { createOutputVerifier } from "./integrations/answers.js";

test("production text routes bind distinct Cloud generators and verifiers without an embedding route", () => {
  const routing = buildRouting();
  assert.equal(routing.chains.embedding, undefined);
  for (const kind of ["ask", "answer", "claims", "summarize", "tree-summary", "topics", "decisions"]) {
    assert.deepEqual(routing.chains[kind], ["ollama-cloud", "ollama-cloud-verifier"]);
  }
  for (const kind of ["evaluator", "note-judge"]) {
    assert.deepEqual(routing.chains[kind], ["ollama-cloud-verifier", "ollama-cloud"]);
  }
  assert.equal(routing.providers["ollama-cloud"]!.name, "ollama-cloud");
  assert.equal(routing.providers["ollama-cloud-verifier"]!.name, "ollama-cloud-verifier");
  assert.notEqual(routing.providers.ollama, routing.providers["ollama-cloud"]);
  assert.equal(routing.providers["ollama-cloud"]!.embed, undefined);
  assert.deepEqual(routing.chains["output-verifier"], ["ollama-cloud-verifier"]);
  assert.deepEqual(routing.chains["output-generation"], ["ollama-cloud"]);
  assert.deepEqual(routing.chains.transcribe, ["gemini"]);
});

test("D-207: /route step B has its own chain on gemini-3.5-flash-lite with minimal thinking; the cloud text chains are unchanged", async () => {
  const routing = buildRouting();
  assert.deepEqual(routing.chains.route, ["gemini-flash-lite"]);
  const lite = routing.providers["gemini-flash-lite"]!;
  assert.equal(lite.name, "gemini-flash-lite");
  assert.notEqual(lite, routing.providers.gemini, "the default gemini (transcribe) provider is a separate, unchanged instance");
  assert.equal(routing.chains.ask![0], "ollama-cloud");
  const source = readFileSync(new URL("./production.ts", import.meta.url), "utf8");
  assert.match(source, /"gemini-flash-lite": new GeminiProvider\(realTransport, \{[^}]*model: "gemini-3\.5-flash-lite"[^}]*thinkingLevel: "minimal"/);
  assert.match(source, /createRouteDeps\(\{.*routeComplete\("route"/, "the live /route step B calls the route chain, not ask");
});

test("output verification cannot fall back to generation, even with an unsafe configured verifier chain", async () => {
  let generationCalls = 0;
  let verifierCalls = 0;
  const tenants: string[] = [];
  const verify = createOutputVerifier({
    chains: { "output-verifier": ["generator"] },
    providers: {
      generator: { name: "generator", listModels: async () => [], complete: async () => {
        generationCalls++; throw new Error("generator must not adjudicate its own output");
      } },
      "ollama-cloud-verifier": { name: "ollama-cloud-verifier", listModels: async () => [], complete: async () => {
        verifierCalls++; throw new Error("verifier unavailable");
      } },
    },
    jobWrite: async entry => { tenants.push(entry.tenantId); },
  });
  await assert.rejects(() => verify("tenant-a", { kind: "answer", messages: [] }), /all providers failed/);
  assert.equal(generationCalls, 0);
  assert.equal(verifierCalls, 1);
  assert.deepEqual(tenants, ["tenant-a"]);
  await assert.rejects(async () => verify("", { kind: "answer", messages: [] }));
  assert.equal(verifierCalls, 1, "invalid tenant is refused before provider calls");
});

test("Compose requires an explicit database and does not bake provider secrets into web builds", () => {
  const source = readFileSync(new URL("../../../../docker-compose.yml", import.meta.url), "utf8");
  const api = source.slice(source.indexOf("  api:"), source.indexOf("  web:"));
  assert.match(api, /MONGODB_DB: \$\{MONGODB_DB:\?/);
  assert.doesNotMatch(api, /MONGODB_DB:\s+lkb\b/);
  assert.match(api, /OLLAMA_API_KEY: \$\{OLLAMA_API_KEY:\?/);
  const web = source.slice(source.indexOf("  web:"));
  assert.doesNotMatch(web, /OLLAMA_API_KEY|GEMINI_API_KEY/);
});
