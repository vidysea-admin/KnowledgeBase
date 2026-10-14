/**
 * scripts/webinar/join-rules-api-host.ts — T-037 unit `t037-join-rules-api-host`.
 * Starts the API exactly as apps/api/src/index.ts does (repo-root .env, MONGODB_URL/MONGODB_DB,
 * startServer with PORT, same listening log) but with the real join-rules store injected, so
 * /calendar/join-rules stops answering 503. Run: node --import tsx scripts/webinar/join-rules-api-host.ts
 * Differences from index.ts, deliberately: a state-directory check + single-host pid file first, and
 * lock release on exit/SIGINT/SIGTERM (index.ts has no shutdown handling).
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { connect } from "../../packages/db/src/index.js";
import { startServer } from "../../apps/api/src/server.js";
import { requireDatabaseName } from "../../apps/api/src/db-name.js";
import { buildProductionDeps } from "../../apps/api/src/composition/production.js";
import { createSendNowDeps } from "./send-now-host.js";
import { createBotEventsDeps } from "../watch/bot-events-host.js";
import { acquireHostLock, createJoinRulesDeps, prepareStateDir, resolveStateDir } from "./join-rules-host.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Same file index.ts loads: apps/api/src/../../../.env == repo root.
loadEnv({ path: path.resolve(HERE, "../../.env") });

async function main(): Promise<void> {
  const stateDir = prepareStateDir(resolveStateDir());
  const release = acquireHostLock(stateDir);
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { release(); process.exit(sig === "SIGINT" ? 130 : 143); });
  try {
    console.log(`join-rules state directory: ${stateDir}`);
    await connect(process.env.MONGODB_URL ?? "mongodb://localhost:27017", requireDatabaseName());
    const prod = buildProductionDeps();
    // T-039: POST /calendar/send-now is live only through this host (needs the "send-now" scope on the key).
    const server = startServer({ ...prod, calendar: { ...prod.calendar, sendNow: createSendNowDeps() }, joinRules: createJoinRulesDeps({ stateDir }), botEvents: createBotEventsDeps({ stateDir }) });
    server.on("listening", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : addr;
      console.log(`@lkb/api listening on :${port}`);
    });
    server.on("close", release);
  } catch (e) { release(); throw e; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("@lkb/api failed to start:", err);
    process.exitCode = 1;
  });
}
