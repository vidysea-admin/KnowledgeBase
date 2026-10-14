// Database-name guard for the API server (ISS-LEGACYSEED-009 / -010).
// No silent default: the server refuses to start unless MONGODB_DB is set explicitly. lkb_staging is
// reachable only with the LKB_ALLOW_STAGING=lkb_staging opt-in, on every path.
const STAGING = "lkb_staging";
const PROTECTED_WORK = ["lkb", "global_university_db"];

/** True when `name` is lkb_staging in any casing (the opt-in only ever matches the exact lowercase name). */
export function isStagingName(name: string | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === STAGING;
}

/** Staging is allowed only for the exact name `lkb_staging` AND LKB_ALLOW_STAGING=lkb_staging. */
export function stagingAllowed(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return name === STAGING && env.LKB_ALLOW_STAGING === STAGING;
}

/** True when `name` may not be used as an isolated work database. */
export function isRefusedWorkDb(name: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const n = (name ?? "").trim();
  if (!n || PROTECTED_WORK.includes(n.toLowerCase())) return true;
  return isStagingName(n) && !stagingAllowed(n, env);
}

/** The API's database name. Throws when MONGODB_DB is unset/blank, or names lkb_staging without the opt-in. */
export function requireDatabaseName(env: NodeJS.ProcessEnv = process.env): string {
  const name = env.MONGODB_DB?.trim();
  if (!name) throw new Error("MONGODB_DB is required: refusing to start without an explicit database name (no default)");
  if (isStagingName(name) && !stagingAllowed(name, env))
    throw new Error("MONGODB_DB=lkb_staging refused: requires LKB_ALLOW_STAGING=lkb_staging");
  return name;
}
