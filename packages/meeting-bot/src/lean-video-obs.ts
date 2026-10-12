/**
 * packages/meeting-bot/src/lean-video-obs.ts — T-035 wiring: push the lean-video settings (720p, low fps,
 * low bitrate; packages/core/src/domain/lean-video.ts) into OBS over obs-websocket v5 before a recording starts.
 * Lives outside capture/ (that directory is at its 30-file budget). Fail-soft: an OBS that refuses a request
 * is logged and the recording proceeds with OBS's current settings — a lost recording is worse than a big one.
 * Key names (SimpleOutput VBitrate/ABitrate) are unverified on a live OBS; the 60-minute measurement is separate.
 */
// Deep import: packages/core/src/index.ts does not re-export lean-video yet (ISS-LEANWIRE-001).
import { assessLeanVideoSettings, toObsRequests, type LeanVideoAssessment, type LeanVideoInput } from "@lkb/core/src/domain/lean-video.js";

export interface LeanObsClient { call: (request: string, args?: unknown) => Promise<unknown> }

export interface LeanVideoApplyResult { assessment: LeanVideoAssessment; failed: string[] }

export async function applyLeanVideoToObs(obs: LeanObsClient, input: LeanVideoInput, log: (msg: string) => void): Promise<LeanVideoApplyResult> {
  const assessment = assessLeanVideoSettings(input);
  const { settings, estimateMbPerHour, withinTarget, targetMbPerHour } = assessment;
  const req = toObsRequests(settings);
  const failed: string[] = [];
  const send = async (name: string, args: unknown): Promise<void> => {
    try { await obs.call(name, args); } catch (e) { failed.push(name); log(`lean video: ${name} refused, OBS keeps its current value (${String(e)})`); }
  };
  await send("SetVideoSettings", req.videoSettings);
  for (const p of req.profileParameters) await send("SetProfileParameter", p);
  for (const note of settings.adjustments) log(`lean video: ${note}`);
  log(`lean video: ${settings.width}x${settings.height} @ ${settings.fps} fps, video ${settings.videoBitrateKbps} kbps, audio ${settings.audioBitrateKbps} kbps; ` +
    `estimate ${estimateMbPerHour.toFixed(1)} MB/h (${withinTarget ? "under" : "NOT under"} ${targetMbPerHour} MB/h)`);
  return { assessment, failed };
}
