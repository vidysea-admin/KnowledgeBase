/**
 * apps/api/src/join-rules/router.ts — T-037 unit `t037-join-rules-edit-api` (API half of "rules are
 * editable"; no web UI, no scheduler switch-over).
 *
 *   GET  /calendar/join-rules              -> { ruleSet, state }
 *   PUT  /calendar/join-rules              body = a rule set; replaces rules ONLY, stored state is kept
 *   POST /calendar/join-rules/approvals    body { kind: "sender"|"domain", value }
 *   POST /calendar/join-rules/opt-outs     body { eventId, meetingUrl?, sessionKey? } (the optional hints store the MEETING
 *                                          identity with the opt-out)
 *   POST /calendar/join-rules/opt-outs/remove  UN-OPT (t037-join-rules-un-opt); same body: removes that exact id and the identities the
 *                                          hints derive -> { state, removed: { eventId, meetings } }; absent = 200 no-op. POST, not DELETE:
 *                                          every mutation here is a JSON-body POST (DELETE bodies are fragile in proxies and clients).
 *
 * The tenant is ALWAYS `req.auth!.tenantId` (as routes/calendar.ts does); URL, query, headers and body
 * never name it, and a body field `tenantId` is rejected (400). Scopes: GET needs "calendar" (read); PUT and
 * every POST need the dedicated WRITE scope "join-rules" (a "calendar" read key must not gain write power).
 * Writes for one tenant are serialised in-process by a promise-chain mutex; across processes the store
 * takes a per-tenant lock file (t037-join-rules-store-lock). Contention surfaces as 503 `join_rules_busy`
 * + Retry-After (STORE_FAILURE below); GET never takes that lock (the store's load is lock-free).
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import type { JoinRulesDeps, JoinRulesStoreCode } from "./deps.js";

/** Dedicated write scope (sibling mutating routes use their own scope: gmail, sources, ingest, keys, compete). */
export const WRITE_SCOPE = "join-rules";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

class BadRequest extends Error {}
class StatusError extends Error {
  constructor(public readonly status: number, public readonly error: string, message: string) { super(message); }
}

function storeCode(e: unknown): string | undefined {
  if (!(e instanceof Error) || e.name !== "JoinRulesStoreError") return undefined;
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function fail(res: Response, status: number, error: string, message: string): void {
  res.status(status).json({ error, message });
}

interface Mapped { status: number; error: string; message: string; retryAfterSeconds?: number }
const UNAVAILABLE: Mapped = { status: 500, error: "join_rules_unavailable", message: "join rules are unavailable for this tenant" };
/** Matches the store lock's default wait (lockWaitMs 5000): by then a live holder has normally finished. */
export const BUSY_RETRY_AFTER_SECONDS = 5;
const BUSY: Mapped = { status: 503, error: "join_rules_busy", message: "join rules are busy; try again in a few seconds", retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS };
/**
 * The ONE status table for store failures, total over the store's code union (a new code fails tsc here).
 * `too-large` -> 413 and `invalid` -> 400 are decided at the call sites that know the cause (PUT save,
 * approval / opt-out value); reaching this table means the failure came from a stored file or an internal
 * path, which stays the fixed 500 as before.
 */
export const STORE_FAILURE: Record<JoinRulesStoreCode, Mapped> = {
  "bad-tenant": UNAVAILABLE, corrupt: UNAVAILABLE, "too-large": UNAVAILABLE, invalid: UNAVAILABLE, "tenant-mismatch": UNAVAILABLE,
  "not-a-file": UNAVAILABLE, "write-failed": UNAVAILABLE, "lock-failed": UNAVAILABLE, locked: BUSY,
};

/** Non-leaking: never echoes the stored file, its path, or the store's own message. Unknown errors -> 500. */
function storeFailure(res: Response, e?: unknown): void {
  const code = storeCode(e);
  const m = code !== undefined && Object.hasOwn(STORE_FAILURE, code) ? STORE_FAILURE[code as JoinRulesStoreCode] : UNAVAILABLE;
  if (m.retryAfterSeconds !== undefined) res.setHeader("Retry-After", String(m.retryAfterSeconds));
  fail(res, m.status, m.error, m.message);
}

function bodyOf(req: Request, allowed: readonly string[]): Record<string, unknown> {
  const body: unknown = req.body;
  if (!isObj(body)) throw new BadRequest("body must be a JSON object");
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw new BadRequest(`unknown field "${key.slice(0, 40)}"`);
  }
  return body;
}

/** Body of opt-out and un-opt. Optional hints (ISS-T037W1-001) are bounded strings; an empty / blank one is "not given". */
function optOutBody(req: Request): { eventId: string; hint: { meetingUrl?: string; sessionKey?: string } } {
  const body = bodyOf(req, ["eventId", "meetingUrl", "sessionKey"]);
  if (typeof body.eventId !== "string" || body.eventId === "" || body.eventId.length > 1024) {
    throw new BadRequest("body must be { eventId: <non-empty string>, meetingUrl?: string, sessionKey?: string }");
  }
  const hint: { meetingUrl?: string; sessionKey?: string } = {};
  for (const [key, max] of [["meetingUrl", 2048], ["sessionKey", 256]] as const) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length > max) throw new BadRequest(`${key} must be a string of at most ${max} characters`);
    if (v.trim() !== "") hint[key] = v;
  }
  return { eventId: body.eventId, hint };
}

