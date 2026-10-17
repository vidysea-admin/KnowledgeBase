/**
 * apps/api/src/join-rules/router.ts — T-037 unit `t037-join-rules-edit-api` (API half of "rules are
 * editable"; no web UI, no scheduler switch-over).
 *
 *   GET  /calendar/join-rules              -> { ruleSet, state }
 *                                          GET carries `ETag: "<sha256 hex of the stored rule set>"` when a rule set is stored (none otherwise).
 *   PUT  /calendar/join-rules              body = a rule set; replaces rules ONLY, stored state is kept. REQUIRES exactly one precondition:
 *                                          `If-Match: "<etag>"` (replace) or `If-None-Match: *` (create the first one). Neither -> 428
 *                                          { error: "precondition-required" }; stale / wrong / unsupported form -> 412
 *                                          { error: "precondition-failed", currentEtag } + current ETag header. The compare-and-write is the
 *                                          store's atomic saveJoinRulesIf (never load-compare-save here); an opt-out/approval landing between
 *                                          the editor's GET and PUT is preserved and does NOT invalidate the ETag (validator excludes state).
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
import { isPrintableAsciiSender, ruleEmailMatchers, SENDER_NOT_ASCII, SENDER_NOT_ASCII_MESSAGE } from "./sender-ascii.js";

/** Dedicated write scope (sibling mutating routes use their own scope: gmail, sources, ingest, keys, compete). */
export const WRITE_SCOPE = "join-rules";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

class BadRequest extends Error {}
/** 400 with the typed code `sender_not_printable_ascii` (ISS-WEBHIGH-001): a sender value outside printable ASCII; nothing is written. */
class NonAsciiSender extends Error {}
/** 412: carries the stored validator ("absent" or hex) so the response can tell the client the current ETag. */
class PreconditionFailed extends Error {
  constructor(public readonly currentValidator: string) { super("precondition failed"); }
}
/** 428: the PUT named no precondition at all. */
class PreconditionRequired extends Error {}
class StatusError extends Error {
  constructor(public readonly status: number, public readonly error: string, message: string) { super(message); }
}

