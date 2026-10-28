/** native-tab-clock/1 wire facts. Runtime validators must enforce units, bounds and joins.
 * These declarations grant no capture authority, platform qualification or native readiness.
 */
export interface NativeCaptureIdentity {
  readonly schema: "native-tab-clock/1";
  readonly tenantId: string;
  readonly sessionId: string;
  readonly captureGeneration: string;
  readonly captureInstanceId: string;
  readonly samplerInstanceId: string;
  readonly platform: string;
  readonly browserBuild: string;
  readonly extensionAssetSha256: string;
  readonly clockInstanceId: string;
}

/** Server composition only. Transport finalization configuration grants no qualification. */
export interface NativeTabCaptureConfig {
  identity: NativeCaptureIdentity;
  maxBytes: number;
  deferFinalization?: boolean;
  finalizationTimeoutMs?: number;
  onClosed: (spool: ClosedNativeSpool, output: string, control?: { signal: AbortSignal }) => Promise<void>;
}

export interface ProducerVideoObservation {
  readonly frameId: string;
  readonly sourceTimestampUs: number | null;
  readonly timestampUs: number;
  readonly copyBeforeUs: number;
  readonly copyAfterUs: number;
  readonly encodedType: "key" | "delta";
  readonly encodedByteLength: number;
  /** Computed by the private receiver over the encoded chunk bytes. */
  readonly chunkSha256: string;
}

export interface ProducerAudioObservation {
  readonly blockId: string;
  readonly startFrame: number;
  readonly frameCount: number;
  readonly sampleRate: number;
  readonly channels: 1;
  readonly format: "s16le";
  readonly byteLength: number;
  /** Computed by the private receiver over the transported PCM bytes. */
  readonly sha256: string;
  /** Descriptive packet facts; retained JSON grants no qualification. */
  readonly windowsPacket?: WindowsPacketClock;
}

export interface WindowsUtcBracket { qpcBefore: string; utcFiletime: string; qpcAfter: string }
/** Separate packet domain. These are never AudioContext output timestamps. */
export interface WindowsPacketClock {
  method: 'wasapi-packet-qpc/1'; sequence: number; firstSampleIndex: number; frameCount: number;
  devicePosition: string; qpc100ns: string; qpcFrequency: string;
  before: WindowsUtcBracket; after: WindowsUtcBracket; flags: number;
  rawSha256: string; pcmSha256: string;
}

export interface AudioClockPair {
  readonly clockInstanceId: string;
  readonly beforePerformanceUs: number;
  /** Actual AudioContext.getOutputTimestamp().contextTime, in seconds. */
  readonly contextTime: number;
  /** Actual AudioContext.getOutputTimestamp().performanceTime, in milliseconds. */
  readonly performanceTime: number;
  readonly afterPerformanceUs: number;
  readonly state: "running" | "suspended" | "interrupted" | "closed";
  readonly sampleRate: number;
}

export interface EpochClockBracket {
  readonly clockInstanceId: string;
  readonly beforeMonotonicUs: number;
  readonly epochUs: number;
  readonly afterMonotonicUs: number;
}

export interface HostClockPair {
  readonly browser: EpochClockBracket;
  readonly serverRequest: EpochClockBracket;
  readonly serverResponse: EpochClockBracket;
}

/** Unknown is null, never zero. Bounds require independently measured applicability. */
export interface NativeClockUncertainty {
  readonly bracketWidthUs: number | null;
  readonly clockFitResidualUs: number | null;
  readonly quantizationUs: number | null;
  readonly audioOutputEstimationBoundUs: number | null;
  readonly samplerObservationLagBoundUs: number | null;
  readonly sourceObservationLagBoundUs: number | null;
}

export interface NativeSpoolFile {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

// Deliberately unexported: arbitrary JSON cannot construct a closed receiver capability.
// Only the private receiver's close/readback implementation may attest this brand.
declare const closedNativeSpool: unique symbol;
export interface ClosedNativeSpool {
  readonly [closedNativeSpool]: true;
  readonly identity: NativeCaptureIdentity;
  readonly video: NativeSpoolFile;
  readonly audio: NativeSpoolFile;
  readonly ledger: NativeSpoolFile;
  readonly videoFrameCount: number;
  readonly audioSampleCount: number;
  readonly firstVideoTimestampUs: number;
  readonly firstAudioSampleIndex: number;
  readonly sampleRate: number;
  readonly audioChannels: 1;
  readonly audioFormat: "s16le";
  readonly ivfTimebase: Readonly<{ rate: 1000000; scale: 1 }>;
  readonly complete: true;
  readonly poisoned: false;
}

export interface RationalTimebase {
  readonly numerator: number;
  readonly denominator: number;
}

export interface DecodedStreamIdentity {
  readonly streamId: string;
  readonly streamIndex: number;
  readonly kind: "video" | "audio";
  readonly codec: string;
  readonly timebase: RationalTimebase;
  readonly firstPts: number;
  readonly lastPts: number;
  readonly decodedFrameCount: number;
  readonly decodedSampleCount: number | null;
  readonly sampleRate: number | null;
  readonly codecPrimingSamples: number | null;
  readonly skipSamples: number | null;
  readonly discardPaddingSamples: number | null;
}

export interface DecodedMediaIdentity {
  readonly file: NativeSpoolFile;
  readonly streams: readonly DecodedStreamIdentity[];
}

/** Half-open stream intervals in each named stream's rational PTS timebase. */
export interface DecodedIntervalMap {
  readonly sourceStreamId: string;
  readonly destinationStreamId: string;
  readonly sourceStartPts: number;
  readonly sourceEndPts: number;
  readonly destinationStartPts: number;
  readonly destinationEndPts: number;
  readonly uncertaintyUs: number;
}

export interface DecodedTransformReceipt {
  readonly schema: "native-tab-clock/1";
  readonly identity: NativeCaptureIdentity;
  readonly transformId: string;
  readonly inputs: readonly DecodedMediaIdentity[];
  readonly output: DecodedMediaIdentity;
  readonly decoder: Readonly<{
    path: string;
    version: string;
    sha256: string;
    argv: readonly string[];
  }>;
  readonly intervalMap: readonly DecodedIntervalMap[];
  /** Unknown output latency/applicability bounds cannot authorize calibration. */
  readonly uncertainty: NativeClockUncertainty;
  readonly completeDecode: true;
}
