/** Metadata-only capability preflight. No model generation, embeddings, DB calls or file writes. */
import { readFileSync } from "node:fs";

const requestedModels = ["glm-5.3-flash", "deepseek-v4.1-flash"] as const;
type Availability = { modelId: string; available: boolean | null };
let result: Availability[] = requestedModels.map(modelId => ({ modelId, available: null }));
let failureClass: "loader" | "auth" | "configuration" | "network" | "http" | "payload" | null = "loader";
let status = "unknown";
const offline = !process.argv.includes("--live-metadata");
if (offline) globalThis.fetch = async () => { throw new Error("offline network blocked"); };

try {
  const [{ parse }, { createOllamaCloudProviders }, { createHttpTransport }] = await Promise.all([
    import("dotenv"), import("../../../packages/ai/src/providers/ollama-cloud.js"),
    import("../../../apps/api/src/ai-transport.js"),
  ]);
  failureClass = "configuration";
  if (offline) {
    const transport = createHttpTransport({ timeoutMs: 10_000, outputBytes: 262_144 });
    const providers = createOllamaCloudProviders(transport, {
      apiKey: "offline-placeholder", primaryModel: requestedModels[0], verifierModel: requestedModels[1],
    });
    await Promise.all(Object.values(providers).map(provider => provider.listModels()));
    failureClass = null; status = "offline-ready";
  } else {
  failureClass = "auth";
  // parse() does not populate process.env or log. Never emit the file, key or arbitrary errors.
  const apiKey = parse(readFileSync(new URL("../../../.env", import.meta.url), "utf8")).OLLAMA_API_KEY?.trim();
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("unavailable");
  failureClass = "configuration";
  const transport = createHttpTransport({ timeoutMs: 10_000, outputBytes: 262_144 });
  const providers = createOllamaCloudProviders(transport, {
    apiKey, primaryModel: requestedModels[0], verifierModel: requestedModels[1], timeoutMs: 10_000,
  });
  // listModels() is a static, explicitly unverified configuration manifest; it makes no request.
  const configured = await Promise.all([
    providers["ollama-cloud"].listModels(), providers["ollama-cloud-verifier"].listModels(),
  ]);
  if (configured.some((models, index) => models.length !== 1 || models[0]?.id !== requestedModels[index])) {
    throw new Error("unavailable");
  }
  failureClass = "network";
  const response = await transport({
    kind: "http", method: "GET", url: "https://ollama.com/api/tags",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  failureClass = response.status === 401 || response.status === 403 ? "auth" : "http";
  if (response.status !== 200) throw new Error("unavailable");
  failureClass = "payload";
  const body = response.body as { models?: unknown } | null;
  if (!body || !Array.isArray(body.models)) throw new Error("unavailable");
  const exactIds = new Set<string>();
  for (const model of body.models) {
    if (!model || typeof model !== "object") throw new Error("unavailable");
    const entry = model as { name?: unknown; model?: unknown };
    if (typeof entry.name !== "string" && typeof entry.model !== "string") throw new Error("unavailable");
    if (typeof entry.name === "string") exactIds.add(entry.name);
    if (typeof entry.model === "string") exactIds.add(entry.model);
  }
  // Exact IDs only: a similarly named tag does not silently substitute for either requested model.
  result = requestedModels.map(modelId => ({ modelId, available: exactIds.has(modelId) }));
  if (result.some(model => !model.available)) process.exitCode = 1;
  failureClass = null; status = "metadata-ready";
  }
} catch {
  process.exitCode = 2; // Unknown metadata/configuration state; no error details escape.
}
process.stdout.write(JSON.stringify({ status, failureClass, models: result }) + "\n");
