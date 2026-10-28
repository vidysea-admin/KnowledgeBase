import { createHash } from "node:crypto";
import type { EvalRuns, Gaps, Sources, Sessions, Turns, Chunks, TreeIndexRootDocument } from "@lkb/core";
import type { IndexSessionResult } from "../indexing/types.js";
import type { IntakeResult } from "@lkb/ingest";

/** Root integrates schema-request.json into canonical schemas and regenerates these owning types. */
export type FlywheelHead = NonNullable<Gaps["flywheel"]>;
export type FlywheelStage = FlywheelHead["stage"];
export type LossSnapshot = FlywheelHead["loss"];
export type CaptureReceipt = NonNullable<FlywheelHead["capture"]>;
export type IndexedReceipt = NonNullable<FlywheelHead["index"]>;
export type FlywheelGap = Gaps & { flywheel: FlywheelHead };
export type RetestLineage = NonNullable<EvalRuns["flywheel"]>;
export type RetestRun = EvalRuns & { flywheel: RetestLineage };
export interface SourceRows { source: Sources | null; session: Sessions | null; turns: Turns[] }
export interface IndexedRows { tree: TreeIndexRootDocument | null; chunks: Chunks[] }
/** Mode authority is a current persisted session attempt, never a caller-selected fallback. */
export interface IndexReceiptContext { source: SourceRows; generation: string; retrievalMode?: "vectorless" | "vector" }
export interface FlywheelStore {
  evaluation(tenantId: string, id: string): Promise<EvalRuns | null>;
  gap(tenantId: string, id: string): Promise<FlywheelGap | null>;
  createGap(tenantId: string, row: FlywheelGap): Promise<void>;
  replaceGap(tenantId: string, expectedRevision: number, row: FlywheelGap): Promise<boolean>;
  sourceRows(tenantId: string, sourceId: string, sessionId: string): Promise<SourceRows>;
  indexedRows(tenantId: string, sessionId: string): Promise<IndexedRows>;
  createRetest(tenantId: string, row: RetestRun): Promise<void>;
}
export interface FlywheelDeps {
  store: FlywheelStore;
  intake(req: { tenantId: string; url: string }): Promise<IntakeResult>;
  index(tenantId: string, sessionId: string): Promise<IndexSessionResult>;
  ask(tenantId: string, question: string, receipt: IndexedReceipt): Promise<NonNullable<EvalRuns["aiAnswer"]>>;
  now?: () => Date; newToken?: () => string;
  /** Deadline for a provider stage; timed-out work is not falsely represented as cancelled. */
  operationTimeoutMs?: number;
}
export class FlywheelError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "not_loss" | "input_drift" | "conflict" | "unavailable", readonly status: number) {
    super(code); this.name = "FlywheelError";
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const fingerprint = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
export const gapId = (tenantId: string, evalId: string): string => `eval-gap-${fingerprint([tenantId, evalId])}`;
export const retestId = (tenantId: string, id: string, requestId: string): string => `eval-retest-${fingerprint([tenantId, id, requestId])}`;
