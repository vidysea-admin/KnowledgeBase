/** Prepared only: one separately authorized GLM call, safe response-shape diagnostics only. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const output = { modelId: "glm-5.3-flash", status: "refused", httpStatus: null as number | null,
  category: "authorization-required", truncated: null as boolean | null, hasThinking: null as boolean | null,
  inputTokens: null as number | null, outputTokens: null as number | null, costStatus: "unknown" };
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
try {
  if (!process.argv.includes("--dispatch-approved")) throw new Error("unavailable");
  output.category = "loader";
  const [{ parse }, { OllamaCloudProvider }, { createHttpTransport }] = await Promise.all([
    import("dotenv"), import("../../../packages/ai/src/providers/ollama-cloud.js"), import("../../../apps/api/src/ai-transport.js"),
  ]);
  output.category = "metadata-proof";
  const argument = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  const proofPath = argument("--metadata-proof"); const expectedHash = argument("--metadata-sha256");
  if (!proofPath || !expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error("unavailable");
  const rawProof = readFileSync(proofPath);
  if (rawProof.byteLength > 262_144 || createHash("sha256").update(rawProof).digest("hex") !== expectedHash.toLowerCase()) throw new Error("unavailable");
  const proof = JSON.parse(rawProof.toString("utf8")) as unknown;
  const listing = Array.isArray(proof) ? proof : (proof as { models?: unknown } | null)?.models;
  if (!Array.isArray(listing) || !listing.some(entry => entry && typeof entry === "object" && entry.modelId === output.modelId && entry.available === true)) throw new Error("unavailable");
  output.category = "auth";
  const apiKey = parse(readFileSync(new URL("../../../.env", import.meta.url), "utf8")).OLLAMA_API_KEY?.trim();
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("unavailable");
  const http = createHttpTransport({ timeoutMs: 20_000, outputBytes: 65_536 });
  const provider = new OllamaCloudProvider(async request => {
    output.category = "transport-failure";
    let response;
    try { response = await http(request); }
    catch { if (request.signal?.aborted) output.category = "transport-deadline"; throw new Error("unavailable"); }
    output.httpStatus = Number.isInteger(response.status) ? response.status : null;
    const body = response.body as { message?: { content?: unknown; thinking?: unknown }; prompt_eval_count?: unknown; eval_count?: unknown; done_reason?: unknown; error?: unknown } | null;
    output.inputTokens = count(body?.prompt_eval_count); output.outputTokens = count(body?.eval_count);
    output.truncated = body?.done_reason === "length" ? true : body?.done_reason === "stop" ? false : null;
    output.hasThinking = typeof body?.message?.thinking === "string" ? Boolean(body.message.thinking.trim()) : null;
    if (response.status === 401 || response.status === 403) output.category = "http-auth";
    else if (response.status === 404) output.category = "http-model-unavailable";
    else if (response.status === 429) output.category = "http-rate-limit";
    else if (response.status >= 500) output.category = "http-upstream";
    else if (response.status < 200 || response.status >= 300) output.category = "http-rejected";
    else if (typeof body?.message?.content !== "string") output.category = "malformed-content";
    else if (!body.message.content.trim()) output.category = "empty-content";
    else if (output.inputTokens === null || output.outputTokens === null) output.category = "missing-usage";
    else output.category = "response-valid";
    return response;
  }, { apiKey, primaryModel: output.modelId, timeoutMs: 20_000 });
  await provider.complete({ kind: "capability-diagnostic", messages: [{ role: "user", content: "Respond with OK only." }],
    structured: { options: { num_predict: 256, temperature: 0 } },
  } as Parameters<typeof provider.complete>[0]);
  output.status = "success"; output.category = "success";
} catch { process.exitCode = 2; }
process.stdout.write(JSON.stringify(output) + "\n");
