/** Shared fake OBS for the lean-video wiring tests (non-test helper; holds state so a restore is observable). */
import type { ObsClientLike } from "./capture/obs/obs-windows.js";

export type Call = { name: string; args?: any };

export const LEAN_VIDEO = { baseWidth: 1280, baseHeight: 720, outputWidth: 1280, outputHeight: 720, fpsNumerator: 5, fpsDenominator: 1 };
export const LEAN_PARAMS = [
  { parameterCategory: "SimpleOutput", parameterName: "VBitrate", parameterValue: "500" },
  { parameterCategory: "SimpleOutput", parameterName: "ABitrate", parameterValue: "64" },
];

export const OPERATOR_VIDEO = { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080, fpsNumerator: 30, fpsDenominator: 1 };

/** A fake OBS that actually HOLDS state: Set* calls mutate it, Get* read it, so a restore is observable as end state. */
export function fakeObs(opts: { refuse?: string[]; startFails?: boolean; stopPath?: string; mode?: string | null; quality?: string | null; unreadable?: string[];
  profile?: Record<string, string | null>; video?: Record<string, number>; onCall?: (name: string, args: any) => void } = {}) {
  const calls: Call[] = [];
  const state = {
    video: { ...(opts.video ?? OPERATOR_VIDEO) } as Record<string, number>,
    profile: { "Output/Mode": opts.mode === undefined ? "Simple" : opts.mode, "SimpleOutput/RecQuality": opts.quality === undefined ? "Stream" : opts.quality,
      "SimpleOutput/VBitrate": "2500", "SimpleOutput/ABitrate": "160", ...(opts.profile ?? {}) } as Record<string, string | null>,
    recording: false,
  };
  const refuse = new Set(opts.refuse ?? []);
  const obs: ObsClientLike = {
    connect: async () => undefined, disconnect: async () => {},
    call: async (name: string, args?: any) => {
      calls.push({ name, args });
      opts.onCall?.(name, args);
      if (refuse.has(name)) throw new Error(`${name} refused (simulated)`);
      switch (name) {
        case "GetInputList": return { inputs: [] };
        case "GetSceneList": return { scenes: [] };
        case "GetSceneItemId": return { sceneItemId: 1 };
        case "GetVideoSettings": return { ...state.video };
        case "SetVideoSettings": if (state.recording) throw new Error("output active (simulated)"); Object.assign(state.video, args); return {};
        case "GetProfileParameter": {
          const k = `${args.parameterCategory}/${args.parameterName}`;
          if (opts.unreadable?.includes(k)) throw new Error(`${k} unreadable (simulated)`);
          return { parameterValue: k in state.profile ? state.profile[k] : null, defaultParameterValue: null };
        }
        case "SetProfileParameter": state.profile[`${args.parameterCategory}/${args.parameterName}`] = args.parameterValue; return {};
        case "GetRecordStatus": return { outputActive: state.recording };
        case "GetSpecialInputs": return {};
        case "StartRecord": if (opts.startFails) throw new Error("StartRecord rejected (simulated)"); state.recording = true; return {};
        case "StopRecord": state.recording = false; return { outputPath: opts.stopPath };
        default: return {};
      }
    },
  };
  return { obs, calls, state };
}
export const names = (calls: Call[]) => calls.map((c) => c.name);
export const sets = (calls: Call[]) => calls.filter((c) => c.name === "SetVideoSettings" || c.name === "SetProfileParameter");
