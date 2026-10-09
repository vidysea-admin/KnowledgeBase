import { jobs } from "../../../../packages/db/src/collections/jobs.js";
import { assertJobsLimit, projectJobSummary, type JobsReadDeps } from "./router.js";

export interface JobsReadCursor {
  project(projection: Record<string, 1>): JobsReadCursor;
  sort(order: Record<string, 1 | -1>): JobsReadCursor;
  limit(limit: number): JobsReadCursor;
  toArray(): Promise<unknown[]>;
}
export type JobsReader = (tenantId: string) => { find(filter: Record<string, never>): JobsReadCursor };

/** Standard application provider-audit collection; no upload queue or write operations. */
export function createMongoJobsReadDeps(reader: JobsReader = jobs): JobsReadDeps {
  return {
    async listJobs(tenantId, limit) {
      assertJobsLimit(limit);
      if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Invalid jobs tenant");
      const rows = await reader(tenantId).find({})
        .project({_id: 1, kind: 1, status: 1, provider: 1, createdAt: 1, updatedAt: 1})
        .sort({createdAt: -1, _id: -1}).limit(limit + 1).toArray();
      if (!Array.isArray(rows) || rows.length > limit + 1) throw new Error("Invalid jobs result");
      const summaries = rows.map(projectJobSummary);
      return {jobs: summaries.slice(0, limit), limit, truncated: rows.length > limit};
    },
  };
}
