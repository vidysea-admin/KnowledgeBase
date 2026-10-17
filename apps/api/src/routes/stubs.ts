/**
 * Remaining unimplemented endpoints. Hosting now owns `/webhooks/register`, including
 * its permission and runtime-configuration checks; it must not be advertised as a 501 stub.
 * Keep the exported table for the docs page and any future explicitly unimplemented endpoint.
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";

export interface StubRoute {
  method: "get" | "post";
  path: string;
  scope: string;
  label: string;
}

export const STUB_ROUTES: StubRoute[] = [];

function notImplemented(label: string) {
  return (_req: Request, res: Response) => {
    res.status(501).json({ error: "not_implemented", message: `${label} is planned, not yet built — see TASKS.md` });
  };
}

export function createStubsRouter(): Router {
  const router = Router();
  for (const route of STUB_ROUTES) {
    router[route.method](route.path, requireScope(route.scope), notImplemented(route.label));
  }
  return router;
}
