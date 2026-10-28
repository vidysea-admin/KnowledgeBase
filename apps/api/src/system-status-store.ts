/**
 * apps/api/src/system-status-store.ts — ISS-T057SCREEN-001. Tenant-scoped per-collection counts for
 * `GET /system-status`. Every count goes through `scopedCollection(...)(tenantId).countDocuments()`
 * (withTenant-merged), never a bare `countDocuments()`. `db`/`names` are injected so a test can use
 * a fake database; production binds them in composition/production.ts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb, scopedCollection } from "@lkb/db";
import type { SystemStatusDeps } from "./routes/system-status.js";

const SCHEMA_INDEX_PATH = fileURLToPath(new URL("../../../schema/index.json", import.meta.url));

export function schemaCollectionNames(): string[] {
  const index = JSON.parse(readFileSync(SCHEMA_INDEX_PATH, "utf8")) as Record<string, unknown>;
  return Object.keys(index).filter((k) => !k.startsWith("$"));
}

type Db = Parameters<typeof scopedCollection>[0];

export function createMongoSystemStatusDeps(
  db: () => Db = () => getDb(),
  names: () => string[] = schemaCollectionNames,
): SystemStatusDeps {
  return {
    async tenantStatus(tenantId) {
      try {
        const handle = db();
        await (handle as unknown as { command(c: object): Promise<unknown> }).command({ ping: 1 });
        const collections: Record<string, number> = {};
        await Promise.all(names().map(async (name) => {
          collections[name] = await scopedCollection<{ tenantId: string; _id: string }>(handle, name)(tenantId).countDocuments();
        }));
        return { db: "ok", collections };
      } catch {
        return { db: "error", collections: {} };
      }
    },
  };
}
