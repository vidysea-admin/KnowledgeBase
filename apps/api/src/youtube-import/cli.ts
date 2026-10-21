#!/usr/bin/env node
/**
 * apps/api/src/youtube-import/cli.ts - `youtube-import` command (owner captions via the official YouTube Data API).
 *   node --import tsx apps/api/src/youtube-import/cli.ts login
 *   node --import tsx apps/api/src/youtube-import/cli.ts import --tenant <id> [--since YYYY-MM-DD] [--limit N] [--budget UNITS]
 * `import` refuses to run unless MONGODB_DB=lkb_staging with LKB_ALLOW_STAGING=lkb_staging (D-117).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { connect, close } from "@lkb/db";
import { requireStagingDatabase } from "./staging-guard.js";
import { createMongoIntakeSink } from "../source-intake/store.js";
import { createYoutubeApi } from "./client.js";
import { fetchHttp } from "./http.js";
import { loadClient, createTokenProvider, runLogin, type TokenStore } from "./oauth.js";
import { createQuotaLedger, DEFAULT_DAILY_BUDGET, type QuotaStore } from "./quota.js";
import { runImport } from "./run.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const flag = (args: string[], name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const readText = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : undefined);
function writeSecret(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* best effort on Windows */ }
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [command, ...args] = argv;
  const tokenFile = resolve(env.LKB_YT_TOKEN_FILE ?? resolve(ROOT, "config", "youtube-token.json"));
  const quotaFile = resolve(env.LKB_YT_QUOTA_FILE ?? resolve(ROOT, "config", "youtube-quota.json"));
  const tokens: TokenStore = {
    async load() { const t = readText(tokenFile); return t ? (JSON.parse(t) as { refreshToken: string }) : undefined; },
    async save(t) { writeSecret(tokenFile, t); },
  };
  const client = () => loadClient(env, readText, resolve(ROOT, "config", "client_secret.json"));
  if (command === "login") {
    await runLogin({ client: client(), store: tokens, http: fetchHttp, print: (l) => console.log(l) });
    return 0;
  }
  if (command !== "import") { console.error("usage: youtube-import <login | import --tenant <id> [--since YYYY-MM-DD] [--limit N] [--budget UNITS]>"); return 2; }

  const tenantId = flag(args, "--tenant") ?? env.LKB_TENANT_ID;
  if (!tenantId) { console.error("youtube-import: --tenant (or LKB_TENANT_ID) is required"); return 2; }
  const since = flag(args, "--since");
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) { console.error("youtube-import: --since must be YYYY-MM-DD"); return 2; }
  let dbName: string;
  try { dbName = requireStagingDatabase(env); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); return 2; }

  const store: QuotaStore = {
    async load() { const t = readText(quotaFile); return t ? JSON.parse(t) : undefined; },
    async save(s) { mkdirSync(dirname(quotaFile), { recursive: true }); writeFileSync(quotaFile, JSON.stringify(s)); },
  };
  const ledger = await createQuotaLedger({ budget: Number(flag(args, "--budget") ?? DEFAULT_DAILY_BUDGET), store });
  const api = createYoutubeApi({ http: fetchHttp, ledger, accessToken: createTokenProvider({ client: client(), store: tokens, http: fetchHttp }) });
  await connect(env.MONGODB_URL ?? "mongodb://localhost:27017", dbName);
  try {
    const summary = await runImport({ api, sink: createMongoIntakeSink(), ledger, newId: randomUUID, log: (l) => console.log(l) },
      { tenantId, since, limit: flag(args, "--limit") ? Number(flag(args, "--limit")) : undefined });
    console.log(JSON.stringify(summary));
    return summary.failed > 0 ? 1 : 0;
  } finally { await close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e instanceof Error ? e.message : "youtube-import failed"); process.exitCode = 1; });
}
