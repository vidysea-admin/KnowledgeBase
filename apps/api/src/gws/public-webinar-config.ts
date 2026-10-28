import {createPublicWebinarDiscovery, type PublicWebinarSource} from "./public-webinars.js";

const MAX_CONFIG_BYTES = 16_384;
const MAX_SOURCES = 10;
function invalid(): never {throw new Error("Invalid public webinar source configuration");}

export type ConfiguredPublicWebinarDiscovery =
  | {readonly configured: false; readonly reason: "not-configured"}
  | {readonly configured: true; readonly sources: readonly Readonly<PublicWebinarSource>[];
      readonly discover: ReturnType<typeof createPublicWebinarDiscovery>};

/** Server-owned configuration only. Never populate owner/sources from request or feed content.
 * Missing configuration is explicit; supplied invalid configuration refuses before provider access.
 * Transport/DNS and acquisition coverage remain owned by the existing discovery factory.
 */
export function createConfiguredPublicWebinarDiscovery(
  owner: string | undefined,
  serializedSources: string | undefined,
  deps?: Parameters<typeof createPublicWebinarDiscovery>[2],
): ConfiguredPublicWebinarDiscovery {
  if (serializedSources === undefined) return Object.freeze({configured: false, reason: "not-configured"});
  if (!owner || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(owner) ||
      typeof serializedSources !== "string" || Buffer.byteLength(serializedSources, "utf8") > MAX_CONFIG_BYTES) invalid();
  let parsed: unknown;
  try {parsed = JSON.parse(serializedSources);} catch {invalid();}
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_SOURCES) invalid();
  const ids = new Set<string>(), urls = new Set<string>();
  const sources: PublicWebinarSource[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).length !== 2 || !Object.hasOwn(item, "id") || !Object.hasOwn(item, "url") ||
        typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item.id) ||
        typeof item.url !== "string" || item.url.length > 2048 || /[\u0000-\u0020\u007f]/.test(item.url)) invalid();
    let url: URL;
    try {url = new URL(item.url);} catch {invalid();}
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.port || url.hash ||
        ids.has(item.id) || urls.has(url.href)) invalid();
    ids.add(item.id); urls.add(url.href);
    sources.push(Object.freeze({id: item.id, url: url.href}));
  }
  const inventory = Object.freeze(sources);
  return Object.freeze({configured: true, sources: inventory,
    discover: createPublicWebinarDiscovery(owner, sources, deps)});
}
