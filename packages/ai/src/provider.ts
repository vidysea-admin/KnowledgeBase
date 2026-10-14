/**
 * packages/ai/src/provider.ts — T-019 C1. The ONE `Provider` interface every adapter under
 * `providers/*.ts` implements, plus the shared `Message`/`Job`/`CompleteResult` shapes and the
 * `Transport` seam every adapter's HTTP/CLI call goes through (ARCHITECTURE H10; contract
 * `qa/contracts/ai-provider-seam.md` C1-C2). No adapter re-declares these shapes — they import
 * from here.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
}

export interface Job {
  kind: string;
  messages: Message[];
  tools?: unknown[];
  schema?: unknown;
  maxCost?: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompleteResult {
  text: string;
  json?: unknown;
  usage: Usage;
  provider: string;
  model: string;
  costUsd: number;
}

export interface ModelInfo {
  id: string;
  label: string;
}

/** One embedding request. Batched, because every provider charges and rate-limits per call. */
export interface EmbedJob {
  kind: string;
  texts: string[];
  /** Providers that support it (gemini) truncate/normalise differently for query vs document. */
  purpose?: "document" | "query";
}

export interface EmbedResult {
  /** One vector per input text, in the SAME ORDER — the caller pairs them back by index. */
  vectors: number[][];
  dims: number;
  provider: string;
  model: string;
}

/**
 * One `Provider` per adapter. `complete` runs one job; `listModels` returns the provider's
 * dropdown manifest (C3 — static-but-labeled for gemini/openai/anthropic/claude-code, a real
 * transport call for ollama).
 *
 * `embed` is OPTIONAL (plan §10 U1.1). Not every provider has an embedding endpoint — claude-code
 * runs a CLI and Anthropic ships no embedding API — and making it required would force four
 * adapters to implement a method that throws, which is a worse lie than not implementing it. The
 * router skips providers where it is absent, so an embedding chain degrades to the members that
 * actually support one rather than failing at the first that does not.
 */
export interface Provider {
  readonly name: string;
  complete(job: Job): Promise<CompleteResult>;
  listModels(): Promise<ModelInfo[]>;
  embed?(job: EmbedJob): Promise<EmbedResult>;
}

/** Narrowing helper so callers test capability rather than duck-typing at each call site. */
export function canEmbed(p: Provider): p is Provider & Required<Pick<Provider, "embed">> {
  return typeof p.embed === "function";
}

/**
 * Every adapter's network/process call is injected as a `Transport` (C2) so tests never touch
 * a real network or spawn a real process — a fake transport returns a canned `TransportResponse`
 * instead. One shape covers both HTTP-style adapters (gemini/openai/anthropic/ollama) and
 * CLI-style adapters (claude-code) rather than declaring two seams.
 */
export interface TransportRequest {
  /** "http" for a fetch-shaped call, "cli" for a spawned-process call. */
  kind: "http" | "cli";
  /** http: full URL. */
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** cli: the binary to run (e.g. "claude") and its argv. */
  command?: string;
  args?: string[];
  stdin?: string;
  /** http: aborts the underlying request when fired (a timeout must really cancel the fetch). Optional; fakes ignore it. */
  signal?: AbortSignal;
}

export interface TransportResponse {
  /** http: HTTP status. cli: process exit code. */
  status: number;
  /** http: parsed JSON body (or raw text if not JSON). cli: parsed stdout JSON if parseable. */
  body: unknown;
  /** cli: raw stdout text; http: raw response text when not JSON. */
  text?: string;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;