function storeCode(e: unknown): string | undefined {
  if (!(e instanceof Error) || e.name !== "JoinRulesStoreError") return undefined;
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * JSON via `end`, NOT `res.json`: Express's `res.send` adds a WEAK content-hash `ETag` (and answers 304 on a matching If-None-Match) to
 * any response that has none. The join-rules ETag is a strong validator of the stored RULE SET (state excluded) that this router sets
 * itself, so a response without one (no rule set stored, 412/428, POSTs) must carry NO ETag and a 200 must never be turned into a 304.
 */
function sendJson(res: Response, status: number, body: unknown): void {
  res.status(status).type("application/json").end(JSON.stringify(body));
}

function fail(res: Response, status: number, error: string, message: string): void {
  sendJson(res, status, { error, message });
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
  // PUT answers this itself (with currentEtag, see PreconditionFailed); the entry keeps the table total and the status 412 anywhere else.
  "precondition-failed": { status: 412, error: "precondition-failed", message: "the rule set changed since it was loaded" },
};

/** The store's "nothing stored" validator (JOIN_RULES_ABSENT in packages/meeting-bot; apps/* may not import it). */
const ABSENT = "absent";
const etagOf = (validator: string): string | null => (validator === ABSENT ? null : `"${validator}"`);
/** Strong entity-tag with a sha256 hex validator, quoted, no `W/` and no list: the only If-Match form accepted. */
const STRONG_ETAG = /^"([0-9a-f]{64})"$/;

function preconditionFailed(res: Response, currentValidator: string): void {
  const current = etagOf(currentValidator);
  if (current !== null) res.setHeader("ETag", current);
  sendJson(res, 412, { error: "precondition-failed", currentEtag: current });
}

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

import { createRegistrationPolicyRouter } from "./registration-policy-router.js";

export function createJoinRulesRouter(deps: JoinRulesDeps): Router {
  const router = Router();
  router.use(createRegistrationPolicyRouter(deps.registrationPolicy));
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
      sendJson(res, 200, await withTenantLock(tenantId, () => work(tenantId)));
    } catch (e) {
      if (e instanceof PreconditionRequired) return void sendJson(res, 428, { error: "precondition-required" });
      if (e instanceof PreconditionFailed) return preconditionFailed(res, e.currentValidator);
      if (storeCode(e) === "precondition-failed") {
        const cv = (e as { currentValidator?: unknown }).currentValidator;
        return preconditionFailed(res, typeof cv === "string" ? cv : ABSENT);
      }
      if (e instanceof NonAsciiSender) return fail(res, 400, SENDER_NOT_ASCII, SENDER_NOT_ASCII_MESSAGE);
      if (e instanceof BadRequest) return fail(res, 400, "bad_request", e.message);
      if (e instanceof StatusError) return fail(res, e.status, e.error, e.message);
      storeFailure(res, e);
    }
  }

  router.get("/calendar/join-rules", requireScope("calendar"), async (req: Request, res: Response) => {
    try {
      const { validator, ...stored } = await deps.loadWithValidator(req.auth!.tenantId);
      const etag = etagOf(validator);
      if (etag !== null) res.setHeader("ETag", etag);
      sendJson(res, 200, stored);
    } catch (e) { storeFailure(res, e); }
  });

  /**
   * The precondition of a PUT: `{ expected }` is what the store compares against ("absent" for If-None-Match: *); `unsupported` is a
   * header that is present but not an accepted form (a list, `If-Match: *`, a weak or unquoted tag, `If-None-Match` other than `*`):
   * answered 412 without writing. Both headers at once is ambiguous -> 400. Neither -> null (428).
   */
  function preconditionOf(req: Request): { expected: string } | { unsupported: true } | null {
    const ifMatch = req.header("if-match");
    const ifNoneMatch = req.header("if-none-match");
    if (ifMatch === undefined && ifNoneMatch === undefined) return null;
    if (ifMatch !== undefined && ifNoneMatch !== undefined) throw new BadRequest("send exactly one of If-Match and If-None-Match");
    if (ifNoneMatch !== undefined) return ifNoneMatch.trim() === "*" ? { expected: ABSENT } : { unsupported: true };
    const m = STRONG_ETAG.exec((ifMatch as string).trim());
    return m ? { expected: m[1]! } : { unsupported: true };
  }

  router.put("/calendar/join-rules", requireScope(WRITE_SCOPE), (req: Request, res: Response) =>
    guarded(req, res, async tenantId => {
      const input: unknown = req.body;
      const pre = preconditionOf(req);
      if (pre === null) throw new PreconditionRequired();
      if (!isObj(input)) throw new BadRequest("body must be a JSON object");
      if (!ruleEmailMatchers(input).every(isPrintableAsciiSender)) throw new NonAsciiSender(); // before any store read: nothing can be written
      // Read-only look FIRST (as before): a corrupt / wrong-tenant stored file refuses the request with a 5xx before any 400. It is NOT the
      // compare: the compare-and-write below is the store's atomic saveIf. It also names the current validator for an unsupported-form 412.
      const current = await deps.loadWithValidator(tenantId);
      let ruleSet;
      try { ruleSet = deps.validateRuleSet(input); }
      catch (e) { throw new BadRequest(e instanceof Error ? e.message.slice(0, 300) : "invalid rule set"); }
      if ("unsupported" in pre) throw new PreconditionFailed(current.validator);
      let saved;
      // ONE atomic store call: compare + write under the store's per-tenant lock; state is the CURRENT state, not a snapshot of ours.
      try { saved = await deps.saveIf(tenantId, pre.expected, ruleSet); }
      catch (e) {
        if (storeCode(e) === "too-large") throw new StatusError(413, "payload_too_large", "rule set exceeds the size cap");
        throw e;
      }
      res.setHeader("ETag", `"${saved.validator}"`);
      return { ruleSet: saved.ruleSet, state: saved.state };
    }));

  router.post("/calendar/join-rules/approvals", requireScope(WRITE_SCOPE), (req: Request, res: Response) =>
    guarded(req, res, async tenantId => {
      const body = bodyOf(req, ["kind", "value"]);
      if ((body.kind !== "sender" && body.kind !== "domain") || typeof body.value !== "string" || body.value === "" || body.value.length > 320) {
        throw new BadRequest('body must be { kind: "sender" | "domain", value: <non-empty string> }');
      }
      if (body.kind === "sender" && !isPrintableAsciiSender(body.value)) throw new NonAsciiSender();
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