export function createJoinRulesRouter(deps: JoinRulesDeps): Router {
  const router = Router();
  const tails = new Map<string, Promise<unknown>>();

  /** One writer at a time per tenant (in this process); other tenants are never blocked. */
  function withTenantLock<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
    const run = (tails.get(tenantId) ?? Promise.resolve()).then(work, work);
    const tail = run.catch(() => undefined);
    tails.set(tenantId, tail);
    void tail.then(() => { if (tails.get(tenantId) === tail) tails.delete(tenantId); });
    return run;
  }

  /** Runs `work` under the tenant lock; maps errors to non-leaking statuses. */
  async function guarded(req: Request, res: Response, work: (tenantId: string) => Promise<unknown>): Promise<void> {
    const tenantId = req.auth!.tenantId;
    try {
      res.status(200).json(await withTenantLock(tenantId, () => work(tenantId)));
    } catch (e) {
      if (e instanceof BadRequest) return fail(res, 400, "bad_request", e.message);
      if (e instanceof StatusError) return fail(res, e.status, e.error, e.message);
      storeFailure(res, e);
    }
  }

  router.get("/calendar/join-rules", requireScope("calendar"), async (req: Request, res: Response) => {
    try {
      res.status(200).json(await deps.load(req.auth!.tenantId));
    } catch (e) { storeFailure(res, e); }
  });

  router.put("/calendar/join-rules", requireScope(WRITE_SCOPE), (req: Request, res: Response) =>
    guarded(req, res, async tenantId => {
      const input: unknown = req.body;
      if (!isObj(input)) throw new BadRequest("body must be a JSON object");
      // Load FIRST: a corrupt / wrong-tenant stored file refuses the write, and its state is preserved.
      const existing = await deps.load(tenantId);
      let ruleSet;
      try { ruleSet = deps.validateRuleSet(input); }
      catch (e) { throw new BadRequest(e instanceof Error ? e.message.slice(0, 300) : "invalid rule set"); }
      try { await deps.save(tenantId, { ruleSet, state: existing.state }); }
      catch (e) {
        if (storeCode(e) === "too-large") throw new StatusError(413, "payload_too_large", "rule set exceeds the size cap");
        throw e;
      }
      return { ruleSet, state: existing.state };
    }));

  router.post("/calendar/join-rules/approvals", requireScope(WRITE_SCOPE), (req: Request, res: Response) =>
    guarded(req, res, async tenantId => {
      const body = bodyOf(req, ["kind", "value"]);
      if ((body.kind !== "sender" && body.kind !== "domain") || typeof body.value !== "string" || body.value === "" || body.value.length > 320) {
        throw new BadRequest('body must be { kind: "sender" | "domain", value: <non-empty string> }');
      }
      await deps.load(tenantId); // a bad stored file is a 5xx, so a later "invalid" can only be the value
      try { return { state: await deps.recordApproval(tenantId, { kind: body.kind, value: body.value }) }; }
      catch (e) {
        if (storeCode(e) === "invalid") throw new BadRequest(`value is not a valid ${body.kind === "sender" ? "email" : "domain"}`);
        throw e;
      }
    }));

  router.post("/calendar/join-rules/opt-outs", requireScope(WRITE_SCOPE), (req: Request, res: Response) =>
    guarded(req, res, async tenantId => {
      const { eventId, hint } = optOutBody(req);
      await deps.load(tenantId);
      try { return { state: await (hint.meetingUrl || hint.sessionKey ? deps.recordOptOut(tenantId, eventId, hint) : deps.recordOptOut(tenantId, eventId)) }; }
      catch (e) {
        if (storeCode(e) === "invalid") throw new BadRequest("eventId is not valid");
        throw e;
      }
    }));

  // Un-opt: same write scope, same tenant-from-auth, same body allow-list and bounds as POST /opt-outs (one parser).
  router.post("/calendar/join-rules/opt-outs/remove", requireScope(WRITE_SCOPE), (req: Request, res: Response) =>
    guarded(req, res, async tenantId => {
      const { eventId, hint } = optOutBody(req);
      await deps.load(tenantId); // a bad stored file is a 5xx before anything else
      return await (hint.meetingUrl || hint.sessionKey ? deps.removeOptOut(tenantId, eventId, hint) : deps.removeOptOut(tenantId, eventId));
    }));

  return router;
}

/** Mounted when no join-rules store is wired: fails closed instead of pretending the rules are empty. */
export function unavailableJoinRulesRouter(): Router {
  const router = Router();
  router.use("/calendar/join-rules", requireScope("calendar"), (_req, res) =>
    fail(res, 503, "join_rules_unavailable", "join rules storage is not configured"));
  return router;
}
