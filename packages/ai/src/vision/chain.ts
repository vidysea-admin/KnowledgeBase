/**
 * packages/ai/src/vision/chain.ts — ollamafirst. Vision (image + prompt -> JSON text) routed through an
 * ORDERED provider chain from config/ai-routing.yaml (`vision: [ollama, gemini]`): Ollama Cloud first, Gemini as
 * fallback. Same first-success-wins semantics as router.ts. Every call is attributed to the provider that served
 * it and fallbacks are counted in a `VisionTally` for the run report. Transport is injected: tests use fakes.
 * Errors never carry the API key, the image bytes or the returned text.
 */
import type { Transport } from "../provider.js";
import { detectGeminiFreeTier, GeminiFreeTierQuotaError } from "../gemini-quota.js";

export interface VisionImageRequest { imageBase64: string; mimeType: string; prompt: string }
export interface VisionBackend { provider: string; model: string; call(req: VisionImageRequest): Promise<string> }

export const DEFAULT_VISION_ORDER = ["ollama", "gemini"];
export const DEFAULT_OLLAMA_VISION_MODELS = ["glm-5.3-flash", "deepseek-v4.1-flash"];
export const OLLAMA_CLOUD_URL = "https://ollama.com";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms); });
  return Promise.race([p, timeout]).finally(() => { if (t) clearTimeout(t); });
}

export function createOllamaVisionBackend(o: { transport: Transport; model: string; baseUrl?: string; apiKey?: string; timeoutMs?: number }): VisionBackend {
  const base = (o.baseUrl ?? OLLAMA_CLOUD_URL).replace(/\/+$/, "");
  const key = o.apiKey?.trim();
  return {
    provider: "ollama", model: o.model,
    async call(req) {
      const res = await withTimeout(o.transport({
        kind: "http", method: "POST", url: `${base}/api/chat`,
        headers: key ? { "content-type": "application/json", authorization: `Bearer ${key}` } : { "content-type": "application/json" },
        body: { model: o.model, stream: false, format: "json", think: false, options: { temperature: 0 },
          messages: [{ role: "user", content: req.prompt, images: [req.imageBase64] }] },
      }), o.timeoutMs ?? 120_000, `ollama vision ${o.model}`);
      if (res.status < 200 || res.status >= 300) throw new Error(`ollama vision ${o.model} status ${res.status}`);
      const content = (res.body as { message?: { content?: unknown } } | null)?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error(`ollama vision ${o.model} returned no content`);
      return content;
    },
  };
}

