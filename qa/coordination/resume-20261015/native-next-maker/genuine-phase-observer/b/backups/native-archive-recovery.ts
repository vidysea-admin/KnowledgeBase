/** Process-root recovery: descriptors are hints; admissions and decoder capabilities are reissued. */
import type { openNativeArchiveStore } from "./native-capture-archive.js";
import { requireNativeArchiveAdmission } from "./native-archive-authority.js";
import { reproveArchivedNativeMedia } from "./native-media-finalize.js";
import { reproveArchivedNativeProviderAudio } from "../record-consent/native-provider-audio.js";
import type { NativeDecoderOptions } from "./native-media-probe.js";
import type { NativeCaptureRecoverer } from "./native-archive-join-types.js";
import { promises as fs } from "node:fs";
import path from "node:path";

export function createNativeArchiveRecoverer(input: {
  store: Awaited<ReturnType<typeof openNativeArchiveStore>>;
  decoder: NativeDecoderOptions;
}): NativeCaptureRecoverer {
  return {
    async recoverCapture({ archiveId, expected }) {
      let admission;
      try { admission = await input.store.admit(archiveId, expected); }
      catch { return { status: "unavailable", reason: "unadmitted" }; }
      try {
        const { directory } = await requireNativeArchiveAdmission(admission);
        const receipt = JSON.parse(await fs.readFile(path.join(directory, "consent.json"), "utf8"));
        if (!Array.isArray(receipt.privateWindows)) return { status: "unavailable", reason: "artifact-unavailable" };
        if (receipt.privateWindows.length) return { status: "unavailable", reason: "private-transform-unsupported" };
        const media = await reproveArchivedNativeMedia(admission, input.decoder);
        const providerAudio = await reproveArchivedNativeProviderAudio(admission, media);
        await requireNativeArchiveAdmission(admission);
        return { status: "ready", media, providerAudio };
      } catch { return { status: "unavailable", reason: "reproof-unavailable" }; }
    },
  };
}
