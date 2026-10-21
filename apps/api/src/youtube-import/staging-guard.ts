/**
 * apps/api/src/youtube-import/staging-guard.ts - D-117: the owner-captions import writes to lkb_staging only.
 * Pure (env in, name out) so it is unit-tested without any database; the CLI calls it before any connect.
 */
import { requireDatabaseName } from "../db-name.js";

export function requireStagingDatabase(env: NodeJS.ProcessEnv): string {
  const name = requireDatabaseName(env); // throws if MONGODB_DB is unset, or lkb_staging without LKB_ALLOW_STAGING
  if (name !== "lkb_staging") throw new Error("youtube-import: writes to lkb_staging only (D-117); set MONGODB_DB=lkb_staging and LKB_ALLOW_STAGING=lkb_staging");
  return name;
}
