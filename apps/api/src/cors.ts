/**
 * apps/api/src/cors.ts — minimal, hand-rolled CORS middleware (no `cors` npm dependency: the
 * real requirement is narrow — one known frontend origin, GET requests carrying an
 * Authorization header, no cookies/credentials — and a few lines of Express middleware cover
 * that exactly, without pulling in a general-purpose package for it). Origin-restricted, never
 * `Access-Control-Allow-Origin: *`, since requests carry a real Bearer credential.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function createCors(allowedOrigins: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, If-Match, If-None-Match, X-LKB-Work-DB");
      // Browsers hide every non-safelisted response header from scripts unless it is exposed: the join-rules editor needs the ETag.
      res.setHeader("Access-Control-Expose-Headers", "ETag, X-LKB-Work-DB, X-LKB-Tenant");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}
