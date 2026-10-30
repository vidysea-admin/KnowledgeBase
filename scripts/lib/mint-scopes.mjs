/**
 * scripts/lib/mint-scopes.mjs - which scopes scripts/mint-key.mjs puts on a key. Pure (no Mongo), so it is unit-tested.
 * DEFAULT_SCOPES is the set every minted key has always carried. Dedicated WRITE scopes are never in it: a key holds one only
 * when it was asked for by name (`--with-scope send-now`), the t037 contract's rule "no key holds a dedicated write scope unless issued deliberately".
 * Both dedicated write scopes (send-now, join-rules) are issuable this way; --with-scope is repeatable and accepts a comma list.
 * --scopes a,b,c adds any canonical scope (ALL_SCOPES) on top of the defaults; --all-scopes mints every canonical scope (operator admin key).
 */
export const DEFAULT_SCOPES = [
  "ask", "compete", "sources", "sessions", "search", "citations", "webhooks",
  "gaps", "graph", "calendar", "gmail", "whatsapp", "keys", "ingest",
];
export const WRITE_SCOPES = ["send-now", "join-rules"];
/** Scopes beyond DEFAULT_SCOPES that routes enforce via requireScope(...). Issuable only by name (--scopes) or --all-scopes. */
export const EXTRA_SCOPES = [
  ...WRITE_SCOPES, "answer-policy:read", "answer-policy:write", "automation:read", "automation:write", "automation:operate",
  "hosting", "jobs", "registration:approve", "operations:write",
  // D-206 user accounts: the scopes roles map to (apps/api/src/user-accounts/roles.ts). Defined together so no later unit edits this file.
  "user-admin", "whatsapp-link", "whatsapp-admin",
];
/** The canonical set: every scope a route in apps/api checks. mint-scopes.test.mjs fails if a requireScope literal is missing here. */
export const ALL_SCOPES = [...DEFAULT_SCOPES, ...EXTRA_SCOPES];
export const ADMIN_KEY_WARNING = "mint-key: WARNING --all-scopes mints an operator ADMIN key holding every scope (writes, hosting, automation, keys). Store it like a root credential; use --scopes for anything narrower.";

/** True when argv asks for the operator admin key (mint-key prints ADMIN_KEY_WARNING). */
export function wantsAllScopes(argv) { return argv.includes("--all-scopes"); }

/** argv -> scopes. Throws on an unknown or non-write name (a typo must not silently mint a weaker or stronger key). */
export function scopesFromArgv(argv) {
  const requested = [];
  const extra = [];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== "--with-scope" && flag !== "--scopes") continue;
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`${flag} needs a scope name`);
    (flag === "--scopes" ? extra : requested).push(...v.split(",").map((s) => s.trim()));
  }
  for (const s of requested) {
    if (!WRITE_SCOPES.includes(s)) throw new Error(`--with-scope: '${s}' is not an issuable write scope (allowed: ${WRITE_SCOPES.join(", ")})`);
  }
  for (const s of extra) {
    if (!ALL_SCOPES.includes(s)) throw new Error(`--scopes: '${s}' is not a known scope (allowed: ${ALL_SCOPES.join(", ")})`);
  }
  if (wantsAllScopes(argv)) return [...ALL_SCOPES];
  return [...DEFAULT_SCOPES, ...new Set([...requested, ...extra].filter((s) => !DEFAULT_SCOPES.includes(s)))];
}
