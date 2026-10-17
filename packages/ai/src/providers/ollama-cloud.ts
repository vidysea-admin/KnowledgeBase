/** Native Ollama Cloud text adapter. Local Ollama remains a separate optional provider.
 * API/model references: https://docs.ollama.com/cloud and https://ollama.com/library.
 * Cloud has no native structured-output guarantee: https://docs.ollama.com/capabilities/structured-outputs.
 */
import type { CompleteResult, Job, ModelInfo, Provider, Transport } from "../provider.js";

export const OLLAMA_CLOUD_PRIMARY_MODEL = "glm-5.3-flash";
export const OLLAMA_CLOUD_VERIFIER_MODEL = "deepseek-v4.1-flash";

export interface OllamaCloudConfig {
  apiKey: string;
  /** Only the official HTTPS origin is accepted; credentials never go to a configurable third party. */
  baseUrl?: string;
  primaryModel?: string;
  verifierModel?: string;
  timeoutMs?: number;
}

type StructuredJob = Job & {
  structured?: { format?: unknown; options?: Record<string, unknown>; think?: boolean | string };
};

function tokenCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("ollama cloud response missing valid token usage");
  }
  return value;
}

export class OllamaCloudProvider implements Provider {
  readonly capabilities = Object.freeze({ text: true, embeddings: false, nativeStructuredOutput: false, tools: false });
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly transport: Transport,
    private readonly config: OllamaCloudConfig,
    readonly name = "ollama-cloud",
    private readonly model = config.primaryModel ?? OLLAMA_CLOUD_PRIMARY_MODEL,
  ) {
    let endpoint: URL;
    try { endpoint = new URL(config.baseUrl ?? "https://ollama.com"); }
    catch { throw new Error("ollama cloud requires the official HTTPS endpoint"); }
    if (endpoint.origin !== "https://ollama.com" || endpoint.username || endpoint.password ||
        endpoint.search || endpoint.hash || !["/", "/api", "/api/"].includes(endpoint.pathname)) {
      throw new Error("ollama cloud requires the official HTTPS endpoint");
    }
    this.baseUrl = endpoint.origin;
    this.timeoutMs = config.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 300_000) {
      throw new Error("ollama cloud timeout must be between 1 and 300000 ms");
    }
    if (!model.trim() || /[\r\n]/.test(model)) throw new Error("ollama cloud model is invalid");
  }

  async complete(job: Job): Promise<CompleteResult> {
    const key = this.config.apiKey?.trim();
    if (!key || /[\r\n]/.test(key)) throw new Error("ollama cloud credentials unavailable");
    if (job.tools?.length) throw new Error("ollama cloud text adapter does not support tool execution");
    const structured = (job as StructuredJob).structured;
    const schema = structured?.format ?? job.schema;
    const messages = job.messages.map(({ role, content }) => ({ role, content }));
    // Guidance only. Consumers must parse and validate before publishing any model output.
    if (schema !== undefined) messages.unshift({ role: "system", content:
      "Return only JSON matching this requested format. This is output guidance, not a server-enforced schema: " + JSON.stringify(schema) });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("request timed out")); }, this.timeoutMs);
      });
      const res = await Promise.race([this.transport({
        kind: "http", url: `${this.baseUrl}/api/chat`, method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        signal: controller.signal,
        body: {
          model: this.model, stream: false, messages,
          ...(structured?.options ? { options: structured.options } : {}),
          ...(structured?.think !== undefined ? { think: structured.think } : {}),
        },
      }), timeout]);
      // Response bodies and underlying transport errors can contain credentials or source text.
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      const body = res.body as { message?: { content?: unknown }; prompt_eval_count?: unknown; eval_count?: unknown } | null;
      if (!body || typeof body.message?.content !== "string" || !body.message.content.trim()) {
        throw new Error("empty or invalid response");
      }
      return {
        text: body.message.content,
        usage: { inputTokens: tokenCount(body.prompt_eval_count), outputTokens: tokenCount(body.eval_count) },
        provider: this.name, model: this.model, costStatus: "unknown",
      };
    } catch (error) {
      // Never include arbitrary exception messages: fetch/proxies may echo Authorization.
      if (error instanceof Error && /^HTTP \d{3}$/.test(error.message)) {
        throw new Error(`ollama cloud API error ${error.message}`);
      }
      if (controller.signal.aborted) throw new Error("ollama cloud request timed out");
      throw new Error("ollama cloud request failed or returned invalid content/usage");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Static, labeled configured text models; not a claim that an account has model access. */
  async listModels(): Promise<ModelInfo[]> {
    return [{ id: this.model, label: `${this.model} (Ollama Cloud; configured, access unverified)` }];
  }
}

/** Router chains provide failover; verifier jobs select the second provider independently. */
export function createOllamaCloudProviders(transport: Transport, config: OllamaCloudConfig): Record<"ollama-cloud" | "ollama-cloud-verifier", Provider> {
  return {
    "ollama-cloud": new OllamaCloudProvider(transport, config),
    "ollama-cloud-verifier": new OllamaCloudProvider(transport, config, "ollama-cloud-verifier", config.verifierModel ?? OLLAMA_CLOUD_VERIFIER_MODEL),
  };
}
