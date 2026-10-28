import { createHash } from "node:crypto";
import { join } from "node:path";
import { isPlain, parseIsoInstant } from "../../strict-record.js";
import { markSessionProcessed, type MarkResult } from "../retention-processed.js";
import { readRetentionBytes, validRetentionTenant, writeRetentionAtomic } from "./private-summary.js";

export interface ProcessedProofBinding { tenantId: string; sessionId: string; sourceId: string; workDb: string; generation: string; inputArtifact: "turns.json" | "knowledge-turns.json"; retrievalMode?: "semantic" | "vectorless" }
export type ProcessedSessionIdentity = Pick<ProcessedProofBinding, "tenantId" | "sessionId" | "sourceId">;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const safeId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);
function writeSessionBytes(path: string, text: string, guard: () => void): void {
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("session-metadata-too-large");
  writeRetentionAtomic(path, text, guard);
}
function boundSession(sessionDir: string, expected: ProcessedSessionIdentity): { bytes: Buffer; source: Buffer; row: Record<string, unknown> } {
  if (!isPlain(expected) || !validRetentionTenant(expected.tenantId) || !safeId(expected.sessionId) || !safeId(expected.sourceId)) throw new Error("invalid-session-binding");
  const source = readRetentionBytes(join(sessionDir, "source.json"), 1024 * 1024), s = JSON.parse(source.toString("utf8")) as Record<string, unknown>;
  const bytes = readRetentionBytes(join(sessionDir, "session.json"), 1024 * 1024), row = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  if (!isPlain(s) || !isPlain(row) || s._id !== expected.sourceId || s.tenantId !== expected.tenantId || row._id !== expected.sessionId ||
      row.tenantId !== expected.tenantId || row.sourceId !== expected.sourceId || !isPlain(row.status)) throw new Error("foreign-session-state");
  return { bytes, source, row };
}
/** Updates only the live attempt's index status; original audit, processing timestamp and metadata survive. */
export function setSessionIndexStatus(sessionDir: string, expected: ProcessedSessionIdentity, index: "processing" | "done" | "failed"): { ok: true } | { ok: false; reason: string } {
  if (!["processing", "done", "failed"].includes(index)) return { ok: false, reason: "invalid-index-status" };
  try {
    const state = boundSession(sessionDir, expected), status = state.row.status as Record<string, unknown>;
    if (index !== "failed" && status.transcribe !== "done") return { ok: false, reason: "transcription-not-done" };
    writeSessionBytes(join(sessionDir, "session.json"), `${JSON.stringify({ ...state.row, status: { ...status, index } }, null, 2)}\n`, () => {
      const current = boundSession(sessionDir, expected);
      if (!current.bytes.equals(state.bytes) || !current.source.equals(state.source)) throw new Error("session-changed");
    });
    return { ok: true };
  } catch { return { ok: false, reason: "index-status-write-refused" }; }
}
/** Existing on-disk metadata takes precedence over re-emitted derived defaults. */
export function emitSessionPreservingAudit(sessionDir: string, incoming: Record<string, unknown>): { ok: true } | { ok: false; reason: string } {
  try {
    if (!isPlain(incoming) || !validRetentionTenant(incoming.tenantId) || !safeId(incoming._id) || !safeId(incoming.sourceId) || !isPlain(incoming.status)) throw new Error("invalid-session");
    const expected = { tenantId: incoming.tenantId, sessionId: incoming._id, sourceId: incoming.sourceId };
    const source = readRetentionBytes(join(sessionDir, "source.json"), 1024 * 1024), s = JSON.parse(source.toString("utf8")) as Record<string, unknown>;
    if (!isPlain(s) || s._id !== expected.sourceId || s.tenantId !== expected.tenantId) throw new Error("foreign-source");
    let existing: ReturnType<typeof boundSession> | undefined;
    try { existing = boundSession(sessionDir, expected); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const payload = existing ? { ...incoming, ...existing.row, status: { ...incoming.status, ...existing.row.status as Record<string, unknown> } } : incoming;
    writeSessionBytes(join(sessionDir, "session.json"), `${JSON.stringify(payload, null, 2)}\n`, () => {
      if (!readRetentionBytes(join(sessionDir, "source.json"), 1024 * 1024).equals(source)) throw new Error("source-changed");
      if (existing && !boundSession(sessionDir, expected).bytes.equals(existing.bytes)) throw new Error("session-changed");
    });
    return { ok: true };
  } catch { return { ok: false, reason: "session-emission-refused" }; }
}
/** Invoked only after the real caller commits a current mode-bound proof and advances disk index status. */
export function markSessionProcessedFromProof(sessionDir: string, expected: ProcessedProofBinding, now: number): MarkResult {
  if (!isPlain(expected) || ["tenantId", "sessionId", "sourceId", "workDb", "generation", "inputArtifact"].some(key => {
    const field = Object.getOwnPropertyDescriptor(expected, key); return !field || !("value" in field) || !field.enumerable;
  })) return { ok: false, reason: "invalid-proof-binding" };
  const modeField = Object.getOwnPropertyDescriptor(expected, "retrievalMode");
  if (modeField && (!("value" in modeField) || !modeField.enumerable)) return { ok: false, reason: "invalid-proof-binding" };
  if (!expected || !validRetentionTenant(expected.tenantId) || ![expected.sessionId, expected.sourceId, expected.generation].every(safeId) ||
      typeof expected.workDb !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(expected.workDb) ||
      !["turns.json", "knowledge-turns.json"].includes(expected.inputArtifact) ||
      (Object.hasOwn(expected, "retrievalMode") && !["semantic", "vectorless"].includes(expected.retrievalMode!)) ||
      !Number.isSafeInteger(now) || now < 0 || now > 253_402_300_799_999) return { ok: false, reason: "invalid-proof-binding" };
  try {
    const files = ["source.json", "session.json", "index-proof.json", expected.inputArtifact];
    const snapshots = files.map((name, index) => readRetentionBytes(join(sessionDir, name), index === 3 ? 64 * 1024 * 1024 : 1024 * 1024));
    const [source, session, proof, turns] = snapshots.map(bytes => JSON.parse(bytes.toString("utf8"))) as unknown[];
    if (!isPlain(source) || !isPlain(session) || !isPlain(proof) || !Array.isArray(turns) || !turns.every(isPlain)) return { ok: false, reason: "invalid-proof-state" };
    const s = source as Record<string, unknown>, row = session as Record<string, unknown>, p = proof as Record<string, unknown>;
    const status = isPlain(row.status) ? row.status as Record<string, unknown> : {};
    if (s._id !== expected.sourceId || s.tenantId !== expected.tenantId || row._id !== expected.sessionId ||
        row.tenantId !== expected.tenantId || row.sourceId !== expected.sourceId || status.transcribe !== "done" || status.index !== "done") return { ok: false, reason: "session-not-currently-processed" };
    if (Object.hasOwn(row, "processedAt") && (parseIsoInstant(row.processedAt) === null || parseIsoInstant(row.processedAt)! > now)) return { ok: false, reason: "invalid-existing-processing-stamp" };
    if (s.testData === true && expected.workDb !== "lkb_staging") return { ok: false, reason: "test-data-work-db-mismatch" };
    const vectorless = expected.retrievalMode === "vectorless";
    if (p.version !== (vectorless ? 4 : 3) || p.tenantId !== expected.tenantId || p.sessionId !== expected.sessionId || p.sourceId !== expected.sourceId ||
        p.workDb !== expected.workDb || p.generation !== expected.generation || p.inputArtifact !== expected.inputArtifact || p.sourceHash !== sha(snapshots[0]!) || p.inputHash !== sha(snapshots[3]!)) return { ok: false, reason: "stale-or-foreign-index-proof" };
    const modeReady = vectorless
      ? p.retrievalMode === "vectorless" && p.lexical === "done" && p.provenance === "passed" && p.semanticSupport === "not-required"
      : (!Object.hasOwn(p, "retrievalMode") || p.retrievalMode === "semantic") && p.semanticSupport === "passed";
    if (p.status !== "done" || p.strict !== true || !modeReady || !["summary", "claims", "chunks", "tree"].every(key => p[key] === "done") ||
        !Number.isSafeInteger(p.turnCount) || p.turnCount !== turns.length || turns.length === 0) return { ok: false, reason: "incomplete-index-proof" };
    const verifyCurrent = () => {
      files.forEach((name, index) => {
        const current = readRetentionBytes(join(sessionDir, name), index === 3 ? 64 * 1024 * 1024 : 1024 * 1024);
        if (!current.equals(snapshots[index]!)) throw new Error("state-changed-before-stamp");
      });
    };
    verifyCurrent();
    return markSessionProcessed(sessionDir, now, {
      read: () => { verifyCurrent(); return snapshots[1]!.toString("utf8"); },
      writeAtomic: (path, text) => writeSessionBytes(path, text, verifyCurrent),
    });
  } catch { return { ok: false, reason: "proof-state-unreadable-or-changed" }; }
}
