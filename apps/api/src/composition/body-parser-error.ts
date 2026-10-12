/**
 * apps/api/src/composition/body-parser-error.ts — ISS-APILOGGER-001. body-parser errors (malformed JSON,
 * too large, ...) used to fall through to Express's default handler, which prints err.stack (with a snippet
 * of the request body in the SyntaxError message) to stderr and, outside production, into the client's page.
 * This handler logs one structured line WITHOUT err/err.message/err.body and answers with the exact bytes
 * Express's production-mode final handler produces (same status, headers and HTML), in every NODE_ENV.
 */
import { STATUS_CODES } from "node:http";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "./logger.js";

const BODY_PARSER_TYPES = new Set([
  "entity.parse.failed", "entity.verify.failed", "entity.too.large", "encoding.unsupported", "charset.unsupported",
  "request.aborted", "request.size.invalid", "stream.encoding.set", "parameters.too.many",
]);

export function bodyParserErrorHandler(log: Logger) {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    const e = err as { type?: unknown; status?: unknown; statusCode?: unknown; headers?: unknown } | null;
    const status = e?.status ?? e?.statusCode;
    if (res.headersSent || typeof e?.type !== "string" || !BODY_PARSER_TYPES.has(e.type)
      || typeof status !== "number" || status < 400 || status > 599 || !STATUS_CODES[status]) { next(err); return; }
    (req.log ?? log).warn("request body rejected", { errType: e.type, status });
    const html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>${STATUS_CODES[status]}</pre>\n</body>\n</html>\n`;
    res.status(status);
    if (e.headers && typeof e.headers === "object") for (const [k, v] of Object.entries(e.headers)) res.setHeader(k, v as string);
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Length", Buffer.byteLength(html, "utf8"));
    res.end(html);
  };
}
