/**
 * packages/ai/src/providers/gemini.ts — T-019 C2. Gemini adapter (D-005: default first
 * provider — "purchased Gemini API tokens carry 80-90% of the load"). Calls the
 * `generateContent` REST endpoint through the injected `transport`; no real network call in
 * tests (C2).
 */
import type { CompleteResult, EmbedJob, EmbedResult, Job, ModelInfo, Provider, Transport } from "../provider.js";

/** Static-but-labeled manifest (C3) — refresh via https://ai.google.dev/gemini-api/docs/models. */
export const GEMINI_MODELS: ModelInfo[] = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
];

const DEFAULT_MODEL = "gemini-2.5-flash";
/** Separate from DEFAULT_MODEL: generation and embedding are different endpoints and families. */
const DEFAULT_EMBED_MODEL = "gemini-embedding-001";

function roleToGemini(role: string): string {
  return role === "assistant" ? "model" : "user";
}

export interface GeminiConfig {
  apiKey: string;
  model?: string;
  /** Overrides DEFAULT_EMBED_MODEL; `model` selects the generation model and is unrelated. */
  embedModel?: string;
}

export class GeminiProvider implements Provider {
  readonly name = "gemini";

  constructor(
    private readonly transport: Transport,
    private readonly config: GeminiConfig,
  ) {}

  private requireCredentials(): void {
    if (typeof this.config.apiKey !== "string" || !this.config.apiKey.trim()) {
      throw new Error("gemini credentials unavailable");
    }
  }

  async complete(job: Job): Promise<CompleteResult> {
    this.requireCredentials();
    const model = this.config.model ?? DEFAULT_MODEL;
    const systemMessages = job.messages.filter((m) => m.role === "system");
    const turnMessages = job.messages.filter((m) => m.role !== "system");

    const res = await this.transport({
      kind: "http",
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        contents: turnMessages.map((m) => ({
          role: roleToGemini(m.role),
          parts: [{ text: m.content }],
        })),
        systemInstruction: systemMessages.length
          ? { parts: systemMessages.map((m) => ({ text: m.content })) }
          : undefined,
      },
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`gemini API error ${res.status}: ${JSON.stringify(res.body)}`);
    }

    const body = res.body as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");

    return {
      text,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
      provider: this.name,
      model,
      costUsd: 0,
    };
  }

  /**
   * Embeddings (plan §10 U1.1), over the SAME `Transport` as `complete` — so this is one more
   * HTTP shape, not a second SDK, and the existing fake transport covers it in tests.
   *
   * `batchEmbedContents`, not N calls to `embedContents`: the caller chunks a whole session at
   * once, and per-text calls would multiply latency and rate-limit pressure by the chunk count.
   *
   * Two things this deliberately validates rather than trusts, because a silently short or ragged
   * vector list corrupts a similarity search in a way no type checks:
   *   - one vector back per input text, IN ORDER — the caller pairs by index;
   *   - every vector the same length, which is what `dims` then means.
   */
  async embed(job: EmbedJob): Promise<EmbedResult> {
    const model = this.config.embedModel ?? DEFAULT_EMBED_MODEL;
    if (job.texts.length === 0) return { vectors: [], dims: 0, provider: this.name, model };
    this.requireCredentials();

    // MEASURED, not anticipated (U1.0 backfill, 2026-09-08): the API rejects a batch of more than
    // 100 with `400 ... BatchEmbedContentsRequest.requests: at most 100 requests can be in one
    // batch`. Three of the 26 real sessions exceed it (237, 228 and 111 chunks) — 576 chunks, 40%
    // of the corpus, and precisely the LONGEST sessions, i.e. the most content-rich ones. Because
    // `writeSessionChunks` degrades rather than throws, the effect was an index that looked
    // populated while silently missing its three biggest sessions. Splitting here rather than at
    // the caller keeps the provider's own API limit the provider's problem: every caller
    // (indexing, the backfill, a future re-embed) would otherwise have to know this number.
    const MAX_BATCH = 100;
    const vectors: number[][] = [];
    for (let i = 0; i < job.texts.length; i += MAX_BATCH) {
      const slice = job.texts.slice(i, i + MAX_BATCH);
      const res = await this.transport({
        kind: "http",
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${this.config.apiKey}`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {
          requests: slice.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType: job.purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
          })),
        },
      });

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`gemini embed error ${res.status}: ${JSON.stringify(res.body)}`);
      }

      const body = res.body as { embeddings?: { values?: number[] }[] };
      // Per-batch arity is checked here so a short batch names its own offset; the combined
      // checks below still run over the whole set, so a cross-batch dimension mismatch — which
      // no single batch can see — is still caught.
      const batch = (body.embeddings ?? []).map((e) => e.values ?? []);
      if (batch.length !== slice.length) {
        throw new Error(
          `gemini embed returned ${batch.length} vector(s) for ${slice.length} text(s) in the ` +
            `batch at offset ${i} — refusing to pair them by index`,
        );
      }
      vectors.push(...batch);
    }

    if (vectors.length !== job.texts.length) {
      throw new Error(
        `gemini embed returned ${vectors.length} vector(s) for ${job.texts.length} text(s) — ` +
          "refusing to pair them by index",
      );
    }
    const dims = vectors[0]?.length ?? 0;
    if (dims === 0) {
      throw new Error(
        `gemini embed returned ${vectors.length} empty vector(s) — a zero-length embedding has ` +
          "no direction, so cosine against it is 0/0 and it would silently match nothing while " +
          "the row looks populated (ISS-096)",
      );
    }
    const ragged = vectors.findIndex((v) => v.length !== dims);
    if (ragged !== -1) {
      throw new Error(
        `gemini embed returned a ${vectors[ragged]?.length}-dim vector at index ${ragged} but ` +
          `${dims} at index 0 — a ragged set cannot be compared by cosine`,
      );
    }
    return { vectors, dims, provider: this.name, model };
  }

  async listModels(): Promise<ModelInfo[]> {
    return GEMINI_MODELS;
  }
}
