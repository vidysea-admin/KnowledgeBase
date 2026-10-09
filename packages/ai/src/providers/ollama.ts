/**
 * packages/ai/src/providers/ollama.ts — T-019 C2/C3. Local Ollama adapter (chain member per
 * D-008's no-single-AI-dependency rule — the offline/local option). `listModels()` is the one
 * adapter whose manifest is a REAL transport call, shaped like Ollama's local `/api/tags`
 * endpoint (C3), still injectable so tests use a fake.
 */
import type { CompleteResult, EmbedJob, EmbedResult, Job, ModelInfo, Provider, Transport } from "../provider.js";

const DEFAULT_MODEL = "llama3.1";
const DEFAULT_BASE_URL = "http://localhost:11434";
/** A dedicated embedding model, not the chat one — `llama3.1` has no embedding endpoint. */
const DEFAULT_EMBED_MODEL = "nomic-embed-text";

/** Nomic RAG task instructions are part of the model-semantic binding, not source text. */
export function ollamaEmbeddingInputs(job: EmbedJob, model: string): string[] {
  if (model.split(":")[0] !== "nomic-embed-text") return [...job.texts];
  if (job.purpose !== undefined && job.purpose !== "query" && job.purpose !== "document") {
    throw new Error("invalid nomic embedding purpose");
  }
  const prefix = job.purpose === "query" ? "search_query: " : "search_document: ";
  return job.texts.map(text => prefix + text);
}

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  /** Overrides DEFAULT_EMBED_MODEL; `model` selects the chat model and is unrelated. */
  embedModel?: string;
}

export class OllamaProvider implements Provider {
  readonly name = "ollama";
  private readonly baseUrl: string;

  constructor(
    private readonly transport: Transport,
    private readonly config: OllamaConfig = {},
  ) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async complete(job: Job): Promise<CompleteResult> {
    const model = this.config.model ?? DEFAULT_MODEL;
    // Speaker-segment-identity gate (Option A, phase 2): jobs may carry structured-output
    // requirements and determinism options. `format` passes a JSON schema straight through to
    // Ollama's structured-outputs mode; `options` seeds deterministic local sampling; `think`
    // disables the reasoning token block for models like qwen3 that would otherwise spend the
    // whole prediction budget there. All three are opt-in via the job so other jobKinds are
    // unchanged.
    const opts = (job as Job & { structured?: { format?: unknown; options?: Record<string, unknown>; think?: boolean } })
      .structured;
    const res = await this.transport({
      kind: "http",
      url: `${this.baseUrl}/api/chat`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        model,
        stream: false,
        messages: job.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(opts?.format ? { format: opts.format } : {}),
        ...(opts?.options ? { options: opts.options } : {}),
        ...(opts?.think !== undefined ? { think: opts.think } : {}),
      },
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`ollama API error ${res.status}: ${JSON.stringify(res.body)}`);
    }

    const body = res.body as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: body.message?.content ?? "",
      usage: {
        inputTokens: body.prompt_eval_count ?? 0,
        outputTokens: body.eval_count ?? 0,
      },
      provider: this.name,
      model,
      costUsd: 0,
    };
  }

  /** Calls the local /api/tags-shaped transport for a live model manifest (C3). */
  /**
   * Local embeddings (plan §10 U1.1, D-b). Ollama's `/api/embed` takes an array and returns
   * `embeddings`, so one call covers the batch exactly as the Gemini adapter does.
   *
   * This is the member of the chain that keeps `goal.md`'s "never leak the corpus into a public
   * model" reachable: chunking the whole transcript corpus for a vector index is the single
   * largest volume of Vidysea text that would ever leave the building, and here it does not have to.
   *
   * The same two guarantees Gemini's adapter enforces are enforced here, for the same reason — a
   * short or ragged vector list corrupts a similarity search silently.
   */
  async embed(job: EmbedJob): Promise<EmbedResult> {
    const model = this.config.embedModel ?? DEFAULT_EMBED_MODEL;
    if (job.texts.length === 0) return { vectors: [], dims: 0, provider: this.name, model };

    const res = await this.transport({
      kind: "http",
      url: `${this.baseUrl}/api/embed`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { model, input: ollamaEmbeddingInputs(job, model), truncate: false, options: { num_thread: 1 } },
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`ollama embed error ${res.status}: ${JSON.stringify(res.body)}`);
    }

    const body = res.body as { embeddings?: number[][] };
    const vectors = body.embeddings ?? [];
    if (vectors.length !== job.texts.length) {
      throw new Error(
        `ollama embed returned ${vectors.length} vector(s) for ${job.texts.length} text(s) — ` +
          "refusing to pair them by index",
      );
    }
    const dims = vectors[0]?.length ?? 0;
    if (dims === 0) {
      throw new Error(
        `ollama embed returned ${vectors.length} empty vector(s) — a zero-length embedding has ` +
          "no direction, so cosine against it is 0/0 and it would silently match nothing while " +
          "the row looks populated (ISS-096)",
      );
    }
    const ragged = vectors.findIndex((v) => v.length !== dims);
    if (ragged !== -1) {
      throw new Error(
        `ollama embed returned a ${vectors[ragged]?.length}-dim vector at index ${ragged} but ` +
          `${dims} at index 0 — a ragged set cannot be compared by cosine`,
      );
    }
    if (vectors.some((v) => v.some((value) => !Number.isFinite(value)))) {
      throw new Error("ollama embed returned non-finite values");
    }
    return { vectors, dims, provider: this.name, model };
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.transport({
      kind: "http",
      url: `${this.baseUrl}/api/tags`,
      method: "GET",
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`ollama /api/tags error ${res.status}: ${JSON.stringify(res.body)}`);
    }

    const body = res.body as { models?: { name?: string }[] };
    return (body.models ?? [])
      .filter((m): m is { name: string } => typeof m.name === "string")
      .map((m) => ({ id: m.name, label: m.name }));
  }
}
