/** Explicit native capture launcher sharing the trusted archive root with the API/index CLI. */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { connect, getDb, close } from "../../packages/db/src/client.js";
import { requireDatabaseName } from "../../apps/api/src/db-name.js";
import { runRecord } from "../../packages/meeting-bot/src/capture/record-commands.js";
import { configuredNativeArchiveService, nativeWorkspaceRoot } from "./server.js";
import type { NativeArchiveServerService } from "../../packages/meeting-bot/src/capture/native/native-archive-join-types.js";

export function nativeRecordInvocation(rest: string[], env: NodeJS.ProcessEnv, workspaceRoot = nativeWorkspaceRoot) {
  const index = rest.indexOf("--session-id"), sessionId = index >= 0 ? rest[index + 1] : undefined;
  if (!sessionId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("Explicit safe native capture session ID required");
  if (!rest.includes("--native-tab-clock")) throw new Error("Native capture launcher requires --native-tab-clock");
  const recordDir = path.resolve(env.LKB_RECORD_DIR ?? path.join(workspaceRoot, "raw/webinars"));
  const nativeSamplerPath = path.join(recordDir, `${sessionId}.tiles.jsonl`);
  if (env.LKB_TILE_CAPTURE_FILE && path.resolve(env.LKB_TILE_CAPTURE_FILE) !== nativeSamplerPath) {
    throw new Error("Native sampler configuration mismatch");
  }
  return { recordDir, nativeSamplerPath };
}

export async function runNativeCapture(
  rest: string[], env: NodeJS.ProcessEnv, service: NativeArchiveServerService,
  record: typeof runRecord = runRecord,
) {
  const invocation = nativeRecordInvocation(rest, env);
  const previous = process.env.LKB_TILE_CAPTURE_FILE;
  process.env.LKB_TILE_CAPTURE_FILE = invocation.nativeSamplerPath;
  try { await record(rest, { ...invocation, nativeArchive: service }); }
  finally {
    if (previous === undefined) delete process.env.LKB_TILE_CAPTURE_FILE;
    else process.env.LKB_TILE_CAPTURE_FILE = previous;
  }
}

export async function main(rest = process.argv.slice(2), env = process.env) {
  nativeRecordInvocation(rest, env);
  await connect(env.MONGODB_URL ?? "mongodb://localhost:27017", requireDatabaseName(env));
  try {
    const service = await configuredNativeArchiveService(env, getDb());
    if (!service) throw new Error("Explicit native archive root required");
    await runNativeCapture(rest, env, service);
  } finally { await close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv({ path: path.join(nativeWorkspaceRoot, ".env"), quiet: true });
  main().catch(() => { console.error("Native capture unavailable"); process.exitCode = 1; });
}