export function createGeminiVisionBackend(o: { transport: Transport; model: string; apiKey: string; timeoutMs?: number }): VisionBackend {
  return {
    provider: "gemini", model: o.model,
    async call(req) {
      const res = await withTimeout(o.transport({
        kind: "http", method: "POST",
        url: `https://generativelanguage.googleapis.com/v1beta/models/${o.model}:generateContent`,
        headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
        body: { contents: [{ role: "user", parts: [{ text: req.prompt }, { inlineData: { mimeType: req.mimeType, data: req.imageBase64 } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 } },
      }), o.timeoutMs ?? 120_000, `gemini vision ${o.model}`);
      if (res.status < 200 || res.status >= 300) {
        throw detectGeminiFreeTier(res.status, res.body, `gemini vision ${o.model} status ${res.status}`)
          ?? new Error(`gemini vision ${o.model} status ${res.status}`);
      }
      const parts = (res.body as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null)?.candidates?.[0]?.content?.parts;
      const text = (parts ?? []).map((p) => p.text ?? "").join("");
      if (!text.trim()) throw new Error(`gemini vision ${o.model} returned no text`);
      return text;
    },
  };
}

export interface VisionTally {
  calls: number;
  byProvider: Record<string, number>;
  /** Calls served by a backend that was not the first one tried. */
  fallbacks: number;
  /** Failed attempts (provider/model/message), capped at 50. */
  failures: { provider: string; model: string; error: string }[];
  /** True once any Gemini attempt hit the free-tier quota. */
  geminiFreeTierQuota: boolean;
}
export function newVisionTally(): VisionTally {
  return { calls: 0, byProvider: {}, fallbacks: 0, failures: [], geminiFreeTierQuota: false };
}

export class VisionAllProvidersFailedError extends Error {
  constructor(public readonly attempts: { provider: string; model: string; error: string }[]) {
    super(`all vision providers failed: ${attempts.map((a) => `${a.provider}/${a.model} (${a.error})`).join("; ")}`);
    this.name = "VisionAllProvidersFailedError";
  }
}

export interface VisionChainOptions<T> {
  tally?: VisionTally;
  log?: (line: string) => void;
  /** Parse/validate the raw text; a throw counts as that backend failing and the chain moves on. */
  validate?: (text: string) => T;
}

export async function runVisionChain<T = string>(
  backends: readonly VisionBackend[], req: VisionImageRequest, opts: VisionChainOptions<T> = {},
): Promise<{ value: T; provider: string; model: string; attempts: number }> {
  if (backends.length === 0) throw new Error("vision chain has no configured backend (check OLLAMA_API_KEY / GEMINI_API_KEY and config/ai-routing.yaml `vision`)");
  const tally = opts.tally ?? newVisionTally();
  const attempts: { provider: string; model: string; error: string }[] = [];
  for (const [i, b] of backends.entries()) {
    try {
      const raw = await b.call(req);
      const value = (opts.validate ? opts.validate(raw) : raw) as T;
      tally.calls++;
      tally.byProvider[b.provider] = (tally.byProvider[b.provider] ?? 0) + 1;
      if (i > 0) tally.fallbacks++;
      opts.log?.(`vision: served by ${b.provider}/${b.model}${i > 0 ? ` (fallback, ${i} earlier backend(s) failed)` : ""}`);
      return { value, provider: b.provider, model: b.model, attempts: i + 1 };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (err instanceof GeminiFreeTierQuotaError) tally.geminiFreeTierQuota = true;
      attempts.push({ provider: b.provider, model: b.model, error });
      if (tally.failures.length < 50) tally.failures.push({ provider: b.provider, model: b.model, error });
      opts.log?.(`vision: ${b.provider}/${b.model} failed: ${error}`);
    }
  }
  throw new VisionAllProvidersFailedError(attempts);
}

export interface VisionEnv {
  OLLAMA_API_KEY?: string; OLLAMA_BASE_URL?: string; OLLAMA_VISION_MODELS?: string;
  GEMINI_API_KEY?: string; WEBINAR_VISION_MODEL?: string;
}

/** Builds backends in `order` (provider names). Unconfigured providers are skipped, not errors. */
export function buildVisionBackends(env: VisionEnv, transport: Transport, order: readonly string[] = DEFAULT_VISION_ORDER): VisionBackend[] {
  const out: VisionBackend[] = [];
  for (const name of order) {
    if (name === "ollama") {
      const key = env.OLLAMA_API_KEY?.trim();
      const baseUrl = env.OLLAMA_BASE_URL?.trim() || (key ? OLLAMA_CLOUD_URL : "");
      if (!baseUrl) continue;
      const models = env.OLLAMA_VISION_MODELS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      for (const model of models.length ? models : DEFAULT_OLLAMA_VISION_MODELS) {
        out.push(createOllamaVisionBackend({ transport, model, baseUrl, apiKey: key }));
      }
    } else if (name === "gemini") {
      const key = env.GEMINI_API_KEY?.trim(); const model = env.WEBINAR_VISION_MODEL?.trim();
      if (key && model && /^[a-zA-Z0-9._-]+$/.test(model)) out.push(createGeminiVisionBackend({ transport, model, apiKey: key }));
    } else {
      throw new Error(`vision chain: unknown provider "${name}" (expected ollama or gemini)`);
    }
  }
  return out;
}
