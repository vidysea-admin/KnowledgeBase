/**
 * packages/ai/src/trace-langfuse/ingestion-response.ts — T-049. PURE parser for the body of
 * Langfuse's batch ingestion response (`POST /api/public/ingestion`, normally 207 Multi-Status):
 *   { successes: [{ id, status }], errors: [{ id, status, message, error }] }
 * where each `id` is the id of an EVENT in the submitted batch (not a trace id).
 *
 * ASSUMPTION (from Langfuse's public API reference, NOT a pinned schema or a live server; the repo
 * has neither): the shape above. Only `id` (string) and `status` (integer) are ever read. The
 * `message` and `error` fields can echo submitted content, so they are never read, stored or
 * logged. Never throws; returns null for anything that is not that shape.
 */
export interface IngestionEntry {
  id: string | null;
  status: number | null;
}
export interface IngestionResult {
  successes: IngestionEntry[];
  errors: IngestionEntry[];
  /** which of the two arrays the body actually carried */
  hasSuccesses: boolean;
  hasErrors: boolean;
}

/** Entries beyond this are ignored (a hostile or buggy server cannot make the sink do unbounded work). */
export const MAX_RESPONSE_ENTRIES = 10_000;
/** Bodies longer than this are not parsed (treated as unreadable). */
export const MAX_RESPONSE_CHARS = 1_048_576;

function entries(v: unknown): IngestionEntry[] | null {
  if (!Array.isArray(v)) return null;
  const out: IngestionEntry[] = [];
  const n = Math.min(v.length, MAX_RESPONSE_ENTRIES);
  for (let i = 0; i < n; i++) {
    const e = v[i] as { id?: unknown; status?: unknown } | null;
    const id = e && typeof e === "object" && typeof e.id === "string" ? e.id : null;
    const st = e && typeof e === "object" && Number.isInteger(e.status) && (e.status as number) >= 100 && (e.status as number) <= 599 ? (e.status as number) : null;
    out.push({ id, status: st });
  }
  return out;
}

export function parseIngestionResponse(text: unknown): IngestionResult | null {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_RESPONSE_CHARS) return null;
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as { successes?: unknown; errors?: unknown };
  const successes = entries(o.successes);
  const errors = entries(o.errors);
  if (!successes && !errors) return null;
  return { successes: successes ?? [], errors: errors ?? [], hasSuccesses: !!successes, hasErrors: !!errors };
}

export interface Assessment {
  sent: number;
  rejected: number;
  unconfirmed: number;
  eventErrors: number;
  /** the batch was not a total success (any rejected / unconfirmed event, or any error entry) */
  failed: boolean;
  /** static codes only: never ids, messages or payload text */
  codes: string[];
}

/**
 * Account for a 2xx response to a batch of `recs` records, `groups` holding the events of each
 * mappable record. Policy (no new retry policy invented): an event Langfuse rejected is recorded
 * and its record DROPPED, never retried (the existing policy treats a 4xx as final, and resending
 * the batch would repeat the events that succeeded). On a 207 a record is "sent" only if ALL its
 * events are listed in `successes`; an unreadable body, or an event absent from the body, is
 * "unconfirmed" and dropped, never success. A non-207 2xx with no readable body is trusted on its
 * status, as before. Pure; never throws for any input.
 */
export function assessIngestion(groups: { events: { id: string }[] }[], recs: number, status: number, text: unknown): Assessment {
  const strict = status === 207;
  const parsed = parseIngestionResponse(text);
  if (!parsed) {
    if (!strict) return { sent: recs, rejected: 0, unconfirmed: 0, eventErrors: 0, failed: false, codes: [] };
    return { sent: 0, rejected: 0, unconfirmed: recs, eventErrors: 0, failed: true, codes: ["malformed_207"] };
  }
  const okIds = new Set(parsed.successes.map((e) => e.id).filter((x): x is string => x !== null));
  const errIds = new Set(parsed.errors.map((e) => e.id).filter((x): x is string => x !== null));
  let rejected = 0;
  let unconfirmed = 0;
  for (const g of groups) {
    if (g.events.some((e) => errIds.has(e.id))) rejected += 1;
    else if (strict && !g.events.every((e) => okIds.has(e.id))) unconfirmed += 1;
  }
  const codes: string[] = [];
  if (parsed.errors.length > 0) {
    codes.push("event_rejected");
    for (const c of new Set(parsed.errors.map((e) => e.status))) if (c !== null) codes.push(`event_http_${c}`);
  }
  if (unconfirmed > 0) codes.push("event_unconfirmed");
  return {
    sent: recs - rejected - unconfirmed, rejected, unconfirmed, eventErrors: parsed.errors.length,
    failed: parsed.errors.length > 0 || unconfirmed > 0, codes,
  };
}

/**
 * Read a 2xx response body as bounded text, racing `abort` (the request timeout / close) so a body
 * that never arrives cannot hang the sink. null = unreadable (no text(), rejects, non-string, or
 * over MAX_RESPONSE_CHARS). When there is no text(), the body is cancelled. Never throws.
 */
export async function readBodyText(res: { text?: () => Promise<string>; body?: unknown }, abort: Promise<never>): Promise<string | null> {
  if (typeof res.text !== "function") {
    try { (res.body as { cancel?: () => unknown } | undefined)?.cancel?.(); } catch { /* ignore */ }
    return null;
  }
  try {
    const p = res.text();
    p.catch(() => undefined);
    const t = await Promise.race([p, abort]);
    return typeof t === "string" && t.length <= MAX_RESPONSE_CHARS ? t : null;
  } catch {
    return null;
  }
}
