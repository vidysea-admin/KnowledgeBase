import type { JobsReadDeps } from "./router.js";

/** Missing fixture/composition dependencies are unavailable, never a healthy empty ledger. */
export const unavailableJobsReadDeps: JobsReadDeps = {
  async listJobs() { throw new Error("Provider audit jobs are unavailable"); },
};
