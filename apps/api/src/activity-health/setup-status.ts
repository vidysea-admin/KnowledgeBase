/**
 * apps/api/src/activity-health/setup-status.ts — T-057 E4 setup wizard. `GET /setup/status`: for each
 * optional integration, whether its environment configuration is present — ONE boolean each, nothing else.
 * It never returns a value, a prefix, a length or a hint of any secret, so the response shape is fixed:
 * `{ configured: { gemini: boolean, tavily: boolean, langfuse: boolean } }`.
 * Mounted AFTER `requireAuth` (any verified key, no scope — the `/system-status` precedent: it is a setup
 * check, not tenant data). The answer is deployment-wide (process env), not tenant data, so it is
 * tenant-agnostic and cannot leak another tenant's anything. The body is rebuilt from literal booleans.
 */
import { Router, type Request, type Response } from "express";

export interface SetupStatusBody {
  configured: { gemini: boolean; tavily: boolean; langfuse: boolean };
}

const present = (env: NodeJS.ProcessEnv, name: string): boolean => (env[name] ?? "").trim() !== "";

export function readSetupStatus(env: NodeJS.ProcessEnv): SetupStatusBody {
  return {
    configured: {
      gemini: present(env, "GEMINI_API_KEY"),
      tavily: present(env, "TAVILY_API_KEY"),
      // Same three variables the sink in packages/ai/src/trace-langfuse/sink.ts requires.
      langfuse: present(env, "LANGFUSE_BASE_URL") && present(env, "LANGFUSE_PUBLIC_KEY") && present(env, "LANGFUSE_SECRET_KEY"),
    },
  };
}

export function createSetupStatusRouter(readEnv: () => NodeJS.ProcessEnv = () => process.env): Router {
  const router = Router();
  router.get("/setup/status", (req: Request, res: Response) => {
    if (!req.auth?.tenantId) { res.status(401).json({ error: "unauthorized", message: "authentication required" }); return; }
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(readSetupStatus(readEnv()));
  });
  return router;
}
