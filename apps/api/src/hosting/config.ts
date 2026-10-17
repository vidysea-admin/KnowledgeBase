import { isAbsolute } from "node:path";
import { HostingJournal } from "./journal.js";
import { HostingService, type HostingServiceOptions } from "./service.js";
import { HostingWorker } from "./worker.js";
import { hostingId } from "./types.js";
import type { HostingRouterDeps } from "./router.js";

export interface ConfiguredHostingOptions { keyExists: HostingServiceOptions["keyExists"]; accountStatus?: HostingServiceOptions["accountStatus"] }
/** Optional feature refuses missing/invalid config. Return no details containing secret values. */
export function createConfiguredHostingDeps(env: NodeJS.ProcessEnv, dependencies: ConfiguredHostingOptions): HostingRouterDeps | undefined {
  try {
    const root = env.LKB_HOSTING_STATE_DIR, key = env.LKB_HOSTING_ENCRYPTION_KEY;
    if (!root || !isAbsolute(root) || /(?:^|[\\/])(?:public|wwwroot|static|assets)(?:[\\/]|$)/i.test(root) || !key || !/^[0-9a-fA-F]{64}$/.test(key) || !env.LKB_HOSTING_BOOTSTRAP_ADMINS || !env.LKB_HOSTING_WEBHOOK_ORIGINS) return undefined;
    const raw: unknown = JSON.parse(env.LKB_HOSTING_BOOTSTRAP_ADMINS);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const bootstrap = new Map<string, ReadonlySet<string>>();
    for (const [tenant, keys] of Object.entries(raw)) {
      hostingId(tenant, "tenant");
      if (!Array.isArray(keys) || !keys.length || keys.length > 100) return undefined;
      bootstrap.set(tenant, new Set(keys.map((id) => hostingId(id, "key"))));
    }
    const values: unknown = JSON.parse(env.LKB_HOSTING_WEBHOOK_ORIGINS);
    if (!Array.isArray(values) || !values.length || values.length > 100) return undefined;
    const origins = new Set<string>();
    for (const value of values) {
      if (typeof value !== "string") return undefined;
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || url.pathname !== "/") return undefined;
      origins.add(url.origin);
    }
    const service = new HostingService({ journal: new HostingJournal(root), encryptionKey: Buffer.from(key, "hex"), bootstrap, origins, ...dependencies });
    return { service, worker: new HostingWorker(service) };
  } catch { return undefined; }
}
