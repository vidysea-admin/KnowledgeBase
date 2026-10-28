// Load the ONE @lkb/db module instance that apps/api (and everything it imports) sees.
//
// Cause of the T-043 "Mongo not connected — call connect() first" failure when scripts/backfill.mjs ran on its own:
// the CLI imported `../packages/db/src/index.ts` by relative path and called connect() on THAT module, while
// apps/api's stores (createMongoJobWriter, the indexing seam) import the bare specifier `@lkb/db`. When the workspace
// link resolves to a different file (a lane worktree whose node_modules junctions point at the main tree) those are two
// module instances with two private `db` variables: connect() filled one, getDb() read the other, and the first
// embedding job-log write threw. Importing `@lkb/db` as apps/api resolves it makes connect() and every getDb() share state.
import {createRequire} from "node:module";
import {pathToFileURL, fileURLToPath} from "node:url";

const DEFAULT_FROM = fileURLToPath(new URL("../../apps/api/package.json", import.meta.url));

export async function loadSharedDb({from = DEFAULT_FROM, resolve = spec => createRequire(from).resolve(spec),
  load = href => import(href)} = {}) {
  return load(pathToFileURL(resolve("@lkb/db")).href);
}

/** Fail loudly (before any write) if connect() left the shared module without a db handle. */
export function assertConnected(dbModule) {
  try { dbModule.getDb(); } catch { throw new Error("backfill: @lkb/db is not connected after connect()"); }
}
