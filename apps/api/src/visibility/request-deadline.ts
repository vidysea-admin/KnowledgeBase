/** D-206 K1/K5: request deadline + request-scoped memo for the knowledge visibility gate (split out of knowledge.ts for the LOC budget). */
/** Thrown (never swallowed by the fail-closed guard) when `filterTurns` runs past `deadlineAt`. A deadline is not a
 * visibility verdict: callers must map it to an explicit timeout, not to "nothing is visible". */
export class VisibilityDeadlineError extends Error { constructor() { super("knowledge visibility deadline exceeded"); this.name = "VisibilityDeadlineError"; } }
/** Request-scoped memo of per-session source context. One object per request; never keep it across requests. */
export interface VisibilityRequestMemo { readonly contexts: Map<string, Promise<unknown>> }
export const newVisibilityRequestMemo = (): VisibilityRequestMemo => ({ contexts: new Map() });
export interface FilterTurnsOptions {
  /** Absolute epoch-ms deadline for the whole visibility step (K1/K5, D-206). */
  deadlineAt?: number;
  /** Shares session/source/review-candidate context across several filterTurns calls of one request. */
  memo?: VisibilityRequestMemo;
  /** Default false: a read error fails closed to []. True lets a caller that must tell "nothing visible" from "could not
   * check" (search) surface the failure instead of ranking only the batches that happened to succeed. */
  throwOnError?: boolean;
}

/** Races `run` against the absolute epoch-ms deadline (rejects with VisibilityDeadlineError); the timer is always cleared.
 * A pending store call cannot be cancelled from here, so this bounds the CALLER's wait, which is what a request deadline needs. */
export async function withDeadline<T>(deadlineAt: number | undefined, run: () => Promise<T>): Promise<T> {
  if (deadlineAt === undefined) return run();
  const remaining = deadlineAt - Date.now();
  if (!(remaining > 0)) throw new VisibilityDeadlineError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([run(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new VisibilityDeadlineError()), remaining); })]); }
  finally { if (timer) clearTimeout(timer); }
}

