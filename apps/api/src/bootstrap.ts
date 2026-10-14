// Testable startup for the API entrypoint (index.ts stays a thin wrapper). All side effects injected.
import type { Server } from "node:http";
import { requireDatabaseName } from "./db-name.js";

export interface BootstrapDeps<D = unknown> {
  connect: (url: string, dbName: string) => Promise<unknown>;
  buildDeps: () => D;
  startServer: (deps: D) => Server;
}

/** Resolve the DB name first (throws before any connection) and only then connect and listen. */
export async function startFromEnv<D>(env: NodeJS.ProcessEnv, d: BootstrapDeps<D>): Promise<Server> {
  const dbName = requireDatabaseName(env);
  await d.connect(env.MONGODB_URL ?? "mongodb://localhost:27017", dbName);
  return d.startServer(d.buildDeps());
}
