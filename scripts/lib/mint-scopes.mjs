/**
 * scripts/lib/mint-scopes.mjs - which scopes scripts/mint-key.mjs puts on a key. Pure (no Mongo), so it is unit-tested.
 * DEFAULT_SCOPES is the set every minted key has always carried. Dedicated WRITE scopes are never in it: a key holds one only
 * when it was asked for by name (`--with-scope send-now`), the t037 contract's rule "no key holds a dedicated write scope unless issued deliberately".
 * (join-rules is not mintable by this script at all today; send-now is the first write scope it can issue.)
 */
export const DEFAULT_SCOPES = [
  "ask", "compete", "sources", "sessions", "search", "citations", "webhooks",
  "gaps", "graph", "calendar", "gmail", "whatsapp", "keys", "ingest",
];
export const WRITE_SCOPES = ["send-now"];

/** argv -> scopes. Throws on an unknown or non-write name (a typo must not silently mint a weaker or stronger key). */
export function scopesFromArgv(argv) {
  const requested = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--with-scope") continue;
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new Error("--with-scope needs a scope name");
    requested.push(...v.split(",").map((s) => s.trim()));
  }
  for (const s of requested) {
    if (!WRITE_SCOPES.includes(s)) throw new Error(`--with-scope: '${s}' is not an issuable write scope (allowed: ${WRITE_SCOPES.join(", ")})`);
  }
  return [...DEFAULT_SCOPES, ...new Set(requested)];
}
