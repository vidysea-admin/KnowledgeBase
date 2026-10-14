/**
 * scripts/watch/test-data-route.mjs - test-data routing (Umesh decision 2026-10-14, D-143).
 * A capture whose source.json carries `testData: true` (a non-career webinar, tagged by the schedule tick) is NEVER written to the
 * work database the run was configured with: it goes to lkb_staging only, and only when the existing opt-in
 * LKB_ALLOW_STAGING=lkb_staging is set. Without the opt-in the sync REFUSES; it never falls back to another database.
 * Anything that is not exactly `testData === true` keeps the configured database unchanged.
 */
export const STAGING_DB = "lkb_staging";

export function resolveWorkDb({ testData, workDb, env }) {
  if (testData !== true) return { workDb, testData: false };
  if (env.LKB_ALLOW_STAGING !== STAGING_DB) {
    throw new Error("testData source: refusing to write it anywhere but lkb_staging, and lkb_staging needs LKB_ALLOW_STAGING=lkb_staging; nothing was written");
  }
  return { workDb: STAGING_DB, testData: true, rerouted: workDb !== STAGING_DB };
}
