/**
 * packages/ai/src/trace-file-sink.ts — T-049. JSON-lines file sink for `TraceRecord`s.
 *
 * Format: one `JSON.stringify(record)` per line (`\n`-terminated), UTF-8, append-only. The sink only
 * ever receives the tracer's record (sizes, tokens, class names, ids), so it cannot write prompt or
 * completion text. Guarantees: `record()` never throws or rejects; one `appendFile` per record,
 * serialised through a queue so lines never interleave; the parent directory is created on first
 * write (mode 0o700) and the file is created 0o600 (honoured on POSIX, ignored on Windows); a write
 * failure bumps `failures` and warns once; past `maxBytes` (counting what is already in the file)
 * the sink stops writing and warns once, so a forgotten flag cannot fill the disk. The queue of
 * pending records is bounded (`maxPending`, default 1000): when full the NEWEST record is dropped
 * (counted in `dropped`, one warning), so a hung or slow disk cannot grow memory without limit.
 * No per-write timeout: with an append that never settles, pending stays at the cap and every later
 * record is dropped and counted.
 * No dependency, no network.
 */
import { appendFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { noopSink, type TraceRecord, type TraceSink } from "./trace.js";

/** Default cap on records waiting to be written. */
export const DEFAULT_TRACE_MAX_PENDING = 1000;

/** 50 MiB: roughly 200k records. */
export const DEFAULT_TRACE_MAX_BYTES = 50 * 1024 * 1024;

export interface FileSinkOptions {
  path: string;
  /** Stop writing once the file would exceed this many bytes. Default 50 MiB. */
  maxBytes?: number;
  /** Max records waiting for the file; beyond it new records are dropped. Default 1000. */
  maxPending?: number;
  /** Append implementation; a seam for tests (e.g. a write that never settles). Default fs appendFile. */
  appendFile?: typeof appendFile;
  /** Receives each warning once; defaults to stderr. */
  warn?: (msg: string) => void;
}

export interface FileSink extends TraceSink {
  readonly stats: { written: number; failures: number; dropped: number; pending: number; stoppedBySize: boolean };
  /** Resolves when every record queued so far has been attempted (tests, shutdown). */
  flush(): Promise<void>;
}

const stderrWarn = (msg: string): void => {
  try {
    process.stderr.write(`[trace] ${msg}\n`);
  } catch {
    /* nothing left to do */
  }
};

export function fileSink(opts: FileSinkOptions): FileSink {
  const maxBytes = opts.maxBytes !== undefined && opts.maxBytes >= 0 ? opts.maxBytes : DEFAULT_TRACE_MAX_BYTES;
  const maxPending = opts.maxPending !== undefined && opts.maxPending >= 1 ? Math.floor(opts.maxPending) : DEFAULT_TRACE_MAX_PENDING;
  const doAppend = opts.appendFile ?? appendFile;
  const warnRaw = opts.warn ?? stderrWarn;
  const warn = (m: string): void => {
    try {
      warnRaw(m);
    } catch {
      /* a broken warner must not reach the call path */
    }
  };
  const stats = { written: 0, failures: 0, dropped: 0, pending: 0, stoppedBySize: false };
  let size: number | null = null;
  let failureWarned = false;
  let queueWarned = false;
  let tail: Promise<void> = Promise.resolve();

  const append = async (line: string): Promise<void> => {
    if (stats.stoppedBySize) {
      stats.dropped += 1;
      return;
    }
    try {
      if (size === null) {
        await mkdir(dirname(opts.path), { recursive: true, mode: 0o700 });
        size = await stat(opts.path).then((s) => s.size, () => 0);
      }
      const bytes = Buffer.byteLength(line, "utf8");
      if (size + bytes > maxBytes) {
        stats.stoppedBySize = true;
        stats.dropped += 1;
        warn(`trace file reached ${maxBytes} bytes (${opts.path}); further traces are dropped`);
        return;
      }
      await doAppend(opts.path, line, { encoding: "utf8", flag: "a", mode: 0o600 });
      size += bytes;
      stats.written += 1;
    } catch (e) {
      stats.failures += 1;
      stats.dropped += 1;
      if (!failureWarned) {
        failureWarned = true;
        const code = (e as { code?: unknown } | null)?.code;
        warn(`trace file write failed (${typeof code === "string" ? code : "error"}); failures are counted, not repeated`);
      }
    }
  };

  return {
    stats,
    record(rec: TraceRecord): void {
      try {
        const line = `${JSON.stringify(rec)}\n`;
        if (stats.pending >= maxPending) {
          stats.dropped += 1;
          if (!queueWarned) {
            queueWarned = true;
            warn(`trace file cannot keep up (${maxPending} records pending); new traces are being dropped`);
          }
          return;
        }
        stats.pending += 1;
        tail = tail.then(() => append(line)).catch(() => undefined).then(() => { stats.pending -= 1; });
      } catch {
        stats.failures += 1;
      }
    },
    flush: () => tail,
  };
}

/**
 * Sink from env: `TELEMETRY_TRACE_FILE` (path) and optional `TELEMETRY_TRACE_MAX_BYTES`. With no
 * path configured it returns the no-op sink and says so once on stderr.
 */
export function fileSinkFromEnv(
  env: Record<string, string | undefined> = process.env,
  warn: (msg: string) => void = stderrWarn,
): TraceSink {
  const path = (env.TELEMETRY_TRACE_FILE ?? "").trim();
  if (!path) {
    warn("TELEMETRY_ENABLED is true but TELEMETRY_TRACE_FILE is not set; traces are discarded");
    return noopSink;
  }
  const max = Number((env.TELEMETRY_TRACE_MAX_BYTES ?? "").trim());
  return fileSink({ path, warn, ...(Number.isFinite(max) && max > 0 ? { maxBytes: max } : {}) });
}
