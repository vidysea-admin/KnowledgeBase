/** Explicit native-enabled process root. Configuration is server-owned, never a request DTO. */
import path from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { connect, getDb } from "../../packages/db/src/client.js";
import { startFromEnv } from "../../apps/api/src/bootstrap.js";
import { startServer } from "../../apps/api/src/server.js";
import { buildProductionDeps } from "../../apps/api/src/composition/production.js";
import type { HostCaptureReadinessAdapter } from "../../apps/api/src/capture-readiness/types.js";
import { selectTabCaptureWorkspace } from "../../packages/meeting-bot/src/capture/workspace/tab-session-workspace.js";
import { readCaptureSlotObservation, captureSlotHostId } from "../../packages/meeting-bot/src/capture/workspace/capture-slot-readiness.js";
import { publishCaptureSlotAcceptance, revokeCaptureSlotAcceptance } from "../../packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.js";
import { createNativeArchiveProductionService } from "./production.js";
import type { NativeArchiveServerService } from "../../packages/meeting-bot/src/capture/native/native-archive-join-types.js";
type Db = ReturnType<typeof getDb>;

export const nativeWorkspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Supported host bridge lives at this trusted root launcher; ordinary API startup has no host.
 * Construction performs no reads. Existing API auth/tenant/slot gates precede every operation. */
export function createTrustedCaptureReadinessHost(root: string, env: NodeJS.ProcessEnv): HostCaptureReadinessAdapter {
  const selected = (tenantId: string, slot: string) => selectTabCaptureWorkspace(["--capture-slot", slot], {
    tenantId, profileDir: path.resolve(env.LKB_BOT_PROFILE_DIR ?? path.join(root, "data/bot-profile")),
    recordDir: path.resolve(env.LKB_RECORD_DIR ?? path.join(root, "raw/webinars")),
  }, "finalize");
  return {
    async list(tenantId, slot) {
      const workspace = selected(tenantId, slot);
      let files: string[];
      try { files = readdirSync(workspace.profileDir); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
      const names = files.filter(name => /^\.lkb-capture-readiness-[a-z][a-z0-9-]{0,39}\.json$/.test(name));
      if (names.length > 32) throw new Error("Capture observation bound exceeded");
      const rows: Awaited<ReturnType<HostCaptureReadinessAdapter["list"]>> = [];
      for (const name of names) {
        const receipt = readCaptureSlotObservation(workspace, name.slice(".lkb-capture-readiness-".length, -5));
        if (receipt.evidenceKind === "browser" && receipt.hostId === captureSlotHostId() && Date.parse(receipt.observedAt) <= Date.now()) {
          const { profileDir: _profile, recordDir: _record, version: _version, observation: _observation, ...view } = receipt;
          rows.push({ ...view, evidenceKind: "browser" });
        }
      }
      return rows;
    },
    async accept(principal, review) {
      return publishCaptureSlotAcceptance(root, selected(principal.tenantId, review.slot),
        { ...review, tenantId: principal.tenantId, keyId: principal.keyId });
    },
    async revoke(principal, review) {
      revokeCaptureSlotAcceptance(root, selected(principal.tenantId, review.slot), review.platform,
        { tenantId: principal.tenantId, keyId: principal.keyId, generation: review.generation, evidenceHash: review.evidenceHash });
    },
  };
}
/** Shared by this explicit launcher and the independent sync-session CLI. No module path input. */
export async function configuredNativeArchiveService(
  env: NodeJS.ProcessEnv, db: Db, workspaceRoot = nativeWorkspaceRoot,
): Promise<NativeArchiveServerService | undefined> {
  if (!env.LKB_NATIVE_ARCHIVE_ROOT) return undefined;
  const maxArchiveBytes = Number(env.LKB_NATIVE_ARCHIVE_MAX_BYTES);
  if (!Number.isSafeInteger(maxArchiveBytes) || maxArchiveBytes < 1 || maxArchiveBytes > 8 * 1024 ** 3) {
    throw new Error("Explicit finite native archive quota required");
  }
  if (!env.LKB_NATIVE_FFMPEG || !env.LKB_NATIVE_FFPROBE) throw new Error("Configured native decoder paths required");
  return createNativeArchiveProductionService({ db, workspaceRoot,
    recordDir: path.resolve(env.LKB_RECORD_DIR ?? path.join(workspaceRoot, "raw/webinars")),
    archiveRoot: env.LKB_NATIVE_ARCHIVE_ROOT, maxArchiveBytes,
    decoder: { ffmpegPath: env.LKB_NATIVE_FFMPEG, ffprobePath: env.LKB_NATIVE_FFPROBE } });
}

/** Bounded startup drain completes before readiness. Caller may explicitly resume its cursor. */
export async function prepareNativeStartup(
  service: NativeArchiveServerService, input: { limit: number; cursor?: string },
) {
  return service.drain(input);
}

export interface NativeServerRuntime {
  connect: typeof connect;
  getDb: typeof getDb;
  service: typeof configuredNativeArchiveService;
  buildDeps: typeof buildProductionDeps;
  startServer: typeof startServer;
}
export async function startNativeServer(env: NodeJS.ProcessEnv = process.env, overrides: Partial<NativeServerRuntime> = {}) {
  const runtime: NativeServerRuntime = { connect, getDb, service: configuredNativeArchiveService,
    buildDeps: buildProductionDeps, startServer, ...overrides };
  let service: NativeArchiveServerService | undefined;
  return startFromEnv(env, {
    async connect(url, dbName) {
      await runtime.connect(url, dbName);
      service = await runtime.service(env, runtime.getDb());
      if (!service) throw new Error("Explicit native archive root required");
      await prepareNativeStartup(service, { limit: 100, ...(env.LKB_NATIVE_ARCHIVE_CURSOR ? { cursor: env.LKB_NATIVE_ARCHIVE_CURSOR } : {}) });
    },
    buildDeps: () => runtime.buildDeps({ onIndexCommitted: binding => service!.onIndexCommitted(binding),
      captureReadinessHost: createTrustedCaptureReadinessHost(nativeWorkspaceRoot, env) }),
    startServer: runtime.startServer,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv({ path: path.join(nativeWorkspaceRoot, ".env"), quiet: true });
  startNativeServer().catch(() => { console.error("Native API startup unavailable"); process.exitCode = 1; });
}
