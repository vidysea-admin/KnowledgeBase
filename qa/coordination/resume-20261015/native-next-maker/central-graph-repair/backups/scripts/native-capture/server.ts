/** Explicit native-enabled process root. Configuration is server-owned, never a request DTO. */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { connect, getDb } from "../../packages/db/src/client.js";
import { startFromEnv } from "../../apps/api/src/bootstrap.js";
import { startServer } from "../../apps/api/src/server.js";
import { buildProductionDeps } from "../../apps/api/src/composition/production.js";
import { createNativeArchiveProductionService } from "./production.js";
import type { NativeArchiveServerService } from "../../packages/meeting-bot/src/capture/native/native-archive-join-types.js";
type Db = ReturnType<typeof getDb>;

export const nativeWorkspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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
    buildDeps: () => runtime.buildDeps({ onIndexCommitted: binding => service!.onIndexCommitted(binding) }),
    startServer: runtime.startServer,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv({ path: path.join(nativeWorkspaceRoot, ".env"), quiet: true });
  startNativeServer().catch(() => { console.error("Native API startup unavailable"); process.exitCode = 1; });
}
