/**
 * apps/api/src/routes/brain.ts — real read routes over the already-real `sessions`/`sources`/
 * `gaps`/`session_pages`/`claims`/`turns` data: `GET /sessions`, `GET /sessions/:id` (joins
 * session_pages + claims + turns for one session), `GET /sources`, `GET /gaps`. Un-stubs
 * `/sessions` and `/sources` from `stubs.ts` (their `501` entries are removed there in the same
 * unit) — `/gaps` is entirely new (no stub existed for it). Injected `BrainReadDeps`, same
 * pattern as `AskRouteDeps`/`EvalRunStore` — tests never touch Mongo, production wires the real
 * accessors in `store.ts`.
 */
import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { Claims, Gaps, Sessions, SessionPages, Sources, Turns } from "@lkb/core";
import { requireScope } from "../auth.js";

export interface SessionDetail {
  session: Sessions;
  page: SessionPages | null;
  claims: Claims[];
  turns: Turns[];
  media?: { available: boolean; bytes: number; mime: string };
  notes?: { text: string; kind: string; tStart: number; turnId?: string; frameId?: string }[];
  frames?: { id: string; tStart: number; text: string }[];
}

export interface SessionAsset { path: string; bytes: number; mime: string }
export interface WebinarOperation {
  id: string; title: string; status: string; attempts: number; reason?: string;
  updatedAt?: string; startTime?: string; endTime?: string;
}
export interface WebinarDiscoveryHealth { status: "healthy" | "failed"; checkedAt: string; lastSuccessAt?: string }
export interface WebinarOperations { operations: WebinarOperation[]; omitted: number; discovery?: Record<"calendar" | "gmail", WebinarDiscoveryHealth> }

export interface BrainReadDeps {
  listSessions(tenantId: string): Promise<Sessions[]>;
  getSessionDetail(tenantId: string, sessionId: string): Promise<SessionDetail | null>;
  listSources(tenantId: string): Promise<Sources[]>;
  listGaps(tenantId: string): Promise<Gaps[]>;
  getSessionAsset?(tenantId: string, sessionId: string, frameId?: string): Promise<SessionAsset | null>;
  listWebinarOperations?(tenantId: string): Promise<WebinarOperations>;
}

