// @lkb/api — T-009. Production entrypoint: connect Mongo, wire real deps, start listening.
// `createServer`/`startServer` (server.ts) stay importable+injectable on their own for tests.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { connect } from "@lkb/db";
import { startServer } from "./server.js";
import { buildProductionDeps } from "./composition/production.js";

export { createServer, startServer, type ServerDeps } from "./server.js";

// Real bug found live 2026-09-06: nothing here ever loaded the repo-root .env, and the var name
// this file read (MONGO_URL) never matched the one actually set there (MONGODB_URL) -- every
// plain `tsx src/index.ts` silently fell back to localhost:27017 and failed, even with the real
// remote Mongo URL sitting in .env the whole time.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

async function main(): Promise<void> {
  await connect(process.env.MONGODB_URL ?? "mongodb://localhost:27017", process.env.MONGODB_DB ?? "lkb");
  const server = startServer(buildProductionDeps());
  server.on("listening", () => {
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : addr;
    console.log(`@lkb/api listening on :${port}`);
  });
}

// Only run when executed directly (`node dist/index.js` / `tsx src/index.ts`), never on import.
// Real bug found live on Windows (2026-09-04): hand-building the `file://` URL for comparison
// drops the leading slash Windows absolute paths need (`file://D:/...` instead of the correct
// `file:///D:/...`), so the guard always evaluated false and `main()` silently never ran, even
// though the process itself exited 0 with no error. `pathToFileURL` produces the correct form
// on every platform.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("@lkb/api failed to start:", err);
    process.exitCode = 1;
  });
}
