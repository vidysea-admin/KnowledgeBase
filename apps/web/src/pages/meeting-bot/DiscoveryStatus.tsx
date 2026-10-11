import type { Loaded } from "./useLoad.js";
import { formatInstant } from "./model.js";

const DISCOVERY_STALE_MS = 15 * 60 * 1000;
type Feed = { status?: unknown; checkedAt?: unknown; lastSuccessAt?: unknown };

/** Source-discovery health for the calendar and Gmail feeds, from the same single GET /webinar-operations state. */
export function DiscoveryStatus({ state }: { state: Loaded<{ discovery?: unknown }> }): React.ReactElement | null {
  if (state.noKey || state.loading || !state.data) return null;
  const discovery = typeof state.data.discovery === "object" && state.data.discovery !== null ? state.data.discovery as Record<string, unknown> : undefined;
  if (!discovery) {
    return state.error ? null : <p role="alert">Connected source discovery is unverified. Run a successful discovery check before relying on coverage.</p>;
  }
  return <>{(["calendar", "gmail"] as const).map(feed => {
    const raw = discovery[feed], row: Feed = typeof raw === "object" && raw !== null ? raw : {};
    const age = typeof row.checkedAt === "string" ? Date.now() - Date.parse(row.checkedAt) : NaN;
    const failed = row.status !== "healthy";
    const stale = !Number.isFinite(age) || age > DISCOVERY_STALE_MS || age < -60000;
    return <p key={feed} role={failed || stale ? "alert" : undefined}>
      {feed === "gmail" ? "Gmail" : "Calendar"} discovery: {failed ? "unavailable; webinar coverage requires attention" : stale ? "stale; no fresh check within 15 minutes" : "healthy"}.
      {typeof row.lastSuccessAt === "string" && <> Last successful check: {formatInstant(row.lastSuccessAt)}.</>}
    </p>;
  })}</>;
}