/** Local artifacts are readable only through the tenant-scoped DB session/source binding. */
export function withSessionArtifacts(deps: BrainReadDeps, root: string): BrainReadDeps {
  function confined(candidate: string): string {
    const actualRoot = realpathSync(root), actual = realpathSync(candidate);
    const relative = path.relative(actualRoot, actual);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("outside artifact root");
    return actual;
  }
  async function artifacts(tenantId: string, id: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(id)) return null;
    const detail = await deps.getSessionDetail(tenantId, id);
    if (!detail || detail.session.tenantId !== tenantId || detail.session._id !== id) return null;
    const source = (await deps.listSources(tenantId)).find((s) => s._id === detail.session.sourceId && s.tenantId === tenantId);
    if (!source) return null;
    const dir = path.join(root, "data", "toc-migrated", id);
    const load = (name: string) => {
      const file = confined(path.join(dir, name));
      if (statSync(file).size > 10 * 1024 * 1024) throw new Error("artifact too large");
      return JSON.parse(readFileSync(file, "utf8"));
    };
    const localSource = load("source.json");
    if (localSource._id !== source._id || localSource.tenantId !== tenantId || localSource.path !== source.path) return null;
    return { detail, source, dir, load };
  }
  const mediaAsset = (source: Sources): SessionAsset | null => {
    if (typeof source.path !== "string" || !/\.(mp4|webm|mkv|mov)$/i.test(source.path)) return null;
    const file = confined(path.resolve(root, source.path));
    const bytes = statSync(file).size;
    const mime = file.endsWith(".webm") ? "video/webm" : file.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
    return bytes > 0 ? { path: file, bytes, mime } : null;
  };
  function framesFor(a: NonNullable<Awaited<ReturnType<typeof artifacts>>>) {
    const evidence = a.load("screen-evidence.json");
    if (evidence.sessionId !== a.detail.session._id || !Array.isArray(evidence.frames)) return [];
    return evidence.frames.filter((f: { id: string; file: string; hash: string; tStart: number }) => {
      const turn = a.detail.turns.find((t) => {
        const e = t.screenEvidence as { frameId?: string; hash?: string; file?: string } | undefined;
        return t.tenantId === a.detail.session.tenantId && t.sessionId === a.detail.session._id &&
          e?.frameId === f.id && e.hash === f.hash && e.file === f.file;
      });
      if (!turn || !/^screen-frames\/[a-zA-Z0-9-]+\/frame-\d+\.jpg$/.test(f.file) || !Number.isFinite(f.tStart) || f.tStart < 0) return false;
      const file = confined(path.join(a.dir, f.file));
      return statSync(file).size <= 5 * 1024 * 1024 && createHash("sha256").update(readFileSync(file)).digest("hex") === f.hash;
    });
  }
  return { ...deps,
    async listWebinarOperations(tenantId) {
      const stateFile = path.join(root, "data", "webinar-release", "operations.json");
      if (!existsSync(stateFile)) return { operations: [], omitted: 0 };
      const file = confined(stateFile);
      if (statSync(file).size > 5 * 1024 * 1024) throw new Error("operation state unavailable");
      const state = JSON.parse(readFileSync(file, "utf8"));
      if (typeof state.tenantId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(state.tenantId)) throw new Error("operation state ownership unavailable");
      if (state.tenantId !== tenantId) return { operations: [], omitted: 0 };
      if (state.version !== 1 || !state.operations || typeof state.operations !== "object" || Array.isArray(state.operations)) throw new Error("operation state unavailable");
      const statuses = ["queued", "recording", "processing", "failed", "ready", "action_required"];
      const reasons = ["retry-limit", "interrupted-no-recording-artifact", "missed-while-processing", "missed-coverage", "cancelled", "overlap-lost", "needs-registration", "needs-review", "invalid-time", "unsafe-join-link",
        "no-join-link", "source-discontinuity", "unproven-calendar-history", "rejected", "rescheduled", "rescheduled-completed", "recurring-series", "unknown-tombstone", "ambiguous-provider", "contradictory-revision", "missing-revision", "ambiguous-identity"];
      const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
      let discovery: WebinarOperations["discovery"];
      if (state.discovery !== undefined) {
        if (!state.discovery || typeof state.discovery !== "object" || Array.isArray(state.discovery) ||
          Object.keys(state.discovery).some((key) => !["calendar", "gmail"].includes(key))) throw new Error("discovery health unavailable");
        discovery = Object.fromEntries((["calendar", "gmail"] as const).map((feed) => {
          const row = state.discovery[feed], checkedAt = date(row?.checkedAt), lastSuccessAt = date(row?.lastSuccessAt);
          if (!row || !["healthy", "failed"].includes(row.status) || !checkedAt ||
            (row.lastSuccessAt !== undefined && !lastSuccessAt) || (row.status === "healthy" && !lastSuccessAt)) throw new Error("discovery health unavailable");
          return [feed, {status: row.status, checkedAt, lastSuccessAt}];
        })) as NonNullable<WebinarOperations["discovery"]>;
      }
      const operations: WebinarOperation[] = Object.entries(state.operations).map(([id, raw]) => {
        const row = raw as Record<string, unknown>;
        if (!row || row.tenantId !== tenantId || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || !statuses.includes(String(row.status))) throw new Error("operation state unavailable");
        return { id, title: typeof row.title === "string" ? row.title.replace(/https?:\/\/\S+/gi, "[link removed]").slice(0, 160) : "Webinar",
          status: String(row.status), attempts: Number.isInteger(row.attempts) && Number(row.attempts) >= 0 ? Number(row.attempts) : 0,
          reason: row.reason ? reasons.includes(String(row.reason)) ? String(row.reason) : "processing-failed" : undefined,
          updatedAt: date(row.updatedAt), startTime: date(row.startTime), endTime: date(row.endTime) };
      }).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      return { operations: operations.slice(0, 200), omitted: Math.max(0, operations.length - 200), discovery };
    },
    async getSessionDetail(tenantId, id) {
      const original = await deps.getSessionDetail(tenantId, id);
      if (!original || original.session.tenantId !== tenantId || original.session._id !== id) return null;
      const detail: SessionDetail = { ...original, media: undefined, notes: undefined, frames: undefined };
      try {
        const a = await artifacts(tenantId, id);
        if (!a) return detail;
        const media = mediaAsset(a.source);
        if (media) detail.media = { available: true, bytes: media.bytes, mime: media.mime };
        try {
          const frames = framesFor(a);
          detail.frames = frames.map((f: { id: string; tStart: number; analysis?: { ocrText?: string; visualDescription?: string } }) =>
            ({ id: f.id, tStart: f.tStart, text: f.analysis?.ocrText ?? f.analysis?.visualDescription ?? "" }));
          const notes = a.load("notes.json");
          if (notes.sessionId === id && Array.isArray(notes.notes)) detail.notes = notes.notes.flatMap((n: { text: string; kind: string; evidence?: { turnId?: string; frameId?: string; sessionId: string; tStart: number }[] }) => {
            const e = n.evidence?.find((e) => e.sessionId === id && Number.isFinite(e.tStart) && e.tStart >= 0 &&
              (e.turnId ? detail.turns.some((t) => t._id === e.turnId && t.tStart === e.tStart) : frames.some((f: { id: string; tStart: number }) => f.id === e.frameId && f.tStart === e.tStart)));
            return e && typeof n.text === "string" ? [{ text: n.text, kind: n.kind, tStart: e.tStart, turnId: e.turnId, frameId: e.frameId }] : [];
          });
        } catch { /* Missing or corrupt screen artifacts remain unavailable. */ }
      } catch { /* Source-only sessions and unsafe artifacts have no local media access. */ }
      return detail;
    },
    async getSessionAsset(tenantId, id, frameId) {
      try {
        const a = await artifacts(tenantId, id);
        if (!a) return null;
        if (!frameId) return mediaAsset(a.source);
        const frame = framesFor(a).find((f: { id: string }) => f.id === frameId);
        if (!frame) return null;
        const file = confined(path.join(a.dir, frame.file));
        return { path: file, bytes: statSync(file).size, mime: "image/jpeg" };
      } catch { return null; }
    },
  };
}

