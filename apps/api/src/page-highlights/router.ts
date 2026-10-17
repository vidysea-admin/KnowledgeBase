import { Router, type Request, type Response } from "express";
import { requireScope, isValidTenantId } from "../auth.js";
import { validateHighlight } from "../../../../packages/index/src/pipeline/page-evidence/highlight-validator.js";
import { highlightId, type PageHighlightStore, type PageHighlightRow } from "./store.js";

export interface PageHighlightDeps { store: PageHighlightStore; clock?: () => string }
type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const KEYS = ["documentHash", "page", "quote", "charStart", "charEnd"];
const sourceIdOk = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 400 && v.trim() === v && !/[\x00-\x1f\x7f]/.test(v);
function send(res: Response, status: number, value: unknown) { res.status(status).set("Cache-Control", "private, no-store").json(value); }
const tenantOf = (req: Request): string | null => isValidTenantId(req.auth?.tenantId) ? req.auth.tenantId : null;
const publicRow = (r: PageHighlightRow) => ({ id: r._id, sourceId: r.sourceId, documentHash: r.documentHash, page: r.page, quote: r.quote, charStart: r.charStart, charEnd: r.charEnd, createdAt: r.createdAt });

/** Mount after requireAuth. Tenant comes only from the verified key; body/query/header tenant values are refused or ignored. */
export function createPageHighlightsRouter(deps: PageHighlightDeps): Router {
  const router = Router(); const now = deps.clock ?? (() => new Date().toISOString());
  // Unknown, foreign and non-document sources are indistinguishable (404); withdrawn consent is refused with 403.
  async function gate(req: Request, res: Response): Promise<{ t: string; sourceId: string } | null> {
    const t = tenantOf(req); if (!t) { send(res, 401, { error: "unauthorized" }); return null; }
    const sourceId = req.params.id;
    if (!sourceIdOk(sourceId)) { send(res, 404, { error: "not_found" }); return null; }
    const state = await deps.store.sourceState(t, sourceId);
    if (state === "absent") { send(res, 404, { error: "not_found" }); return null; }
    if (state === "withdrawn") { send(res, 403, { error: "source_consent_withdrawn" }); return null; }
    return { t, sourceId };
  }
  router.get("/sources/:id/highlights", requireScope("sessions"), async (req, res) => {
    try {
      const g = await gate(req, res); if (!g) return;
      const index = await deps.store.loadPageIndex(g.t, g.sourceId);
      if (!index) return send(res, 404, { error: "document_unavailable" });
      const rows = await deps.store.list(g.t, g.sourceId, index.digest);
      send(res, 200, { sourceId: g.sourceId, title: index.title, documentHash: index.digest, pageCount: index.pageCount, highlights: rows.map(publicRow) });
    } catch { send(res, 503, { error: "highlights_unavailable" }); }
  });
  router.post("/sources/:id/highlights", requireScope("ingest"), async (req, res) => {
    const b: unknown = req.body;
    if (!obj(b) || !Object.keys(b).every(k => KEYS.includes(k)) || typeof b.quote !== "string" || b.quote.length > 4000
        || !Number.isInteger(b.page) || Number(b.page) < 1
        || (b.documentHash !== undefined && (typeof b.documentHash !== "string" || !/^[0-9a-f]{64}$/.test(b.documentHash)))
        || (b.charStart === undefined) !== (b.charEnd === undefined)
        || (b.charStart !== undefined && (!Number.isInteger(b.charStart) || !Number.isInteger(b.charEnd)))) return send(res, 400, { error: "invalid_highlight" });
    const keyId = req.auth?.keyId;
    if (typeof keyId !== "string" || !keyId) return send(res, 401, { error: "verified_key_identity_required" });
    try {
      const g = await gate(req, res); if (!g) return;
      const index = await deps.store.loadPageIndex(g.t, g.sourceId);
      if (!index) return send(res, 404, { error: "document_unavailable" });
      if (b.documentHash !== undefined && b.documentHash !== index.digest) return send(res, 409, { error: "document_changed" });
      const page = Number(b.page); const seg = index.segments.find(s => s.page === page);
      // Offsets omitted: locate the first verbatim occurrence on the cited page. validateHighlight still decides acceptance.
      const found = seg ? seg.text.indexOf(b.quote) : -1;
      const charStart = b.charStart !== undefined ? Number(b.charStart) : seg && found >= 0 ? seg.start + found : -1;
      const charEnd = b.charEnd !== undefined ? Number(b.charEnd) : charStart + b.quote.length;
      const verdict = validateHighlight(index, { quote: b.quote, page, start: charStart, end: charEnd });
      if (!verdict.ok) return send(res, 422, { error: "highlight_rejected", reason: verdict.reason });
      const h = verdict.highlight;
      const row: PageHighlightRow = { _id: highlightId(g.t, g.sourceId, index.digest, h.page, h.start, h.end, h.quote), tenantId: g.t, sourceId: g.sourceId,
        documentHash: index.digest, page: h.page, quote: h.quote, charStart: h.start, charEnd: h.end, createdBy: keyId, createdAt: now() };
      const saved = await deps.store.insert(g.t, row);
      send(res, saved.created ? 201 : 200, { created: saved.created, highlight: publicRow(saved.row) });
    } catch { send(res, 503, { error: "highlights_unavailable" }); }
  });
  return router;
}
