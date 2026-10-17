/**
 * apps/api/src/routes/meeting-candidates.ts — T-028, Umesh's approval/auto-trust workflow:
 * "gmail meeting but i will approve first... after 2-3 times auto confirmed". `POST /gmail/scan`
 * scans real Gmail for meeting-shaped mail and files each as a `meeting_candidates` row —
 * `pending` by default, or `auto_approved` immediately if the sender domain has already earned
 * trust. `GET /meeting-candidates` lists them for review; `POST /meeting-candidates/:id/approve`
 * and `/reject` record the human decision, and an approval increments the sender's trust count
 * (crossing the threshold flips future scans of that sender straight to `auto_approved`).
 */
import { isRefusedWorkDb } from "../db-name.js";
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import type { PublicWebinarAcquisition } from "../gws/public-webinars.js";

export interface MeetingCandidate {
  _id: string;
  messageId: string;
  subject: string;
  senderEmail: string;
  senderDomain: string;
  meetingUrl?: string;
  status: "pending" | "approved" | "rejected" | "auto_approved";
  detectedAt: string;
  decidedAt?: string;
  // U2 source-watcher — additive fields from the extended Gmail scan (gws-gmail.ts).
  kind?: "past-recording" | "upcoming";
  startTime?: string;
  endTime?: string;
  recordingUrl?: string;
  registrationOnly?: boolean;
  registrationUrl?: string;
  senderAuthenticated?: boolean;
  receivedAt?: string;
  youtubeWatch?: { url: string; videoId: string; source: 'body' | 'snippet' };
  youtubeWatchIssue?: 'ambiguous';
  meetingLinkIssue?: 'ambiguous' | 'registration-only' | 'host-start-link';
}

export interface MeetingCandidatesDeps {
  getWorkDatabase?(tenantId: string): string | undefined;
  scanGmail(tenantId: string): Promise<{ created: number; autoApproved: number }>;
  /** Acquisition only: public evidence never becomes a trusted sender or personal admission. */
  discoverPublicWebinars?(tenantId: string): Promise<PublicWebinarAcquisition & {tenantId: string}>;
  listCandidates(tenantId: string): Promise<MeetingCandidate[]>;
  approve(tenantId: string, id: string): Promise<boolean>;
  reject(tenantId: string, id: string): Promise<boolean>;
}

export function createMeetingCandidatesRouter(deps: MeetingCandidatesDeps): Router {
  const router = Router();

  router.post("/public-webinars/scan", requireScope("gmail"), async (req: Request, res: Response) => {
    try {
      const tenantId = req.auth!.tenantId;
      const work = deps.getWorkDatabase?.(tenantId);
      if (!work || isRefusedWorkDb(work) || req.get("X-LKB-Work-DB") !== work || !deps.discoverPublicWebinars) {
        throw new Error("Public discovery not bound");
      }
      // Only authenticated tenant and operator-owned callback configuration reach acquisition.
      const publicDiscovery = await deps.discoverPublicWebinars(tenantId);
      if (publicDiscovery.tenantId !== tenantId) throw new Error("Public discovery owner mismatch");
      res.setHeader("X-LKB-Tenant", tenantId);
      res.setHeader("X-LKB-Work-DB", work);
      res.status(200).json({publicDiscovery});
    } catch {
      res.status(503).json({error: "discovery_unavailable", message: "Public discovery unavailable; check the isolated work database and connection"});
    }
  });

  router.post("/gmail/scan", requireScope("gmail"), async (req: Request, res: Response) => {
    try {
      const work = deps.getWorkDatabase?.(req.auth!.tenantId);
      if (!work || isRefusedWorkDb(work) || req.get("X-LKB-Work-DB") !== work) throw new Error("Work database not bound");
      const result = await deps.scanGmail(req.auth!.tenantId);
      res.status(200).json(result);
    } catch { res.status(503).json({error: "discovery_unavailable", message: "Gmail scan unavailable; check the isolated work database and connection"}); }
  });

  router.get("/meeting-candidates", requireScope("gmail"), async (req: Request, res: Response) => {
    const work = deps.getWorkDatabase?.(req.auth!.tenantId);
    if (work && !isRefusedWorkDb(work)) res.setHeader("X-LKB-Work-DB", work);
    const candidates = await deps.listCandidates(req.auth!.tenantId);
    res.setHeader("X-LKB-Tenant", req.auth!.tenantId);
    res.status(200).json({ candidates });
  });

  router.post("/meeting-candidates/:id/approve", requireScope("gmail"), async (req: Request, res: Response) => {
    const ok = await deps.approve(req.auth!.tenantId, req.params.id as string);
    if (!ok) { res.status(404).json({ error: "not_found", message: "no pending candidate with that id for this tenant" }); return; }
    res.status(200).json({ ok: true });
  });

  router.post("/meeting-candidates/:id/reject", requireScope("gmail"), async (req: Request, res: Response) => {
    const ok = await deps.reject(req.auth!.tenantId, req.params.id as string);
    if (!ok) { res.status(404).json({ error: "not_found", message: "no pending candidate with that id for this tenant" }); return; }
    res.status(200).json({ ok: true });
  });

  return router;
}
