/**
 * apps/api/src/composition/logger.ts — D7 structured logging. One JSON object per line on stdout:
 * `{...fields, time, level, msg}` (requestId arrives via `child({requestId})`). No dependency
 * (apps/api lists no logger package).
 *
 * Redaction is applied to EVERY line, at serialisation time, in two ways:
 *  - by KEY: any field whose name is a credential/body/header/query carrier is replaced by "[redacted]"
 *    (authorization, cookie, x-api-key, token, password, body, headers, query, ...), at any depth;
 *  - by VALUE: strings (msg, error text/stacks, nested strings) are scrubbed of Mongo connection-string
 *    credentials, Bearer tokens, `x-api-key`/`api_key=` pairs, URL query strings, and the literal
 *    value of MONGODB_URL if it carries credentials.
 * Level comes from LOG_LEVEL (debug|info|warn|error|silent; default info), read on every call so a
 * `.env` loaded after import still applies. Under `node --test` with LOG_LEVEL unset the default is
 * silent, so existing suites do not interleave JSON lines with test output.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;
export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger that stamps `base` (e.g. `{requestId}`) on every line. */
  child(base: LogFields): Logger;
}
export interface LoggerOptions {
  /** Receives one complete line (with trailing newline). Default: process.stdout. */
  write?: (line: string) => void;
  /** Fixed level; default reads LOG_LEVEL per call. */
  level?: LogLevel | "silent";
  base?: LogFields;
  /** Environment used for level resolution (LOG_LEVEL, NODE_TEST_CONTEXT); default process.env. Lets tests pin it. */
  env?: Record<string, string | undefined>;
}

const RANK: Record<LogLevel | "silent", number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const REDACTED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_STRING = 8192;
const SENSITIVE_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|apikey|key|keys|token|access[-_]?token|refresh[-_]?token|secret|client[-_]?secret|password|passwd|credentials?|mongodb[-_]?url|mongo[-_]?url|connection[-_]?string|headers?|body|req|res|request|response|query|querystring|search|payload|data)$/i;

export function resolveLevel(raw: string | undefined = process.env.LOG_LEVEL, env: Record<string, string | undefined> = process.env): LogLevel | "silent" {
  const v = raw?.trim().toLowerCase();
  if (v && v in RANK) return v as LogLevel | "silent";
  if (!v && env.NODE_TEST_CONTEXT) return "silent";
  return "info";
}

/** Scrub secrets out of free text (messages, stacks, error strings). */
export function scrubString(input: string): string {
  let s = input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}...[truncated]` : input;
  const mongo = process.env.MONGODB_URL;
  if (mongo && mongo.length >= 8 && /\/\/[^/@\s]+@/.test(mongo)) s = s.split(mongo).join("[redacted-mongodb-url]");
  s = s.replace(/(mongodb(?:\+srv)?:\/\/)[^\s/@]*@/gi, "$1[redacted]@");
  s = s.replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [redacted]");
  s = s.replace(/\b(x-api-key|api[-_]?key|authorization|cookie|set-cookie|access[-_]?token|password|secret)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, `$1$2${REDACTED}`);
  s = s.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#"']*|\s\/[^\s?#"']*)\?[^\s#"']*/gi, "$1?[redacted]");
  return s;
}

function errorToObject(e: Error, depth: number): LogFields {
  const out: LogFields = { name: e.name, message: scrubString(e.message) };
  if (e.stack) out.stack = scrubString(e.stack);
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") out.code = code;
  if (e.cause !== undefined && depth < MAX_DEPTH) out.cause = sanitize(e.cause, depth + 1, new WeakSet());
  return out;
}

function sanitize(v: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof v === "string") return scrubString(v);
  if (v === null || typeof v === "number" || typeof v === "boolean" || v === undefined) return v;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "function" || typeof v === "symbol") return undefined;
  if (v instanceof Error) return errorToObject(v, depth);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v !== "object") return undefined;
  if (seen.has(v) || depth >= MAX_DEPTH) return "[truncated]";
  seen.add(v);
  if (Array.isArray(v)) return v.slice(0, 100).map((x) => sanitize(x, depth + 1, seen));
  const out: LogFields = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : sanitize(val, depth + 1, seen);
  }
  return out;
}

export function formatLine(level: LogLevel, msg: string, base: LogFields, fields?: LogFields): string {
  const merged = sanitize({ ...base, ...(fields ?? {}) }, 0, new WeakSet()) as LogFields;
  // Reserved keys last, so a caller field can never overwrite time/level/msg.
  const line = { ...merged, time: new Date().toISOString(), level, msg: scrubString(String(msg)) };
  try { return `${JSON.stringify(line)}\n`; } catch { return `${JSON.stringify({ time: line.time, level, msg: line.msg, logError: "unserialisable" })}\n`; }
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const write = opts.write ?? ((line: string) => { process.stdout.write(line); });
  const build = (base: LogFields): Logger => {
    const emit = (level: LogLevel) => (msg: string, fields?: LogFields): void => {
      if (RANK[level] < RANK[opts.level ?? (opts.env ? resolveLevel(opts.env.LOG_LEVEL, opts.env) : resolveLevel())]) return;
      try { write(formatLine(level, msg, base, fields)); } catch { /* logging must never break a request */ }
    };
    return { debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error"), child: (b) => build({ ...base, ...b }) };
  };
  return build(opts.base ?? {});
}

/** Process-wide default (stdout, LOG_LEVEL). */
export const logger: Logger = createLogger();
