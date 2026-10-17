/**
 * apps/api/src/composition/request-log.ts — D7 request-id + access-log middleware. Mounted FIRST in
 * createServer, so even body-parser and auth failures carry an id and get an access line.
 *  - `X-Request-Id` is honoured only if it matches SAFE_REQUEST_ID (1-128 chars of [A-Za-z0-9._-]);
 *    anything else (CR/LF, spaces, too long, repeated header) is discarded and a UUID generated.
 *  - The id is echoed on the response (`X-Request-Id`) and exposed as `req.requestId` / `req.log`.
 *  - One access line per request: method, path (query string and fragment REMOVED), status,
 *    durationMs, requestId, tenantId when authenticated. Never headers, bodies or the API key.
 */
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "./logger.js";

export const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      log?: Logger;
    }
  }
}

export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/** The request path with no query string / fragment, bounded in length. */
export function pathOnly(url: string): string {
  const cut = url.search(/[?#]/);
  const p = cut === -1 ? url : url.slice(0, cut);
  return p.length > 512 ? `${p.slice(0, 512)}...` : p;
}

export function requestLogger(log: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    const requestId = resolveRequestId(req.headers["x-request-id"]);
    req.requestId = requestId;
    req.log = log.child({ requestId });
    res.setHeader("X-Request-Id", requestId);
    let done = false;
    const access = (aborted: boolean): void => {
      if (done) return;
      done = true;
      const status = aborted ? 499 : res.statusCode;
      const fields: Record<string, unknown> = {
        method: req.method,
        path: pathOnly(req.originalUrl ?? req.url),
        status,
        durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100,
      };
      if (req.auth?.tenantId) fields.tenantId = req.auth.tenantId;
      if (aborted) fields.aborted = true;
      const lvl = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
      req.log![lvl]("request", fields);
    };
    res.on("finish", () => access(false));
    res.on("close", () => access(!res.writableFinished));
    next();
  };
}
