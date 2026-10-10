/**
 * packages/ai/src/trace-registry.ts — T-049. Module-level trace-sink registry and the single
 * wrapper `withTracing`, which `router.route()` applies to every provider it hands out.
 *
 * `setTraceSink(sink)` / `getTraceSink()` (default: no-op) let a later unit (a Langfuse sink, an
 * app logger) install a sink without touching call sites. When no sink was installed explicitly
 * and tracing is ON, the sink is built once from env (`TELEMETRY_TRACE_FILE`, see
 * trace-file-sink.ts). With `TELEMETRY_ENABLED` unset, `withTracing` returns the SAME provider
 * object, so behaviour is unchanged.
 */
import type { Provider } from "./provider.js";
import { isTelemetryEnabled, noopSink, traceProvider, type TraceRecord, type TraceSink } from "./trace.js";
import { fileSinkFromEnv } from "./trace-file-sink.js";

let installed: TraceSink | null = null;
let envSink: TraceSink | null = null;

/** Install the process-wide sink; `null`/`undefined` restores the default. */
export function setTraceSink(sink: TraceSink | null | undefined): void {
  installed = sink ?? null;
  envSink = null;
}

/** The explicitly installed sink, or the no-op sink. */
export function getTraceSink(): TraceSink {
  return installed ?? noopSink;
}

const registrySink: TraceSink = {
  record(rec: TraceRecord) {
    if (installed) return installed.record(rec);
    envSink ??= fileSinkFromEnv();
    return envSink.record(rec);
  },
};

/** Wrap `provider` for tracing; the original object, unchanged, when TELEMETRY_ENABLED is off. */
export function withTracing(provider: Provider, env: Record<string, string | undefined> = process.env): Provider {
  if (!isTelemetryEnabled(env)) return provider;
  return traceProvider(provider, { sink: registrySink, env });
}
