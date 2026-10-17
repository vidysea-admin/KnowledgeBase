/**
 * packages/ai/src/jobs.ts — T-019 C5. Writes to the `jobs` ledger (schema/jobs.schema.json,
 * T-018) on every provider call, success or failure. Mirrors `packages/db`'s injectable-accessor
 * pattern (ADR-0001 §3, `scopedCollection`) — `recordJob` never touches Mongo itself; the caller
 * injects `write` (e.g. `packages/db`'s `jobs(tenantId).insertOne`), so this file and its tests
 * need no live database.
 */
import type { Jobs } from "@lkb/core";

/** The subset of `Jobs` a provider call is responsible for filling in (contract C5). */
export type JobEntry = Pick<Jobs, "tenantId" | "kind" | "status"> &
  Partial<Pick<Jobs, "provider" | "createdAt" | "updatedAt">> & {
    model?: string;
    costUsd?: number;
    costStatus?: "unknown" | "reported";
    inputTokens?: number;
    outputTokens?: number;
    error?: string;
  };

export type WriteJobFn = (entry: JobEntry & { createdAt: string }) => Promise<void>;

/** Fills in `createdAt` if the caller omitted it, then calls the injected `write`. */
export async function recordJob(entry: JobEntry, write: WriteJobFn): Promise<void> {
  await write({ ...entry, createdAt: entry.createdAt ?? new Date().toISOString() });
}