export function createBrainRouter(deps: BrainReadDeps): Router {
  const router = Router();
  router.get("/webinar-operations", requireScope("sessions"), async (req: Request, res: Response) => {
    try {
      const result = await deps.listWebinarOperations?.(req.auth!.tenantId) ?? { operations: [], omitted: 0 };
      res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-LKB-Tenant", req.auth!.tenantId); res.status(200).json(result);
    } catch { res.status(503).json({ error: "operation_state_unavailable", message: "Webinar status unavailable; inspect the local runner state" }); }
  });

  for (const route of ["/sessions/:id/media", "/sessions/:id/frames/:frameId"]) {
    router.get(route, requireScope("sessions"), async (req: Request, res: Response) => {
      const asset = await deps.getSessionAsset?.(req.auth!.tenantId, req.params.id as string, req.params.frameId as string | undefined);
      if (!asset) { res.status(404).json({ error: "not_found" }); return; }
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type(asset.mime).sendFile(asset.path);
    });
  }

  router.get("/sessions", requireScope("sessions"), async (req: Request, res: Response) => {
    const sessions = await deps.listSessions(req.auth!.tenantId);
    res.status(200).json({ sessions });
  });

  router.get("/sessions/:id", requireScope("sessions"), async (req: Request, res: Response) => {
    const detail = await deps.getSessionDetail(req.auth!.tenantId, req.params.id as string);
    if (!detail) {
      res.status(404).json({ error: "not_found", message: "no session with that id for this tenant" });
      return;
    }
    res.status(200).json(detail);
  });

  router.get("/sources", requireScope("sources"), async (req: Request, res: Response) => {
    const sources = await deps.listSources(req.auth!.tenantId);
    res.status(200).json({ sources });
  });

  router.get("/gaps", requireScope("gaps"), async (req: Request, res: Response) => {
    const gaps = await deps.listGaps(req.auth!.tenantId);
    res.status(200).json({ gaps });
  });

  return router;
}
