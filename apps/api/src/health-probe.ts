/**
 * apps/api/src/health-probe.ts — ISS-070, narrowed by ISS-T057SCREEN-001. The public `/health` is
 * liveness-only: this runs the db ping under a try/catch and degrades to `{db: "error"}` rather
 * than throwing. It deliberately takes NO count function — counting is not a liveness concern and
 * the authenticated `/system-status` owns it.
 */
import type { HealthReport } from "./routes/health.js";

export async function probeMongoHealth(ping: () => Promise<unknown>): Promise<HealthReport> {
  try {
    await ping();
    return { db: "ok" };
  } catch {
    return { db: "error" };
  }
}
