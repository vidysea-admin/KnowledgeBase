/**
 * packages/ai/src/trace-langfuse/payload.ts — T-049. PURE mapping from `TraceRecord` to a Langfuse
 * ingestion batch, plus base-URL validation. No I/O, no env, no clock, no randomness (ids injected).
 *
 * ASSUMPTION (not evidenced in this repo, verify on a real self-hosted instance; correct HERE only):
 *   A1 endpoint path    `POST {baseUrl}/api/public/ingestion`            (INGESTION_PATH)
 *   A2 auth header      `Authorization: Basic base64(publicKey:secretKey)` (built in sink.ts)
 *   A3 body shape       `{ batch: [{ id, type, timestamp, body }] }`
 *   A4 event types      "trace-create" and "generation-create"
 *   A5 trace body keys  id, name, timestamp, sessionId, metadata
 *   A6 generation keys  id, traceId, name, startTime, endTime, model, level, statusMessage,
 *                       usageDetails{input,output}, costDetails{total}, metadata
 *   A7 2xx (incl. 207 multi-status) means accepted; per-event errors inside a 207 are NOT parsed.
 *
 * WHAT MAY LEAVE: only fields the redacted TraceRecord carries, each re-validated here (defence in
 * depth): label-shaped strings (<= 64 chars of [A-Za-z0-9._:-], no key-looking prefix, no long
 * opaque run), finite non-negative numbers. Anything else is OMITTED, never forwarded. There is no
 * input/output/prompt/completion field. `errorClass` (a class name) is sent, never a message.
 * `tenantId` and `correlationId` ARE sent (the tracer contract exposes them; caller-supplied ids,
 * validated as labels); a value that is not label-shaped is dropped.
 */
import type { TraceRecord } from "../trace.js";

export const INGESTION_PATH = "/api/public/ingestion";

export interface LangfuseEvent {
  id: string;
  type: "trace-create" | "generation-create";
  timestamp: string;
  body: Record<string, unknown>;
}
export interface LangfuseBatch {
  batch: LangfuseEvent[];
}

const LABEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const KEYISH = /^(sk-|pk-|AIza|ghp_|gho_|xox.-|eyJ|Bearer)|[A-Za-z0-9]{24,}/;

/** A label-shaped string, or undefined. Never throws. */
export function label(v: unknown): string | undefined {
  return typeof v === "string" && LABEL.test(v) && !KEYISH.test(v) ? v : undefined;
}

function count(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;
}

function money(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function iso(ms: unknown): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Copy only the defined entries; undefined when nothing is left. */
function compact(o: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Map ONE record to its two events (trace + generation). Pure. */
export function toLangfuseEvents(rec: TraceRecord, genId: () => string): LangfuseEvent[] {
  const startMs = typeof rec.startedAtMs === "number" ? rec.startedAtMs : NaN;
  const lat = count(rec.latencyMs) ?? 0;
  const start = iso(startMs) ?? "1970-01-01T00:00:00.000Z";
  const end = iso(startMs + lat) ?? start;
  const traceId = genId();
  const operation = rec.operation === "embed" ? "embed" : "complete";
  const failed = rec.outcome === "error";
  const jobKind = label(rec.jobKind) ?? "unknown";
  const provider = label(rec.provider);
  const errorClass = label(rec.errorClass);
  const tenantId = label(rec.tenantId);
  const inTok = count(rec.inputTokens);
  const outTok = count(rec.outputTokens);
  const cost = money(rec.costUsd);

  const trace: LangfuseEvent = {
    id: genId(),
    type: "trace-create",
    timestamp: start,
    body: {
      id: traceId,
      name: jobKind,
      timestamp: start,
      ...(label(rec.correlationId) ? { sessionId: label(rec.correlationId) } : {}),
      ...(compact({ tenantId, operation, provider }) ? { metadata: compact({ tenantId, operation, provider }) } : {}),
    },
  };
  const usage = compact({ input: inTok, output: outTok });
  const costDetails = compact({ total: cost });
  const metadata = compact({
    operation, jobKind, provider, outcome: failed ? "error" : "ok", errorClass: failed ? errorClass : undefined,
    inputChars: count(rec.inputChars), outputChars: count(rec.outputChars), retries: count(rec.retries),
  });
  const gen: LangfuseEvent = {
    id: genId(),
    type: "generation-create",
    timestamp: start,
    body: {
      id: genId(),
      traceId,
      name: `${operation}:${jobKind}`,
      startTime: start,
      endTime: end,
      level: failed ? "ERROR" : "DEFAULT",
      ...(label(rec.model) ? { model: label(rec.model) } : {}),
      ...(failed && errorClass ? { statusMessage: errorClass } : {}),
      ...(usage ? { usageDetails: usage } : {}),
      ...(costDetails ? { costDetails } : {}),
      ...(metadata ? { metadata } : {}),
    },
  };
  return [trace, gen];
}

/** Map records to the ingestion body. Pure; a record that cannot be mapped is skipped. */
export function toLangfuseBatch(records: readonly TraceRecord[], genId: () => string): LangfuseBatch {
  const batch: LangfuseEvent[] = [];
  for (const r of records) {
    try {
      batch.push(...toLangfuseEvents(r, genId));
    } catch {
      /* unmappable record: skipped, never forwarded raw */
    }
  }
  return { batch };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validate the configured base URL and return it normalised (no trailing slash). Rules: https
 * anywhere; http ONLY for localhost / 127.0.0.1 / [::1] (the service is self-hosted on this machine
 * and a loopback hop never leaves it; remote http would send the keys in clear). No userinfo, no
 * query, no fragment. Errors are generic and never echo the input (it may carry a password).
 */
export function validateBaseUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") throw new Error("invalid Langfuse base URL");
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("invalid Langfuse base URL");
  }
  const okScheme = u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.has(u.hostname));
  if (!okScheme || /[?#@]/.test(raw) || u.username || u.password || u.search || u.hash || !u.hostname) {
    throw new Error("invalid Langfuse base URL");
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}
