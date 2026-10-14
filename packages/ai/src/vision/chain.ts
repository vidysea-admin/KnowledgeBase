/**
 * packages/ai/src/vision/chain.ts — ollamafirst. Vision (image + prompt -> JSON text) routed through an
 * ORDERED provider chain from config/ai-routing.yaml (`vision: [ollama, gemini]`): Ollama Cloud first, Gemini as
 * fallback. Same first-success-wins semantics as router.ts. Every call is attributed to the provider that served
 * it and fallbacks are counted in a `VisionTally` for the run report. Transport is injected: tests use fakes.
 * Errors never carry the API key, the image bytes or the returned text.
 */
import type { Transport } from "../provider.js";
import { detectGeminiFreeTier, GeminiFreeTierQuotaError } from "../gemini-quota.js";

export interface VisionImageRequest { imageBase64: string; mimeType: string; prompt: string; /** Optional JSON schema for Ollama structured output (`format`). */ schema?: Record<string, unknown> }
export interface VisionCallContext { signal?: AbortSignal; /** Remaining overall budget; the backend timeout is min(own, this). */ timeoutMs?: number }
export interface VisionBackend { provider: string; model: string; call(req: VisionImageRequest, ctx?: VisionCallContext): Promise<string> }

export const DEFAULT_VISION_ORDER = ["ollama", "gemini"];
export const DEFAULT_OLLAMA_VISION_MODELS = ["glm-5.3-flash", "deepseek-v4.1-flash"];
export const OLLAMA_CLOUD_URL = "https://ollama.com";

/** Per-call overall budget across ALL backends (ISS-OLLAMAFIRST-001). Env: LKB_VISION_DEADLINE_MS. */
export const DEFAULT_VISION_DEADLINE_MS = 90_000;
export const DEFAULT_VISION_BACKEND_TIMEOUT_MS = 45_000;
export function visionDeadlineMs(env: { LKB_VISION_DEADLINE_MS?: string } = process.env): number {
  const n = Number(env.LKB_VISION_DEADLINE_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_VISION_DEADLINE_MS;
}

/** Runs `start(signal)`; on timeout the signal is ABORTED (cancels the fetch) and the call rejects. */
async function withAbortTimeout<T>(start: (signal: AbortSignal) => Promise<T>, ms: number, label: string, outer?: AbortSignal): Promise<T> {
  const ctl = new AbortController();
  const onOuter = () => ctl.abort();
  if (outer?.aborted) ctl.abort(); else outer?.addEventListener("abort", onOuter, { once: true });
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => { ctl.abort(); rej(new Error(`${label} timed out after ${ms}ms`)); }, ms); });
  try { return await Promise.race([start(ctl.signal), timeout]); }
  finally { if (t) clearTimeout(t); outer?.removeEventListener("abort", onOuter); }
}

/** First valid JSON object in a model reply (tolerates fences, reasoning prose, <think> blocks). `accept` (e.g. the strict
 *  schema validator) may reject a candidate; the next candidate is tried. The thrown message is fixed: it never echoes the reply. */
export function extractJsonObject(text: string, accept?: (v: unknown) => unknown): unknown {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i]!;
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try { const v = JSON.parse(text.slice(start, i + 1)); return accept ? accept(v) : v; } catch { /* next candidate */ }
        break;
      }
    }
  }
  throw new Error("vision reply contained no valid JSON object");
}

export function createOllamaVisionBackend(o: { transport: Transport; model: string; baseUrl?: string; apiKey?: string; timeoutMs?: number }): VisionBackend {
  const base = (o.baseUrl ?? OLLAMA_CLOUD_URL).replace(/\/+$/, "");
  const key = o.apiKey?.trim();
  return {
    provider: "ollama", model: o.model,
    async call(req, ctx = {}) {
      const res = await withAbortTimeout((signal) => o.transport({
        kind: "http", method: "POST", url: `${base}/api/chat`, signal,
        headers: key ? { "content-type": "application/json", authorization: `Bearer ${key}` } : { "content-type": "application/json" },
        // Structured output: `format` is "json" or a JSON-schema object; `think:false` disables reasoning on thinking models.
        body: { model: o.model, stream: false, format: req.schema ?? "json", think: false, options: { temperature: 0 },
          messages: [{ role: "user", content: req.prompt, images: [req.imageBase64] }] },
      }), Math.min(o.timeoutMs ?? DEFAULT_VISION_BACKEND_TIMEOUT_MS, ctx.timeoutMs ?? Infinity), `ollama vision ${o.model}`, ctx.signal);
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
    async call(req, ctx = {}) {
      const res = await withAbortTimeout((signal) => o.transport({
        kind: "http", method: "POST", signal,
        url: `https://generativelanguage.googleapis.com/v1beta/models/${o.model}:generateContent`,
        headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
        body: { contents: [{ role: "user", parts: [{ text: req.prompt }, { inlineData: { mimeType: req.mimeType, data: req.imageBase64 } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 } },
      }), Math.min(o.timeoutMs ?? DEFAULT_VISION_BACKEND_TIMEOUT_MS, ctx.timeoutMs ?? Infinity), `gemini vision ${o.model}`, ctx.signal);
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
  /** Preferred: tolerant JSON extraction (first valid JSON object in the reply) then this strict validator; wins over `validate`. */
  validateJson?: (value: any) => T;
  /** Overall budget for the whole call across all backends (default visionDeadlineMs(): 90 s). Each backend gets what remains. */
  deadlineMs?: number;
}

export async function runVisionChain<T = string>(
  backends: readonly VisionBackend[], req: VisionImageRequest, opts: VisionChainOptions<T> = {},
): Promise<{ value: T; provider: string; model: string; attempts: number }> {
  if (backends.length === 0) throw new Error("vision chain has no configured backend (check OLLAMA_API_KEY / GEMINI_API_KEY and config/ai-routing.yaml `vision`)");
  const tally = opts.tally ?? newVisionTally();
  const attempts: { provider: string; model: string; error: string }[] = [];
  const deadline = Date.now() + (opts.deadlineMs ?? visionDeadlineMs());
  for (const [i, b] of backends.entries()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const error = "vision deadline exceeded before this backend was tried";
      attempts.push({ provider: b.provider, model: b.model, error });
      if (tally.failures.length < 50) tally.failures.push({ provider: b.provider, model: b.model, error });
      opts.log?.(`vision: ${b.provider}/${b.model} skipped: ${error}`);
      continue;
    }
    try {
      const raw = await b.call(req, { timeoutMs: remaining });
      const value = (opts.validateJson ? extractJsonObject(raw, opts.validateJson) : opts.validate ? opts.validate(raw) : raw) as T;
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
