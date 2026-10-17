/** Prepared only. At most two tiny generation calls; no metadata request/retry/fallback. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
type Outcome = { modelId: string; status: "success" | "refused"; refusalClass: string | null; inputTokens: number | null; outputTokens: number | null; costStatus: "unknown" };
const modelIds = ["glm-5.3-flash", "deepseek-v4.1-flash"] as const;
const outcomes: Outcome[] = modelIds.map(modelId => ({ modelId, status: "refused", refusalClass: "not-started", inputTokens: null, outputTokens: null, costStatus: "unknown" }));
const total = new AbortController();
const timer = setTimeout(() => total.abort(), 50_000);
let phase = "loader";
try {
  const [{ parse }, { OllamaCloudProvider }, { createHttpTransport }] = await Promise.all([
    import("dotenv"), import("../../../packages/ai/src/providers/ollama-cloud.js"), import("../../../apps/api/src/ai-transport.js"),
  ]);
  phase = "metadata-proof";
  const argument = (name: string) => {
    const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1];
  };
  const proofPath = argument("--metadata-proof");
  const expectedHash = argument("--metadata-sha256");
  if (!proofPath || !expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error("unavailable");
  const rawProof = readFileSync(proofPath);
  if (rawProof.byteLength > 262_144 || createHash("sha256").update(rawProof).digest("hex") !== expectedHash.toLowerCase()) throw new Error("unavailable");
  const proof = JSON.parse(rawProof.toString("utf8")) as unknown;
  const listing = Array.isArray(proof) ? proof : (proof as { models?: unknown } | null)?.models;
  if (!Array.isArray(listing)) throw new Error("unavailable");
  phase = "auth";
  const apiKey = parse(readFileSync(new URL("../../../.env", import.meta.url), "utf8")).OLLAMA_API_KEY?.trim();
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("unavailable");
  const http = createHttpTransport({ timeoutMs: 20_000, outputBytes: 65_536 });
  const transport = http;
  for (let index = 0; index < modelIds.length; index++) {
    const modelId = modelIds[index]!; const outcome = outcomes[index]!;
    if (!listing.some(entry => entry && typeof entry === "object" && entry.modelId === modelId && entry.available === true)) {
      outcome.refusalClass = "not-listed"; continue;
    }
    if (total.signal.aborted) { outcome.refusalClass = "total-deadline"; continue; }
    try {
      const provider = new OllamaCloudProvider(async request => transport({ ...request,
        signal: request.signal ? AbortSignal.any([request.signal, total.signal]) : total.signal,
      }), { apiKey, primaryModel: modelId, timeoutMs: 20_000 });
      const result = await provider.complete({ kind: "capability-smoke", messages: [{ role: "user", content: "Respond with OK only." }],
        structured: { options: { num_predict: 32, temperature: 0 } },
      } as Parameters<typeof provider.complete>[0]);
      outcome.status = "success"; outcome.refusalClass = null;
      outcome.inputTokens = result.usage.inputTokens; outcome.outputTokens = result.usage.outputTokens;
    } catch {
      outcome.refusalClass = total.signal.aborted ? "total-deadline" : "provider-refused";
    }
  }
} catch {
  for (const outcome of outcomes) if (outcome.refusalClass === "not-started") outcome.refusalClass = total.signal.aborted ? "total-deadline" : phase;
} finally { clearTimeout(timer); }
process.stdout.write(JSON.stringify(outcomes) + "\n");
if (outcomes.some(outcome => outcome.status !== "success")) process.exitCode = 2;
