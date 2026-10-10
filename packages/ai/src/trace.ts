/**
 * packages/ai/src/trace.ts — T-049. Provider-agnostic AI call tracing.
 *
 * `traceProvider(provider, opts)` wraps any `Provider` and records ONE `TraceRecord` per
 * `complete` / `embed` call into an injected `TraceSink`. The wrapper is transparent: same
 * result object, same thrown error object (identity preserved), no added retries, and the sink is
 * fire-and-forget — it is never awaited, and a throwing or rejecting sink is swallowed and counted.
 *
 * PRIVACY: a record carries SIZES only (character counts, token counts). It never contains prompt
 * text, completion text, texts to embed, headers or keys, and error MESSAGES are not recorded
 * (only the error class name) because messages routinely echo request content.
 *
 * Sinks: `memorySink` (tests) and `noopSink` ship here. A Langfuse sink is a later unit that
 * implements `TraceSink`; this file imports no SDK and makes no network call.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { CompleteResult, EmbedJob, EmbedResult, Job, Provider } from "./provider.js";

export interface TraceContext {
  /** Caller-supplied id tying this call to a pipeline run / request. Never generated here. */
  correlationId: string;
  /** Caller-supplied tenant. Recorded verbatim when present; NEVER inferred. */
  tenantId?: string;
}

export interface TraceRecord {
  operation: "complete" | "embed";
  /** `Job.kind` / `EmbedJob.kind` (e.g. "extract"); a category label, not content. */
  jobKind: string;
  provider: string;
  /** Model the provider reported; `opts.model` fallback on error; else null. */
  model: string | null;
  startedAtMs: number;
  latencyMs: number;
  inputChars: number;
  outputChars: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  /** Only when the thrown error carries a numeric `retryCount`; the Provider seam exposes none. */
  retries: number | null;
  outcome: "ok" | "error";
  /** Error constructor name when outcome is "error"; never the message. */
  errorClass: string | null;
  correlationId: string | null;
  tenantId: string | null;
}

export interface TraceSink {
  record(rec: TraceRecord): void | Promise<void>;
}

export const noopSink: TraceSink = { record() {} };

export interface MemorySink extends TraceSink {
  readonly records: TraceRecord[];
}

export function memorySink(): MemorySink {
  const records: TraceRecord[] = [];
  return { records, record: (r) => void records.push(r) };
}

export interface TraceStats {
  sinkFailures: number;
}

export interface TraceOptions {
  sink: TraceSink;
  /** Explicit env (tests). Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** Used for `model` only when a failed call reports none. */
  model?: string;
  /** Millisecond clock; injectable for tests. */
  now?: () => number;
  /** Mutable counter the caller may hold to observe swallowed sink failures. */
  stats?: TraceStats;
}

const als = new AsyncLocalStorage<TraceContext>();

/** Run `fn` with a trace context; every traced call made inside (incl. async) inherits it. */
export function withTraceContext<T>(ctx: TraceContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/**
 * Opt-in: tracing is ON only when `TELEMETRY_ENABLED` is exactly "true" (case-insensitive).
 * Unset or any other value means off — T-049 / Vidysea rule 5 is "TELEMETRY_ENABLED=false".
 */
export function isTelemetryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.TELEMETRY_ENABLED ?? "").trim().toLowerCase() === "true";
}

function errorClass(e: unknown): string {
  if (e instanceof Error) return e.constructor?.name || e.name || "Error";
  return typeof e === "object" && e !== null ? "NonErrorObject" : `Non-Error:${typeof e}`;
}

/** Size probe that can never throw: a malformed job must reach the provider unchanged. */
function size(f: () => number): number {
  try {
    const n = f();
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function retriesOf(e: unknown): number | null {
  const n = (e as { retryCount?: unknown } | null)?.retryCount;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function traceProvider(provider: Provider, opts: TraceOptions): Provider {
  if (!isTelemetryEnabled(opts.env ?? process.env)) return provider;
  const now = opts.now ?? Date.now;

  const emit = (rec: TraceRecord): void => {
    const fail = (): void => {
      if (opts.stats) opts.stats.sinkFailures += 1;
    };
    try {
      const r = opts.sink.record(rec);
      if (r && typeof (r as Promise<void>).then === "function") (r as Promise<void>).then(undefined, fail);
    } catch {
      fail();
    }
  };

  const run = async <R>(
    operation: TraceRecord["operation"],
    jobKind: string,
    inputChars: number,
    call: () => Promise<R>,
    summarize: (r: R) => Partial<TraceRecord>,
  ): Promise<R> => {
    const ctx = als.getStore();
    const startedAtMs = now();
    const base = (): TraceRecord => ({
      operation, jobKind, provider: provider.name, model: opts.model ?? null, startedAtMs,
      latencyMs: Math.max(0, now() - startedAtMs), inputChars, outputChars: null,
      inputTokens: null, outputTokens: null, costUsd: null, retries: null, outcome: "ok",
      errorClass: null, correlationId: ctx?.correlationId ?? null, tenantId: ctx?.tenantId ?? null,
    });
    let result: R;
    try {
      result = await call();
    } catch (e) {
      emit({ ...base(), outcome: "error", errorClass: errorClass(e), retries: retriesOf(e) });
      throw e;
    }
    let extra: Partial<TraceRecord> = {};
    try {
      extra = summarize(result);
    } catch {
      /* a malformed result must not break the call */
    }
    emit({ ...base(), ...extra });
    return result;
  };

  const wrapped = Object.create(provider) as Provider;
  wrapped.complete = (job: Job): Promise<CompleteResult> =>
    run(
      "complete", job.kind,
      size(() => job.messages.reduce((n, m) => n + m.content.length, 0)),
      () => provider.complete(job),
      (r) => ({
        model: r.model ?? opts.model ?? null, outputChars: r.text.length,
        inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.costUsd,
      }),
    );
  if (typeof provider.embed === "function") {
    wrapped.embed = (job: EmbedJob): Promise<EmbedResult> =>
      run(
        "embed", job.kind,
        size(() => job.texts.reduce((n, t) => n + t.length, 0)),
        () => provider.embed!(job),
        (r) => ({ model: r.model ?? opts.model ?? null }),
      );
  }
  return wrapped;
}
