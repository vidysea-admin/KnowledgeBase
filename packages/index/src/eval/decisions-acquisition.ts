/** Offline acquisition through the actual decisions extractor. No provider, storage or gold defaults. */
import type { Turns } from "@lkb/core";
import { parseJsonLoose } from "@lkb/ai";
import { extractDecisions, type DecisionsCompleteFn, type DecisionsResult } from "../pipeline/notes/decisions.js";
import { evaluateExtractionCase, type ExtractionCase, type ExtractionReport } from "./extraction.js";

export interface DecisionAcquisitionInput {
  id: string;
  tenantId: string;
  sessionId: string;
  /** Caller-bound source artifact hash, never a human approval declaration. */
  artifactHash: string;
  turns: Turns[];
  complete: DecisionsCompleteFn;
  /** Read actual stored rows after extraction. Never synthesize persisted rows from proposals.
   * This read-only adapter does not write; the caller owns persistence and generation matching.
   * Available readback is a storage observation, not proof this run persisted its proposals. */
  readPersisted?: (scope: Readonly<{ tenantId: string; sessionId: string }>) => Promise<unknown>;
}
export interface DecisionAcquisition {
  artifacts: ExtractionCase;
  extraction: DecisionsResult;
  report: ExtractionReport;
  providerCalls: number;
  persistence: { kind: "storage-observation"; available: boolean; reason: string | null };
  /** Missing stages and degradation keep acquisition incomplete independently of semantic scores. */
  complete: boolean;
}

/** Preserve literal provider text and the parsed value used by the extractor before filtering.
 * Returned artifacts contain source/provider text: callers must apply their existing privacy rules.
 * No labels, binding thresholds, credentials, environment or filesystem access are introduced. */
export async function acquireDecisions(input: DecisionAcquisitionInput): Promise<DecisionAcquisition> {
  const identity = (v: unknown): v is string => typeof v === "string" && !!v && v === v.trim()
    && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v);
  if (!identity(input.id) || !identity(input.tenantId) || !identity(input.sessionId)
    || !/^[a-f0-9]{64}$/.test(input.artifactHash) || !Array.isArray(input.turns)
    || input.turns.some(t => !t || t.tenantId !== input.tenantId || t.sessionId !== input.sessionId)) {
    throw new Error("Invalid decision acquisition scope");
  }
  const turns = structuredClone(input.turns);
  const artifacts: ExtractionCase = { id: input.id, tenantId: input.tenantId,
    sessionId: input.sessionId, artifactHash: input.artifactHash, turns: structuredClone(turns) };
  let providerCalls = 0;
  const extraction = await extractDecisions(turns, async job => {
    providerCalls++;
    const completion = await input.complete(job);
    // Clone before exposing it to extraction or allowing later caller mutation.
    if (typeof completion.text === "string") artifacts.rawText = completion.text;
    if (completion.json != null) artifacts.parsed = structuredClone(completion.json);
    else {
      try { artifacts.parsed = structuredClone(parseJsonLoose(completion.text)); }
      catch { /* Literal unparseable text remains evidence; parsed stage stays unavailable. */ }
    }
    return completion;
  });
  artifacts.filtered = { claims: structuredClone(extraction.decisions).map(d => ({
    ...d, ...(d.owner ? { speakerRef: d.owner } : {}),
  })), degraded: structuredClone(extraction.degraded) };
  let reason: string | null = "readback-not-supplied";
  if (extraction.degraded) reason = "extraction-degraded";
  else if (!providerCalls) reason = "provider-not-called";
  else if (input.readPersisted) {
    try {
      const rows = await input.readPersisted(Object.freeze({ tenantId: input.tenantId, sessionId: input.sessionId }));
      if (Array.isArray(rows)) { artifacts.persisted = structuredClone(rows); reason = null; }
      else reason = "readback-invalid";
    } catch { reason = "readback-failed"; }
  }
  const report = evaluateExtractionCase(artifacts);
  return { artifacts, extraction, report, providerCalls,
    persistence: { kind: "storage-observation", available: reason === null, reason },
    complete: !extraction.degraded && report.complete
      && Object.values(report.stages).every(stage => stage.available) };
}
