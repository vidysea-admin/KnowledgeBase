/** Process-root recovery: descriptors are hints; admissions and decoder capabilities are reissued. */
import type { openNativeArchiveStore } from "./native-capture-archive.js";
import { requireNativeArchiveAdmission } from "./native-archive-authority.js";
import { reproveArchivedNativeMedia } from "./native-media-finalize.js";
import { reproveArchivedNativeProviderAudio } from "../record-consent/native-provider-audio.js";
import type { NativeDecoderOptions } from "./native-media-probe.js";
import type { NativeCaptureRecoverer } from "./native-archive-join-types.js";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface NativeArchiveRecoveryPhaseEvent {
  readonly stage: "admit" | "receipt" | "media" | "provider" | "final-admission";
  readonly event: "start" | "complete" | "failed";
  readonly errorName?: "Error" | "TypeError" | "RangeError" | "SyntaxError" | "UnknownError";
  readonly errorCode?: "EACCES" | "EPERM" | "ENOENT" | "EINVAL" | "EIO" | "ETIMEDOUT";
}
function classifyFailure(error: unknown): Pick<NativeArchiveRecoveryPhaseEvent, "errorName" | "errorCode"> {
  const result: { errorName: NonNullable<NativeArchiveRecoveryPhaseEvent["errorName"]>;
    errorCode?: NativeArchiveRecoveryPhaseEvent["errorCode"] } = { errorName: "UnknownError" };
  try {
    const candidate = error as { name?: unknown; code?: unknown } | null;
    const name = candidate?.name, code = candidate?.code;
    if (name === "Error" || name === "TypeError" || name === "RangeError" || name === "SyntaxError") result.errorName = name;
    if (code === "EACCES" || code === "EPERM" || code === "ENOENT" || code === "EINVAL" || code === "EIO" || code === "ETIMEDOUT") result.errorCode = code;
  } catch { /* Error accessors cannot alter the recovery result or expose other fields. */ }
  return result;
}
export function createNativeArchiveRecoverer(input: {
  store: Awaited<ReturnType<typeof openNativeArchiveStore>>;
  decoder: NativeDecoderOptions;
  /** Trusted synchronous telemetry only; no proof inputs or HTTP exposure. */
  observe?: (event: Readonly<NativeArchiveRecoveryPhaseEvent>) => void;
}): NativeCaptureRecoverer {
  const observe = input.observe;
  const notify = (event: NativeArchiveRecoveryPhaseEvent) => {
    try { observe?.(Object.freeze(event)); } catch { /* Telemetry never controls recovery. */ }
  };
  async function phase<T>(stage: NativeArchiveRecoveryPhaseEvent["stage"], run: () => Promise<T>): Promise<T> {
    notify({ stage, event: "start" });
    try {
      const result = await run();
      notify({ stage, event: "complete" });
      return result;
    } catch (error) {
      notify({ stage, event: "failed", ...classifyFailure(error) });
      throw error;
    }
  }
  return {
    async recoverCapture({ archiveId, expected }) {
      let admission;
      try { admission = await phase("admit", () => input.store.admit(archiveId, expected)); }
      catch { return { status: "unavailable", reason: "unadmitted" }; }
      try {
        const receipt = await phase("receipt", async () => {
          const { directory } = await requireNativeArchiveAdmission(admission);
          return JSON.parse(await fs.readFile(path.join(directory, "consent.json"), "utf8"));
        });
        if (!Array.isArray(receipt.privateWindows)) return { status: "unavailable", reason: "artifact-unavailable" };
        if (receipt.privateWindows.length) return { status: "unavailable", reason: "private-transform-unsupported" };
        const media = await phase("media", () => reproveArchivedNativeMedia(admission, input.decoder));
        const providerAudio = await phase("provider", () => reproveArchivedNativeProviderAudio(admission, media));
        await phase("final-admission", () => requireNativeArchiveAdmission(admission));
        return { status: "ready", media, providerAudio };
      } catch { return { status: "unavailable", reason: "reproof-unavailable" }; }
    },
  };
}
