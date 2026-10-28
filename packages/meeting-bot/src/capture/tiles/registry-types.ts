/** Descriptive physical DTOs shared by registry and measurement. No capability issuer. */
import type { SessionPageIndexArtifact } from "@lkb/core";
import type { RecordConsentReceipt } from "../record-consent/context.js";
export interface TileCommittedCapture {
  evidenceKind: "native" | "synthetic"; tenantId: string; sessionId: string;
  indexBinding: SessionPageIndexArtifact; captureGeneration: string; hostId: string; samplerInstance: string;
  platform: "meet"; durationSec: number;
  audioPath: string; publicVideoPath: string; sourcePath: string; sidecarPath: string; clockPath: string;
  audioSha256: string; publicVideoSha256: string; sourceSha256: string; sidecarSha256: string; receiptSha256: string; clockSha256: string;
}
/** Returned by the trusted actual measurement subsystem, not a body/sidecar/consent parser.
 * Intervals bound decoded zero and the sampler's epoch/monotonic origin independently.
 * trimStartSec describes a contiguous retained original timeline; arbitrary edits are unsupported.
 */
export interface TileDecodedClockMeasurement {
  evidenceKind: "native" | "synthetic"; method: "decoded-first-sample";
  captureGeneration: string; hostId: string; samplerInstance: string;
  audioSha256: string; publicVideoSha256: string; sourceSha256: string; sidecarSha256: string; receiptSha256: string;
  mediaZeroEpochSec: { earliest: number; latest: number };
  samplerZeroEpochSec: { earliest: number; latest: number };
  driftBoundSec: number; highlightLagBoundSec: number;
  originalDurationSec: number; trimStartSec: number; durationSec: number;
  monotonicMappingSha256: string; measurementSha256: string;
}
export interface TileMeasurementArtifacts {
  binding: Readonly<TileCommittedCapture>; receipt: Readonly<RecordConsentReceipt>;
  physical: Readonly<{ audio: string; publicVideo: string; source: string; sidecar: string; clock: string }>;
}
