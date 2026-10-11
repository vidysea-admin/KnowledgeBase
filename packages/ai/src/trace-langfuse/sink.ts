/**
 * packages/ai/src/trace-langfuse/sink.ts — T-049. Langfuse (self-hosted) `TraceSink`, UNWIRED by
 * default. `createLangfuseSink` reads NO environment; fetch and timers are injected. No SDK, no
 * dependency, and nothing here contacts any host unless a caller hands it a fetch.
 *
 * Guarantees: `record()` never throws, never awaits, never returns a promise. A bounded queue
 * (`maxPending`, default 1000, same discipline as the file sink: when full the NEWEST record is
 * dropped and counted). Batches of <= `batchSize`. Each request has a timeout (AbortController +
 * injected timer). Retries (`maxRetries`, default 2, exponential backoff) ONLY for network errors,
 * timeouts and 5xx; 4xx and 3xx are final. Redirects are never followed (`redirect: "manual"`; any
 * 3xx / opaque redirect is a failure). A batch that still fails is dropped and counted, so a dead
 * endpoint cannot grow memory. `flush()` / `close()` resolve within `flushTimeoutMs` even when fetch
 * hangs; `close()` aborts in-flight requests and clears every timer. Credentials go ONLY in the
 * Authorization header; errors surface as static codes ("http_503", "timeout", "network"), never
 * as messages. See payload.ts for the ASSUMPTIONs about the Langfuse API.
 */
import { randomUUID } from "node:crypto";
import { isTelemetryEnabled, type TraceRecord, type TraceSink } from "../trace.js";
import { INGESTION_PATH, toLangfuseBatch, validateBaseUrl } from "./payload.js";

export type FetchFn = (url: string, init: Record<string, unknown>) => Promise<{ status: number; type?: string; body?: unknown }>;
type Handle = unknown;

export interface LangfuseSinkOptions {
  fetch: FetchFn;
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  maxPending?: number;
  batchSize?: number;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  flushTimeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => Handle;
  clearTimer?: (h: Handle) => void;
  genId?: () => string;
  /** Receives a static code only ("http_503", "timeout", "network", "redirect", "queue_full"). */
  onError?: (code: string) => void;
}

export interface LangfuseSink extends TraceSink {
  readonly stats: { sent: number; failures: number; dropped: number; pending: number; retries: number };
  flush(): Promise<void>;
  close(): Promise<void>;
}

export const DEFAULT_LANGFUSE_MAX_PENDING = 1000;

const pos = (v: number | undefined, d: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.floor(v) : d);

