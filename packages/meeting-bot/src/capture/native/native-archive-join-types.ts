/** Trusted process-root join contracts. Descriptive DTOs never issue capabilities. */
import type { NativeFinalizedMedia } from "./native-media-finalize.js";
import type { NativeProviderAudio } from "../record-consent/native-provider-audio.js";
import type { NativeArchiveBinding } from "./native-archive-authority.js";
import type { QualifiedCaptureClock } from "../tiles/native-measurement.js";

export interface NativeSealCaptureInput {
  media: NativeFinalizedMedia;
  providerAudio: NativeProviderAudio;
  sourcePath: string;
  sidecarPath: string;
  consentPath: string;
  publicVideoPath: string;
  recordDir: string;
  sourceId: string;
  remainingReservationBytes: number;
}
export interface NativeCaptureSealer {
  sealCapture(input: NativeSealCaptureInput): Promise<{ archiveId: string; binding: NativeArchiveBinding }>;
}
export type NativeArchiveUnavailableReason = "unadmitted" | "binding-unavailable" | "artifact-unavailable"
  | "clock-unavailable" | "private-transform-unsupported" | "reproof-unavailable";
export type NativeArchiveRecovery = { status: "ready"; media: NativeFinalizedMedia;
  providerAudio: NativeProviderAudio; canonicalClock?: QualifiedCaptureClock }
  | { status: "unavailable"; reason: NativeArchiveUnavailableReason };
export interface NativeCaptureRecoverer {
  recoverCapture(input: { archiveId: string; expected: NativeArchiveBinding }): Promise<NativeArchiveRecovery>;
}
/** Structurally compatible with API-owned DTOs; API must not import this module. */
export interface CurrentPublicationBinding extends NativeArchiveBinding {
  readonly generation: string;
  readonly turnDigest: string;
  readonly reviewRevision: string | null;
}
export interface NativeCommittedIndexBinding {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly sourceId: string;
  readonly generation: string;
  readonly turnDigest: string;
  readonly reviewRevision: string | null;
}
export interface NativeArchiveServerService extends NativeCaptureSealer {
  onIndexCommitted(binding: Readonly<NativeCommittedIndexBinding>): Promise<void>;
  drain(input: { limit: number; cursor?: string }): Promise<{ cursor?: string; pending: number }>;
}
