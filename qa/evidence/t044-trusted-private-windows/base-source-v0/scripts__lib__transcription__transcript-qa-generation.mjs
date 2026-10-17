/** Bind QA audit evidence to the exact transcript bytes committed by the producer. */
import { createHash } from "node:crypto";

export const transcriptBytesSha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const finite = n => typeof n === "number" && Number.isFinite(n);
const count = n => Number.isSafeInteger(n) && n >= 0;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = message => { throw new Error(`QA report: ${message}`); };

/** Validate audit counts/indices before they can authorize a transcript generation. */
export function assertQaReport(report) {
  if (!object(report) || report.durationValid !== true || !finite(report.durationSec) || report.durationSec <= 0) fail("audio duration invalid");
  for (const field of ["inputCount", "outputCount", "clampedCount"]) if (!count(report[field])) fail(`invalid ${field}`);
  for (const field of ["clampedIndices", "dropped", "nonMonotonicIndices"]) if (!Array.isArray(report[field])) fail(`invalid ${field}`);
  if (!object(report.hallucination) || !Array.isArray(report.hallucination.pastEndIndices) || !Array.isArray(report.hallucination.repeatedRuns) ||
      !count(report.hallucination.repeatThreshold) || report.hallucination.repeatThreshold < 2) fail("invalid hallucination evidence");
  const indices = (values, name) => {
    if (values.some(i => !count(i) || i >= report.inputCount) || new Set(values).size !== values.length) fail(`invalid ${name} indices`);
  };
  indices(report.clampedIndices, "clamped"); indices(report.nonMonotonicIndices, "non-monotonic");
  indices(report.hallucination.pastEndIndices, "past-end");
  const dropped = report.dropped.map(d => {
    if (!object(d) || !["invalid-duration", "invalid-timing", "start-at-or-beyond-duration"].includes(d.reason) || typeof d.suspectedHallucination !== "boolean") fail("invalid dropped evidence");
    if (d.suspectedHallucination !== (d.reason === "start-at-or-beyond-duration")) fail("contradictory dropped evidence");
    return d.index;
  });
  indices(dropped, "dropped");
  if (report.inputCount !== report.outputCount + dropped.length || report.clampedCount !== report.clampedIndices.length ||
      report.clampedIndices.some(i => dropped.includes(i)) || report.nonMonotonicIndices.some(i => dropped.includes(i))) fail("contradictory counts/indices");
  const expectedPast = report.dropped.filter(d => d.suspectedHallucination).map(d => d.index).sort((a, b) => a - b);
  if (JSON.stringify(expectedPast) !== JSON.stringify([...report.hallucination.pastEndIndices].sort((a, b) => a - b))) fail("contradictory past-end evidence");
  for (const run of report.hallucination.repeatedRuns) {
    if (!object(run) || typeof run.text !== "string" || !run.text.trim() || !count(run.startIndex) || !count(run.length) ||
        run.length < report.hallucination.repeatThreshold || run.startIndex + run.length > report.inputCount) fail("invalid repeated-run evidence");
  }
  for (const field of ["totalTurnSec", "overshootSec", "maxInputEndSec"]) if (!finite(report[field]) || report[field] < 0) fail(`invalid ${field}`);
  if (Math.abs(report.overshootSec - Math.max(0, report.totalTurnSec - report.durationSec)) > 1e-6) fail("contradictory overshoot evidence");
}

export function assertQaGenerationShape(proof) {
  if (!object(proof) || proof.version !== 1 || !/^[0-9a-f]{64}$/.test(proof.turnsSha256 ?? "") ||
      !finite(proof.durationSec) || proof.durationSec <= 0 || !Array.isArray(proof.spans)) fail("unbound or malformed transcript generation");
  assertQaReport(proof.merged);
  if (proof.merged.durationSec !== proof.durationSec) fail("merged duration mismatch");
  const ids = new Set();
  let accepted = 0;
  let retainedOutputCount = 0;
  for (const span of proof.spans) {
    if (!object(span) || typeof span.id !== "string" || !span.id.trim() || ids.has(span.id) || typeof span.accepted !== "boolean" ||
        !finite(span.offsetSeconds) || span.offsetSeconds < 0) fail("invalid span attempt identity");
    ids.add(span.id);
    assertQaReport(span.report);
    if (span.accepted) {
      accepted++;
      retainedOutputCount += span.report.outputCount;
      if (span.offsetSeconds >= proof.durationSec || span.report.durationSec > proof.durationSec - span.offsetSeconds + 1e-6) fail("accepted span outside recording");
    }
  }
  if (proof.merged.outputCount > 0 && accepted === 0) fail("accepted span evidence missing");
  if (retainedOutputCount !== proof.merged.inputCount) fail("accepted span count does not reconcile with merged input");
}

/** Producer calls AFTER committing turns.json; bytes are read from that actual committed file. */
export function buildTranscriptQaGeneration({ turnsBytes, durationSec, spans, merged }) {
  const proof = structuredClone({ version: 1, turnsSha256: transcriptBytesSha256(turnsBytes), durationSec, spans, merged });
  assertQaGenerationShape(proof);
  return proof;
}

/** Retained attempts gate ingestion; rejected retry attempts remain visible audit metadata. */
export function qaReportFailureReasons(report, label) {
  const reasons = [];
  if (report.dropped.some(d => d.reason === "invalid-timing" || d.reason === "invalid-duration")) reasons.push(`${label}: invalid dropped timing`);
  if (report.hallucination.pastEndIndices.length) reasons.push(`${label}: turn(s) past the audio end (possible hallucination)`);
  if (report.hallucination.repeatedRuns.length) reasons.push(`${label}: repeated-turn run(s) (possible hallucination)`);
  if (report.nonMonotonicIndices.length) reasons.push(`${label}: non-monotonic turn(s)`);
  return reasons;
}
