/**
 * apps/api/src/routes/keys.ts — real self-serve API key management (plan §8b phase 4):
 * `GET /keys` (list, masked — never the raw key or its hash), `POST /keys` (mint a new key,
 * returns the raw value ONCE, same shape `scripts/seed-demo-server.mjs` already establishes),
 * `DELETE /keys/:id` (revoke). Tenant-scoped by construction — `req.auth.tenantId` comes from
 * the CALLER's own already-verified key, never from the request body/params, so a key can only
 * ever list/create/revoke within its own tenant. A genuinely security-sensitive feature: no
 * route here ever echoes back a `keyHash` or a previously-minted raw key.
 */
import { Router, type Request, type Response } from "express";
import { requireScope, type VerifiedKey } from "../auth.js";

export interface ApiKeySummary {
  _id: string;
  label: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
}

export interface KeysDeps {
  listKeys(tenantId: string, principal?: VerifiedKey): Promise<ApiKeySummary[]>;
  createKey(tenantId: string, label: string, scopes: string[], principal?: VerifiedKey): Promise<{ id: string; rawKey: string }>;
  revokeKey(tenantId: string, id: string, principal?: VerifiedKey): Promise<boolean>;
}

interface CreateKeyBody {
  label?: unknown;
  scopes?: unknown;
}

export function createKeysRouter(deps: KeysDeps): Router {
  const router = Router();

  router.get("/keys", requireScope("keys"), async (req: Request, res: Response) => {
    const keys = await deps.listKeys(req.auth!.tenantId, req.auth);
    res.status(200).json({ keys });
  });

  router.post("/keys", requireScope("keys"), async (req: Request, res: Response) => {
    const body = req.body as CreateKeyBody | undefined;
    const label = body?.label;
    const scopes = body?.scopes;
    if (
      typeof label !== "string" || label.trim() === "" ||
      !Array.isArray(scopes) || scopes.length === 0 || !scopes.every((s) => typeof s === "string")
    ) {
      res.status(400).json({ error: "bad_request", message: "body must be { label: string, scopes: string[] } (scopes non-empty)" });
      return;
    }
    const { id, rawKey } = await deps.createKey(req.auth!.tenantId, label, scopes as string[], req.auth);
    // The raw key is returned exactly once, here, and never again -- no route in this file (or
    // anywhere else) ever reads it back out of storage, because only its hash is stored.
    res.status(201).json({ id, key: rawKey });
  });

  router.delete("/keys/:id", requireScope("keys"), async (req: Request, res: Response) => {
    const revoked = await deps.revokeKey(req.auth!.tenantId, req.params.id as string, req.auth);
    if (!revoked) {
      res.status(404).json({ error: "not_found", message: "no key with that id for this tenant" });
      return;
    }
    res.status(200).json({ ok: true });
  });

  return router;
}
