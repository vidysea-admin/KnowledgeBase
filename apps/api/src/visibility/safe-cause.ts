/** Server-side-only record of the REAL cause behind a masked 503 (w27-standalone). Responses stay generic; this line
 * is what lets an operator see e.g. "Transaction numbers are only allowed on a replica set member or mongos".
 * Credentials embedded in connection strings, bearer tokens and key-like values are redacted; length is bounded. */
export function describeCause(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}${(error as { code?: unknown }).code !== undefined ? `[${String((error as { code?: unknown }).code)}]` : ""}: ${error.message}` : String(error);
  return raw
    .replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]*@/gi, "$1<redacted>@")
    .replace(/(bearer\s+)[A-Za-z0-9._~+\/=-]+/gi, "$1<redacted>")
    .replace(/\b(lkb_[A-Za-z0-9_]{8,}|sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{16,})/g, "<redacted>")
    .replace(/\s+/g, " ").slice(0, 300);
}

export function logServerCause(scope: string, error: unknown): void {
  console.error(`[${scope}] masked failure -> ${describeCause(error)}`);
}
