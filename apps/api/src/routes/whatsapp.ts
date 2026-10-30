/**
 * apps/api/src/routes/whatsapp.ts — T-007 first slice. `GET /whatsapp/groups` (real, live-
 * queried list of what `sources/whatsapp_msg` is actually tracking, so a caller sees real
 * capturable groups before ingesting anything) and `POST /whatsapp/ingest` (real write — pulls
 * one group's real captured messages via `@lkb/ingest`'s `whatsapp` adapter and persists a real
 * `sources` + `sessions` + `turns` doc set, same shape `POST /ingest` already produces for URLs
 * — reused via the already-real `GET /sessions/:id` view, no second viewer built).
 *
 * Scope disclosure: this is the ingestion step of T-007 only ("WhatsApp → claims ingestion
 * review" per the plan's A9). The review layer — topic/decision/sensitive-content detection,
 * duplicate flagging, an approve-before-publish queue — is explicitly OUT of this slice, a
 * separate, larger follow-up (same disclosed-scope pattern as the Gmail meeting-candidate unit's
 * split from its own approval workflow).
 *
 * Real bug fixed in this session's own data-engineer review (2026-09-06): `POST /whatsapp/ingest`
 * used to accept `ownerUserId` straight from the request body with no binding to the caller's
 * tenant — any key with the `whatsapp` scope could ingest ANY archiver owner's private group
 * messages. The body now takes `groupJid` only; `ingestGroup`'s real implementation resolves the
 * owner itself from the live trackable-groups list (never trusts a client-supplied identity).
 *
 * whatsapp-multiuser W7 (R-25, R-30): both routes now narrow to the caller. The route derives the caller from the
 * verified principal (`whatsAppCallerFromAuth(req.auth)`), accepts an optional, validated `linkId` that can only NARROW
 * the permitted set, maps an ambiguous jid to 409 `ambiguous_link` and an absent / not-permitted group to 404, and the
 * 502 body is a closed `{ error, code, linkId }` (ISS-API-003: upstream error text is never echoed).
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import {
  WhatsAppAmbiguousLinkError, WhatsAppGroupNotFoundError, WhatsAppNotConfiguredError, WhatsAppUnavailableError, whatsAppCallerFromAuth,
  type WhatsAppResolveScope,
} from "../whatsapp/owner-config.js";

export interface WhatsAppGroup {
  groupJid: string;
  /** Archiver owner id: returned to admin callers only (R-30 / spec section 1). */
  ownerUserId?: string;
  /** The link this group was found under, so a caller can name it in `linkId` when a jid is ambiguous. */
  linkId?: string | null;
  subject: string;
  trackedPersonCount: number;
}

export interface WhatsAppIngestResult {
  sessionId: string;
  sourceId: string;
  turnCount: number;
}

export interface WhatsAppRouteDeps {
  /** `scope` carries the verified caller and an optional `linkId`; it can only narrow what the caller may reach. */
  listGroups(tenantId: string, scope?: WhatsAppResolveScope): Promise<WhatsAppGroup[]>;
  /** `ownerUserId` is intentionally NOT a parameter here — the real implementation resolves it
   * itself from the live trackable-groups list, so a caller can never ingest on behalf of an
   * owner it didn't actually look up via `listGroups()`. */
  ingestGroup(tenantId: string, groupJid: string, scope?: WhatsAppResolveScope): Promise<WhatsAppIngestResult>;
}

/** G-A1: a not-configured archive answers a fixed `not_configured` body; a configured-but-unreachable one keeps `whatsapp_unavailable`. */
function sendUnavailable(res: Response, error: WhatsAppUnavailableError): void {
  if (error instanceof WhatsAppNotConfiguredError) res.status(503).json({ error: "not_configured", feature: "whatsapp" });
  else res.status(503).json({ error: "whatsapp_unavailable", message: "WhatsApp source unavailable" });
}

const LINK_ID = /^[0-9a-f]{24}$/;
/** `undefined` = absent, `null` = present but malformed (answer 400). A repeated or non-string value is malformed. */
function parseLinkId(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && LINK_ID.test(value) ? value : null;
}

/** Closed failure codes for the 502 body. Free text from the archive, the driver or the store is never put in a response. */
export const WHATSAPP_INGEST_FAILURE_CODES = ["archive_unreachable", "snapshot_shrink_refused", "store_transaction_unavailable", "unknown"] as const;
export type WhatsAppIngestFailureCode = typeof WHATSAPP_INGEST_FAILURE_CODES[number];
export function classifyIngestFailure(error: unknown): WhatsAppIngestFailureCode {
  const name = typeof error === "object" && error !== null ? String((error as { name?: unknown }).name ?? "") : "";
  if (name === "SnapshotShrinkError") return "snapshot_shrink_refused";
  if (/^Mongo(Network|ServerSelection|Parse)/.test(name) || name === "MongoNetworkTimeoutError") return "archive_unreachable";
  const message = error instanceof Error ? error.message : "";
  if (/Transaction numbers are only allowed|replica set member|transaction/i.test(message) && name.startsWith("Mongo")) return "store_transaction_unavailable";
  return "unknown";
}

export function createWhatsAppRouter(deps: WhatsAppRouteDeps): Router {
  const router = Router();
  const scopeFor = (req: Request, linkId: string | undefined): WhatsAppResolveScope =>
    ({ caller: whatsAppCallerFromAuth(req.auth), ...(linkId !== undefined ? { linkId } : {}) });

  router.get("/whatsapp/groups", requireScope("whatsapp"), async (req: Request, res: Response) => {
    const linkId = parseLinkId(req.query.linkId);
    if (linkId === null) { res.status(400).json({ error: "bad_request", message: "linkId must be a 24-character hex link id" }); return; }
    try {
      const scope = scopeFor(req, linkId);
      const groups = await deps.listGroups(req.auth!.tenantId, scope);
      // The archiver owner id is an admin-only field; a member or plain key sees groups and link ids only.
      res.status(200).json({ groups: scope.caller?.admin ? groups : groups.map(({ ownerUserId: _owner, ...rest }) => rest) });
    } catch (error) {
      if (!(error instanceof WhatsAppUnavailableError)) throw error;
      sendUnavailable(res, error);
    }
  });

  router.post("/whatsapp/ingest", requireScope("whatsapp"), async (req: Request, res: Response) => {
    const body = req.body as { groupJid?: unknown; linkId?: unknown } | undefined;
    if (!body || typeof body.groupJid !== "string") {
      res.status(400).json({ error: "bad_request", message: "body must be { groupJid: string, linkId?: string }" });
      return;
    }
    const linkId = parseLinkId(body.linkId);
    if (linkId === null) { res.status(400).json({ error: "bad_request", message: "linkId must be a 24-character hex link id" }); return; }
    try {
      const result = await deps.ingestGroup(req.auth!.tenantId, body.groupJid, scopeFor(req, linkId));
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof WhatsAppUnavailableError) { sendUnavailable(res, err); return; }
      // Same body for "never marked", "another owner's" and "another tenant's" group (R-30).
      if (err instanceof WhatsAppGroupNotFoundError) { res.status(404).json({ error: "not_found" }); return; }
      if (err instanceof WhatsAppAmbiguousLinkError) { res.status(409).json({ error: "ambiguous_link" }); return; }
      // A real upstream failure is an environment/input problem, not a server bug -- 502, not 500 -- but only a closed
      // code leaves the process: driver and archive text can carry hosts, ports and credentials (ISS-API-003).
      res.status(502).json({ error: "whatsapp_ingest_failed", code: classifyIngestFailure(err), linkId: linkId ?? null });
    }
  });

  return router;
}