export function createLangfuseSink(opts: LangfuseSinkOptions): LangfuseSink {
  const base = validateBaseUrl(opts.baseUrl); // throws a generic error; never echoes the URL
  if (typeof opts.publicKey !== "string" || !opts.publicKey || typeof opts.secretKey !== "string" || !opts.secretKey) {
    throw new Error("Langfuse keys are required");
  }
  const url = `${base}${INGESTION_PATH}`;
  const auth = `Basic ${Buffer.from(`${opts.publicKey}:${opts.secretKey}`, "utf8").toString("base64")}`;
  const maxPending = pos(opts.maxPending, DEFAULT_LANGFUSE_MAX_PENDING);
  const batchSize = pos(opts.batchSize, 50);
  const timeoutMs = pos(opts.timeoutMs, 10_000);
  const maxRetries = typeof opts.maxRetries === "number" && opts.maxRetries >= 0 ? Math.floor(opts.maxRetries) : 2;
  const backoffMs = pos(opts.backoffMs, 500);
  const flushTimeoutMs = pos(opts.flushTimeoutMs, 5_000);
  const setT = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const genId = opts.genId ?? randomUUID;
  const stats = { sent: 0, failures: 0, dropped: 0, pending: 0, retries: 0 };
  const queue: TraceRecord[] = [];
  const timers = new Set<Handle>();
  const wakers = new Set<() => void>();
  const aborts = new Set<AbortController>();
  let running: Promise<void> | null = null;
  let closed = false;
  let fullReported = false;

  const report = (code: string): void => {
    try {
      opts.onError?.(code);
    } catch {
      /* a broken callback must not reach the call path */
    }
  };
  const timer = (fn: () => void, ms: number): Handle => {
    const h = setT(() => { timers.delete(h); fn(); }, ms);
    timers.add(h);
    return h;
  };
  const untimer = (h: Handle): void => {
    timers.delete(h);
    try { clearT(h); } catch { /* ignore */ }
  };
  const sleep = (ms: number): Promise<void> => new Promise<void>((res) => {
    const done = (): void => { wakers.delete(done); res(); };
    wakers.add(done);
    timer(done, ms);
  });

  /** One POST. "ok" | "retry" | "final"; reports a static code on failure. */
  const attempt = async (body: string): Promise<"ok" | "retry" | "final"> => {
    const ac = new AbortController();
    aborts.add(ac);
    let h: Handle;
    let timedOut = false;
    const abortP = new Promise<never>((_, rej) => {
      h = timer(() => { timedOut = true; ac.abort(); rej(new Error("timeout")); }, timeoutMs);
      ac.signal.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
    });
    abortP.catch(() => undefined);
    try {
      const res = await Promise.race([
        opts.fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: auth },
          body,
          redirect: "manual",
          signal: ac.signal,
        }),
        abortP,
      ]);
      const st = res?.status;
      try { (res?.body as { cancel?: () => unknown } | undefined)?.cancel?.(); } catch { /* ignore */ }
      if (typeof st === "number" && st >= 200 && st < 300) return "ok";
      if (res?.type === "opaqueredirect" || st === 0 || (typeof st === "number" && st >= 300 && st < 400)) {
        report("redirect");
        return "final";
      }
      report(`http_${typeof st === "number" ? st : "unknown"}`);
      return typeof st === "number" && st >= 500 ? "retry" : "final";
    } catch {
      report(closed ? "closed" : timedOut ? "timeout" : "network");
      return closed ? "final" : "retry";
    } finally {
      untimer(h!);
      aborts.delete(ac);
    }
  };

  const sendBatch = async (recs: TraceRecord[]): Promise<void> => {
    let body: string;
    try {
      body = JSON.stringify(toLangfuseBatch(recs, genId));
    } catch {
      stats.dropped += recs.length;
      return;
    }
    for (let n = 0; ; n++) {
      const r = await attempt(body);
      if (r === "ok") {
        stats.sent += recs.length;
        return;
      }
      if (r === "final" || n >= maxRetries || closed) break;
      stats.retries += 1;
      await sleep(backoffMs * 2 ** n);
      if (closed) break;
    }
    stats.failures += 1;
    stats.dropped += recs.length;
  };

  const drain = async (): Promise<void> => {
    await Promise.resolve(); // let a synchronous burst accumulate into one batch
    while (queue.length > 0 && !closed) {
      const recs = queue.splice(0, batchSize);
      try {
        await sendBatch(recs);
      } catch {
        stats.dropped += recs.length;
      }
      stats.pending -= recs.length;
    }
  };

  const kick = (): void => {
    if (running || closed) return;
    running = drain().catch(() => undefined).then(() => {
      running = null;
      if (queue.length > 0) kick();
    });
  };

  const flush = async (): Promise<void> => {
    const cur = running;
    if (!cur) return;
    let h: Handle;
    const limit = new Promise<void>((res) => { h = timer(res, flushTimeoutMs); });
    try {
      await Promise.race([cur, limit]);
    } finally {
      untimer(h!);
    }
  };

  return {
    stats,
    record(rec: TraceRecord): void {
      try {
        if (closed || stats.pending >= maxPending) {
          stats.dropped += 1;
          if (!closed && !fullReported) {
            fullReported = true;
            report("queue_full");
          }
          return;
        }
        stats.pending += 1;
        queue.push(rec);
        kick();
      } catch {
        stats.failures += 1;
      }
    },
    flush,
    async close(): Promise<void> {
      if (closed) return;
      try { await flush(); } catch { /* bounded anyway */ }
      closed = true;
      for (const ac of [...aborts]) {
        try { ac.abort(); } catch { /* ignore */ }
      }
      for (const w of [...wakers]) w();
      for (const h of [...timers]) untimer(h);
      stats.dropped += queue.length;
      stats.pending -= queue.length;
      queue.length = 0;
      if (running) await running; // settles promptly: every attempt races an already-fired abort
    },
  };
}

export interface LangfuseEnvOptions {
  fetch?: FetchFn;
  warn?: (msg: string) => void;
}

/**
 * Selection predicate (also used by the registry): the Langfuse sink is chosen ONLY when
 * `TELEMETRY_ENABLED` is true AND `TELEMETRY_SINK` is exactly "langfuse" (case-insensitive).
 */
export function selectsLangfuse(env: Record<string, string | undefined>): boolean {
  return isTelemetryEnabled(env) && (env.TELEMETRY_SINK ?? "").trim().toLowerCase() === "langfuse";
}

/**
 * Build the sink from env: `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`.
 * Returns null (warning once per code, naming only variable NAMES) when not selected, when any is
 * missing, or when the URL is refused, so the caller falls back to the existing selection.
 */
export function langfuseSinkFromEnv(
  env: Record<string, string | undefined> = process.env,
  o: LangfuseEnvOptions = {},
): LangfuseSink | null {
  if (!selectsLangfuse(env)) return null;
  const warnRaw = o.warn ?? ((m: string) => { process.stderr.write(`[trace] ${m}\n`); });
  const warn = (m: string): void => {
    try { warnRaw(m); } catch { /* ignore */ }
  };
  const baseUrl = (env.LANGFUSE_BASE_URL ?? "").trim();
  const publicKey = (env.LANGFUSE_PUBLIC_KEY ?? "").trim();
  const secretKey = (env.LANGFUSE_SECRET_KEY ?? "").trim();
  if (!baseUrl || !publicKey || !secretKey) {
    warn("TELEMETRY_SINK=langfuse needs LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY; falling back");
    return null;
  }
  const f = o.fetch ?? (globalThis.fetch as unknown as FetchFn | undefined);
  if (!f) {
    warn("no fetch available for the Langfuse sink; falling back");
    return null;
  }
  const seen = new Set<string>();
  const onError = (c: string): void => {
    if (!seen.has(c)) {
      seen.add(c);
      warn(`langfuse export failed (${c}); further failures with this code are counted, not repeated`);
    }
  };
  try {
    return createLangfuseSink({ fetch: f, baseUrl, publicKey, secretKey, onError });
  } catch {
    warn("LANGFUSE_BASE_URL was refused (https required, or http only for localhost); falling back");
    return null;
  }
}
