/**
 * apps/api/src/user-accounts/viewer-guard.ts -- unit `ua-session-core`, spec UA-9a / UA-9b.
 * Two guards for a SESSION principal (an API key never reaches them):
 *  - activeGuard: a non-active user (pending) is answered 403 `account_not_active` everywhere except `/auth/*`.
 *  - viewerGuard: a `viewer` is read-only by construction. Any method other than GET/HEAD/OPTIONS is 403
 *    `read_only_role` unless it is an exact (method, path) entry of READ_LIKE_POSTS, kept in THIS file only.
 * The generated route-enumeration test (viewer-guard.test.ts) fails when a mounted write route is not behind
 * these guards, so a route added later cannot silently escape them.
 */
import type { NextFunction, Request, Response } from "express";
import { SAFE_METHODS } from "./csrf.js";

/** POSTs that only READ for the signed-in caller (kept as the single allowlist, UA-9a). */
export const READ_LIKE_POSTS: ReadonlySet<string> = new Set(["POST /ask", "POST /citations/native/resolve"]);

export function isReadLikePost(method: string, path: string): boolean {
  return READ_LIKE_POSTS.has(`${method.toUpperCase()} ${path.length > 1 ? path.replace(/\/+$/, "") : path}`);
}

export function activeGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.principal === "session" && req.auth.notActive === true && req.path !== "/auth" && !req.path.startsWith("/auth/")) {
    res.status(403).json({ error: "account_not_active", message: "this account is not active" });
    return;
  }
  next();
}

export function viewerGuard(req: Request, res: Response, next: NextFunction): void {
  const a = req.auth;
  if (a?.principal === "session" && a.userRole === "viewer" && !SAFE_METHODS.has(req.method.toUpperCase()) && !isReadLikePost(req.method, req.path)) {
    res.status(403).json({ error: "read_only_role", message: "viewers have read-only access" });
    return;
  }
  next();
}
